import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { GeneratedLevel } from "../generator/pipeline.js";
import { LAUNCH_TIERS, tierByName, type TierSpec } from "../generator/tiers.js";
import { scoreLevel, type ScoreBreakdown } from "./score.js";
import {
  isDistinctBoard,
  isNearForced,
  isTrapShaped,
  isTwoKeystone,
  sharesShape,
  type Candidate,
  type SlotRole,
} from "./slots.js";

export interface LadderSlot {
  readonly world: number;
  readonly slot: number;
  readonly id: string;
  readonly role: SlotRole;
  readonly candidate: Candidate;
  readonly breakdown: ScoreBreakdown;
}

export interface UnfilledSlot {
  readonly world: number;
  readonly slot: number;
  readonly id: string;
  readonly role: SlotRole;
  readonly reason: string;
}

export interface CurationResult {
  readonly ladder: readonly LadderSlot[];
  readonly unfilled: readonly UnfilledSlot[];
  readonly poolSizes: ReadonlyMap<string, number>;
}

export { loadCorpus };

const slotId = (world: number, slot: number): string =>
  `${world}-${String(slot).padStart(2, "0")}`;

function loadCorpus(dir: string): GeneratedLevel[] {
  const out: GeneratedLevel[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.startsWith("gen-") && entry.endsWith(".json")) {
        out.push(JSON.parse(readFileSync(path, "utf8")) as GeneratedLevel);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Build the candidate pool for one tier.
 *
 * GDD §10: the curated ladder requires all three modes. The corpus is allowed
 * to be permissive; the ladder is not, because §6 promises the same 40 levels
 * across three modes and a gap leaves Expert players with broken progression.
 */
/**
 * Which composite to order by. Both are computed for every level; running the
 * whole curation under each is the only way to answer whether the uniqueness
 * term changes anything, since it affects selection and not just display.
 */
export type ScoreKey = "total" | "totalWithoutUniqueness";

export function poolFor(
  corpus: readonly GeneratedLevel[],
  tier: TierSpec,
  scoreKey: ScoreKey = "total",
): Candidate[] {
  const seen = new Set<string>();
  const pool: Candidate[] = [];

  for (const level of corpus) {
    if (level.generator.targetTier !== tier.name) continue;
    if (!level.modes.casual || !level.modes.normal || !level.modes.expert) continue;
    if (seen.has(level.generator.hash)) continue;
    seen.add(level.generator.hash);

    const block = level.modes[tier.modeOfRecord]!;
    const breakdown = scoreLevel(level, tier);
    pool.push({
      level,
      tier,
      score: breakdown[scoreKey],
      decisionPoints: block.metrics.decisionPoints,
      lookahead: block.metrics.lookaheadDistance,
      maxTrapDepth: block.metrics.maxTrapDepth,
      keystones: block.metrics.keystones.length,
      dPath: block.metrics.dPath,
      temptation: level.generator.peakTemptation,
    });
  }

  return pool.sort((a, b) => a.score - b.score);
}

/** Evenly-spaced picks across a sorted pool, so the world spans its range. */
function spread(sorted: readonly Candidate[], count: number): Candidate[] {
  if (sorted.length <= count) return [...sorted];
  if (count === 1) return [sorted[0]!];
  const picked: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * (sorted.length - 1)) / (count - 1));
    picked.push(sorted[index]!);
  }
  return picked;
}

/**
 * GDD §7.3, amended: the opening slot of a world is the valley.
 *
 * It must be the minimum composite score WITHIN ITS OWN WORLD and sit at the
 * floor of its tier band on both lookahead and decisionPoints — the new
 * mechanic arrives with everything else dialled down. The valley is about
 * novelty load, not absolute score.
 *
 * There is deliberately no cross-world comparison. T is fixed per world by
 * §7.2 and both lookahead and decisionPoints scale with it, so absolute score
 * must rise at every boundary; asking otherwise fights the progression the
 * spec mandates.
 */
export function pickValleyOpener(pool: readonly Candidate[], tier: TierSpec): Candidate | undefined {
  const atFloor = pool.filter(
    (c) => c.lookahead === tier.lookahead.min && c.decisionPoints === tier.decisionPoints.min,
  );
  const source = atFloor.length > 0 ? atFloor : pool;
  return [...source].sort((a, b) => a.score - b.score)[0];
}

function take(pool: Candidate[], candidate: Candidate | undefined): Candidate | undefined {
  if (!candidate) return undefined;
  const index = pool.indexOf(candidate);
  if (index >= 0) pool.splice(index, 1);
  return candidate;
}

