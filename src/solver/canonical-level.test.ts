import { describe, expect, it } from "vitest";

import { analyse } from "./analyse.js";
import { enumerate } from "./enumerate.js";
import { budgetFor, scarcityOf } from "./budget.js";
import { solve } from "./solve.js";
import { makePool } from "./pool.js";
import { describeMove } from "./format.js";
import { CANONICAL, CONSUMED_SOLVABLE } from "./__fixtures__/canonical.js";

/**
 * The five assertions from the Phase 1 brief, against the GDD §1 canonical level.
 *
 *   pool:    [1, 2, 2, 3, 4, 5]
 *   targets: [8, 3, 15]
 *   ops:     free
 */

const FREE = budgetFor(CANONICAL, "casual");

describe("canonical level — assertion (a): exactly one winning path", () => {
  const result = solve(CANONICAL, "casual");

  it("is solvable", () => {
    expect(result.solvable).toBe(true);
  });

  it("has exactly one winning path", () => {
    expect(result.winningPaths).toHaveLength(1);
  });

  it("wins with 8 = 2x4, then 3 = 1+2, then 15 = 3x5", () => {
    const path = result.winningPaths[0]!;
    expect(path.map(describeMove)).toEqual(["2 * 4 = 8", "1 + 2 = 3", "3 * 5 = 15"]);
  });

  it("consumes tiles by index, not by value", () => {
    // Pool [1,2,2,3,4,5] holds two distinguishable 2-tiles. The winning path
    // uses one for 2*4 and the other for 1+2 — different tile ids.
    const path = result.winningPaths[0]!;
    const first = path[0]!;
    const second = path[1]!;
    expect(first.kind).toBe("binary");
    expect(second.kind).toBe("binary");
    if (first.kind !== "binary" || second.kind !== "binary") return;

    const twoInFirst = [first.leftId, first.rightId].find(
      (id) => CANONICAL.pool[id] === 2,
    );
    const twoInSecond = [second.leftId, second.rightId].find(
      (id) => CANONICAL.pool[id] === 2,
    );
    expect(twoInFirst).toBeDefined();
    expect(twoInSecond).toBeDefined();
    expect(twoInFirst).not.toBe(twoInSecond);
  });
});

describe("canonical level — assertion (b): 15 is the keystone at index 2", () => {
  it("target 15 has exactly one decomposition from the STARTING pool", () => {
    const decomps = enumerate(makePool(CANONICAL.pool), 15, FREE, CANONICAL.rules);
    expect(decomps).toHaveLength(1);
    expect(decomps[0]).toMatchObject({ left: 3, op: "*", right: 5, result: 15 });
  });

  it("reports the keystone at index 2", () => {
    expect(analyse(CANONICAL, "casual").keystones).toEqual([2]);
  });

  it("keystone uniqueness is measured against the starting pool, not the reached pool", () => {
    // Target index 1 (value 3) has ONE decomposition from the pool as reached
    // along the winning line minus its alternatives — but five from the
    // starting pool. It must not be reported as a keystone.
    const fromStart = enumerate(makePool(CANONICAL.pool), 3, FREE, CANONICAL.rules);
    expect(fromStart.length).toBeGreaterThan(1);
    expect(analyse(CANONICAL, "casual").keystones).not.toContain(1);
  });
});

describe("canonical level — assertion (c): 3+5=8 is legal, fatal, trap depth 2", () => {
  const result = solve(CANONICAL, "casual");

  it("is a legal decomposition of target 8", () => {
    const decomps = enumerate(makePool(CANONICAL.pool), 8, FREE, CANONICAL.rules);
    expect(decomps.map((d) => `${d.left} ${d.op} ${d.right}`)).toContain("3 + 5");
  });

  it("is reported as a fatal move at target index 0 with trap depth 2", () => {
    const fatal = result.fatalMoves.find(
      (f) => f.targetIndex === 0 && describeMove(f.move) === "3 + 5 = 8",
    );
    expect(fatal).toBeDefined();
    expect(fatal!.trapDepth).toBe(2);
  });

  it("survives target 1 and dies at target 2", () => {
    const fatal = result.fatalMoves.find(
      (f) => f.targetIndex === 0 && describeMove(f.move) === "3 + 5 = 8",
    )!;
    expect(fatal.diesAtTargetIndex).toBe(2);
  });
});

describe("canonical level — assertion (d): 5-2=3 is legal, fatal, trap depth 1", () => {
  const result = solve(CANONICAL, "casual");

  it("is a legal decomposition of target 3", () => {
    const decomps = enumerate(makePool(CANONICAL.pool), 3, FREE, CANONICAL.rules);
    expect(decomps.map((d) => `${d.left} ${d.op} ${d.right}`)).toContain("5 - 2");
  });

  it("is reported as a fatal move at target index 1 with trap depth 1", () => {
    const fatal = result.fatalMoves.find(
      (f) => f.targetIndex === 1 && describeMove(f.move) === "5 - 2 = 3",
    );
    expect(fatal).toBeDefined();
    expect(fatal!.trapDepth).toBe(1);
    expect(fatal!.diesAtTargetIndex).toBe(2);
  });
});

