import type { BinaryOp } from "../solver/index.js";
import type { Rng } from "./rng.js";
import type { TierSpec } from "./tiers.js";

/**
 * GDD §8.3 step 1 — CONSTRUCT BACKWARDS. Never forward-search.
 *
 * Pick T operand pairs and an operator for each, compute the targets. A valid
 * solution exists by construction; everything downstream measures the board
 * rather than searching for a way to win it.
 */
export interface Construction {
  /** 2T operand values, before decoys. */
  readonly pool: readonly number[];
  readonly targets: readonly number[];
  /** The operator used per target by the construction's own solution. */
  readonly solutionOps: readonly BinaryOp[];
  /** How many pool tiles were stored squared and need a sqrt to unlock. */
  readonly transforms: number;
}

/**
 * Construction strategy — the variable this session exists to test.
 *
 *   random    Pure rejection sampling. Operand pairs and queue order are
 *             uniform within the tier's constraints. Whether a keystone
 *             appears, and where, is left entirely to chance.
 *   directed  Same value sampling, but the queue is ordered to put a
 *             single-decomposition target last. This is the cheapest possible
 *             step away from pure rejection sampling, and isolating it tells
 *             us whether ordering alone rescues the top of the curve.
 */
export type Strategy = "random" | "directed";

interface Pair {
  readonly a: number;
  readonly b: number;
  readonly op: BinaryOp;
  readonly result: number;
}

/** Build one operand pair for `op`, or null if the roll produced nothing legal. */
function buildPair(op: BinaryOp, tier: TierSpec, rng: Rng): Pair | null {
  const max = tier.operandMax;

  switch (op) {
    // Every branch samples INSIDE the legal range rather than sampling freely
    // and discarding misses. Sample-and-reject looks harmless but it silently
    // throttled the top tiers: with operandMax 12, only ~30% of division rolls
    // produced a dividend that fits the pool, and at T=6 that compounded into
    // ~70% of all attempts dying before a single design rule was evaluated.
    case "+": {
      const a = rng.int(1, max);
      const bMax = Math.min(max, tier.targetMax - a);
      if (bMax < 1) return null;
      const b = rng.int(1, bMax);
      return { a, b, op, result: a + b };
    }
    case "-": {
      const a = rng.int(2, max);
      const b = rng.int(1, a - 1);
      // GDD §3.6: early worlds reject negatives, and a zero target is not a
      // thing the lane can display. Both are excluded by construction.
      return { a, b, op, result: a - b };
    }
    case "*": {
      // x1 is a degenerate pair: it reads as a non-move and clutters d_i.
      const a = rng.int(2, Math.min(max, 9));
      const bMax = Math.min(max, 9, Math.floor(tier.targetMax / a));
      if (bMax < 2) return null;
      const b = rng.int(2, bMax);
      return { a, b, op, result: a * b };
    }
    case "/": {
      // The dividend a = b*q has to be a pool tile, so bound the quotient by
      // the divisor rather than rolling both and hoping the product fits.
      const b = rng.int(2, Math.max(2, Math.floor(max / 2)));
      const quotientMax = Math.min(9, Math.floor(max / b));
      if (quotientMax < 2) return null;
      const result = rng.int(2, quotientMax);
      return { a: b * result, b, op, result };
    }
  }
}

/**
 * Store one operand squared so the solution needs a sqrt to unlock it
 * (GDD §3.3 — unary operators manufacture a number you do not have).
 * Returns the rewritten pool, or null if no operand can be squared in range.
 */
function applySqrtSubstitution(
  pool: number[],
  tier: TierSpec,
  rng: Rng,
): { pool: number[]; transforms: number } | null {
  // Keep the squared tile small. GDD §3.3: sqrt shrinks and behaves well, but
  // the premise is that the arithmetic stays trivial — a 144 on the board is
  // working against that.
  const candidates = pool
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value >= 2 && value * value <= Math.max(36, tier.operandMax * 4));

  if (candidates.length === 0) return null;

  const chosen = rng.pick(candidates);
  const rewritten = [...pool];
  rewritten[chosen.index] = chosen.value * chosen.value;
  return { pool: rewritten, transforms: 1 };
}

/**
 * One candidate board. Returns null when the dice produced nothing legal —
 * the caller counts that as a construction miss, not a design rejection.
 */
export function construct(
  tier: TierSpec,
  rng: Rng,
  strategy: Strategy,
  decompositionCounter: (pool: readonly number[], target: number) => number,
): Construction | null {
  const targetCount = rng.int(tier.targetCount.min, tier.targetCount.max);

  const pairs: Pair[] = [];
  for (let i = 0; i < targetCount; i++) {
    const pair = buildPair(rng.pick(tier.ops), tier, rng);
    if (!pair) return null;
    pairs.push(pair);
  }

  let ordered = rng.shuffle(pairs);

  if (strategy === "directed") {
    // Move a target that is already hard to make another way to the back of
    // the queue. Value selection is untouched — only the ordering is directed.
    const pool = pairs.flatMap((p) => [p.a, p.b]);
    const scored = ordered.map((pair) => ({
      pair,
      count: decompositionCounter(pool, pair.result),
    }));
    const unique = scored.filter((s) => s.count === 1);
    if (unique.length > 0) {
      const keystone = rng.pick(unique).pair;
      ordered = [...ordered.filter((p) => p !== keystone), keystone];
    }
  }

  let pool = ordered.flatMap((p) => [p.a, p.b]);
  let transforms = 0;

  if (tier.unaryOps.includes("sqrt") && rng.chance(0.5)) {
    const substituted = applySqrtSubstitution(pool, tier, rng);
    if (substituted) {
      pool = substituted.pool;
      transforms = substituted.transforms;
    }
  }

  return {
    pool,
    targets: ordered.map((p) => p.result),
    solutionOps: ordered.map((p) => p.op),
    transforms,
  };
}
