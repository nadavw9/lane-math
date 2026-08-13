import { describe, expect, it } from "vitest";

import { enumerateTransforms } from "./unary.js";
import { makePool } from "./pool.js";
import { solve } from "./solve.js";
import { describeMove } from "./format.js";
import { DEFAULT_RULES, type Level } from "./types.js";

const level = (over: Partial<Level>): Level => ({
  id: "unary-fixture",
  pool: [16, 3],
  targets: [7],
  operators: { casual: {}, normal: {}, expert: {} },
  rules: DEFAULT_RULES,
  ...over,
});

describe("enumerateTransforms (GDD §3.3)", () => {
  it("offers sqrt only on perfect squares", () => {
    const t = enumerateTransforms(makePool([16, 15, 9]), { sqrt: null }, DEFAULT_RULES);
    expect(t.map((x) => `${x.op} ${x.from} -> ${x.to}`).sort()).toEqual([
      "sqrt 16 -> 4",
      "sqrt 9 -> 3",
    ]);
  });

  it("does not offer sqrt(1) — it is a no-op that would burn an operator", () => {
    expect(enumerateTransforms(makePool([1]), { sqrt: null }, DEFAULT_RULES)).toEqual([]);
  });

  it("does not offer square(1) — also a no-op", () => {
    expect(enumerateTransforms(makePool([1]), { sq: null }, DEFAULT_RULES)).toEqual([]);
  });

  it("collapses identical tiles to one transform", () => {
    const t = enumerateTransforms(makePool([9, 9]), { sqrt: null }, DEFAULT_RULES);
    expect(t).toHaveLength(1);
  });

  it("offers nothing when the operator is not in the budget", () => {
    expect(enumerateTransforms(makePool([16]), {}, DEFAULT_RULES)).toEqual([]);
    expect(enumerateTransforms(makePool([16]), { sqrt: 0 }, DEFAULT_RULES)).toEqual([]);
  });

  it("squares a tile under x²", () => {
    const t = enumerateTransforms(makePool([3]), { sq: null }, DEFAULT_RULES);
    expect(t[0]).toMatchObject({ op: "sq", from: 3, to: 9 });
  });
});

describe("unary transforms inside solve()", () => {
  it("manufactures a number the pool does not have", () => {
    // 16, 3 -> sqrt(16)=4 -> 4 + 3 = 7
    const result = solve(level({}), { "+": null, sqrt: null });
    expect(result.solvable).toBe(true);
    expect(result.winningPaths[0]!.map(describeMove)).toEqual([
      "sqrt 16 -> 4",
      "3 + 4 = 7",
    ]);
  });

  it("is unsolvable without the unary operator in the budget", () => {
    expect(solve(level({}), { "+": null, "-": null, "*": null }).solvable).toBe(false);
  });

  it("respects a counted unary budget", () => {
    // Two square roots are needed; only one is granted.
    const twoRoots = level({ pool: [16, 9], targets: [7] });
    expect(solve(twoRoots, { "+": null, sqrt: 1 }).solvable).toBe(false);
    expect(solve(twoRoots, { "+": null, sqrt: 2 }).solvable).toBe(true);
  });

  it("does NOT cascade — one transform per tile (GDD §3.5)", () => {
    // Reaching 5 needs sqrt(16)=4 then sqrt(4)=2, then 2+3. Cascading is banned,
    // so this level is unsolvable however much sqrt budget is granted.
    const cascade = level({ pool: [16, 3], targets: [5] });
    expect(solve(cascade, { "+": null, "-": null, sqrt: null }).solvable).toBe(false);
  });

  it("a transform does not advance the target index", () => {
    const result = solve(level({}), { "+": null, sqrt: null });
    const path = result.winningPaths[0]!;
    expect(path[0]!.targetIndex).toBe(0);
    expect(path[1]!.targetIndex).toBe(0);
  });

  it("counts as a move for failure detection, not as a dead board (GDD §3.5)", () => {
    // pool {9,2,6,5}, queue 11 -> 5, sqrt available.
    //   6+5=11 leaves {9,2}: NO binary decomposition of 5 exists, yet the board
    //   is not dead — sqrt(9)=3 is available, and 2+3=5 then wins.
    //   2+9=11 leaves {6,5}: no binary decomposition AND no perfect square. Dead.
    const board = level({ pool: [9, 2, 6, 5], targets: [11, 5] });
    const budget = { "+": null, "-": null, "*": null, "/": null, sqrt: null };
    const result = solve(board, budget);

    expect(result.solvable).toBe(true);
    expect(result.winningPaths.map((p) => p.map(describeMove))).toContainEqual([
      "5 + 6 = 11",
      "sqrt 9 -> 3",
      "2 + 3 = 5",
    ]);

    const fatal = result.fatalMoves.find(
      (f) => f.targetIndex === 0 && describeMove(f.move) === "2 + 9 = 11",
    );
    expect(fatal).toBeDefined();
    expect(fatal!.trapDepth).toBe(1);
    expect(fatal!.diesAtTargetIndex).toBe(1);
  });
});

describe("unary transforms are irreversible and consume the tile's identity", () => {
  it("the transformed tile keeps its id but changes value", () => {
    const result = solve(level({}), { "+": null, sqrt: null });
    const path = result.winningPaths[0]!;
    const transform = path[0]!;
    expect(transform.kind).toBe("unary");
    if (transform.kind !== "unary") return;

    const binary = path[1]!;
    if (binary.kind !== "binary") return;
    // The 4 used in 3+4 is the same tile that was 16.
    expect([binary.leftId, binary.rightId]).toContain(transform.tileId);
  });
});
