import { budgetKey, scarcityOf, spend } from "./budget.js";
import { enumerate } from "./enumerate.js";
import { makePool, poolKey } from "./pool.js";
import { enumerateTransforms } from "./unary.js";
import { validateLevel } from "./validate.js";
import {
  DEFAULT_MAX_COLLECTED,
  type FatalBranch,
  type Level,
  type Mode,
  type Move,
  type OperatorBudget,
  type Rules,
  type SolveOptions,
  type SolveResult,
  type Tile,
} from "./types.js";

/**
 * Solver state, exactly as specified in GDD §8.3:
 * (remaining pool, target index, operator budget).
 */
export interface State {
  readonly tiles: readonly Tile[];
  readonly targetIndex: number;
  readonly budget: OperatorBudget;
}

interface Survival {
  readonly depth: number;
  readonly diesAt: number;
}

interface Ctx {
  readonly targets: readonly number[];
  readonly rules: Rules;
  readonly winnable: Map<string, boolean>;
  readonly survival: Map<string, Survival>;
  readonly moves: Map<string, readonly Move[]>;
  states: number;
}

export function resolveBudget(level: Level, mode: Mode | OperatorBudget): OperatorBudget {
  return typeof mode === "string" ? level.operators[mode] : mode;
}

/**
 * Memo key for winnability and survival depth. A value-class multiset, so two
 * states holding interchangeable tiles share an answer — which is correct,
 * because whether a board can still be won depends on values, not on which
 * physical tile carries them.
 */
export function stateKey(state: State): string {
  return `${poolKey(state.tiles)}#${state.targetIndex}#${budgetKey(state.budget)}`;
}

/**
 * Cache key for legal moves. Identifies the exact tiles in hand — id AND
 * current value AND transform state.
 *
 * The id is needed because a Move names the tiles it consumes and those ids
 * must exist in the state receiving it. The value is needed because a unary
 * transform rewrites a tile in place, keeping its id: `16` and `4` can be the
 * same tile at different moments, and they do not offer the same moves.
 */
export function movesKey(state: State): string {
  const tiles = state.tiles
    .map((t) => `${t.id}:${t.value}${t.transformed ? "'" : ""}`)
    .sort();
  return `${tiles.join(".")}#${state.targetIndex}#${budgetKey(state.budget)}`;
}

export function isComplete(ctx: Pick<Ctx, "targets">, state: State): boolean {
  return state.targetIndex >= ctx.targets.length;
}

/**
 * Every move legal from this state: binary decompositions of the front target,
 * plus every available pool transform.
 *
 * Transforms are included because a unary transform counts as a move for
 * failure detection (GDD §3.5) — a board with no legal equation but an
 * available `sqrt` is not yet dead.
 */
export function legalMoves(ctx: Ctx, state: State): readonly Move[] {
  // Keyed by concrete tile IDS, never by stateKey.
  //
  // stateKey is a value-class multiset, which is the right key for winnability
  // — that genuinely depends only on values. It is the WRONG key for moves,
  // because a Move carries the ids of the tiles it consumes. Pool [4,…,4,…]
  // reaching the same value signature by consuming different 4s produces two
  // distinct states with one stateKey; the second would receive moves naming
  // tiles it does not hold, applyMove's id filter would remove nothing, and the
  // state would advance a target while keeping a full pool.
  const key = movesKey(state);
  const cached = ctx.moves.get(key);
  if (cached !== undefined) return cached;

  const target = ctx.targets[state.targetIndex]!;
  const moves: Move[] = [];

  for (const decomp of enumerate(state.tiles, target, state.budget, ctx.rules)) {
    moves.push({ ...decomp, kind: "binary", targetIndex: state.targetIndex });
  }
  for (const transform of enumerateTransforms(state.tiles, state.budget, ctx.rules)) {
    moves.push({ ...transform, kind: "unary", targetIndex: state.targetIndex });
  }

  ctx.moves.set(key, moves);
  return moves;
}

