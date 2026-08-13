import { describe, expect, it } from "vitest";

import { enumerate } from "./enumerate.js";
import { makePool } from "./pool.js";
import { FREE_BUDGET } from "./budget.js";
import { DEFAULT_RULES } from "./types.js";

const show = (pool: number[], target: number, rules = DEFAULT_RULES) =>
  enumerate(makePool(pool), target, FREE_BUDGET, rules).map(
    (d) => `${d.left} ${d.op} ${d.right}`,
  );

describe("canonicalisation of commutative pairs (GDD §13, hard constraint 1)", () => {
  it("3+5 and 5+3 are ONE decomposition", () => {
    expect(show([3, 5], 8)).toEqual(["3 + 5"]);
  });

  it("2x4 and 4x2 are ONE decomposition", () => {
    expect(show([2, 4], 8)).toEqual(["2 * 4"]);
  });

  it("emits the commutative pair in ascending order", () => {
    expect(show([5, 3], 8)).toEqual(["3 + 5"]);
  });

  it("duplicate tiles of the same value collapse to one decomposition", () => {
    // 3+3 is the only way [3,3] makes 6 — one decomposition, not two orderings.
    expect(show([3, 3], 6)).toEqual(["3 + 3"]);
  });

  it("collapses the pairing but still separates the operators", () => {
    // [2,2] makes 4 by both 2+2 and 2*2. Two decompositions, one per operator,
    // and neither is double-counted for operand order.
    expect(show([2, 2], 4).sort()).toEqual(["2 * 2", "2 + 2"]);
  });

  it("a value reachable by two different tile pairings is still one decomposition", () => {
    // [1,2,2] -> 1+2 can use either 2-tile. One decomposition, not two.
    expect(show([1, 2, 2], 3)).toEqual(["1 + 2"]);
  });

  it("subtraction stays ordered — it is not commutative", () => {
    expect(show([5, 2], 3)).toEqual(["5 - 2"]);
    expect(show([5, 2], 7)).toEqual(["2 + 5"]);
  });

  it("division stays ordered", () => {
    expect(show([6, 2], 3)).toEqual(["6 / 2"]);
  });

  it("same tile pair under different operators is two decompositions", () => {
    // 1*3 and 3/1 both make 3 and consume the same tiles, but the operators
    // differ — under counted/consumed scarcity that distinction is real.
    expect(show([1, 3], 3).sort()).toEqual(["1 * 3", "3 / 1"]);
  });
});

describe("consumption by index, not by value (hard constraint 2)", () => {
  it("returns concrete tile ids for the representative pairing", () => {
    const pool = makePool([1, 2, 2]);
    const [decomp] = enumerate(pool, 3, FREE_BUDGET, DEFAULT_RULES);
    expect(decomp).toBeDefined();
    expect(decomp!.leftId).not.toBe(decomp!.rightId);
    expect(pool[decomp!.leftId]!.value + pool[decomp!.rightId]!.value).toBe(3);
  });

  it("distinguishes the two tiles of an identical-value pair", () => {
    const pool = makePool([2, 2]);
    const [decomp] = enumerate(pool, 4, FREE_BUDGET, DEFAULT_RULES);
    expect(decomp!.leftId).toBe(0);
    expect(decomp!.rightId).toBe(1);
  });
});

describe("integer-only arithmetic (GDD §3.4, hard constraint 3)", () => {
  it("division is legal only on exact division", () => {
    expect(show([7, 2], 3)).toEqual([]);
    expect(show([7, 2], 3.5)).toEqual([]);
    expect(show([8, 2], 4)).toEqual(["8 / 2"]);
  });

  it("never produces a fractional result", () => {
    const decomps = enumerate(makePool([9, 4, 2]), 4.5, FREE_BUDGET, DEFAULT_RULES);
    expect(decomps).toEqual([]);
  });
});

describe("negative intermediates (GDD §3.6)", () => {
  it("rejects negative results when allowNegative is false", () => {
    expect(show([3, 8], -5)).toEqual([]);
  });

  it("permits them when allowNegative is true", () => {
    expect(show([3, 8], -5, { allowNegative: true, integerOnly: true })).toEqual([
      "3 - 8",
    ]);
  });

  it("with negatives on, both orderings of subtraction are distinct decompositions", () => {
    const rules = { allowNegative: true, integerOnly: true };
    expect(show([3, 8], 5, rules)).toEqual(["8 - 3"]);
    expect(show([3, 8], -5, rules)).toEqual(["3 - 8"]);
  });
});

describe("operator budget gating", () => {
  it("omits decompositions whose operator has no budget left", () => {
    expect(
      enumerate(makePool([2, 4]), 8, { "*": 0, "+": null }, DEFAULT_RULES),
    ).toEqual([]);
  });

  it("includes them when budget remains", () => {
    expect(
      enumerate(makePool([2, 4]), 8, { "*": 1, "+": null }, DEFAULT_RULES),
    ).toHaveLength(1);
  });

  it("an operator absent from a counted budget is unavailable", () => {
    expect(enumerate(makePool([2, 4]), 8, { "+": 3 }, DEFAULT_RULES)).toEqual([]);
  });
});
