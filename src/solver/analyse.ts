import { enumerate } from "./enumerate.js";
import { makePool } from "./pool.js";
import { applyMove, resolveBudget, solve, type State } from "./solve.js";
import { validateLevel } from "./validate.js";
import type {
  Decomposition,
  KeystoneInfo,
  Level,
  Metrics,
  Mode,
  Move,
  OperatorBudget,
  SolveOptions,
  SolveResult,
} from "./types.js";

export interface AnalyseOptions extends SolveOptions {
  /** A solve() result for the same level and budget, to avoid re-solving. */
  readonly reuse?: SolveResult;
  /**
   * The line `dPath` is measured along. Defaults to the first winning path in
   * canonical enumeration order — deterministic, and derivable from the level
   * JSON alone, which is what lets verification reproduce a published `dPath`
   * without knowing how the level was constructed.
   */
  readonly intendedLine?: readonly Move[];
}

/**
 * GDD §8.4 metrics.
 *
 * Two decomposition counts, deliberately kept apart:
 *
 *   dStart  from the starting pool. Structure and keystone detection, because
 *           the starting pool is what the player can see and reason about at
 *           level open (GDD §13).
 *   dPath   from the pool as reached along the intended winning line. Search
 *           burden, and the only basis `decisionPoints` may use — banding on
 *           dStart rejects correctly-difficult large boards (GDD §8.4).
 *
 * Reporting only one of them is a spec error.
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
  const dStart = decompositions.map((d) => d.length);

  const keystoneDetail = findKeystones(decompositions);
  // A caller that has already solved this exact (level, budget) can hand the
  // result back rather than paying for it twice.
  const result = options.reuse ?? solve(level, budget, options);

  const intendedLine = options.intendedLine ?? result.winningPaths[0] ?? null;
  const dPath = intendedLine ? computeDPath(level, budget, intendedLine) : [];

  return {
    // GDD §3.1: N = 2T + S. Unary transforms rewrite tiles rather than
    // consuming them, so they do not disturb this.
    surplus: level.pool.length - 2 * level.targets.length,
    dStart,
    dPath,
    decisionPoints: dPath.filter((count) => count >= 2).length,
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
 * Walk the intended line, counting the decompositions available at each target.
 *
 * Measured immediately before the binary move that clears the target, so any
 * unary transforms the line performs while that target is at the front have
 * already happened. That keeps `dPath_i >= 1` on a solvable level — the
 * intended move is always one of the options counted.
 *
 * The budget is carried forward too: under a counted or consumed budget, what
 * the player can see at target 5 depends on what they spent at targets 1–4.
 */
function computeDPath(
  level: Level,
  budget: OperatorBudget,
  path: readonly Move[],
): number[] {
  const dPath: number[] = [];
  let state: State = { tiles: makePool(level.pool), targetIndex: 0, budget };

  for (const move of path) {
    if (move.kind === "binary") {
      dPath.push(
        enumerate(state.tiles, level.targets[state.targetIndex]!, state.budget, level.rules)
          .length,
      );
    }
    state = applyMove(state, move);
  }

  return dPath;
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
