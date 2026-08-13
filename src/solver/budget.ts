import {
  ALL_OPS,
  BINARY_OPS,
  type Level,
  type Mode,
  type MutableOperatorBudget,
  type Operator,
  type OperatorBudget,
  type Scarcity,
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
 * GDD §6. Derived, not declared:
 *
 *   free      every operator present is unlimited
 *   consumed  every binary operator is counted and they sum to exactly T —
 *             one operator per move, all of them spent
 *   counted   anything else
 */
export function scarcityOf(budget: OperatorBudget, targetCount: number): Scarcity {
  const present = ALL_OPS.filter((op) => budget[op] !== undefined);
  if (present.length > 0 && present.every((op) => budget[op] === null)) return "free";

  let total = 0;
  for (const op of BINARY_OPS) {
    const remaining = budget[op];
    if (remaining === null) return "counted";
    if (remaining !== undefined) total += remaining;
  }
  return total === targetCount ? "consumed" : "counted";
}
