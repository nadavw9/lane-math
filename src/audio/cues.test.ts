import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Director } from "../game/director.js";
import type { Command, LadderLevel, ViewState } from "../game/types.js";
import { advancesTarget } from "../renderer/transitions.js";
import { cuesFor, toneOf, type Cue } from "./cues.js";

/**
 * WHAT THE GAME IS ALLOWED TO MAKE A NOISE ABOUT.
 *
 * The synthesiser needs a browser, but the failure modes that actually matter
 * are not about timbre — they are about a sound firing at a moment it should
 * not. Those are decided here, in a pure function, so they can be pinned.
 *
 * The loudest requirement in the brief is SILENCE: a player sits still for
 * twenty seconds planning, and the game has to stay quiet through it.
 */
function load(id: string): LadderLevel {
  return JSON.parse(readFileSync(join("levels", `${id}.json`), "utf8")) as LadderLevel;
}

function stateOf(commands: readonly Command[]): ViewState {
  const render = commands.find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
}

function names(cues: readonly Cue[]): string[] {
  return cues.map((c) => c.name);
}

/** Play a real board, returning every (previous, next, rejected) transition. */
function transitionsOf(
  levelId: string,
  inputs: readonly Parameters<Director["handle"]>[0][],
): { previous: ViewState; next: ViewState; rejected: boolean }[] {
  const level = load(levelId);
  const director = new Director(level, "normal");
  let previous = stateOf(director.handle({ type: "loadLevel", id: level.id }));

  const out: { previous: ViewState; next: ViewState; rejected: boolean }[] = [];
  for (const input of inputs) {
    const commands = director.handle(input);
    const next = stateOf(commands);
    out.push({ previous, next, rejected: commands.some((c) => c.type === "reject") });
    previous = next;
  }
  return out;
}

describe("silence is the default (GDD §9.5)", () => {
  it("says nothing when a level opens", () => {
    const level = load("1-01");
    const director = new Director(level, "normal");
    const opened = stateOf(director.handle({ type: "loadLevel", id: level.id }));
    // No previous state at all: the board arriving is not something the player
    // did, so it cannot be something the player hears.
    expect(cuesFor(null, opened, false)).toEqual([]);
  });

  it("says nothing on a tick with an untouched board", () => {
    const [tick] = transitionsOf("1-01", [{ type: "tick" }]);
    expect(cuesFor(tick!.previous, tick!.next, tick!.rejected)).toEqual([]);
  });

  it("says nothing on restart — retry is silent as well as instant", () => {
    const level = load("1-01");
    const director = new Director(level, "normal");
    let state = stateOf(director.handle({ type: "loadLevel", id: level.id }));
    const live = state.tiles.filter((t) => !t.consumed);
    director.handle({ type: "tapTile", id: live[0]!.id });
    state = stateOf(director.handle({ type: "tapOperator", op: "+" }));

    const after = stateOf(director.handle({ type: "tapRestart" }));
    // A rewind is the harshest moment in the game already. Announcing it would
    // be the game commenting on the player's failure.
    expect(cuesFor(state, after, false)).toEqual([]);
  });

  it("makes at most one sound per action, never a chord", () => {
    // 9 + 5 on 1-01: stage, operator, stage, commit.
    const level = load("1-01");
    const director = new Director(level, "normal");
    const opened = stateOf(director.handle({ type: "loadLevel", id: level.id }));
    const id = (v: number) => opened.tiles.find((t) => t.value === v && !t.consumed)!.id;

    for (const t of transitionsOf("1-01", [
      { type: "tapTile", id: id(9) },
      { type: "tapOperator", op: "+" },
      { type: "tapTile", id: id(5) },
      { type: "tapCommit" },
    ])) {
      expect(cuesFor(t.previous, t.next, t.rejected).length).toBeLessThanOrEqual(1);
    }
  });
});

