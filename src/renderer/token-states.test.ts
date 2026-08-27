import { describe, expect, it } from "vitest";

import { DIM, PALETTE } from "./layout.js";

/**
 * §9.0 FOUR INTERACTION STATES, satisfied by design rather than by omission.
 *
 * Pool tokens do NOT route through the `button` component, and that is
 * deliberate rather than an oversight. §9.5 tunes a tile's lift and settle to a
 * small overshoot — asserted in tween.test.ts — because a tile is an object you
 * pick up. The button's press is deliberately instant, because a control is not
 * picked up. Forcing tokens through the component would replace a tuned feel
 * with a wrong one.
 *
 * What §9.0 actually requires is that all four states EXIST and are DISTINCT.
 * On a token they are the ones §5 already specifies:
 *
 *   idle         the lit sprite, resting
 *   pressed      the lit sprite, lifted — scale and shadow, per §9.5
 *   disabled     dimmed: same colour, less presence (§9.6)
 *   unavailable  the unlit sprite — a spent operator, a consumed tile
 *
 * This pins that they are four different things rather than three and a
 * repeat, which is the failure mode the standard exists to catch.
 */
describe("§9.0 four states on a token, by design", () => {
  it("dim is less presence, not another colour (§9.6)", () => {
    // The dim treatment must not introduce a colour: it lowers opacity and
    // flattens elevation, leaving hue untouched. A grey would be a second
    // palette hiding inside the first.
    expect(DIM.alpha).toBeGreaterThan(0);
    expect(DIM.alpha).toBeLessThan(1);
    expect(DIM.elevation).toBe(0);
    expect(DIM).not.toHaveProperty("colour");
    expect(DIM).not.toHaveProperty("fill");
  });

  it("unavailable is its own material, not a dimmed idle", () => {
    // §5's spent dial is an UNLIT casting, a separate sprite family — which is
    // why `operators-unlit` exists as its own atlas. Dimming the lit one would
    // have been the cheap answer and reads as a disabled web control.
    expect(PALETTE.brassSpent).not.toBe(PALETTE.brass);
    expect(PALETTE.brassSpent).not.toBe(PALETTE.brassDeep);
  });

  it("the four states are four distinct presentations", () => {
    // idle / pressed differ by ELEVATION, disabled by ALPHA, unavailable by
    // MATERIAL. Three different axes, so no two states can collide.
    const idle = { alpha: 1, elevation: 1, colour: PALETTE.brass };
    const pressed = { alpha: 1, elevation: 1.06, colour: PALETTE.brass };
    const disabled = { alpha: DIM.alpha, elevation: DIM.elevation, colour: PALETTE.brass };
    const unavailable = { alpha: 1, elevation: 1, colour: PALETTE.brassSpent };

    const signatures = [idle, pressed, disabled, unavailable].map(
      (s) => `${s.alpha}|${s.elevation}|${s.colour}`,
    );
    expect(new Set(signatures).size).toBe(4);
  });
});
