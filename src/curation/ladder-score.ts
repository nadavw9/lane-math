import { scoreLevel, type ScoreBreakdown } from "./score.js";
import { LAUNCH_TIERS, tierByName, type TierName, type TierSpec } from "../generator/tiers.js";

/**
 * THE COMPOSITE SCORE IS DERIVED, NEVER STORED.
 *
 * It used to be written into `curation.compositeScore` when a board was first
 * placed and never recomputed. Every input to it then moved underneath it:
 *
 *   - Normal's budget went from counted-with-slack to exact (§8.5), which
 *     changes decisionPoints, maxTrapDepth and solutionPaths — and Mid and Late
 *     score against Normal;
 *   - four levels were re-slotted between worlds, so they were being scored
 *     against a different tier than the one they now sit in;
 *   - the solver itself changed.
 *
 * 4-02 stored 27 while actually scoring 29.92, and a valley check reading the
 * stored field failed a board that passes. A cached value with no invalidation
 * is the bug class; a CI assertion only reports it after the drift has
 * happened, so the cache is removed instead.
 */

/** The tier a ladder slot is banded against — its POSITION, not its provenance. */
export function slotTier(level: { id: string; world: number }): TierSpec {
  // §7.4 gives 1-1 its own tier; every other slot follows §7.2's world mapping.
  if (level.id === "1-01") return tierByName("tutorial-forced");
  const byWorld = LAUNCH_TIERS.find((t) => t.ladderWorld === level.world);
  if (!byWorld) throw new Error(`${level.id}: no launch tier for world ${level.world}`);
  return byWorld;
}

/** Composite score for a ladder level, computed from its CURRENT metrics. */
export function ladderScore(level: Parameters<typeof scoreLevel>[0] & { id: string; world: number }): ScoreBreakdown {
  return scoreLevel(level, slotTier(level));
}

export type { TierName };