export function applyMove(state: State, move: Move): State {
  if (move.kind === "binary") {
    return {
      tiles: state.tiles.filter((t) => t.id !== move.leftId && t.id !== move.rightId),
      targetIndex: state.targetIndex + 1,
      budget: spend(state.budget, move.op),
    };
  }
  return {
    tiles: state.tiles.map((t) =>
      t.id === move.tileId ? { id: t.id, value: move.to, transformed: true } : t,
    ),
    targetIndex: state.targetIndex,
    budget: spend(state.budget, move.op),
  };
}

/** Memoised DFS. True if the queue can still be cleared from here. */
function winnable(ctx: Ctx, state: State): boolean {
  if (isComplete(ctx, state)) return true;

  const key = stateKey(state);
  const cached = ctx.winnable.get(key);
  if (cached !== undefined) return cached;

  ctx.states++;
  ctx.winnable.set(key, false);

  let ok = false;
  for (const move of legalMoves(ctx, state)) {
    if (winnable(ctx, applyMove(state, move))) {
      ok = true;
      break;
    }
  }

  ctx.winnable.set(key, ok);
  return ok;
}

/**
 * How much longer a doomed branch stays alive, and where it finally stalls.
 *
 * Only meaningful on unwinnable states — every continuation is a dead end, so
 * this takes the longest one. Termination is guaranteed: a binary move advances
 * the target index, and a unary move strictly reduces the count of
 * untransformed tiles.
 */
function survival(ctx: Ctx, state: State): Survival {
  const key = stateKey(state);
  const cached = ctx.survival.get(key);
  if (cached !== undefined) return cached;

  let best: Survival = { depth: 0, diesAt: state.targetIndex };
  for (const move of legalMoves(ctx, state)) {
    const child = survival(ctx, applyMove(state, move));
    if (child.depth + 1 > best.depth) {
      best = { depth: child.depth + 1, diesAt: child.diesAt };
    }
  }

  ctx.survival.set(key, best);
  return best;
}

function collectWinningPaths(
  ctx: Ctx,
  state: State,
  prefix: Move[],
  out: Move[][],
  cap: number,
): void {
  if (isComplete(ctx, state)) {
    out.push([...prefix]);
    return;
  }
  for (const move of legalMoves(ctx, state)) {
    if (out.length >= cap) return;
    const next = applyMove(state, move);
    if (!winnable(ctx, next)) continue;
    prefix.push(move);
    collectWinningPaths(ctx, next, prefix, out, cap);
    prefix.pop();
  }
}

/**
 * Every fatal move offered from a state that was still winnable — the moves
 * that actually lose the level, as opposed to moves made after it was already
 * lost. This is what Casual mode's fatal-move warning consumes.
 */
function collectFatalMoves(
  ctx: Ctx,
  state: State,
  prefix: Move[],
  out: FatalBranch[],
  seen: Set<string>,
  cap: number,
): void {
  if (isComplete(ctx, state)) return;

  const key = stateKey(state);
  if (seen.has(key)) return;
  seen.add(key);

  for (const move of legalMoves(ctx, state)) {
    const next = applyMove(state, move);
    if (winnable(ctx, next)) {
      prefix.push(move);
      collectFatalMoves(ctx, next, prefix, out, seen, cap);
      prefix.pop();
      continue;
    }
    if (out.length >= cap) continue;
    const doomed = survival(ctx, next);
    out.push({
      prefix: [...prefix],
      move,
      targetIndex: state.targetIndex,
      trapDepth: doomed.depth + 1,
      diesAtTargetIndex: doomed.diesAt,
    });
  }
}

/**
 * Solve a level under one operator scarcity. Exhaustive: every winning path and
 * every dead branch.
 *
 * Cross-mode solvability is NOT free (GDD §13). A level solvable with unlimited
 * `+` may have no solution under a consumed budget — run this once per mode and
 * never assume the result transfers.
 */
