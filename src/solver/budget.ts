import {
  ALL_OPS,
  BINARY_OPS,
  type Level,
  type Mode,
  type MutableOperatorBudget,
  type Operator,
  type OperatorBudget,
  type Scarcity,
  UNARY_OPS,
} from "./types.js";

/** Every operator, unlimited. */
export const FREE_BUDGET: OperatorBudget = {
  "+": null,
  "-": null,
  "*": null,
  "/": null,
  sqrt: null,
  sq: null,
};

export function budgetFor(level: Level, mode: Mode): OperatorBudget {
  return level.operators[mode];
}

/** True if the operator exists in this level and has uses remaining. */
export function hasBudget(budget: OperatorBudget, op: Operator): boolean {
  const remaining = budget[op];
  return remaining === null || (typeof remaining === "number" && remaining > 0);
}

/** Consume one use. Unlimited and absent operators are returned unchanged. */
export function spend(budget: OperatorBudget, op: Operator): OperatorBudget {
  const remaining = budget[op];
  if (remaining === null || remaining === undefined) return budget;
  const next: MutableOperatorBudget = { ...budget };
  next[op] = remaining - 1;
  return next;
}

/** Stable key for memoisation. */
export function budgetKey(budget: OperatorBudget): string {
  return ALL_OPS.map((op) => {
    const remaining = budget[op];
    if (remaining === null) return "*";
    if (remaining === undefined) return "-";
    return String(remaining);
  }).join("|");
}

/**
 * GDD §6 and §8.5. Derived, not declared:
 *
 *   free      every operator present is unlimited
 *   consumed  every operator is counted and the TOTAL budget is exactly
 *             `T + U`, where `U` is the number of unary transforms — one
 *             operator per move, all of them spent
 *   counted   anything else
 *
 * `#ops = T` cannot hold on a level using a unary operator: a transform
 * consumes an operator without clearing a target, so it adds a move without
 * adding a target. `T + U` is the relation that actually holds.
 *
 * TWO HOLES, both fixed here rather than worked around at the call sites.
 *
 * 1. The sum `T + U` was checked against the COMBINED total, which lets a
 *    binary slot pay for a unary one. On `T = 3, U = 1`, the budget
 *    `{+: 4}` sums to 4 and passed — while granting a spare binary op and no
 *    root to perform the transform with. The contract is one operator per
 *    move of each KIND, so the check is now `binary === T` AND
 *    `unary === U`, not one sum.
 *
 * 2. Called without `unaryTransforms` it ignored the unary allowance
 *    entirely, so `{+: 3, √: 5}` on `T = 3` reported consumed. That form now
 *    REFUSES to claim consumed whenever any unary use is granted: without the
 *    intended line there is nothing to check `U` against, and a check that
 *    cannot see half its contract must under-claim rather than over-claim.
 *    A budget granting no unary use has `U = 0` by construction, which is the
 *    case the short form can still answer exactly.
 *
 * This gated Expert alone until §8.5 was amended; it now gates Normal too, so
 * a budget it wrongly blesses ships in the mode every player is in.
 */
export function scarcityOf(
  budget: OperatorBudget,
  targetCount: number,
  unaryTransforms?: number,
): Scarcity {
  const present = ALL_OPS.filter((op) => budget[op] !== undefined);
  if (present.length > 0 && present.every((op) => budget[op] === null)) return "free";

  const sum = (ops: readonly Operator[]): number | null => {
    let total = 0;
    for (const op of ops) {
      const remaining = budget[op];
      if (remaining === null) return null; // unlimited: cannot be consumed
      if (remaining !== undefined) total += remaining;
    }
    return total;
  };

  const binary = sum(BINARY_OPS);
  const unary = sum(UNARY_OPS);
  if (binary === null || unary === null) return "counted";

  if (unaryTransforms !== undefined) {
    return binary === targetCount && unary === unaryTransforms ? "consumed" : "counted";
  }
  return binary === targetCount && unary === 0 ? "consumed" : "counted";
}
