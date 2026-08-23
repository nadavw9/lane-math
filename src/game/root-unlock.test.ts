import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { casualBudget } from "../generator/budgets.js";
import { tierByName } from "../generator/tiers.js";
import { solve, type Level } from "../solver/index.js";

const load = (id: string) => JSON.parse(readFileSync(`levels/${id}.json`, "utf8"));
const asLevel = (j: {
  id: string;
  pool: number[];
  targets: number[];
  rules: Level["rules"];
}): Level => ({ id: j.id, pool: j.pool, targets: j.targets, rules: j.rules }) as Level;

/**
 * GDD §7.6 unlocks `√` at 4-1, and §9.0's "designed empty state" logic applies
 * to mechanics too: a dial the player is handed and never needs is worse than
 * no dial.
 *
 * This was not hypothetical. Every one of the ten World 4 levels shipped with a
 * root that was OPTIONAL — `applySqrtSubstitution` stored an operand squared
 * but never removed the root-free route, so Expert's uniqueness rule picked a
 * root-free budget every time and `√` reached no shipped budget at all.
 */
describe("the √ unlock at 4-1 has something behind it (GDD §7.6)", () => {
  const late = tierByName("late");
  const withoutRoots = (() => {
    const b = { ...casualBudget(late) };
    for (const op of late.unaryOps) delete b[op];
    return b;
  })();

  it("4-01 CANNOT be won without a root", () => {
    const level = asLevel(load("4-01"));
    // Free binary operators, no root. If this is winnable, the level that
    // introduces the mechanic does not need it.
    const escape = solve(level, withoutRoots, { collectFatalMoves: false, maxCollected: 1 });
    expect(escape.solvable, "4-01 is winnable with no root — the unlock is empty").toBe(false);
  });

  it("4-01's shipped budget grants the root, and its intended line spends it", () => {
    const j = load("4-01");
    const level = asLevel(j);
    for (const mode of ["normal", "expert"] as const) {
      const budget = j.modes[mode].budget;
      expect(budget.sqrt, `${mode} budget grants a root`).toBeGreaterThanOrEqual(1);
      const res = solve(level, budget);
      expect(res.solvable, `${mode} is solvable`).toBe(true);
      expect(
        res.winningPaths[0]?.some((m) => m.kind === "unary"),
        `${mode}'s intended line performs a transform`,
      ).toBe(true);
    }
  });

  it("4-01 is still the world's valley — no World 4 level is gentler", () => {
    // §7.2 opens each world on its gentlest board. The root constraint must not
    // have been paid for by making the opener the hard one.
    const scores: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const j = load(`4-${String(i).padStart(2, "0")}`);
      scores.push(j.curation.compositeScore as number);
    }
    expect(Math.min(...scores)).toBe(scores[0]);
  });
});