/**
 * World 1 follows the beat sheet in GDD §7.4 rather than a plain ramp:
 *
 *   1-1  near-forced, unloseable
 *   1-2  free decisions appear, still no fatal branch
 *   1-3  same, slightly more
 *   1-4  THE SCRIPTED TRAP — local peak
 *   1-5  valley, recovery beat
 *   1-6  the trap shape again, warning off — second peak
 *   1-7..1-9  rising
 *   1-10 world peak
 */
function curateWorldOne(
  pool: Candidate[],
  forcedPool: Candidate[],
  unfilled: UnfilledSlot[],
): LadderSlot[] {
  const tier = tierByName("tutorial");
  const slots: (LadderSlot | null)[] = Array(10).fill(null);

  const place = (
    slot: number,
    role: SlotRole,
    candidate: Candidate | undefined,
    scoringTier: TierSpec = tier,
  ): void => {
    if (!candidate) return;
    slots[slot - 1] = {
      world: 1,
      slot,
      id: slotId(1, slot),
      role,
      candidate,
      breakdown: scoreLevel(candidate.level, scoringTier),
    };
  };

  // 1-1: near-forced, drawn from the dedicated tutorial-forced pool. The main
  // tutorial tier cannot supply this board — it requires a live trap, and a
  // trap implies a branch (GDD §7.4 vs §7.5). Cheapest such board, so it is
  // also the gentlest possible opening.
  const nearForced = take(forcedPool, forcedPool.filter(isNearForced)[0]);
  if (nearForced) place(1, "near-forced", nearForced, nearForced.tier);
  else {
    unfilled.push({
      world: 1,
      slot: 1,
      id: slotId(1, 1),
      role: "near-forced",
      reason: "no tutorial-forced board with every dPath_i = 1 and decisionPoints 0",
    });
  }

  // 1-4: the scripted trap. Most tempting board with exactly one keystone.
  const trapCandidates = pool.filter(isTrapShaped).sort((a, b) => b.temptation - a.temptation);
  const trap = take(pool, trapCandidates[0]);
  if (trap) place(4, "scripted-trap", trap);
  else {
    unfilled.push({
      world: 1,
      slot: 4,
      id: slotId(1, 4),
      role: "scripted-trap",
      reason: "no tutorial board with one keystone, temptation >= 0.5 and trap depth >= 2",
    });
  }

  // 1-6: same shape, different numbers.
  if (trap) {
    const retest = take(
      pool,
      pool
        .filter((c) => isTrapShaped(c) && sharesShape(c, trap) && isDistinctBoard(c, trap))
        .sort((a, b) => b.temptation - a.temptation)[0],
    );
    if (retest) place(6, "trap-retest", retest);
    else {
      unfilled.push({
        world: 1,
        slot: 6,
        id: slotId(1, 6),
        role: "trap-retest",
        reason: `no second trap-shaped board matching 1-4's shape (k${trap.keystones}/l${trap.lookahead}/d${trap.decisionPoints})`,
      });
    }
  }

  // Remaining beats, easiest first: 1-2, 1-3, then 1-5 as the recovery valley,
  // then 1-7 through 1-10 rising to the world peak.
  const order: [number, SlotRole][] = [
    [2, "standard"],
    [3, "standard"],
    [5, "valley"],
    [7, "standard"],
    [8, "standard"],
    [9, "standard"],
    [10, "world-peak"],
  ];
  const needed = order.filter(([slot]) => slots[slot - 1] === null);
  const chosen = spread(pool, needed.length);

  needed.forEach(([slot, role], i) => {
    const candidate = chosen[i];
    if (candidate) place(slot, role, candidate);
    else {
      unfilled.push({
        world: 1,
        slot,
        id: slotId(1, slot),
        role,
        reason: "tutorial candidate pool exhausted",
      });
    }
  });

  return slots.filter((s): s is LadderSlot => s !== null);
}

/**
 * Worlds 2-4: valley at slots 1-2 so the new mechanic arrives without
 * difficulty pressure, a rise across 3-9, and the world's peak at 10 (§7.3).
 *
 * World 4 additionally reserves its last three slots for two-keystone boards —
 * §7.2 calls these "the FIRST two-keystone levels", which is a curation
 * requirement on specific slots, not a tier band (§8.7).
 */
