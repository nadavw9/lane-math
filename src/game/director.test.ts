import { describe, expect, it } from "vitest";

import { Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";
import { DEFAULT_RULES } from "../solver/index.js";

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};
const rejection = (commands: readonly Command[]): string | null => {
  const r = commands.find((c) => c.type === "reject");
  return r && r.type === "reject" ? r.reason : null;
};

/**
 * These exercise the raw rules, so they run in NORMAL. Casual intercepts
 * level-killing moves (GDD §6), which is the right behaviour and the wrong
 * setting for testing what happens when one is committed.
 *
 * The canonical level (GDD §1) as a ladder level, free operators.
 */
const CANONICAL: LadderLevel = {
  id: "test-canonical",
  world: 1,
  pool: [1, 2, 2, 3, 4, 5],
  targets: [8, 3, 15],
  rules: DEFAULT_RULES,
  modes: {
    casual: { budget: { "+": null, "-": null, "*": null }, tier: "tutorial" },
    normal: { budget: { "+": null, "-": null, "*": null }, tier: "tutorial" },
    expert: { budget: { "+": 1, "*": 2 }, tier: "early" },
  },
  surplus: 0,
};

/** sqrt(16)=4, then 3+4=7. */
const UNARY: LadderLevel = {
  id: "test-unary",
  world: 4,
  pool: [16, 3],
  targets: [7],
  rules: DEFAULT_RULES,
  modes: {
    casual: { budget: { "+": null, sqrt: null }, tier: null },
    normal: { budget: { "+": null, sqrt: null }, tier: null },
    expert: { budget: { "+": 1, sqrt: 1 }, tier: null },
  },
  surplus: 0,
};

const idOfValue = (state: ViewState, value: number, skip = 0): number => {
  const matches = state.tiles.filter((t) => t.value === value && !t.consumed);
  return matches[skip]!.id;
};

describe("tap state machine (GDD §3.5)", () => {
  it("walks IDLE -> number -> operator -> number -> commit", () => {
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: CANONICAL.id }));
    expect(s.affordance).toBe("numbers");

    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    expect(s.affordance).toBe("operators");

    s = stateOf(d.handle({ type: "tapOperator", op: "*" }));
    expect(s.affordance).toBe("numbers");

    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 4) }));
    expect(s.affordance).toBe("commit");

    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.targetIndex).toBe(1);
  });

  it("refuses an operator before a number", () => {
    const d = new Director(CANONICAL, "normal");
    expect(rejection(d.handle({ type: "tapOperator", op: "+" }))).toBe("pick a number first");
  });

  it("tapping slot 0 clears the whole row; slot 1 rewinds to the operator step", () => {
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "tapTile", id: 0 }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: 1 }));
    expect(s.slots.rightTileId).not.toBeNull();

    s = stateOf(d.handle({ type: "tapSlot", index: 1 }));
    expect(s.slots.op).toBeNull();
    expect(s.slots.rightTileId).toBeNull();
    expect(s.slots.leftTileId).toBe(0);

    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    expect(s.slots.leftTileId).toBeNull();
  });

  it("= is refused until all three slots are filled", () => {
    const d = new Director(CANONICAL, "normal");
    expect(rejection(d.handle({ type: "tapCommit" }))).toBe("fill all three slots first");
  });

  it("wrong arithmetic is rejected without failing the level", () => {
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "tapTile", id: idOfValue(stateOf(d.handle({ type: "loadLevel", id: "x" })), 1) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    const out = d.handle({ type: "tapCommit" });
    expect(rejection(out)).toContain("not 8");
    expect(stateOf(out).phase).toBe("playing");
    expect(stateOf(out).slots.leftTileId).toBeNull();
  });
});

describe("consumption is by tile id, not value (GDD §3.5)", () => {
  it("consumes the tapped 2, leaving the other 2 in the pool", () => {
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: CANONICAL.id }));
    const firstTwo = idOfValue(s, 2, 0);
    const secondTwo = idOfValue(s, 2, 1);

    s = stateOf(d.handle({ type: "tapTile", id: firstTwo }));
    s = stateOf(d.handle({ type: "tapOperator", op: "*" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 4) }));
    s = stateOf(d.handle({ type: "tapCommit" }));

    expect(s.tiles.find((t) => t.id === firstTwo)!.consumed).toBe(true);
    expect(s.tiles.find((t) => t.id === secondTwo)!.consumed).toBe(false);
  });
});

