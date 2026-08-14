import type { GeneratedLevel } from "../generator/pipeline.js";
import type { TierSpec } from "../generator/tiers.js";

/**
 * Composite difficulty score.
 *
 * Four inputs, all measured under the tier's mode of record, all on `dPath`
 * where applicable (GDD §8.4):
 *
 *   lookaheadDistance x 3.0  GDD §8.2 calls this "the primary difficulty
 *                            metric" — the number of targets the player has to
 *                            hold in mind at once. Weighted highest because the
 *                            spec says it is the dial.
 *   decisionPoints    x 2.0  Search burden: how many targets actually branch
 *                            when the player reaches them.
 *   maxTrapDepth      x 1.5  Frustration, not difficulty — how far the failure
 *                            surfaces from the mistake that caused it. Real
 *                            cost to the player, but a level is not "harder"
 *                            in the planning sense for punishing later.
 *   T                 x 1.0  Length. Lowest weight because GDD §4.5 is explicit
 *                            that difficulty should come from keystone
 *                            structure, not from length.
 *   uniqueness        x 1.0  1 / log2(solutionPaths + 1). GDD §8.7 names
 *                            solution uniqueness as a difficulty axis: one
 *                            winning line is meaningfully harder than fifty.
 *                            Log-scaled because the raw count spans 1..4000 —
 *                            the range was a scaling problem, not a relevance
 *                            problem. Puts a 1-path level at 1.00 and a
 *                            4000-path level at 0.08, so it can inform the
 *                            ordering without dominating it.
 *
 * The score rises across worlds on purpose: T is fixed per world by §7.2 and
 * both lookahead and decisionPoints scale with it. There is no cross-world
 * comparison to satisfy — player skill rises between worlds, so absolute
 * difficulty rising is correct. The saw lives inside each world (§7.3).
 */
export const WEIGHTS = {
  lookaheadDistance: 3.0,
  decisionPoints: 2.0,
  maxTrapDepth: 1.5,
  targetCount: 1.0,
  uniqueness: 1.0,
} as const;

/** 1 path -> 1.00, 3 paths -> 0.50, 50 paths -> 0.18, 4000 paths -> 0.08. */
export function uniquenessScore(solutionPaths: number): number {
  return 1 / Math.log2(Math.max(1, solutionPaths) + 1);
}

export interface ScoreBreakdown {
  readonly lookaheadDistance: number;
  readonly decisionPoints: number;
  readonly maxTrapDepth: number;
  readonly targetCount: number;
  readonly solutionPaths: number;
  readonly uniqueness: number;
  /** Composite including the uniqueness term. The ordering of record. */
  readonly total: number;
  /** Composite without uniqueness, kept so the term's effect is measurable. */
  readonly totalWithoutUniqueness: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

export function scoreLevel(level: GeneratedLevel, tier: TierSpec): ScoreBreakdown {
  const block = level.modes[tier.modeOfRecord];
  if (!block) {
    throw new Error(`${level.id} has no ${tier.modeOfRecord} block to score against`);
  }
  const m = block.metrics;
  const targetCount = level.targets.length;

  const base =
    WEIGHTS.lookaheadDistance * m.lookaheadDistance +
    WEIGHTS.decisionPoints * m.decisionPoints +
    WEIGHTS.maxTrapDepth * m.maxTrapDepth +
    WEIGHTS.targetCount * targetCount;

  const uniqueness = uniquenessScore(m.solutionPaths);

  return {
    lookaheadDistance: m.lookaheadDistance,
    decisionPoints: m.decisionPoints,
    maxTrapDepth: m.maxTrapDepth,
    targetCount,
    solutionPaths: m.solutionPaths,
    uniqueness: round(uniqueness),
    total: round(base + WEIGHTS.uniqueness * uniqueness),
    totalWithoutUniqueness: round(base),
  };
}
