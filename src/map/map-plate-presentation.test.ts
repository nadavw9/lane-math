import { describe, expect, it } from "vitest";

import { DIM, PALETTE } from "../renderer/layout.js";
import { mapPlatePresentation } from "./map-screen.js";

describe("the map's durable next-level focal", () => {
  it("keeps the open plate elevated after entrance motion settles", () => {
    const open = mapPlatePresentation("open");
    const cleared = mapPlatePresentation("cleared");
    const locked = mapPlatePresentation("locked");

    expect(open.scale).toBeGreaterThanOrEqual(1.08);
    expect(open.scale).toBeLessThanOrEqual(1.12);
    expect(open.scale).toBeGreaterThan(cleared.scale);
    expect(open.scale).toBeGreaterThan(locked.scale);
    expect(open.seatLayers).toBeGreaterThan(cleared.seatLayers);
    expect(open.seatDepth).toBeGreaterThan(cleared.seatDepth);
    expect(open.rim).toBe(PALETTE.targetFrontRim);
  });

  it("keeps earned stars present but reserves DIM for locked plates", () => {
    const open = mapPlatePresentation("open");
    const cleared = mapPlatePresentation("cleared");
    const locked = mapPlatePresentation("locked");

    expect(cleared.faceAlpha).toBeLessThan(open.faceAlpha);
    expect(cleared.faceAlpha).toBeGreaterThan(DIM.alpha);
    expect(locked.faceAlpha).toBe(DIM.alpha);
    expect(cleared.rim).not.toBe(PALETTE.targetFrontRim);
  });
});
