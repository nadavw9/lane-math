import { describe, expect, it } from "vitest";

import { auditSprite, lightAngleFrom } from "./audit.js";

/**
 * The consistency audit's geometry (ART_DIRECTION §9).
 *
 * The audit exists to reject art that drifts. It is therefore worth more than
 * the art it judges: a metric that rejects a correct sheet costs a regeneration
 * cycle and teaches the wrong lesson about the asset. This has now happened
 * twice, both times because a shape assumption was baked into the measurement.
 */

/**
 * A synthetic object: a filled rectangle with one bright spot placed at a
 * FRACTIONAL position within it. The whole point is that two objects with the
 * same fractional spot must measure the same, whatever their proportions.
 */
function objectWith(
  width: number,
  height: number,
  spotFx: number,
  spotFy: number,
  spotRadiusFraction = 0.12,
): { rgba: Buffer; width: number; height: number } {
  const rgba = Buffer.alloc(width * height * 4);
  const spotX = spotFx * (width - 1);
  const spotY = spotFy * (height - 1);
  // The radius is a fraction of each axis, so the spot is the same shape
  // relative to the object rather than the same number of pixels.
  const rx = width * spotRadiusFraction;
  const ry = height * spotRadiusFraction;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // A mid brass body, opaque everywhere.
      rgba[i] = 150;
      rgba[i + 1] = 120;
      rgba[i + 2] = 40;
      rgba[i + 3] = 255;

      const dx = (x - spotX) / rx;
      const dy = (y - spotY) / ry;
      if (dx * dx + dy * dy <= 1) {
        rgba[i] = 255;
        rgba[i + 1] = 245;
        rgba[i + 2] = 210;
      }
    }
  }
  return { rgba, width, height };
}

describe("light angle is a property of the object, not of its bounding box", () => {
  it("reports the same angle for a square and a wide object lit identically", () => {
    /*
     * THE REGRESSION THIS EXISTS FOR.
     *
     * The angle used to come from PIXEL offsets, so the aspect ratio rotated
     * it: the horizontal component scaled with the width while the vertical did
     * not. On the real sheets a 4.12-aspect plaque measured 167 degrees against
     * a 0.98-aspect dial at 131 — a 33-degree rejection of art that was lit
     * correctly. Same normalised spot here, so the two must agree.
     */
    const square = objectWith(300, 300, 0.3, 0.3);
    const wide = objectWith(1133, 275, 0.3, 0.3);

    const a = auditSprite("square", square.rgba, square.width, square.height);
    const b = auditSprite("wide", wide.rgba, wide.width, wide.height);

    expect(b.aspect / a.aspect).toBeGreaterThan(4); // genuinely different shapes
    expect(b.lightAngle).toBeCloseTo(a.lightAngle, 0);
  });

  it("still reads upper-left as upper-left", () => {
    // A sanity anchor: §3 puts the source upper-left, which is ~135 degrees.
    const wide = objectWith(1133, 275, 0.25, 0.25);
    const audit = auditSprite("wide", wide.rgba, wide.width, wide.height);
    expect(audit.lightAngle).toBeGreaterThan(100);
    expect(audit.lightAngle).toBeLessThan(170);
  });

  it("moves when the light actually moves", () => {
    // The metric must still be sensitive to the thing it measures — a test
    // that only proves invariance would pass on a function returning a
    // constant.
    const left = auditSprite("l", ...spread(objectWith(400, 200, 0.2, 0.3)));
    const right = auditSprite("r", ...spread(objectWith(400, 200, 0.8, 0.3)));
    expect(left.lightAngle).toBeGreaterThan(right.lightAngle);
    expect(Math.abs(left.lightAngle - right.lightAngle)).toBeGreaterThan(40);
  });

  it("is unchanged by scale at a fixed aspect", () => {
    const small = objectWith(150, 150, 0.35, 0.28);
    const large = objectWith(600, 600, 0.35, 0.28);
    const a = auditSprite("small", small.rgba, small.width, small.height);
    const b = auditSprite("large", large.rgba, large.width, large.height);
    expect(b.lightAngle).toBeCloseTo(a.lightAngle, 0);
  });

  it("measures from the object, not from the padded frame", () => {
    /*
     * The old metric took its centre from the frame, so padding moved the
     * angle. A sprite sheet pads every cell, and the padding is not the object.
     */
    const width = 400;
    const height = 400;
    const rgba = Buffer.alloc(width * height * 4);
    // Object occupies the lower-right quadrant only, with its spot centred.
    for (let y = 200; y < 400; y++) {
      for (let x = 200; x < 400; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = 150;
        rgba[i + 1] = 120;
        rgba[i + 2] = 40;
        rgba[i + 3] = 255;
      }
    }
    const audit = auditSprite("offset", rgba, width, height);
    // A centred, unlit body has no direction to report; what matters is that
    // the object's own bounds were used, so the box is a quarter of the frame.
    expect(audit.boxWidth).toBeCloseTo(0.5, 2);
    expect(audit.boxX).toBeCloseTo(0.5, 2);
  });
});

describe("lightAngleFrom", () => {
  it("cancels the aspect for the same fractional position", () => {
    const tall = lightAngleFrom(30, 30, { x0: 0, y0: 0, x1: 100, y1: 400 });
    const wideBox = lightAngleFrom(120, 7.5, { x0: 0, y0: 0, x1: 400, y1: 100 });
    // 30/100 across and 30/400 down, versus 120/400 across and 7.5/100 down —
    // the same place on the object, two very different boxes.
    expect(wideBox).toBeCloseTo(tall, 6);
  });

  it("returns 0 for a degenerate box rather than NaN", () => {
    expect(lightAngleFrom(5, 5, { x0: 0, y0: 0, x1: 0, y1: 0 })).toBe(0);
  });
});

/** Spread the synthetic object into auditSprite's argument order. */
function spread(o: { rgba: Buffer; width: number; height: number }): [Buffer, number, number] {
  return [o.rgba, o.width, o.height];
}
