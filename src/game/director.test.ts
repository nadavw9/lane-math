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

/**
 * The same board with NO assistance and NO scarcity.
 *
 * §4.1's failure rule and §4.3's restart have to be testable on their own. In
 * Normal the fatal move is now intercepted by the warning (§6 amended) and can
 * never be committed — `dismissWarning` rewinds it for free and there is no
 * override — so a Normal director cannot reach a failed board at all. Expert is
 * the one mode that does not warn, and free operators keep the failure purely
 * structural: the front target is unreachable because the TILES are gone, not
 * because an operator ran out.
 */
const CANONICAL_UNASSISTED: LadderLevel = {
  ...CANONICAL,
  modes: {
    ...CANONICAL.modes,
    expert: { budget: { "+": null, "-": null, "*": null }, tier: "tutorial" },
  },
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
  });

  it("leaves the refused equation standing so it can be corrected (GDD §9.5)", () => {
    /*
     * This asserted the opposite until §9.5 was written: the slots were emptied
     * on a refusal, so a wrong guess cost three taps to re-enter. Wrong
     * arithmetic is explicitly not a failure state (§2 step 4) and should not
     * carry a failure's price — and §9.5's "tiles stay put" has nothing to
     * describe if the Director has already cleared them.
     */
    const d = new Director(CANONICAL, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: "x" }));
    const left = idOfValue(s, 1);
    s = stateOf(d.handle({ type: "tapTile", id: left }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    const right = idOfValue(s, 2);
    s = stateOf(d.handle({ type: "tapTile", id: right }));

    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.slots.leftTileId).toBe(left);
    expect(s.slots.op).toBe("+");
    expect(s.slots.rightTileId).toBe(right);

    // And the player can fix just the wrong part rather than start over.
    s = stateOf(d.handle({ type: "tapSlot", index: 1 }));
    expect(s.slots.leftTileId).toBe(left);
    expect(s.slots.op).toBeNull();
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
    const d = new Director(CANONICAL_UNASSISTED, "expert");
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
    const d = new Director(CANONICAL_UNASSISTED, "expert");
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

describe("swap gesture on the equation row (GDD §3.5)", () => {
  /**
   * Order-sensitive board: 5−3 = 2 is legal; 3−5 is refused under early rules.
   * Pool keeps extras so the equation can stand without starving the board.
   */
  const ORDERED: LadderLevel = {
    id: "test-swap-order",
    world: 1,
    pool: [5, 3, 2, 4],
    targets: [2],
    rules: DEFAULT_RULES,
    modes: {
      casual: { budget: { "+": null, "-": null, "*": null, "/": null }, tier: "tutorial" },
      normal: { budget: { "+": null, "-": null, "*": null, "/": null }, tier: "tutorial" },
      expert: { budget: { "+": null, "-": null, "*": null, "/": null }, tier: "tutorial" },
    },
    surplus: 0,
  };

  const fillEquation = (
    d: Director,
    left: number,
    op: "+" | "-" | "*" | "/",
    right: number,
  ): ViewState => {
    let s = stateOf(d.handle({ type: "loadLevel", id: ORDERED.id }));
    const leftId = idOfValue(s, left);
    s = stateOf(d.handle({ type: "tapTile", id: leftId }));
    s = stateOf(d.handle({ type: "tapOperator", op }));
    const rightId = idOfValue(s, right);
    s = stateOf(d.handle({ type: "tapTile", id: rightId }));
    return s;
  };

  it("arms on first operand tap and swaps on the other without emptying slots", () => {
    const d = new Director(ORDERED, "normal");
    let s = fillEquation(d, 5, "-", 3);
    const left = s.slots.leftTileId!;
    const right = s.slots.rightTileId!;
    expect(s.swapArmedSlot).toBeNull();

    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    expect(s.swapArmedSlot).toBe(0);
    expect(s.slots.leftTileId).toBe(left);
    expect(s.slots.op).toBe("-");
    expect(s.slots.rightTileId).toBe(right);

    s = stateOf(d.handle({ type: "tapSlot", index: 2 }));
    expect(s.swapArmedSlot).toBeNull();
    expect(s.slots.leftTileId).toBe(right);
    expect(s.slots.rightTileId).toBe(left);
    expect(s.slots.op).toBe("-");
  });

  it("also swaps right-then-left", () => {
    const d = new Director(ORDERED, "normal");
    let s = fillEquation(d, 5, "-", 3);
    const left = s.slots.leftTileId!;
    const right = s.slots.rightTileId!;

    s = stateOf(d.handle({ type: "tapSlot", index: 2 }));
    expect(s.swapArmedSlot).toBe(2);
    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    expect(s.slots.leftTileId).toBe(right);
    expect(s.slots.rightTileId).toBe(left);
    expect(s.slots.op).toBe("-");
  });

  it("second tap on the armed slot still rewinds (Wordle clear)", () => {
    const d = new Director(ORDERED, "normal");
    let s = fillEquation(d, 5, "-", 3);
    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    expect(s.swapArmedSlot).toBe(0);
    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    expect(s.swapArmedSlot).toBeNull();
    expect(s.slots.leftTileId).toBeNull();
    expect(s.slots.op).toBeNull();
    expect(s.slots.rightTileId).toBeNull();
  });

  it("lets a swapped subtraction commit when order was wrong", () => {
    const d = new Director(ORDERED, "normal");
    let s = fillEquation(d, 3, "-", 5);
    // 3−5 is illegal under DEFAULT_RULES (no negatives).
    expect(rejection(d.handle({ type: "tapCommit" }))).toContain("not allowed");
    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    s = stateOf(d.handle({ type: "tapSlot", index: 2 }));
    expect(s.slots.op).toBe("-");
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("won");
  });

  it("swaps division operands so 6÷2 can replace illegal 2÷6", () => {
    const DIV: LadderLevel = {
      ...ORDERED,
      id: "test-swap-div",
      pool: [6, 2, 3, 4],
      targets: [3],
    };
    const d = new Director(DIV, "normal");
    let s = stateOf(d.handle({ type: "loadLevel", id: DIV.id }));
    const two = idOfValue(s, 2);
    const six = idOfValue(s, 6);
    s = stateOf(d.handle({ type: "tapTile", id: two }));
    s = stateOf(d.handle({ type: "tapOperator", op: "/" }));
    s = stateOf(d.handle({ type: "tapTile", id: six }));
    // 2÷6 is not exact integer division.
    expect(rejection(d.handle({ type: "tapCommit" }))).toContain("not allowed");
    // Equation still standing (§9.5); swap fixes order without re-entry.
    expect(s.slots.leftTileId).toBe(two);
    expect(s.slots.rightTileId).toBe(six);
    s = stateOf(d.handle({ type: "tapSlot", index: 0 }));
    s = stateOf(d.handle({ type: "tapSlot", index: 2 }));
    expect(s.slots.leftTileId).toBe(six);
    expect(s.slots.rightTileId).toBe(two);
    expect(s.slots.op).toBe("/");
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("won");
  });

  it("does not slide slots when clearing only the right operand", () => {
    const d = new Director(ORDERED, "normal");
    let s = fillEquation(d, 5, "-", 3);
    const left = s.slots.leftTileId;
    s = stateOf(d.handle({ type: "tapSlot", index: 2 }));
    // First tap arms; second on same clears right only.
    s = stateOf(d.handle({ type: "tapSlot", index: 2 }));
    expect(s.slots.leftTileId).toBe(left);
    expect(s.slots.op).toBe("-");
    expect(s.slots.rightTileId).toBeNull();
  });
});
