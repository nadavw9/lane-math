import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Economy } from "../economy/economy.js";
import {
  MemoryStore,
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  writeSave,
  type SaveData,
  type SaveStore,
} from "../economy/save.js";
import { DEFAULT_RULES } from "../solver/index.js";
import { MemorySink, Telemetry } from "../telemetry/telemetry.js";
import { Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

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

describe("clearEquation wrong-answer recovery (engine contract)", () => {
  const load = (id: string): LadderLevel =>
    JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

  it("1-03: refused 9+3 then clearEquation restores empty slots without a new attempt", () => {
    const level = load("1-03");
    const economy = new Economy(new MemoryStore(), () => 1_700_000_000_000);
    const d = new Director(level, "normal", economy);
    let s = stateOf(d.handle({ type: "loadLevel", id: level.id }));

    const runBefore = s.run;
    const failuresBefore = s.failures;
    const livesBefore = s.economy!.lives;
    const starsBefore = s.economy!.totalStars;

    // Make 4 with 9 − 5.
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 9) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "-" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 5) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(1);
    expect(s.tiles.filter((t) => t.consumed)).toHaveLength(2);
    expect(s.budget["+"]).toBe(1);
    expect(s.budget["-"]).toBe(1);

    // Submit 9 + 3 for target 11 — wrong arithmetic, equation stays up (§9.5).
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 9) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapSlot", index: 0 })); // arm swap so clearEquation must clear it
    expect(s.swapArmedSlot).toBe(0);

    const refused = d.handle({ type: "tapCommit" });
    expect(rejection(refused)).toBe("9 + 3 = 12, not 11");
    s = stateOf(refused);
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(1);
    expect(s.tiles.filter((t) => t.consumed)).toHaveLength(2);
    expect(s.budget["+"]).toBe(1);
    expect(s.failures).toBe(failuresBefore);
    expect(s.run).toBe(runBefore);
    expect(s.economy!.lives).toBe(livesBefore);
    expect(s.economy!.totalStars).toBe(starsBefore);
    expect(s.slots.leftTileId).not.toBeNull();
    expect(s.slots.op).toBe("+");
    expect(s.slots.rightTileId).not.toBeNull();

    // clearEquation: empty slots + number affordance; same attempt.
    s = stateOf(d.handle({ type: "clearEquation" }));
    expect(s.slots).toEqual({ leftTileId: null, op: null, rightTileId: null });
    expect(s.swapArmedSlot).toBeNull();
    expect(s.message).toBeNull();
    expect(s.affordance).toBe("numbers");
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(1);
    expect(s.tiles.filter((t) => t.consumed)).toHaveLength(2);
    expect(s.budget["+"]).toBe(1);
    expect(s.failures).toBe(failuresBefore);
    expect(s.run).toBe(runBefore);
    expect(s.economy!.lives).toBe(livesBefore);
    expect(s.economy!.totalStars).toBe(starsBefore);
  });
});