describe("canonical level — dStart and dPath diverge (GDD §8.4)", () => {
  const metrics = analyse(CANONICAL, "casual");

  it("dStart is [2, 4, 1] — measured against the starting pool", () => {
    expect([...metrics.dStart]).toEqual([2, 4, 1]);
  });

  it("dPath is [2, 3, 1] — measured along the intended winning line", () => {
    // 4 - 1 = 3 is counted at the start but is gone by the time target 1 is
    // reached, because 2 x 4 consumed the 4. This is the worked example the
    // GDD uses to show the two metrics are not interchangeable.
    expect([...metrics.dPath]).toEqual([2, 3, 1]);
  });

  it("decisionPoints derives from dPath, never dStart", () => {
    expect(metrics.decisionPoints).toBe(metrics.dPath.filter((d) => d >= 2).length);
  });

  it("dPath is never zero on a solvable level — the intended move is always counted", () => {
    expect(metrics.dPath.every((d) => d >= 1)).toBe(true);
  });

  it("keystones are still measured on dStart", () => {
    // Target 2 has dStart 1 and dPath 1; target 1 has dStart 4 and dPath 3.
    // Only the dStart-unique one is a keystone.
    expect([...metrics.keystones]).toEqual([2]);
    expect(metrics.dStart[2]).toBe(1);
  });
});

describe("canonical level — assertion (e): metrics", () => {
  const metrics = analyse(CANONICAL, "casual");

  it("surplus 0", () => {
    expect(metrics.surplus).toBe(0);
  });

  it("decisionPoints 2", () => {
    expect(metrics.decisionPoints).toBe(2);
  });

  it("solutionPaths 1", () => {
    expect(metrics.solutionPaths).toBe(1);
  });

  it("lookaheadDistance 2", () => {
    expect(metrics.lookaheadDistance).toBe(2);
  });

  it("matches the metrics block published in GDD §10", () => {
    expect(metrics).toMatchObject({
      surplus: 0,
      keystones: [2],
      lookaheadDistance: 2,
      decisionPoints: 2,
      solutionPaths: 1,
      maxTrapDepth: 2,
    });
  });
});

describe("scarcityOf refuses to bless an over-supplied budget (GDD §8.5)", () => {
  const T = 3;

  it("a spare ROOT is not consumed, even though the binary ops sum to T", () => {
    // The short form used to ignore the unary allowance entirely and answer
    // "consumed" here, which is how a budget granting five unused roots would
    // have passed the ladder gate.
    expect(scarcityOf({ "+": 3, sqrt: 5 }, T)).toBe("counted");
    // With no unary allowance at all, U is 0 by construction and the short
    // form can still answer exactly.
    expect(scarcityOf({ "+": 3 }, T)).toBe("consumed");
  });

  it("a binary slot may not pay for a unary one", () => {
    // T = 3, U = 1. Both of these sum to 4.
    expect(scarcityOf({ "+": 3, sqrt: 1 }, T, 1)).toBe("consumed");
    // Four binary ops for three targets, and no root to perform the transform
    // the line requires. The old combined-sum check called this consumed.
    expect(scarcityOf({ "+": 4 }, T, 1)).toBe("counted");
    // And the mirror: a root too many.
    expect(scarcityOf({ "+": 3, sqrt: 2 }, T, 1)).toBe("counted");
  });

  it("still recognises the exact case it is supposed to accept", () => {
    expect(scarcityOf({ "+": 1, "*": 2 }, T, 0)).toBe("consumed");
  });
});

describe("canonical level — runs under all three operator scarcities", () => {
  it("free: solvable", () => {
    const budget = budgetFor(CANONICAL, "casual");
    expect(scarcityOf(budget, CANONICAL.targets.length)).toBe("free");
    expect(solve(CANONICAL, "casual").solvable).toBe(true);
  });

  it("counted: the GDD §10 `normal` budget is NOT solvable — it allows one *, the line needs two", () => {
    const budget = budgetFor(CANONICAL, "normal");
    expect(scarcityOf(budget, CANONICAL.targets.length)).toBe("counted");
    const result = solve(CANONICAL, "normal");
    expect(result.solvable).toBe(false);
    expect(result.winningPaths).toHaveLength(0);
  });

  it("counted: a budget that admits two * is solvable", () => {
    const result = solve(CANONICAL, { "+": 2, "-": 1, "*": 2 });
    expect(result.solvable).toBe(true);
    expect(result.winningPaths).toHaveLength(1);
  });

  it("consumed: the GDD §10 `expert` budget is NOT solvable — cross-mode solvability is not free (GDD §13)", () => {
    const budget = budgetFor(CANONICAL, "expert");
    expect(scarcityOf(budget, CANONICAL.targets.length)).toBe("consumed");
    expect(solve(CANONICAL, "expert").solvable).toBe(false);
  });

  it("consumed: {+:1, *:2} totals T + U (U = 0 here) and is solvable", () => {
    expect(scarcityOf(CONSUMED_SOLVABLE, CANONICAL.targets.length)).toBe("consumed");
    const result = solve(CANONICAL, CONSUMED_SOLVABLE);
    expect(result.solvable).toBe(true);
    expect(result.winningPaths[0]!.map(describeMove)).toEqual([
      "2 * 4 = 8",
      "1 + 2 = 3",
      "3 * 5 = 15",
    ]);
  });
});
