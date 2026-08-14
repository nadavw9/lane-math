import { describe, expect, it } from "vitest";

import { enumerate, enumerateTransforms, makePool, DEFAULT_RULES } from "../solver/index.js";

/**
 * Reported: front target 45 with no way to reach it, and the game did not fail.
 *
 * Board from the report — level 4-03, three targets cleared, sqrt already spent:
 *   pool   3, 7, 3(transformed), 6, 3, 6, 10
 *   front  45
 *   budget + 1, - 1, * 2, / 1, sqrt 0
 *
 * First question: is the board actually dead? If the solver finds a move here
 * then the report is a misread, and if it finds none then failure detection is
 * at fault. Answer that before touching any code.
 */
describe("the reported 45 board", () => {
  const pool = makePool([3, 7, 3, 6, 3, 6, 10]);
  const budget = { "+": 1, "-": 1, "*": 2, "/": 1, sqrt: 0 };

  it("has no legal decomposition of 45", () => {
    expect(enumerate(pool, 45, budget, DEFAULT_RULES)).toEqual([]);
  });

  it("has no legal transform either — sqrt is spent", () => {
    expect(enumerateTransforms(pool, budget, DEFAULT_RULES)).toEqual([]);
  });

  it("so the lane is genuinely dead and the level must be failed", () => {
    const dead =
      enumerate(pool, 45, budget, DEFAULT_RULES).length === 0 &&
      enumerateTransforms(pool, budget, DEFAULT_RULES).length === 0;
    expect(dead).toBe(true);
  });
});
