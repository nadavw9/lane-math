import { enumerate } from "./enumerate.js";
import { makePool } from "./pool.js";
import { resolveBudget, solve } from "./solve.js";
import { validateLevel } from "./validate.js";
import type {
  Decomposition,
  KeystoneInfo,
  Level,
  Metrics,
  Mode,
  OperatorBudget,
  SolveOptions,
  SolveResult,
} from "./types.js";

export interface AnalyseOptions extends SolveOptions {
  /** A solve() result for the same level and budget, to avoid re-solving. */
  readonly reuse?: SolveResult;
}

/**
 * GDD §8.4 metrics.
 *
 * `d_i` is measured against the STARTING pool, not the pool as reached. GDD §13
 * resolves keystone uniqueness that way — the starting pool is what the player
 * can see and reason about at level open — and the two definitions must agree
 * or `decisionPoints` and `keystones` would be counting different things.
 */
export function analyse(
  level: Level,
  mode: Mode | OperatorBudget,
  options: AnalyseOptions = {},
): Metrics {
  validateLevel(level);

  const budget = resolveBudget(level, mode);
  const startingPool = makePool(level.pool);

  const decompositions: Decomposition[][] = level.targets.map((target) =>
    enumerate(startingPool, target, budget, level.rules),
  );
  const decompositionCounts = decompositions.map((d) => d.length);

  const keystoneDetail = findKeystones(decompositions);
  // A caller that has already solved this exact (level, budget) can hand the
  // result back rather than paying for it twice.
  const result = options.reuse ?? solve(level, budget, options);

  return {
    // GDD §3.1: N = 2T + S. Unary transforms rewrite tiles rather than
    // consuming them, so they do not disturb this.
    surplus: level.pool.length - 2 * level.targets.length,
    decompositionCounts,
    decisionPoints: decompositionCounts.filter((count) => count >= 2).length,
    keystones: keystoneDetail.map((k) => k.index),
    keystoneDetail,
    overlappingKeystonePairs: countOverlaps(keystoneDetail),
    lookaheadDistance: keystoneDetail.reduce((max, k) => Math.max(max, k.lookahead), 0),
    solutionPaths: result.winningPaths.length,
    maxTrapDepth: result.fatalMoves.reduce((max, f) => Math.max(max, f.trapDepth), 0),
    solvable: result.solvable,
  };
}

/**
 * GDD §8.2. A keystone is a target that
 *   1. has exactly one decomposition from the starting pool,
 *   2. sits late enough that an earlier target exists, and
 *   3. has contested operands — some earlier target can be made in a way that
 *      consumes one of them.
 *
 * Condition 3 is what makes the trap live. Without it the player stumbles onto
 * the correct line by accident and there is no puzzle.
 *
 * Lookahead distance = keystone position minus the earliest target that can
 * steal from it. This is the primary difficulty dial.
 */
function findKeystones(decompositions: readonly Decomposition[][]): KeystoneInfo[] {
  const keystones: KeystoneInfo[] = [];

  for (let i = 0; i < decompositions.length; i++) {
    const only = decompositions[i]!;
    if (only.length !== 1) continue;

    const operands = new Set([only[0]!.left, only[0]!.right]);

    let earliestThief = -1;
    for (let j = 0; j < i; j++) {
      const steals = decompositions[j]!.some(
        (alt) => operands.has(alt.left) || operands.has(alt.right),
      );
      if (steals) {
        earliestThief = j;
        break;
      }
    }

    if (earliestThief === -1) continue;

    keystones.push({
      index: i,
      operands: [...operands],
      earliestThief,
      lookahead: i - earliestThief,
    });
  }

  return keystones;
}

/** Keystone pairs that contest at least one number. */
function countOverlaps(keystones: readonly KeystoneInfo[]): number {
  let pairs = 0;
  for (let a = 0; a < keystones.length; a++) {
    for (let b = a + 1; b < keystones.length; b++) {
      const left = new Set(keystones[a]!.operands);
      if (keystones[b]!.operands.some((v) => left.has(v))) pairs++;
    }
  }
  return pairs;
}
