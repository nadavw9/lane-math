import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { advancesTarget, isRewind } from "../renderer/transitions.js";
import { enumerate } from "../solver/index.js";
import { Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

/**
 * THE RETRY GUARANTEE (GDD §9.5: retry must be instantaneous).
 *
 * Measured in the browser at 1 frame, with the board playable in the same
 * synchronous tick as the restart input. That is the strongest number in the
 * build and the easiest to lose to a later feature — a confirm dialog, a
 * "level failed" screen, a fade — so it is pinned here rather than left to be
 * re-measured by hand.
 *
 * The claim has three parts and each is asserted separately:
 *   1. the Director rewinds SYNCHRONOUSLY, so no frame is needed to become
 *      playable;
 *   2. restarting emits ONE render and nothing else, so there is no screen,
 *      modal or transition command to sit through;
 *   3. the transition cannot trigger the renderer's hit-stop, which is the only
 *      thing in the game that delays a frame.
 */
const LEVELS = "levels";

function load(id: string): LadderLevel {
  return JSON.parse(readFileSync(join(LEVELS, `${id}.json`), "utf8")) as LadderLevel;
}

function stateOf(commands: readonly Command[]): ViewState {
  const render = commands.find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
}

/**
 * Play a level into a genuine loss.
 *
 * Deliberately not a hand-written fatal line: the retry path has to be measured
 * from a real failure, and a level whose failure was hand-constructed would
 * stop being a failure the moment the ladder was recurated.
 */
function playIntoFailure(director: Director, level: LadderLevel): ViewState {
  let state = stateOf(director.handle({ type: "loadLevel", id: level.id }));

  for (let guard = 0; guard < 40 && state.phase === "playing"; guard++) {
    const live = state.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = state.targets[state.targetIndex];
    if (target === undefined) break;

    const options = enumerate(live, target, state.budget, level.rules);
    if (options.length === 0) break;

    // The last option: on a trapped board the natural move is enumerated
    // first, so this walks into trouble reliably.
    const pick = options[options.length - 1]!;
    director.handle({ type: "tapTile", id: pick.leftId });
    director.handle({ type: "tapOperator", op: pick.op });
    director.handle({ type: "tapTile", id: pick.rightId });
    state = stateOf(director.handle({ type: "tapCommit" }));
  }
  return state;
}

/** A level that this walk actually loses, so the test measures a real retry. */
function failedBoard(): { director: Director; level: LadderLevel; failed: ViewState } {
  for (const id of ["1-06", "1-04", "1-08", "2-03", "2-07", "3-02", "3-05", "4-02"]) {
    const level = load(id);
    const director = new Director(level, "normal");
    const failed = playIntoFailure(director, level);
    if (failed.phase === "failed") return { director, level, failed };
  }
  throw new Error("no level in the ladder could be walked into a failure");
}

describe("retry is instantaneous (GDD §9.5)", () => {
  it("rewinds to a playable board in the same synchronous tick", () => {
    const { director, failed } = failedBoard();
    expect(failed.phase).toBe("failed");

    // No await, no frame, no callback: the state returned BY the restart call
    // is already the state of a playable board.
    const after = stateOf(director.handle({ type: "tapRestart" }));

    expect(after.phase).toBe("playing");
    expect(after.targetIndex).toBe(0);
    expect(after.tiles.every((t) => !t.consumed)).toBe(true);
    expect(after.slots).toEqual({ leftTileId: null, op: null, rightTileId: null });
  });

  it("emits one render and NOTHING else — no screen to sit through", () => {
    const { director } = failedBoard();
    const commands = director.handle({ type: "tapRestart" });

    // The whole guarantee in one assertion: if a modal, a transition or a
    // second screen is ever added to this path, it arrives as another command
    // and this fails.
    expect(commands.map((c) => c.type)).toEqual(["render"]);
  });

  it("cannot trigger the hit-stop, the only thing that delays a frame", () => {
    const { director, failed } = failedBoard();
    const after = stateOf(director.handle({ type: "tapRestart" }));

    expect(advancesTarget(failed, after)).toBe(false);
    // And it IS recognised as a rewind, so the feel layer is dropped rather
    // than carried into the fresh board.
    expect(isRewind(failed, after)).toBe(true);
  });

  it("restarting mid-level is just as immediate as restarting from a loss", () => {
    // The player can bail out at any point, not only after failing.
    const level = load("1-01");
    const director = new Director(level, "normal");
    let state = stateOf(director.handle({ type: "loadLevel", id: level.id }));

    const live = state.tiles.filter((t) => !t.consumed);
    director.handle({ type: "tapTile", id: live[0]!.id });
    state = stateOf(director.handle({ type: "tapOperator", op: "+" }));

    const commands = director.handle({ type: "tapRestart" });
    expect(commands.map((c) => c.type)).toEqual(["render"]);

    const after = stateOf(commands);
    expect(after.phase).toBe("playing");
    expect(after.slots.leftTileId).toBeNull();
    expect(advancesTarget(state, after)).toBe(false);
  });
});

describe("transition predicates", () => {
  const base = (over: Partial<ViewState>): ViewState =>
    ({ levelId: "1-01", targetIndex: 0, phase: "playing", ...over }) as ViewState;

  it("only a rising target index holds a frame", () => {
    expect(advancesTarget(base({ targetIndex: 0 }), base({ targetIndex: 1 }))).toBe(true);
    expect(advancesTarget(base({ targetIndex: 1 }), base({ targetIndex: 1 }))).toBe(false);
    expect(advancesTarget(base({ targetIndex: 2 }), base({ targetIndex: 0 }))).toBe(false);
  });

  it("recognises every way a board can go backwards", () => {
    expect(isRewind(base({ targetIndex: 3 }), base({ targetIndex: 0 }))).toBe(true);
    expect(isRewind(base({ phase: "failed" }), base({ phase: "playing" }))).toBe(true);
    expect(isRewind(base({ phase: "won" }), base({ phase: "playing" }))).toBe(true);
    expect(isRewind(base({ levelId: "1-01" }), base({ levelId: "1-02" }))).toBe(true);
    expect(isRewind(base({ targetIndex: 1 }), base({ targetIndex: 2 }))).toBe(false);
  });
});