export function solve(
  level: Level,
  mode: Mode | OperatorBudget,
  options: SolveOptions = {},
): SolveResult {
  validateLevel(level);

  const budget = resolveBudget(level, mode);
  const cap = options.maxCollected ?? DEFAULT_MAX_COLLECTED;

  const ctx: Ctx = {
    targets: level.targets,
    rules: level.rules,
    winnable: new Map(),
    survival: new Map(),
    moves: new Map(),
    states: 0,
  };

  const start: State = { tiles: makePool(level.pool), targetIndex: 0, budget };
  const solvable = winnable(ctx, start);

  const winningPaths: Move[][] = [];
  const fatalMoves: FatalBranch[] = [];

  if (solvable) {
    collectWinningPaths(ctx, start, [], winningPaths, cap);
    if (options.collectFatalMoves !== false) {
      collectFatalMoves(ctx, start, [], fatalMoves, new Set(), cap);
    }
  }

  return {
    budget,
    scarcity: scarcityOf(budget, level.targets.length),
    solvable,
    winningPaths,
    fatalMoves,
    truncated: winningPaths.length >= cap || fatalMoves.length >= cap,
    states: ctx.states,
  };
}

export interface LineCount {
  /** Complete play-throughs that clear the queue. */
  readonly winning: number;
  /** Complete play-throughs, win or dead end. */
  readonly total: number;
  readonly truncated: boolean;
}

/**
 * Count every distinct play-through from the opening board to a terminal state
 * — cleared queue or stuck lane.
 *
 * GDD §8.4: `survivalRate = solutionPaths / totalLinesExplored`. The winning
 * count alone says nothing about forgiveness; 337 winning lines is brutal out
 * of 4000 and a walkover out of 400.
 *
 * Lines are counted, not stored, and moves are already canonicalised per state,
 * so this agrees with `solutionPaths` by construction. Memoisation would be
 * wrong here: the same state reached by two prefixes is two distinct lines.
 */
export function countLines(
  level: Level,
  mode: Mode | OperatorBudget,
  maxLines = 2_000_000,
): LineCount {
  validateLevel(level);

  const budget = resolveBudget(level, mode);
  const ctx: Ctx = {
    targets: level.targets,
    rules: level.rules,
    winnable: new Map(),
    survival: new Map(),
    moves: new Map(),
    states: 0,
  };

  let winning = 0;
  let total = 0;
  let truncated = false;

  const walk = (state: State): void => {
    if (truncated) return;
    if (isComplete(ctx, state)) {
      winning++;
      total++;
      return;
    }
    const moves = legalMoves(ctx, state);
    if (moves.length === 0) {
      total++;
      return;
    }
    for (const move of moves) {
      if (total >= maxLines) {
        truncated = true;
        return;
      }
      walk(applyMove(state, move));
    }
  };

  walk({ tiles: makePool(level.pool), targetIndex: 0, budget });
  return { winning, total, truncated };
}

/**
 * Memo tables that survive between `isWinnable` calls.
 *
 * Casual re-asks the same question on every commit, and a fresh context re-walks
 * the whole tree each time — measured at up to 28ms on a T=7, N=16 board, which
 * blows a 60fps frame and would be several times worse on the low-end Android
 * §13 names. Sharing the memo across a level makes every call after the first a
 * lookup.
 *
 * Safe to reuse for one level: the keys carry the target index and the operator
 * budget, so a spent budget cannot collide with an unspent one.
 */
export interface WinnabilityCache {
  readonly winnable: Map<string, boolean>;
  readonly survival: Map<string, Survival>;
  readonly moves: Map<string, readonly Move[]>;
}

export function createWinnabilityCache(): WinnabilityCache {
  return { winnable: new Map(), survival: new Map(), moves: new Map() };
}

/**
 * Cheap solvability check for a live board — what Casual mode calls on every
 * commit to decide whether to warn. Skips path and dead-branch collection.
 *
 * Pass a `cache` to share memo tables across calls on the same level.
 */
export function isWinnable(
  level: Level,
  mode: Mode | OperatorBudget,
  state?: State,
  cache?: WinnabilityCache,
): boolean {
  const budget = resolveBudget(level, mode);
  const ctx: Ctx = {
    targets: level.targets,
    rules: level.rules,
    winnable: cache?.winnable ?? new Map(),
    survival: cache?.survival ?? new Map(),
    moves: cache?.moves ?? new Map(),
    states: 0,
  };
  return winnable(
    ctx,
    state ?? { tiles: makePool(level.pool), targetIndex: 0, budget },
  );
}
