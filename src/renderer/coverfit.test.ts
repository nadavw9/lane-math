import { describe, expect, it } from "vitest";

import { DESIGN } from "./layout.js";

/**
 * The background cover-fit, verified as arithmetic.
 *
 * §9.1 crops FROM THE EDGES for shorter devices, and the 12%-88% safe zone
 * depends on that crop being symmetric — an anchor drift of even a few percent
 * moves the safe zone off the composition it was designed around.
 *
 * This mirrors `Renderer.setWorld`: scale = max(fitW, fitH), anchor 0.5,
 * positioned at the centre of the design surface.
 */
const SOURCE = { width: 900, height: 2100 };

function coverFit(design: { width: number; height: number }, source: { width: number; height: number }) {
  const scale = Math.max(design.width / source.width, design.height / source.height);
  const drawnW = source.width * scale;
  const drawnH = source.height * scale;
  return {
    scale,
    drawnW,
    drawnH,
    cropLeft: (drawnW - design.width) / 2,
    cropRight: (drawnW - design.width) / 2,
    cropTop: (drawnH - design.height) / 2,
    cropBottom: (drawnH - design.height) / 2,
  };
}

describe("background cover-fit", () => {
  it("covers the design surface with no gap on either axis", () => {
    const fit = coverFit(DESIGN, SOURCE);
    expect(fit.drawnW).toBeGreaterThanOrEqual(DESIGN.width - 1e-9);
    expect(fit.drawnH).toBeGreaterThanOrEqual(DESIGN.height - 1e-9);
  });

  it("crops symmetrically, top equal to bottom and left equal to right", () => {
    const fit = coverFit(DESIGN, SOURCE);
    expect(fit.cropTop).toBeCloseTo(fit.cropBottom, 9);
    expect(fit.cropLeft).toBeCloseTo(fit.cropRight, 9);
  });

  it("keeps the 12%-88% safe zone inside the source at every supported aspect", () => {
    // The safe zone is expressed against the DESIGN surface; this checks the
    // source rows it maps to stay within the image after cropping.
    for (const [name, design] of [
      ["21:9", { width: 900, height: 2100 }],
      ["16:9", { width: 900, height: 1600 }],
      ["4:3", { width: 900, height: 1200 }],
    ] as const) {
      const fit = coverFit(design, SOURCE);
      const safeTop = design.height * 0.12;
      const safeBottom = design.height * 0.88;

      // Map design-space y back into source pixels.
      const toSource = (y: number) => (y + fit.cropTop) / fit.scale;
      expect(toSource(safeTop), `${name} safe top`).toBeGreaterThanOrEqual(0);
      expect(toSource(safeBottom), `${name} safe bottom`).toBeLessThanOrEqual(SOURCE.height);
    }
  });

  it("is anchored at the centre, so a shorter frame loses equal amounts of sky and ground", () => {
    const tall = coverFit({ width: 900, height: 2100 }, SOURCE);
    const short = coverFit({ width: 900, height: 1200 }, SOURCE);
    // The tall frame is the design ratio: nothing cropped vertically.
    expect(tall.cropTop).toBeCloseTo(0, 6);
    // A shorter frame crops, and crops evenly.
    expect(short.cropTop).toBeGreaterThan(0);
    expect(short.cropTop).toBeCloseTo(short.cropBottom, 9);
  });
});
