import { describe, expect, it } from "vitest";
import {
  SCRIPTED_TRAP_BEAT_MS,
  SCRIPTED_TRAP_HOLD_MS,
  sampleScriptedTrapBeat,
  startsScriptedTrapBeat,
 } from "./scripted-trap.js";
import type { ViewState } from "../game/types.js";

const state = (warning: ViewState["warning"]): ViewState => ({
  levelId: "1-04", run: 1, mode: "normal", targets: [4, 9, 2], targetIndex: 0,
  tiles: [], slots: { leftTileId: 0, op: "+", rightTileId: 2 }, swapArmedSlot: null,
  budget: { "+": 1, "-": 2 }, phase: "playing", exit: null, transformOp: null,
  transformableTileIds: [], affordance: "commit", constrainedTileIds: null, message: null,
  failures: 0, economy: null, unlocks: {} as ViewState["unlocks"], warning,
  hints: [], shop: [], shopOpen: false, teachingLine: null, hintAd: null,
});

describe("1-04 scripted trap beat", () => {
  it("only starts when the Director has exposed the scripted warning", () => {
    const warning = { move: "1 + 3", keystoneTarget: 9, keystoneTargetIndex: 1, keystoneTileIds: [0, 3], scripted: true, overridable: false, line: "Wait — what makes the 9?" };
    expect(startsScriptedTrapBeat(state(null), state(warning))).toBe(true);
    expect(startsScriptedTrapBeat(state(null), { ...state(warning), levelId: "1-05" })).toBe(false);
    expect(startsScriptedTrapBeat(state(warning), state(warning))).toBe(false);
  });

  it("holds the commit halfway, then focuses the later target", () => {
    const held = sampleScriptedTrapBeat(SCRIPTED_TRAP_HOLD_MS - 1);
    expect(held.phase).toBe("commit-hold");
    expect(held.commitProgress).toBe(0.5);
    const focused = sampleScriptedTrapBeat(SCRIPTED_TRAP_BEAT_MS);
    expect(focused.phase).toBe("lookahead");
    expect(focused.focus).toBe(1);
  });
});
