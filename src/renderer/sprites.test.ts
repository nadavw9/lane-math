import { afterEach, describe, expect, it } from "vitest";

import {
  missingSprites,
  numeralCentre,
  opacityFor,
  resetSprites,
  setSpritesEnabled,
  spriteFor,
  spriteNameFor,
  type Frame,
} from "./sprites.js";

/**
 * The sprite path's rules, tested without a browser.
 *
 * The two things that can go wrong quietly: a numeral placed on the frame
 * instead of the object, and a missing texture producing nothing at all. Both
 * are invisible in isolation and obvious on a board.
 */
afterEach(() => resetSprites());

/** A frame whose object sits in the upper part, with a shadow below it. */
function framed(shadowFraction: number): Frame {
  const size = 100;
  const objectHeight = Math.round(size * (1 - shadowFraction));
  return {
    x: 0,
    y: 0,
    w: size,
    h: size,
    content: { x: 0, y: 0, w: size, h: objectHeight },
  };
}

describe("numerals sit on the object, not on the frame", () => {
  it("centres on the content box, above the frame's centre", () => {
    /*
     * The frame includes the contact shadow, so its centre is BELOW the
     * object's. A numeral centred on the frame rides low on every token in the
     * game by exactly half the shadow's height.
     */
    const frame = framed(0.25); // a quarter of the frame is shadow
    const centre = numeralCentre(frame, 92, 92);

    expect(centre.x).toBeCloseTo(46, 5);
    // Object occupies the top 75%, so its centre is at 37.5% of the height.
    expect(centre.y).toBeCloseTo(92 * 0.375, 5);
    // And that is meaningfully above the naive answer.
    expect(centre.y).toBeLessThan(46);
  });

  it("agrees with the naive centre when there is no shadow", () => {
    const centre = numeralCentre(framed(0), 92, 92);
    expect(centre.y).toBeCloseTo(46, 5);
  });

  it("scales with the token, which ranges 46 to 92px (§9.2)", () => {
    const frame = framed(0.25);
    const small = numeralCentre(frame, 46, 46);
    const large = numeralCentre(frame, 92, 92);
    expect(large.y / small.y).toBeCloseTo(2, 5);
  });

  it("survives a degenerate frame rather than dividing by zero", () => {
    const broken: Frame = { x: 0, y: 0, w: 0, h: 0, content: { x: 0, y: 0, w: 0, h: 0 } };
    expect(numeralCentre(broken, 60, 60)).toEqual({ x: 30, y: 30 });
  });
});

describe("a missing texture degrades visibly, never silently", () => {
  it("returns null so the caller falls back, and records the name", () => {
    setSpritesEnabled(true);
    expect(spriteFor("cube-lit")).toBeNull();
    // The name is kept. Three silent-blank failures in this project already
    // (CLAUDE.md); a fourth will not be one nobody noticed.
    expect(missingSprites()).toEqual(["cube-lit"]);
  });

  it("reports nothing missing while the path is off", () => {
    // Disabled is not the same as broken: with the flag off the procedural path
    // is the intended one, so asking for a sprite is not a miss.
    expect(spriteFor("cube-lit")).toBeNull();
    expect(missingSprites()).toEqual([]);
  });

  it("accumulates every distinct miss, once each", () => {
    setSpritesEnabled(true);
    spriteFor("cube-lit");
    spriteFor("cube-lit");
    spriteFor("dial-lit");
    expect(missingSprites()).toEqual(["cube-lit", "dial-lit"]);
  });
});

describe("four interaction states (ART_DIRECTION §5)", () => {
  it("gives `unavailable` its own sprite, not a tint", () => {
    /*
     * §5: a dimmed glass tile means "the light inside goes out". The glow is
     * emitted light baked into the lit sprite, and multiplying cannot remove
     * emission — a tint darkens the highlight too, which reads as an object in
     * shadow rather than one switched off.
     */
    expect(spriteNameFor("cube", "unavailable")).toBe("cube-unlit");
    expect(spriteNameFor("cube", "idle")).toBe("cube-lit");
  });

  it("keeps pressed on the lit sprite — it is the same object, moved", () => {
    expect(spriteNameFor("cube", "pressed")).toBe("cube-lit");
    expect(opacityFor("pressed")).toBe(1);
  });

  it("separates disabled from unavailable", () => {
    // The §9.0 audit found these conflated. "Not usable this step" and "gone"
    // are the two states a resource-planning game most needs to keep apart.
    expect(spriteNameFor("cube", "disabled")).toBe("cube-lit");
    expect(opacityFor("disabled")).toBeLessThan(1);
    expect(spriteNameFor("cube", "unavailable")).toBe("cube-unlit");
    expect(opacityFor("unavailable")).toBe(1);
  });
});
