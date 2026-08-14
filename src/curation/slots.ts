import type { GeneratedLevel } from "../generator/pipeline.js";
import type { TierSpec } from "../generator/tiers.js";

/**
 * Reserved slots from GDD §7.4 and §7.5. These are not "whatever scored right"
 * — they carry specific teaching jobs and their structure is prescribed.
 */
export type SlotRole =
  | "near-forced"
  | "scripted-trap"
  | "trap-retest"
  | "two-keystone"
  | "valley"
  | "standard"
  | "world-peak";

export interface Candidate {
  readonly level: GeneratedLevel;
  readonly tier: TierSpec;
  readonly score: number;
  readonly decisionPoints: number;
  readonly lookahead: number;
  readonly maxTrapDepth: number;
  readonly keystones: number;
  readonly dPath: readonly number[];
  readonly temptation: number;
}

/**
 * 1-1, GDD §7.4: "Level 1-1 is near-forced — every target has d_i = 1. The
 * player cannot go wrong."
 *
 * Measured on dPath: every target must be forced at the moment it is reached.
 * decisionPoints is then 0 by definition, but assert both so the intent
 * survives a future metric change.
 */
export function isNearForced(c: Candidate): boolean {
  return c.decisionPoints === 0 && c.dPath.every((d) => d === 1);
}

/**
 * 1-4, GDD §7.5: the fatal branch must be the obvious one. Exactly one
 * keystone, so there is a single insight to have, and the highest temptation
 * available so the player genuinely reaches for the wrong move.
 */
export function isTrapShaped(c: Candidate): boolean {
  return c.keystones === 1 && c.temptation >= 0.5 && c.maxTrapDepth >= 2;
}

/**
 * 1-6 repeats 1-4's structural shape with different numbers, so the lesson is
 * tested rather than re-taught. Same keystone count, same branching profile,
 * same lookahead — different board.
 */
export function sharesShape(a: Candidate, b: Candidate): boolean {
  return (
    a.keystones === b.keystones &&
    a.lookahead === b.lookahead &&
    a.decisionPoints === b.decisionPoints &&
    a.level.targets.length === b.level.targets.length
  );
}

export function isDistinctBoard(a: Candidate, b: Candidate): boolean {
  return a.level.generator.hash !== b.level.generator.hash;
}

/** 4-8 and later: the first two-keystone levels (GDD §7.2, §7.6). */
export function isTwoKeystone(c: Candidate): boolean {
  return c.keystones === 2;
}