describe("the sound map (GDD §9.5)", () => {
  const level = load("1-01");
  const opened = stateOf(new Director(level, "normal").handle({ type: "loadLevel", id: "1-01" }));
  const id = (v: number) => opened.tiles.find((t) => t.value === v && !t.consumed)!.id;

  it("clicks when a tile is staged, pitched by its value", () => {
    const [staged] = transitionsOf("1-01", [{ type: "tapTile", id: id(9) }]);
    const cues = cuesFor(staged!.previous, staged!.next, staged!.rejected);
    expect(names(cues)).toEqual(["click"]);
    expect(cues[0]!.tone).toBeGreaterThan(0);
  });

  it("thunks when a target is cleared", () => {
    const steps = transitionsOf("1-01", [
      { type: "tapTile", id: id(9) },
      { type: "tapOperator", op: "+" },
      { type: "tapTile", id: id(5) },
      { type: "tapCommit" },
    ]);
    const commit = steps[steps.length - 1]!;
    expect(names(cuesFor(commit.previous, commit.next, commit.rejected))).toEqual(["thunk"]);
  });

  it("scrapes on a refused commit — and does NOT thunk", () => {
    // 9 + 5 = 14 against a target of 14 succeeds on 1-01, so refuse with 1 + 4.
    const steps = transitionsOf("1-01", [
      { type: "tapTile", id: id(1) },
      { type: "tapOperator", op: "+" },
      { type: "tapTile", id: id(4) },
      { type: "tapCommit" },
    ]);
    const refused = steps[steps.length - 1]!;
    expect(refused.rejected).toBe(true);
    const cues = names(cuesFor(refused.previous, refused.next, refused.rejected));
    expect(cues).toEqual(["scrape"]);
    // §2 step 4: wrong arithmetic is not a failure state, so it must never
    // borrow the failure sound.
    expect(cues).not.toContain("fail");
  });

  it("tears — and only tears — on a unary transform", () => {
    const level4 = load("4-09");
    const director = new Director(level4, "normal");
    const state = stateOf(director.handle({ type: "loadLevel", id: level4.id }));
    const armed = stateOf(director.handle({ type: "tapUnary", op: "sqrt" }));
    const target = armed.transformableTileIds[0]!;
    const after = stateOf(director.handle({ type: "tapTile", id: target }));

    const cues = names(cuesFor(state, after, false));
    expect(cues).toEqual(["tear"]);
    // A transform must never be mistaken for a binary move.
    expect(cues).not.toContain("click");
    expect(cues).not.toContain("knock");
  });

  it("sounds failure exactly once, on the edge", () => {
    const failed = { phase: "failed", targetIndex: 0, levelId: "1-01", tiles: [], slots: {} };
    const playing = { ...failed, phase: "playing" };
    const base = { ...failed, phase: "failed" };

    // Entering failure speaks; sitting in it does not.
    expect(
      names(cuesFor(playing as unknown as ViewState, base as unknown as ViewState, false)),
    ).toContain("fail");
    expect(
      names(cuesFor(base as unknown as ViewState, base as unknown as ViewState, false)),
    ).not.toContain("fail");
  });
});

describe("one action, one sound", () => {
  it("returns a tile with a single knock, not two", () => {
    /*
     * Caught by the cue log during verification, not by reading the code.
     *
     * A return was sounding twice: once from this map when the slot emptied,
     * and again when the travelling token landed. Placement is the case that
     * genuinely wants two — a click for the finger and a knock for the piece
     * arriving, ~260ms apart — and the return was following it by reflex.
     */
    const level = load("1-01");
    const director = new Director(level, "normal");
    const opened = stateOf(director.handle({ type: "loadLevel", id: level.id }));
    const first = opened.tiles.find((t) => !t.consumed)!;

    const staged = stateOf(director.handle({ type: "tapTile", id: first.id }));
    const returned = stateOf(director.handle({ type: "tapSlot", index: 0 }));

    expect(names(cuesFor(staged, returned, false))).toEqual(["knockSoft"]);
  });
});

describe("the hit-stop is silent by construction (GDD §9.5)", () => {
  it("binds the commit sound to the transition the renderer DEFERS", () => {
    /*
     * The guarantee is structural, not a timer.
     *
     * The renderer holds exactly the transitions where advancesTarget() is
     * true, and the thunk is produced by exactly those transitions — so the
     * sound cannot be made until the hold has released. This asserts the two
     * predicates agree; if a later change moved the thunk to the input path,
     * they would come apart here.
     */
    const level = load("1-01");
    const director = new Director(level, "normal");
    const opened = stateOf(director.handle({ type: "loadLevel", id: level.id }));
    const id = (v: number) => opened.tiles.find((t) => t.value === v && !t.consumed)!.id;

    const steps = transitionsOf("1-01", [
      { type: "tapTile", id: id(9) },
      { type: "tapOperator", op: "+" },
      { type: "tapTile", id: id(5) },
      { type: "tapCommit" },
    ]);

    for (const step of steps) {
      const thunks = names(cuesFor(step.previous, step.next, step.rejected)).includes("thunk");
      expect(thunks).toBe(advancesTarget(step.previous, step.next));
    }
  });
});

describe("toneOf", () => {
  it("rises with value and never runs off the top", () => {
    expect(toneOf(1)).toBe(0);
    expect(toneOf(8)).toBeGreaterThan(toneOf(2));
    expect(toneOf(999)).toBeLessThanOrEqual(1);
  });
});