describe("winning and failing", () => {
  it("clears the canonical level along 2x4, 1+2, 3x5", () => {
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: CANONICAL.id }));

    const play = (a: number, op: "+" | "-" | "*", b: number): void => {
      s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, a) }));
      s = stateOf(d.handle({ type: "tapOperator", op }));
      s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, b) }));
      s = stateOf(d.handle({ type: "tapCommit" }));
    };

    play(2, "*", 4);
    play(1, "+", 2);
    play(3, "*", 15 / 3);
    expect(s.phase).toBe("won");
  });

  it("fails when the FRONT target becomes unreachable (GDD §4.1)", () => {
    // 3+5=8 is legal and fatal: it survives target 1 and dies at target 2.
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: CANONICAL.id }));

    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 5) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(1);

    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 1) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapCommit" }));

    expect(s.phase).toBe("failed");
    expect(s.message).toContain("15");
  });

  it("restart returns to the level start and keeps the failure count", () => {
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: CANONICAL.id }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 5) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 1) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("failed");
    expect(s.failures).toBe(1);

    s = stateOf(d.handle({ type: "tapRestart" }));
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(0);
    expect(s.tiles.every((t) => !t.consumed)).toBe(true);
    // GDD §5.1: the counter survives the restart or the economy is fake.
    expect(s.failures).toBe(1);
  });
});

describe("unary transform mode (GDD §3.3, §3.5)", () => {
  it("tapping sqrt highlights perfect squares only", () => {
    const d = new Director(UNARY, "normal");
    const s = stateOf(d.handle({ type: "tapUnary", op: "sqrt" }));
    expect(s.transformOp).toBe("sqrt");
    expect(s.affordance).toBe("transform");
    expect(s.transformableTileIds).toEqual([0]); // the 16, not the 3
  });

  it("tapping sqrt again cancels", () => {
    const d = new Director(UNARY, "normal");
    d.handle({ type: "tapUnary", op: "sqrt" });
    const s = stateOf(d.handle({ type: "tapUnary", op: "sqrt" }));
    expect(s.transformOp).toBeNull();
  });

  it("transforms in place, keeping the tile id, and does not advance the queue", () => {
    const d = new Director(UNARY, "normal");
    d.handle({ type: "tapUnary", op: "sqrt" });
    const s = stateOf(d.handle({ type: "tapTile", id: 0 }));

    const tile = s.tiles.find((t) => t.id === 0)!;
    expect(tile.value).toBe(4);
    expect(tile.transformed).toBe(true);
    expect(tile.consumed).toBe(false);
    expect(s.targetIndex).toBe(0);
    expect(s.transformOp).toBeNull();
  });

  it("the transformed tile can then be used to win", () => {
    const d = new Director(UNARY, "normal");
    d.handle({ type: "tapUnary", op: "sqrt" });
    let s = stateOf(d.handle({ type: "tapTile", id: 0 }));
    s = stateOf(d.handle({ type: "tapTile", id: 1 }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: 0 }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("won");
  });

  it("does not cascade — a transformed tile cannot be transformed again", () => {
    const d = new Director(UNARY, "normal");
    d.handle({ type: "tapUnary", op: "sqrt" });
    d.handle({ type: "tapTile", id: 0 });
    // 4 is a perfect square, but tile 0 has already been transformed.
    const out = d.handle({ type: "tapUnary", op: "sqrt" });
    expect(rejection(out)).toContain("nothing in the pool");
  });
});

describe("operator budgets are honoured", () => {
  it("refuses an operator with no budget left", () => {
    const d = new Director(CANONICAL, "expert"); // { +:1, *:2 }
    const out = d.handle({ type: "tapTile", id: 0 });
    expect(rejection(out)).toBeNull();
    expect(rejection(d.handle({ type: "tapOperator", op: "-" }))).toBe("no - left");
  });

  it("spends the operator on commit", () => {
    const d = new Director(CANONICAL, "expert");
    let s = stateOf(d.handle({ type: "loadLevel", id: CANONICAL.id }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "*" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 4) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.budget["*"]).toBe(1);
  });
});
