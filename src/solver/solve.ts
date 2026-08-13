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

export function stateKey(state: State): string {
  return `${poolKey(state.tiles)}#${state.targetIndex}#${budgetKey(state.budget)}`;
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
  const key = stateKey(state);
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

/**
 * Cheap solvability check for a live board — what Casual mode calls on every
 * commit to decide whether to warn. Skips path and dead-branch collection.
 */
export function isWinnable(
  level: Level,
  mode: Mode | OperatorBudget,
  state?: State,
): boolean {
  const budget = resolveBudget(level, mode);
  const ctx: Ctx = {
    targets: level.targets,
    rules: level.rules,
    winnable: new Map(),
    survival: new Map(),
    moves: new Map(),
    states: 0,
  };
  return winnable(
    ctx,
    state ?? { tiles: makePool(level.pool), targetIndex: 0, budget },
  );
}
