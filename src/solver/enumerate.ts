import { hasBudget } from "./budget.js";
import { compareTiles, tileClass } from "./pool.js";
import {
  BINARY_OPS,
  COMMUTATIVE,
  DEFAULT_RULES,
  type BinaryOp,
  type Decomposition,
  type OperatorBudget,
  type Rules,
  type Tile,
} from "./types.js";

/**
 * Apply one binary operator. Returns null when the result is illegal.
 *
 * Integer-only is a hard rule (GDD §3.4): `/` is legal only on exact division.
 * Pool values are positive integers, so a zero divisor is unrepresentable
 * rather than merely guarded.
 */
export function applyBinary(
  op: BinaryOp,
  a: number,
  b: number,
  rules: Rules,
): number | null {
  switch (op) {
    case "+":
      return a + b;
    case "-": {
      const result = a - b;
      return result < 0 && !rules.allowNegative ? null : result;
    }
    case "*":
      return a * b;
    case "/":
      if (b === 0) return null;
      return a % b === 0 ? a / b : null;
  }
}

/**
 * Every legal decomposition of one target from the current pool — `d_i` in
 * GDD §8.4.
 *
 * Canonicalisation (GDD §13, and the reason every tier band is meaningful):
 *
 *   - `+` and `*` are commutative, so each unordered operand pair is emitted
 *     once, ascending. `3+5` and `5+3` are ONE decomposition.
 *   - `-` and `/` are ordered, so both arrangements are tried and kept distinct.
 *   - Tiles that share an interchangeability class collapse: pool `[1,2,2]`
 *     yields one `1+2`, not two. The returned ids name one valid pairing.
 *   - The same tile pair under different operators stays distinct — `1*3` and
 *     `3/1` both make 3, and under counted scarcity that difference is real.
 */
export function enumerate(
  pool: readonly Tile[],
  target: number,
  budget: OperatorBudget,
  rules: Rules = DEFAULT_RULES,
): Decomposition[] {
  const found: Decomposition[] = [];
  const seen = new Set<string>();

  const consider = (left: Tile, right: Tile, op: BinaryOp): void => {
    const result = applyBinary(op, left.value, right.value, rules);
    if (result === null || result !== target) return;

    const key = `${tileClass(left)}${op}${tileClass(right)}`;
    if (seen.has(key)) return;
    seen.add(key);

    found.push({
      left: left.value,
      right: right.value,
      op,
      result,
      leftId: left.id,
      rightId: right.id,
    });
  };

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      const ascending = compareTiles(a, b) <= 0 ? [a, b] : [b, a];

      for (const op of BINARY_OPS) {
        if (!hasBudget(budget, op)) continue;
        if (COMMUTATIVE.has(op)) {
          consider(ascending[0]!, ascending[1]!, op);
        } else {
          consider(a, b, op);
          consider(b, a, op);
        }
      }
    }
  }

  return found;
}
