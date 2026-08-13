import { hasBudget } from "./budget.js";
import {
  DEFAULT_RULES,
  UNARY_OPS,
  type OperatorBudget,
  type Rules,
  type Tile,
  type Transform,
  type UnaryOp,
} from "./types.js";

/** Integer square root, or null when `value` is not a perfect square (GDD §3.4). */
export function exactSqrt(value: number): number | null {
  if (value < 0) return null;
  const root = Math.round(Math.sqrt(value));
  return root * root === value ? root : null;
}

export function applyUnary(op: UnaryOp, value: number): number | null {
  return op === "sqrt" ? exactSqrt(value) : value * value;
}

/**
 * Every legal unary pool transform (GDD §3.3).
 *
 * Unary operators never enter the equation row — they rewrite a tile in place,
 * which is what lets them manufacture a number the pool does not have. Rules:
 *
 *   - `sqrt` only on perfect squares.
 *   - No cascading: a tile that has already been transformed is out (GDD §3.5),
 *     even where `sqrt(4) = 2` would be legal.
 *   - No-op transforms (`sqrt(1)`, `1²`) are excluded — they would burn a
 *     scarce operator and change nothing.
 *   - Tiles of the same class collapse to one transform, same as enumerate().
 */
export function enumerateTransforms(
  pool: readonly Tile[],
  budget: OperatorBudget,
  _rules: Rules = DEFAULT_RULES,
): Transform[] {
  const found: Transform[] = [];
  const seen = new Set<string>();

  for (const tile of pool) {
    if (tile.transformed) continue;
    for (const op of UNARY_OPS) {
      if (!hasBudget(budget, op)) continue;

      const to = applyUnary(op, tile.value);
      if (to === null || to === tile.value) continue;

      const key = `${op}:${tile.value}`;
      if (seen.has(key)) continue;
      seen.add(key);

      found.push({ op, from: tile.value, to, tileId: tile.id });
    }
  }

  return found;
}
