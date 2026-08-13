import {
  analyse,
  enumerate,
  makePool,
  solve,
  type Level,
  type Metrics,
  type Mode,
  type OperatorBudget,
  type Rules,
} from "../solver/index.js";
import {
  casualBudget,
  distinctUsages,
  solveExpertBudget,
  solveNormalBudget,
} from "./budgets.js";
import { construct, type Strategy } from "./construct.js";
import { addDecoys, type DecoyInfo } from "./decoys.js";
import type { Rng } from "./rng.js";
import { inRange, type TierName, type TierSpec } from "./tiers.js";
import { peakTemptation, scoreTraps, type TrapScore } from "./temptation.js";

/** Every way a candidate board can fail to become a level. */
export type RejectionReason =
  | "construction-failed"
  | "no-keystone"
  | "trap-not-live"
  | "trap-not-tempting"
  | "inert-decoy"
  | "no-expert-budget"
  | "out-of-band"
  | "duplicate"
  | "unsolvable";

export const REJECTION_REASONS: readonly RejectionReason[] = [
  "construction-failed",
  "no-keystone",
  "trap-not-live",
  "trap-not-tempting",
  "inert-decoy",
  "no-expert-budget",
  "out-of-band",
  "duplicate",
  "unsolvable",
];

export interface ModeAnalysis {
  readonly mode: Mode;
  readonly budget: OperatorBudget;
  readonly metrics: Metrics;
  readonly inBand: boolean;
  readonly bandFailures: readonly string[];
  /** Which tier this mode's metrics actually land in, if any. */
  readonly landsInTier: TierName | null;
}

export interface GeneratedLevel {
  readonly id: string;
  readonly world: number;
  readonly tier: TierName;
  readonly pool: readonly number[];
  readonly targets: readonly number[];
  readonly operators: Readonly<Record<Mode, OperatorBudget>>;
  readonly rules: Rules;
  /** GDD §10 metrics block, taken from the tier's mode of record. */
  readonly metrics: {
    readonly surplus: number;
    readonly keystones: readonly number[];
    readonly lookaheadDistance: number;
    readonly decisionPoints: number;
    readonly solutionPaths: number;
    readonly maxTrapDepth: number;
  };
  /** Additive, beyond GDD §10 — the per-mode evidence the central constraint needs. */
  readonly metricsByMode: Readonly<Record<Mode, Metrics>>;
  readonly traps: readonly TrapScore[];
  readonly generator: {
    readonly seed: number;
    readonly strategy: Strategy;
    readonly hash: string;
    readonly overlappingKeystonePairs: number;
    readonly peakTemptation: number;
    readonly decoys: readonly DecoyInfo[];
    readonly expertBudgetsSolvable: number;
    readonly expertBudgetsUnique: number;
  };
}

export type Outcome =
  | { readonly accepted: true; readonly level: GeneratedLevel; readonly ms: number }
  | {
      readonly accepted: false;
      readonly reason: RejectionReason;
      readonly detail?: string;
      readonly ms: number;
      readonly inertDecoyRejections: number;
      /**
       * Mode-of-record metrics, when the candidate survived far enough to be
       * measured. This is the diagnostic that matters when yield is zero: it
       * says whether the band is unreachable or merely rare.
       */
      readonly recordMetrics: Metrics | null;
    };

export interface AttemptContext {
  readonly tier: TierSpec;
  readonly allTiers: readonly TierSpec[];
  readonly rng: Rng;
  readonly strategy: Strategy;
  readonly seed: number;
  readonly seen: Set<string>;
  readonly rules: Rules;
  readonly maxCollected: number;
  /**
   * GDD §13 says the fatal path must be "at least as natural" as the correct
   * one, which is 0.5. Tunable so its cost can be measured: it is the one
   * acceptance rule with no numeric anchor in the spec, and a yield finding
   * that is really an artefact of this threshold would be worthless.
   */
  readonly temptationThreshold: number;
}

export function hashBoard(pool: readonly number[], targets: readonly number[]): string {
  // GDD §13: dedupe on (pool, targets). Pool order is not part of the puzzle.
  return `${[...pool].sort((a, b) => a - b).join(".")}|${targets.join(".")}`;
}

/** Targets with exactly one decomposition from the starting pool (GDD §13). */
function uniqueDecompositionTargets(
  pool: readonly number[],
  targets: readonly number[],
  budget: OperatorBudget,
  rules: Rules,
): number[] {
  const tiles = makePool(pool);
  const indices: number[] = [];
  for (let i = 1; i < targets.length; i++) {
    if (enumerate(tiles, targets[i]!, budget, rules).length === 1) indices.push(i);
  }
  return indices;
}

