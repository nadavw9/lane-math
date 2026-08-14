import {
  analyse,
  applyMove,
  enumerate,
  isWinnable,
  makePool,
  type Level,
  type OperatorBudget,
  type Rules,
  type State,
  type Tile,
} from "../solver/index.js";

/**
 * GDD §5.4. Hints are bought with stars and **none may reveal a keystone
 * outright** — in a single-keystone level "the 15 has only one solution" IS
 * the answer, and the player has purchased the solution rather than help.
 */
export type HintType = "narrow" | "contested" | "branch";

export const HINT_COST: Readonly<Record<HintType, number>> = {
  narrow: 1,
  contested: 2,
  branch: 3,
};

export const HINT_LABEL: Readonly<Record<HintType, string>> = {
  narrow: "Narrow",
  contested: "Contested resource",
  branch: "Branch elimination",
};

export interface Hint {
  readonly type: HintType;
  readonly text: string;
  /** Pool tiles to mark. Never the operands of a keystone's only decomposition. */
  readonly tileIds: readonly number[];
  /** Target index to mark, if any. */
  readonly targetIndex: number | null;
  /** A fatal move to strike out — branch elimination only. */
  readonly forbiddenMove: { readonly leftId: number; readonly rightId: number; readonly op: string } | null;
}

export interface HintContext {
  readonly level: Level;
  readonly tiles: readonly Tile[];
  readonly targetIndex: number;
  readonly budget: OperatorBudget;
  readonly rules: Rules;
}

/**
 * "One of the last three targets has only one solution."
 *
 * Shrinks the search without ending it: the player learns a keystone exists and
 * roughly where, not which target it is or what makes it.
 */
function narrow(ctx: HintContext): Hint | null {
  const metrics = analyse(ctx.level, ctx.budget);
  const keystones = metrics.keystones.filter((i) => i >= ctx.targetIndex);
  if (keystones.length === 0) return null;

  const last = ctx.level.targets.length;
  const span = Math.max(2, Math.min(3, last - Math.min(...keystones)));
  return {
    type: "narrow",
    text: `One of the last ${span} targets has only one solution.`,
    tileIds: [],
    targetIndex: null,
    forbiddenMove: null,
  };
}

/**
 * "The 5 is contested."
 *
 * Points at the scarce number, not at what needs it. The player still has to
 * work out which later target reserves it.
 */
function contested(ctx: HintContext): Hint | null {
  const metrics = analyse(ctx.level, ctx.budget);
  const detail = metrics.keystoneDetail.find((k) => k.index >= ctx.targetIndex);
  if (!detail) return null;

  // Name the operand an EARLIER target could also consume — the one actually
  // under pressure. Naming both would hand over the decomposition.
  const front = ctx.level.targets[ctx.targetIndex];
  if (front === undefined) return null;
  const here = enumerate(ctx.tiles, front, ctx.budget, ctx.rules);
  const pressured = detail.operands.filter((value) =>
    here.some((d) => d.left === value || d.right === value),
  );
  const value = pressured[0] ?? detail.operands[0]!;

  return {
    type: "contested",
    text: `The ${value} is contested.`,
    tileIds: ctx.tiles.filter((t) => t.value === value).map((t) => t.id),
    targetIndex: null,
    forbiddenMove: null,
  };
}

/**
 * Branch elimination — a warning, not an answer.
 *
 * Finds a legal move available right now that loses the level, and strikes it
 * out. It kills the tempting fatal option without saying which of the
 * remaining options is correct, which is why §5.4 calls it the most honest.
 */
function branch(ctx: HintContext): Hint | null {
  const front = ctx.level.targets[ctx.targetIndex];
  if (front === undefined) return null;

  const options = enumerate(ctx.tiles, front, ctx.budget, ctx.rules);
  if (options.length < 2) return null; // nothing to eliminate on a forced move

  for (const option of options) {
    const state: State = { tiles: ctx.tiles, targetIndex: ctx.targetIndex, budget: ctx.budget };
    const next = applyMove(state, { ...option, kind: "binary", targetIndex: ctx.targetIndex });
    if (!isWinnable(ctx.level, ctx.budget, next)) {
      return {
        type: "branch",
        text: `Your instinct here is wrong: ${option.left} ${option.op} ${option.right} loses the level.`,
        tileIds: [option.leftId, option.rightId],
        targetIndex: ctx.targetIndex,
        forbiddenMove: { leftId: option.leftId, rightId: option.rightId, op: option.op },
      };
    }
  }
  return null;
}

export function generateHint(type: HintType, ctx: HintContext): Hint | null {
  switch (type) {
    case "narrow":
      return narrow(ctx);
    case "contested":
      return contested(ctx);
    case "branch":
      return branch(ctx);
  }
}

/** Build a solver context from a level and the tiles still in hand. */
export function hintContext(
  level: Level,
  liveTiles: readonly Tile[],
  targetIndex: number,
  budget: OperatorBudget,
): HintContext {
  return { level, tiles: liveTiles, targetIndex, budget, rules: level.rules };
}

/** The starting pool, used when a hint is re-shown after a restart. */
export function startingTiles(level: Level): Tile[] {
  return makePool(level.pool);
}
