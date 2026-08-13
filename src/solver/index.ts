/**
 * Lane Math solver — public surface.
 *
 * Runtime consumers:
 *   - Casual mode's fatal-move warning (GDD §6) calls `isWinnable` on commit.
 *   - The hint system (GDD §5.4) reads `analyse` output.
 *   - CI and the (Phase 2) generator call `solve` and `analyse` per mode.
 */

export { enumerate, applyBinary } from "./enumerate.js";
export { enumerateTransforms, applyUnary, exactSqrt } from "./unary.js";
export { solve, isWinnable, legalMoves, applyMove, stateKey, type State } from "./solve.js";
export { analyse } from "./analyse.js";
export { validateLevel } from "./validate.js";
export { makePool, poolKey, tileClass, compareTiles } from "./pool.js";
export {
  FREE_BUDGET,
  budgetFor,
  budgetKey,
  hasBudget,
  scarcityOf,
  spend,
} from "./budget.js";
export {
  describeMove,
  describePath,
  describeDecomposition,
  describeTransform,
} from "./format.js";
export * from "./types.js";