export function bandAgainst(metrics: Metrics, tier: TierSpec): string[] {
  const failures: string[] = [];
  if (!metrics.solvable) failures.push("unsolvable");
  if (!inRange(metrics.keystones.length, tier.keystones)) {
    failures.push(`keystones ${metrics.keystones.length}`);
  }
  if (tier.requireOverlappingKeystones && metrics.overlappingKeystonePairs < 1) {
    failures.push("keystones not overlapping");
  }
  if (!inRange(metrics.lookaheadDistance, tier.lookahead)) {
    failures.push(`lookahead ${metrics.lookaheadDistance}`);
  }
  if (!inRange(metrics.decisionPoints, tier.decisionPoints)) {
    failures.push(`decisionPoints ${metrics.decisionPoints}`);
  }
  if (tier.uniqueSolution && metrics.solutionPaths !== 1) {
    failures.push(`solutionPaths ${metrics.solutionPaths}`);
  }
  return failures;
}

function landingTier(
  metrics: Metrics,
  poolSize: number,
  targetCount: number,
  tiers: readonly TierSpec[],
): TierName | null {
  for (const tier of tiers) {
    if (!inRange(targetCount, tier.targetCount)) continue;
    if (!inRange(poolSize - 2 * targetCount, tier.surplus)) continue;
    if (bandAgainst(metrics, tier).length === 0) return tier.name;
  }
  return null;
}

/**
 * One candidate board, start to finish.
 *
 * The central constraint is structural, not a late check: a board is solved and
 * analysed under all three modes before it can be accepted. A board that works
 * in Casual and dies in Expert is a failed candidate, not a Casual-only level.
 */
