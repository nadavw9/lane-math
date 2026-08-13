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
 * Pass `unaryTransforms` — the `U` of the intended line — to check the rule as
 * written. Without it this can only verify the structural half (binary ops sum
 * to `T`) and will call a budget consumed even when it grants more unary uses
 * than the line performs, because the budget alone cannot reveal that.
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
    return binary + unary === targetCount + unaryTransforms ? "consumed" : "counted";
  }
  return binary === targetCount ? "consumed" : "counted";
}