describe("save-concurrency: Director clear / fail unapplied paths", () => {
  const T0 = 1_700_000_000_000;

  /** Single-target board — final move is the only move. */
  const FINAL: LadderLevel = {
    id: "test-final-clear",
    world: 1,
    pool: [2, 3],
    targets: [5],
    rules: DEFAULT_RULES,
    modes: {
      casual: { budget: { "+": null }, tier: "tutorial" },
      normal: { budget: { "+": null }, tier: "tutorial" },
      expert: { budget: { "+": null }, tier: "tutorial" },
    },
    surplus: 0,
  };

  function emptySave(): SaveData {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      levels: {},
      lives: 5,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 0,
      starsSpent: 0,
      restored: {},
      selectedMode: "normal",
      muted: false,
    };
  }

  /** Every primary read returns a distinct foreign validated payload. */
  function racingStore(seed: SaveData): {
    store: SaveStore;
    inner: MemoryStore;
    stopRace: () => void;
  } {
    const inner = new MemoryStore();
    writeSave(inner, seed);
    let race = true;
    let tick = 0;
    const store: SaveStore = {
      read(key) {
        if (!race || key !== SAVE_KEY) return inner.read(key);
        tick += 1;
        return JSON.stringify({
          ...seed,
          totalStars: seed.totalStars + tick,
          clockHighWater: T0 + tick,
        });
      },
      write(key, value) {
        inner.write(key, value);
      },
    };
    return {
      store,
      inner,
      stopRace: () => {
        race = false;
      },
    };
  }

  it("double-conflict clear restores pre-final tiles/budget/targetIndex; no win telemetry", () => {
    const seed = emptySave();
    const { store, inner, stopRace } = racingStore(seed);
    const economy = new Economy(store, () => T0);
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);
    const d = new Director(FINAL, "normal", economy, telemetry);

    let s = stateOf(d.handle({ type: "loadLevel", id: FINAL.id }));
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(0);
    const budgetBefore = { ...s.budget };

    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapCommit" }));

    // Restored to pre-final: still playing with a front target.
    expect(s.phase).toBe("playing");
    expect(s.targetIndex).toBe(0);
    expect(s.targetIndex).toBeLessThan(FINAL.targets.length);
    expect(s.tiles.every((t) => !t.consumed)).toBe(true);
    expect(s.budget).toEqual(budgetBefore);
    expect(s.slots.leftTileId).not.toBeNull();
    expect(s.slots.op).toBe("+");
    expect(s.slots.rightTileId).not.toBeNull();
    expect(s.message).toBe("could not save — try again");
    expect(economy.state.levels[FINAL.id]?.cleared).toBeFalsy();

    const names = sink.events.map((e) => e.event.name);
    expect(names).not.toContain("level_complete");
    expect(names).not.toContain("level_clear");
    expect(names).not.toContain("star_bank_update");

    // Race settles: pin adopted token as durable primary, then final move wins.
    stopRace();
    const token = economy.expectedPrimaryToken;
    expect(token).toBeTruthy();
    inner.write(SAVE_KEY, token!);

    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("won");
    expect(economy.state.levels[FINAL.id]?.cleared).toBe(true);
    expect(sink.events.some((e) => e.event.name === "level_clear")).toBe(true);
  });

  it("starBankUpdate delta equals starsAdded after foreign adopt+retry", () => {
    const shared = new MemoryStore();
    writeSave(shared, {
      ...emptySave(),
      totalStars: 4,
      levels: {
        "1-01": {
          bestStars: 2,
          failCount: 0,
          cleared: true,
          firstFailureUsed: false,
          hintsPurchased: [],
          ratingAttempt: "tainted",
        },
        "1-02": {
          bestStars: 2,
          failCount: 0,
          cleared: true,
          firstFailureUsed: false,
          hintsPurchased: [],
          ratingAttempt: "tainted",
        },
      },
    });
    const a = new Economy(shared, () => T0);
    const b = new Economy(shared, () => T0);
    b.recordClear("2-01"); // foreign +3
    const foreignTotal = b.state.totalStars;

    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);
    const d = new Director(FINAL, "normal", a, telemetry);
    let s = stateOf(d.handle({ type: "loadLevel", id: FINAL.id }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("won");

    const bank = sink.events.find((e) => e.event.name === "star_bank_update");
    expect(bank).toBeTruthy();
    if (!bank || bank.event.name !== "star_bank_update") throw new Error("missing");
    // Local clear of fresh level = 3★; must NOT include foreign tab's +3.
    expect(bank.event.delta).toBe(3);
    expect(bank.event.total_stars).toBe(foreignTotal + 3);
    expect(bank.event.delta).toBeLessThan(bank.event.total_stars - 4);
  });

  it("unapplied failure suppresses fail/life telemetry", () => {
    const seed = emptySave();
    // World-3 id so lives are active if a life were spent; racing forces unapplied.
    const level: LadderLevel = {
      ...CANONICAL_UNASSISTED,
      id: "3-05",
      world: 3,
    };
    const { store } = racingStore(seed);
    const economy = new Economy(store, () => T0);
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);
    const d = new Director(level, "expert", economy, telemetry);

    let s = stateOf(d.handle({ type: "loadLevel", id: level.id }));
    // Fatal path: 3+5=8 then 1+2=3 leaves 15 unreachable.
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 5) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 1) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapCommit" }));

    expect(s.phase).toBe("failed");
    const names = sink.events.map((e) => e.event.name);
    expect(names).not.toContain("level_fail");
    expect(names).not.toContain("life_depleted");
    // Economy mutation itself did not stick.
    expect(economy.progressFor("3-05").failCount).toBe(0);
  });
});

