import { afterEach, describe, expect, it } from "vitest";

import { EASE, TIMING, Tween, effectSpeed, lerp, setEffectSpeed, shudder } from "./tween.js";

afterEach(() => setEffectSpeed(1));

describe("easing curves (GDD §9.5)", () => {
  const curves = Object.entries(EASE);

  it.each(curves)("%s starts at 0 and ends at 1", (_name, ease) => {
    // Anything that misses its endpoints makes a token jump on the first or
    // last frame, which is the exact opposite of weight.
    expect(ease(0)).toBeCloseTo(0, 6);
    expect(ease(1)).toBeCloseTo(1, 6);
  });

  it("settles with an overshoot small enough to read as weight, not bounce", () => {
    /*
     * The whole register of the game is in this number. The stock back-out
     * constant overshoots about 10%, which reads as a beach ball; this curve is
     * tuned to a few percent so a tile arrives, rocks once and is still.
     */
    let peak = 0;
    for (let t = 0; t <= 1; t += 0.001) peak = Math.max(peak, EASE.settle(t));
    expect(peak).toBeGreaterThan(1); // it does overshoot — the arrival is visible
    expect(peak).toBeLessThan(1.05); // but never enough to bounce
  });

  it("never overshoots on the curves that must not", () => {
    // A tile sliding home or a lane falling into place must not sail past and
    // come back: only a landing gets to overshoot.
    for (const name of ["lift", "slide", "fall", "pinch"] as const) {
      for (let t = 0; t <= 1; t += 0.001) {
        expect(EASE[name](t), `${name} at ${t.toFixed(3)}`).toBeLessThanOrEqual(1.000001);
        expect(EASE[name](t), `${name} at ${t.toFixed(3)}`).toBeGreaterThanOrEqual(-0.000001);
      }
    }
  });

  it("falls slowly at first, so the lane has to get moving", () => {
    // Gravity, not a rail: the first half of the journey covers far less than
    // half the distance.
    expect(EASE.fall(0.5)).toBeLessThan(0.3);
  });
});

describe("shudder is resistance, not impact", () => {
  it("starts and ends at rest", () => {
    expect(shudder(0, 7, 7)).toBeCloseTo(0, 6);
    expect(shudder(1, 7, 7)).toBeCloseTo(0, 6);
  });

  it("decays — it dies away instead of ringing", () => {
    // Measured: the second half peaks at 29% of the first, and the final
    // quarter at 7%. The tail is the part that matters — a refusal that is
    // still visibly wobbling when the player looks back reads as an animation
    // rather than as an answer.
    const early = Math.max(...sample(0, 0.5));
    const late = Math.max(...sample(0.5, 1));
    const tail = Math.max(...sample(0.75, 1));
    expect(late).toBeLessThan(early * 0.35);
    expect(tail).toBeLessThan(early * 0.1);
  });

  it("stays within its amplitude", () => {
    for (const v of sample(0, 1)) expect(Math.abs(v)).toBeLessThanOrEqual(7);
  });

  function sample(from: number, to: number): number[] {
    const out: number[] = [];
    for (let t = from; t <= to; t += 0.001) out.push(Math.abs(shudder(t, 7, 7)));
    return out;
  }
});

describe("Tween", () => {
  it("runs for its duration and then reports done", () => {
    const tween = new Tween(100, EASE.slide);
    expect(tween.advance(60)).toBe(true);
    expect(tween.done).toBe(false);
    expect(tween.advance(60)).toBe(false);
    expect(tween.done).toBe(true);
    expect(tween.raw).toBe(1);
  });

  it("holds at zero through its delay, so staggered stars wait their turn", () => {
    const tween = new Tween(100, EASE.settle, 200);
    tween.advance(150);
    expect(tween.started).toBe(false);
    expect(tween.raw).toBe(0);
    tween.advance(100);
    expect(tween.started).toBe(true);
    expect(tween.raw).toBeGreaterThan(0);
  });

  it("obeys the effect-speed multiplier, so effects can be photographed", () => {
    // The whole feel layer has to slow down together, or a screenshot catches
    // one effect mid-flight and the rest already finished.
    setEffectSpeed(0.25);
    expect(effectSpeed()).toBe(0.25);
    const tween = new Tween(100);
    tween.advance(100);
    expect(tween.raw).toBeCloseTo(0.25, 6);
    expect(tween.done).toBe(false);
  });

  it("pauses at zero, so a frame can be chosen and photographed", () => {
    setEffectSpeed(0);
    const tween = new Tween(100);
    tween.advance(1000);
    expect(tween.raw).toBe(0);
    expect(tween.done).toBe(false);
  });

  it("clamps a negative speed to the pause rather than running backwards", () => {
    setEffectSpeed(-4);
    expect(effectSpeed()).toBe(0);
  });

  it("resumes from where it was paused", () => {
    const tween = new Tween(100);
    tween.advance(50);
    setEffectSpeed(0);
    tween.advance(1000);
    expect(tween.raw).toBeCloseTo(0.5, 6);
    setEffectSpeed(1);
    tween.advance(50);
    expect(tween.raw).toBe(1);
  });
});

describe("timings", () => {
  it("keeps hit-stop inside the 60-100ms the GDD specifies", () => {
    expect(TIMING.hitStop).toBeGreaterThanOrEqual(60);
    expect(TIMING.hitStop).toBeLessThanOrEqual(100);
  });

  it("returns a tile home no slower than it was placed", () => {
    // Undo must never cost more patience than the action it undoes.
    expect(TIMING.returnHome).toBeLessThanOrEqual(TIMING.place);
  });

  it("staggers stars far enough apart to be counted", () => {
    expect(TIMING.starGap).toBeGreaterThan(120);
  });
});

describe("lerp", () => {
  it("hits both ends and the middle", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
});