function curateWorld(
  world: number,
  tier: TierSpec,
  pool: Candidate[],
  unfilled: UnfilledSlot[],
): LadderSlot[] {
  const slots: (LadderSlot | null)[] = Array(10).fill(null);

  const place = (slot: number, role: SlotRole, candidate: Candidate): void => {
    slots[slot - 1] = {
      world,
      slot,
      id: slotId(world, slot),
      role,
      candidate,
      breakdown: scoreLevel(candidate.level, tier),
    };
  };

  const twoKeystoneSlots = world === 4 ? [8, 9, 10] : [];
  if (twoKeystoneSlots.length > 0) {
    const need = twoKeystoneSlots.length;
    const others = 10 - need;
    const available = pool.filter(isTwoKeystone);

    // The reserved slots sit at the TOP of the world, so every one of them must
    // outrank every non-reserved slot — otherwise slot 10 is not the world peak
    // and the curve dips into its own climax.
    //
    // Take the HIGHEST threshold that still leaves enough two-keystone boards
    // above it and enough boards below it. The lowest qualifying cut also keeps
    // the ordering monotonic, but it strands the seven non-reserved slots in a
    // narrow band and stacks the whole climb into two jumps at the end.
    let threshold = Number.POSITIVE_INFINITY;
    for (const candidate of [...pool].reverse()) {
      const above = available.filter((c) => c.score >= candidate.score).length;
      const below = pool.filter((c) => c.score < candidate.score).length;
      if (above >= need && below >= others) {
        threshold = candidate.score;
        break;
      }
    }

    const eligible =
      threshold === Number.POSITIVE_INFINITY
        ? available
        : available.filter((c) => c.score >= threshold);
    const picks = spread(eligible, need);

    twoKeystoneSlots.forEach((slot, i) => {
      const candidate = take(pool, picks[i]);
      if (candidate) {
        place(slot, slot === 10 ? "world-peak" : "two-keystone", candidate);
      } else {
        unfilled.push({
          world,
          slot,
          id: slotId(world, slot),
          role: "two-keystone",
          reason: `only ${available.length} two-keystone ${tier.name} boards with all three modes; needed ${need}`,
        });
      }
    });

    // Non-reserved slots must stay below the reserved block.
    if (threshold !== Number.POSITIVE_INFINITY) {
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i]!.score >= threshold) pool.splice(i, 1);
      }
    }
  }

  // Slot 1 is the valley: minimum score in this world, at the floor of the
  // tier band on lookahead and decisionPoints (§7.3, amended).
  const opener = take(pool, pickValleyOpener(pool, tier));
  if (opener) place(1, "valley", opener);
  else {
    unfilled.push({
      world,
      slot: 1,
      id: slotId(world, 1),
      role: "valley",
      reason: `no ${tier.name} board at the tier floor (lookahead ${tier.lookahead.min}, decisionPoints ${tier.decisionPoints.min})`,
    });
  }

  const remaining: [number, SlotRole][] = [];
  for (let slot = 1; slot <= 10; slot++) {
    if (slots[slot - 1] !== null) continue;
    remaining.push([slot, slot === 10 ? "world-peak" : slot === 2 ? "valley" : "standard"]);
  }

  const chosen = spread(pool, remaining.length);
  remaining.forEach(([slot, role], i) => {
    const candidate = chosen[i];
    if (candidate) place(slot, role, candidate);
    else {
      unfilled.push({
        world,
        slot,
        id: slotId(world, slot),
        role,
        reason: `${tier.name} candidate pool exhausted (${pool.length} available with all three modes)`,
      });
    }
  });

  return slots.filter((s): s is LadderSlot => s !== null);
}

export function curate(
  corpusDir: string,
  scoreKey: ScoreKey = "total",
  preloaded?: readonly GeneratedLevel[],
): CurationResult {
  const corpus = preloaded ?? loadCorpus(corpusDir);
  const unfilled: UnfilledSlot[] = [];
  const ladder: LadderSlot[] = [];
  const poolSizes = new Map<string, number>();

  for (const tier of LAUNCH_TIERS) {
    const world = tier.ladderWorld;
    if (world === null) continue;

    const pool = poolFor(corpus, tier, scoreKey);
    poolSizes.set(tier.name, pool.length);

    if (world === 1) {
      const forced = tierByName("tutorial-forced");
      const forcedPool = poolFor(corpus, forced, scoreKey);
      poolSizes.set(forced.name, forcedPool.length);
      ladder.push(...curateWorldOne(pool, forcedPool, unfilled));
    } else {
      ladder.push(...curateWorld(world, tier, pool, unfilled));
    }
  }

  ladder.sort((a, b) => a.world - b.world || a.slot - b.slot);
  return { ladder, unfilled, poolSizes };
}