describe("save-concurrency: Director mode / replay double-conflict", () => {
  const T0 = 1_700_000_000_000;

  const FINAL: LadderLevel = {
    id: "test-final-clear",
    world: 1,
    pool: [2, 3],
    targets: [5],
    rules: DEFAULT_RULES,
    modes: {
      casual: { budget: { "+": null }, tier: "tutorial" },
      normal: { budget: { "+": null }, tier: "tutorial" },
      expert: { budget: { "+": null }, tier: "tutorial" },
    },
    surplus: 0,
  };

  function emptySave(): SaveData {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      levels: {},
      lives: 5,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 0,
      starsSpent: 0,
      restored: {},
      selectedMode: "normal",
      muted: false,
    };
  }

  /** Toggleable race: every primary read can return a distinct foreign payload. */
  function racingStore(seed: SaveData): {
    store: SaveStore;
    inner: MemoryStore;
    setRace: (on: boolean) => void;
  } {
    const inner = new MemoryStore();
    writeSave(inner, seed);
    let race = true;
    let tick = 0;
    const store: SaveStore = {
      read(key) {
        if (!race || key !== SAVE_KEY) return inner.read(key);
        tick += 1;
        return JSON.stringify({
          ...seed,
          totalStars: seed.totalStars + tick,
          clockHighWater: T0 + tick,
          levels: { ...seed.levels },
        });
      },
      write(key, value) {
        inner.write(key, value);
      },
    };
    return {
      store,
      inner,
      setRace: (on: boolean) => {
        race = on;
      },
    };
  }

  it("double-conflict selectMode rejects and keeps prior mode (no silent success)", () => {
    const seed = emptySave();
    const { store } = racingStore(seed);
    const economy = new Economy(store, () => T0);
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);
    const d = new Director(FINAL, "normal", economy, telemetry);

    stateOf(d.handle({ type: "loadLevel", id: FINAL.id }));
    const commands = d.handle({ type: "selectMode", mode: "casual" });

    expect(rejection(commands)).toBe("could not save — try again");
    expect(stateOf(commands).mode).toBe("normal");
    expect(economy.selectedMode).toBe("normal");
    expect(economy.lastCommitResult).toBe("rejected_stale");
  });

  it("double-conflict replay preserves won board; no reset / no abandon telemetry", () => {
    const seed: SaveData = {
      ...emptySave(),
      totalStars: 3,
      levels: {
        [FINAL.id]: {
          bestStars: 3,
          failCount: 2,
          cleared: true,
          firstFailureUsed: false,
          hintsPurchased: [],
          ratingAttempt: "tainted",
        },
      },
    };
    const { store, setRace } = racingStore(seed);
    setRace(false);
    const economy = new Economy(store, () => T0);
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);
    const d = new Director(FINAL, "normal", economy, telemetry);

    // Reach won without a save race, then re-arm the race for beginReplay.
    let s = stateOf(d.handle({ type: "loadLevel", id: FINAL.id }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 2) }));
    s = stateOf(d.handle({ type: "tapOperator", op: "+" }));
    s = stateOf(d.handle({ type: "tapTile", id: idOfValue(s, 3) }));
    s = stateOf(d.handle({ type: "tapCommit" }));
    expect(s.phase).toBe("won");
    expect(economy.progressFor(FINAL.id).failCount).toBe(2);

    // Foreign reads keep seed.failCount=2 while advancing the concurrency token.
    setRace(true);
    sink.events.length = 0;
    const commands = d.handle({ type: "tapRestart" });

    expect(rejection(commands)).toBe("could not save — try again");
    s = stateOf(commands);
    expect(s.phase).toBe("won");
    expect(s.failures).toBe(2);
    expect(economy.progressFor(FINAL.id).failCount).toBe(2);
    expect(economy.lastCommitResult).toBe("rejected_stale");

    const names = sink.events.map((e) => e.event.name);
    expect(names).not.toContain("level_abandon");
    expect(names).not.toContain("level_start");
  });
});
