import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ladderScore } from "../curation/ladder-score.js";

const load = (id: string) => JSON.parse(readFileSync(`levels/${id}.json`, "utf8"));
const worldOne = Array.from({ length: 10 }, (_, i) => `1-${String(i + 1).padStart(2, "0")}`);
const worstTrap = (j: { modes: Record<string, { metrics: { maxTrapDepth: number } }> }): number =>
  Math.max(...["casual", "normal", "expert"].map((m) => j.modes[m]!.metrics.maxTrapDepth));

/**
 * GDD §7.4's beat sheet, as an assertion.
 *
 * The tutorial tier required a live trap on EVERY board, which put fatal moves
 * at 1-2 and 1-3 — before §7.6 unlocks the fatal-move warning at 1-4, and
 * before §7.5's scripted trap is supposed to introduce the mechanic at all. A
 * player could lose the second level of the game with no warning and nothing
 * having taught them the rule.
 */
describe("World 1 follows §7.4's beat sheet", () => {
  it("no level before 1-4 carries a live trap, in any mode", () => {
    for (const id of ["1-01", "1-02", "1-03"]) {
      expect(worstTrap(load(id)), `${id} has a fatal branch before the warning exists`).toBe(0);
    }
  });

  it("1-2 and 1-3 have a real decision — free choices, no wrong answer", () => {
    for (const id of ["1-02", "1-03"]) {
      const j = load(id);
      // §8.5's exception: the decision necessarily means more than one winning
      // line, so these two are the only levels where Normal is non-unique.
      for (const mode of ["casual", "normal", "expert"] as const) {
        const m = j.modes[mode].metrics;
        expect(m.decisionPoints, `${id} ${mode} decisionPoints`).toBeGreaterThanOrEqual(1);
        expect(m.maxTrapDepth, `${id} ${mode} maxTrapDepth`).toBe(0);
      }
      expect(j.modes.normal.metrics.solutionPaths, `${id} normal is non-unique`).toBeGreaterThan(1);
      expect(j.modes.normal.budget, `${id} expert shares Normal's budget`).toEqual(j.modes.expert.budget);
    }
  });

  it("1-1 is near-forced — the player cannot go wrong (§7.4)", () => {
    const j = load("1-01");
    expect(j.modes.normal.metrics.decisionPoints).toBe(0);
    expect(worstTrap(j)).toBe(0);
  });

  it("1-4 is where the first trap lands, with the warning unlocked for it", () => {
    expect(worstTrap(load("1-04"))).toBeGreaterThan(0);
  });

  it("subtraction is introduced BEFORE the scripted trap, not with it", () => {
    /*
     * The renderer omits any operator absent from the budget, so the dial row
     * is the level's operator set. 1-01 is `+` only; if 1-2 and 1-3 were also
     * `+` only then `-` would first appear at 1-4 — in the same level as the
     * trap, which is the one beat that should not share the player's attention
     * with a new control.
     */
    const ops = (id: string) => Object.keys(load(id).modes.normal.budget).sort().join("");
    expect(ops("1-03")).toContain("-");
    expect(ops("1-03").length).toBeGreaterThan(ops("1-02").length);
  });

  it("difficulty does not fall backwards across the opening three", () => {
    const s = worldOne.slice(0, 3).map((id) => ladderScore(load(id)).total);
    expect(s[0]).toBeLessThanOrEqual(s[1]!);
    expect(s[1]).toBeLessThanOrEqual(s[2]!);
    // And 1-1 is the gentlest board in the world.
    const all = worldOne.map((id) => ladderScore(load(id)).total);
    expect(Math.min(...all)).toBe(all[0]);
  });
});
