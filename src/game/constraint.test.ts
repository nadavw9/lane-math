import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONSTRAINT_LEVEL, Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

/**
 * GDD §7.7: THE BOARD TEACHES BY CONSTRAINT — ON 1-01 ONLY.
 *
 * This was specified from the FTUE session onward and never implemented. The
 * spec said "the player cannot form a wrong equation"; measured against the
 * shipped Director, 9 + 1 on 1-01 staged completely — first tile accepted,
 * operator accepted, second tile accepted — and was only refused at commit.
 *
 * The narrowness is the design, not an unfinished job. §7.4 guarantees d_i = 1
 * on 1-01, so filtering the pool there removes nothing the player could have
 * wanted. Anywhere else it would delete §9.5's shudder and do their arithmetic.
 */

const load = (id: string): LadderLevel =>
  JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};

function open(id: string): { director: Director; state: ViewState } {
  const director = new Director(load(id), "normal");
  return { director, state: stateOf(director.handle({ type: "loadLevel", id })) };
}

describe(`the pool is filtered on ${CONSTRAINT_LEVEL}`, () => {
  it("offers only tiles that appear in some legal decomposition", () => {
    const { state } = open(CONSTRAINT_LEVEL);
    const allowed = state.constrainedTileIds;
    expect(allowed, "the constraint must apply here").not.toBeNull();

    const values = state.tiles.filter((t) => allowed!.includes(t.id)).map((t) => t.value).sort();
    // 1-01: front target 14 from 9,5,1,4,7,8 — the only decomposition is 5 + 9.
    expect(values).toEqual([5, 9]);
  });

  it("refuses a tile that cannot reach the front target", () => {
    const { director, state } = open(CONSTRAINT_LEVEL);
    const dead = state.tiles.find((t) => !state.constrainedTileIds!.includes(t.id));
    expect(dead, "1-01 has tiles outside the legal set").toBeDefined();

    const after = stateOf(director.handle({ type: "tapTile", id: dead!.id }));
    expect(after.slots.leftTileId, "the dead tile must not enter a slot").toBeNull();
  });

  it("narrows to the completing tiles once an operand and operator are down", () => {
    const { director, state } = open(CONSTRAINT_LEVEL);
    const nine = state.tiles.find((t) => t.value === 9)!;

    let next = stateOf(director.handle({ type: "tapTile", id: nine.id }));
    expect(next.slots.leftTileId, "9 is a legal first operand").toBe(nine.id);

    next = stateOf(director.handle({ type: "tapOperator", op: "+" }));
    const completing = next.tiles
      .filter((t) => next.constrainedTileIds!.includes(t.id))
      .map((t) => t.value);
    expect(completing, "only 5 completes 9 + _ = 14").toEqual([5]);

    // And the refusal is real, not merely a drawing hint.
    const one = next.tiles.find((t) => t.value === 1)!;
    const refused = stateOf(director.handle({ type: "tapTile", id: one.id }));
    expect(refused.slots.rightTileId).toBeNull();
  });

  it("still lets a staged move be rewound", () => {
    /*
     * Returning a piece is a rewind (§3.5: tapping a filled SLOT returns it),
     * not a new operand — the filter must not trap the player in a move they
     * have started. Re-tapping the tile itself is refused by design and always
     * was; that is the equation-is-full path, not the constraint.
     */
    const { director, state } = open(CONSTRAINT_LEVEL);
    const nine = state.tiles.find((t) => t.value === 9)!;
    stateOf(director.handle({ type: "tapTile", id: nine.id }));
    const back = stateOf(director.handle({ type: "tapSlot", index: 0 }));
    expect(back.slots.leftTileId).toBeNull();
  });
});

describe("no other level is filtered", () => {
  it("reports no constraint, and lets a wrong equation be formed and refused", () => {
    const { director, state } = open("2-01");
    expect(state.constrainedTileIds, "null means NO constraint, not none allowed").toBeNull();

    const target = state.targets[0]!;
    const free = state.tiles.filter((t) => !t.consumed);
    // Any pair that does not sum to the target will do.
    const a = free[0]!;
    const b = free.find((t) => t.id !== a.id && a.value + t.value !== target)!;

    let next = stateOf(director.handle({ type: "tapTile", id: a.id }));
    next = stateOf(director.handle({ type: "tapOperator", op: "+" }));
    next = stateOf(director.handle({ type: "tapTile", id: b.id }));

    expect(next.slots.rightTileId, "the wrong equation forms — §9.5 refuses it at commit").toBe(b.id);
    const committed = stateOf(director.handle({ type: "tapCommit" }));
    expect(committed.targetIndex, "and it does not advance the lane").toBe(0);
  });
});

describe("1-01 teaches by doing", () => {
  it("moves through one-line cues as the equation is built", () => {
    const { director, state } = open(CONSTRAINT_LEVEL);
    expect(state.teachingLine).toBe("Tap a number.");
    const nine = state.tiles.find((t) => t.value === 9)!;
    let next = stateOf(director.handle({ type: "tapTile", id: nine.id }));
    expect(next.teachingLine).toBe("Choose a sign.");
    next = stateOf(director.handle({ type: "tapOperator", op: "+" }));
    expect(next.teachingLine).toBe("Make the target.");
  });
});
