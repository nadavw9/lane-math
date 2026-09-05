import { describe, expect, it } from "vitest";

import {
  AUTOMATON_DROOP_MS,
  AUTOMATON_JUMP_MS,
  THINKING_AFTER_MS,
  automatonMotionOnEnter,
  automatonState,
  sampleAutomatonMotion,
} from "./automaton.js";
import { ALL_UNLOCKED } from "../economy/unlocks.js";
import { TIMING } from "./tween.js";
import type { ViewState, WarningView } from "../game/types.js";

/** Minimal board view — only fields automatonState reads. */
function view(partial: Partial<ViewState> & Pick<ViewState, "phase">): ViewState {
  return {
    levelId: "1-01",
    run: 0,
    mode: "normal",
    targets: [3],
    targetIndex: 0,
    tiles: [],
    slots: { leftTileId: null, op: null, rightTileId: null },
    swapArmedSlot: null,
    budget: {},
    exit: null,
    transformOp: null,
    transformableTileIds: [],
    affordance: "numbers",
    constrainedTileIds: null,
    message: null,
    failures: 0,
    economy: null,
    unlocks: ALL_UNLOCKED,
    warning: null,
    hints: [],
    shop: [],
    shopOpen: false,
    ...partial,
  };
}

const FATAL_WARNING: WarningView = {
  move: "3 + 1 = 4",
  keystoneTarget: 7,
  keystoneTargetIndex: 1,
  keystoneTileIds: [],
  scripted: false,
  overridable: true,
  line: "That move loses the level.",
};

describe("automatonState pose mapping (GDD §7.5)", () => {
  it("is delighted when the level is won", () => {
    expect(automatonState(view({ phase: "won" }), 0)).toBe("delighted");
  });

  it("is worried when the level has failed", () => {
    expect(automatonState(view({ phase: "failed" }), 0)).toBe("worried");
  });

  it("is worried on an active warning without waiting for idle", () => {
    expect(automatonState(view({ phase: "playing", warning: FATAL_WARNING }), 0)).toBe("worried");
  });

  it("stays calm until the thinking threshold, then thinks", () => {
    const playing = view({ phase: "playing" });
    expect(automatonState(playing, THINKING_AFTER_MS - 1)).toBe("calm");
    expect(automatonState(playing, THINKING_AFTER_MS)).toBe("thinking");
  });

  it("prefers won/failed over idle thinking", () => {
    expect(automatonState(view({ phase: "won" }), THINKING_AFTER_MS * 2)).toBe("delighted");
    expect(automatonState(view({ phase: "failed" }), THINKING_AFTER_MS * 2)).toBe("worried");
  });
});

describe("automatonMotionOnEnter fires once per outcome", () => {
  it("starts a hop only when entering won", () => {
    expect(automatonMotionOnEnter("playing", "won")).toBe("jump");
    expect(automatonMotionOnEnter("won", "won")).toBeNull();
    expect(automatonMotionOnEnter(null, "won")).toBe("jump");
  });

  it("starts a droop only when entering failed", () => {
    expect(automatonMotionOnEnter("playing", "failed")).toBe("droop");
    expect(automatonMotionOnEnter("failed", "failed")).toBeNull();
    expect(automatonMotionOnEnter(null, "failed")).toBe("droop");
  });

  it("never motions for calm/thinking play", () => {
    expect(automatonMotionOnEnter("playing", "playing")).toBeNull();
    expect(automatonMotionOnEnter("won", "playing")).toBeNull();
    expect(automatonMotionOnEnter("failed", "playing")).toBeNull();
  });

  it("uses the weight-register timings", () => {
    expect(AUTOMATON_JUMP_MS).toBe(TIMING.automatonJump);
    expect(AUTOMATON_DROOP_MS).toBe(TIMING.automatonDroop);
    expect(AUTOMATON_JUMP_MS).toBeGreaterThanOrEqual(300);
    expect(AUTOMATON_JUMP_MS).toBeLessThanOrEqual(500);
    expect(AUTOMATON_DROOP_MS).toBeGreaterThanOrEqual(300);
    expect(AUTOMATON_DROOP_MS).toBeLessThanOrEqual(500);
  });
});

describe("sampleAutomatonMotion (weight, not energy)", () => {
  it("starts and ends a hop at rest", () => {
    const start = sampleAutomatonMotion("jump", 0);
    const end = sampleAutomatonMotion("jump", 1);
    expect(start.dy).toBeCloseTo(0, 6);
    expect(end.dy).toBeCloseTo(0, 6);
    expect(start.scaleY).toBeCloseTo(1, 6);
    expect(end.scaleY).toBeCloseTo(1, 6);
  });

  it("peaks a hop upward mid-flight — one arc, not a bounce chain", () => {
    const mid = sampleAutomatonMotion("jump", 0.5);
    expect(mid.dy).toBeLessThan(-20);
    expect(mid.scaleY).toBeCloseTo(1, 6);
    // The larger arc is readable at phone distance without squash/stretch.
    expect(Math.abs(mid.dy)).toBeGreaterThanOrEqual(22);
    // Monotone rise then fall: no second peak (elastic bounce would re-rise).
    const early = sampleAutomatonMotion("jump", 0.25).dy;
    const late = sampleAutomatonMotion("jump", 0.75).dy;
    expect(early).toBeLessThan(0);
    expect(late).toBeLessThan(0);
    expect(Math.abs(early - late)).toBeLessThan(0.01);
  });

  it("droops downward, holds, then recovers to rest — no shake", () => {
    const start = sampleAutomatonMotion("droop", 0);
    const deep = sampleAutomatonMotion("droop", 0.4);
    const end = sampleAutomatonMotion("droop", 1);
    expect(start.dy).toBeCloseTo(0, 6);
    expect(deep.dy).toBeGreaterThan(2);
    expect(end.dy).toBeCloseTo(0, 6);
    expect(end.scaleY).toBeCloseTo(1, 6);
    // Hold plateau between sink and recover.
    expect(sampleAutomatonMotion("droop", 0.45).dy).toBeCloseTo(deep.dy, 5);
    // No lateral motion in the sample — PE-01 gutter stays intact.
    expect(Object.keys(deep).sort()).toEqual(["dy", "scaleY"]);
  });

  it("never stretches taller than rest (squash only)", () => {
    for (const kind of ["jump", "droop"] as const) {
      for (let t = 0; t <= 1; t += 0.02) {
        expect(sampleAutomatonMotion(kind, t).scaleY).toBeLessThanOrEqual(1.000001);
        expect(sampleAutomatonMotion(kind, t).scaleY).toBeGreaterThan(0.9);
      }
    }
  });
});