export function attempt(ctx: AttemptContext, index: number): Outcome {
  const started = performance.now();
  const { tier, rng, rules } = ctx;
  const done = (
    outcome: Omit<
      Extract<Outcome, { accepted: false }>,
      "ms" | "inertDecoyRejections" | "recordMetrics"
    > & {
      inertDecoyRejections?: number;
      recordMetrics?: Metrics;
    },
  ): Outcome => ({
    ...outcome,
    inertDecoyRejections: outcome.inertDecoyRejections ?? 0,
    recordMetrics: outcome.recordMetrics ?? null,
    ms: performance.now() - started,
  });

  const casual = casualBudget(tier);
  const countDecompositions = (pool: readonly number[], target: number): number =>
    enumerate(makePool(pool), target, casual, rules).length;

  // 1. CONSTRUCT BACKWARDS
  const built = construct(tier, rng, ctx.strategy, countDecompositions);
  if (!built) return done({ accepted: false, reason: "construction-failed" });

  // 2/3. KEYSTONE + LIVENESS on the base pool. Cheap, so it runs before decoys.
  const baseUnique = uniqueDecompositionTargets(built.pool, built.targets, casual, rules);
  if (baseUnique.length === 0) {
    return done({ accepted: false, reason: "no-keystone", detail: "pre-decoy" });
  }

  // 4/5. DECOYS. Every one must open a new reading; inert candidates are counted.
  const surplus = rng.int(tier.surplus.min, tier.surplus.max);
  const decoyed = addDecoys(
    built.pool,
    built.targets,
    surplus,
    tier,
    casual,
    rules,
    rng,
  );
  if (!decoyed) return done({ accepted: false, reason: "inert-decoy" });

  const pool = decoyed.pool;
  const targets = built.targets;
  const inert = decoyed.inertRejections;

  // 8. DEDUPE early — hashing is free and everything below is not.
  const hash = hashBoard(pool, targets);
  if (ctx.seen.has(hash)) {
    return done({ accepted: false, reason: "duplicate", inertDecoyRejections: inert });
  }

  const level: Level = {
    id: `gen-${tier.name}-${index}`,
    world: tier.world,
    tier: tier.name,
    pool,
    targets,
    operators: { casual, normal: casual, expert: casual },
    rules,
  };

  // A decoy can destroy keystone uniqueness, so re-verify against the FINAL
  // starting pool — that is the pool the player sees (GDD §13).
  const finalUnique = uniqueDecompositionTargets(pool, targets, casual, rules);
  if (finalUnique.length === 0) {
    return done({
      accepted: false,
      reason: "no-keystone",
      detail: "post-decoy",
      inertDecoyRejections: inert,
    });
  }

  const casualSolve = solve(level, casual, { maxCollected: ctx.maxCollected });
  if (!casualSolve.solvable) {
    return done({ accepted: false, reason: "unsolvable", inertDecoyRejections: inert });
  }

  const casualMetrics = analyse(level, casual, {
    maxCollected: ctx.maxCollected,
    reuse: casualSolve,
  });

  // analyse() only calls something a keystone once its operands are contested,
  // so a unique target with no keystone entry is precisely a dead trap.
  if (casualMetrics.keystones.length === 0) {
    return done({
      accepted: false,
      reason: "trap-not-live",
      detail: `unique targets ${finalUnique.join(",")} but nothing steals from them`,
      inertDecoyRejections: inert,
    });
  }

  // 4 (brief). TEMPTATION — liveness is not enough (GDD §13).
  const keystoneOperands = new Set(casualMetrics.keystoneDetail.flatMap((k) => k.operands));
  const traps = scoreTraps(casualSolve, keystoneOperands);

  // A keystone whose operands are contested but where no move actually loses
  // the level is a dead trap, not an untempting one. Separate reasons, because
  // they call for different fixes.
  if (traps.length === 0) {
    return done({
      accepted: false,
      reason: "trap-not-live",
      detail: "keystone contested but no fatal move exists",
      inertDecoyRejections: inert,
    });
  }

  const temptation = peakTemptation(traps);
  if (temptation < ctx.temptationThreshold) {
    return done({
      accepted: false,
      reason: "trap-not-tempting",
      detail: `peak temptation ${temptation.toFixed(3)}`,
      inertDecoyRejections: inert,
    });
  }

  // 6. PER-MODE BUDGETS — solved for, never authored.
  const usages = distinctUsages(casualSolve.winningPaths);
  const normal = solveNormalBudget(level, tier, usages, rng);
  const expert = solveExpertBudget(level, usages, true);

  if (!normal || !expert.chosen) {
    return done({
      accepted: false,
      reason: "no-expert-budget",
      detail: normal
        ? `${expert.solvableCount} solvable expert budgets, ${expert.uniqueCount} unique`
        : "no normal budget",
      inertDecoyRejections: inert,
    });
  }

  // 7. PER-MODE ANALYSIS AND BANDING.
  const budgets: Record<Mode, OperatorBudget> = {
    casual,
    normal: normal.budget,
    expert: expert.chosen.budget,
  };

  const byMode = {} as Record<Mode, Metrics>;
  const analyses: ModeAnalysis[] = [];
  for (const mode of ["casual", "normal", "expert"] as const) {
    const metrics =
      mode === "casual"
        ? casualMetrics
        : analyse(level, budgets[mode], { maxCollected: ctx.maxCollected });
    byMode[mode] = metrics;
    const bandFailures = bandAgainst(metrics, tier);
    analyses.push({
      mode,
      budget: budgets[mode],
      metrics,
      inBand: bandFailures.length === 0,
      bandFailures,
      landsInTier: landingTier(metrics, pool.length, targets.length, ctx.allTiers),
    });
  }

  // The central constraint: solvable in ALL THREE modes or it is not a level.
  const unsolvableModes = analyses.filter((a) => !a.metrics.solvable);
  if (unsolvableModes.length > 0) {
    return done({
      accepted: false,
      reason: "unsolvable",
      detail: `unsolvable in ${unsolvableModes.map((a) => a.mode).join(", ")}`,
      inertDecoyRejections: inert,
    });
  }

  const record = analyses.find((a) => a.mode === tier.modeOfRecord)!;
  if (!record.inBand) {
    return done({
      accepted: false,
      reason: "out-of-band",
      detail: record.bandFailures.join("; "),
      inertDecoyRejections: inert,
      recordMetrics: record.metrics,
    });
  }

  ctx.seen.add(hash);

  const accepted: GeneratedLevel = {
    id: level.id,
    world: tier.world,
    tier: tier.name,
    pool,
    targets,
    operators: budgets,
    rules,
    metrics: {
      surplus: record.metrics.surplus,
      keystones: record.metrics.keystones,
      lookaheadDistance: record.metrics.lookaheadDistance,
      decisionPoints: record.metrics.decisionPoints,
      solutionPaths: record.metrics.solutionPaths,
      maxTrapDepth: record.metrics.maxTrapDepth,
    },
    metricsByMode: byMode,
    traps,
    generator: {
      seed: ctx.seed,
      strategy: ctx.strategy,
      hash,
      overlappingKeystonePairs: record.metrics.overlappingKeystonePairs,
      peakTemptation: temptation,
      decoys: decoyed.decoys,
      expertBudgetsSolvable: expert.solvableCount,
      expertBudgetsUnique: expert.uniqueCount,
    },
  };

  return { accepted: true, level: accepted, ms: performance.now() - started };
}
