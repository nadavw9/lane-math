import { describe, expect, it } from "vitest";

import { DIM, PALETTE } from "../renderer/layout.js";
import { mapFocusBeat, mapPlatePresentation, worldGateCopy } from "./map-screen.js";


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


describe("the clear-to-map handoff beat", () => {
  it("sets the next plate down with a short weighted settle", () => {
    const start = mapFocusBeat(0);
    const middle = mapFocusBeat(0.5);
    const end = mapFocusBeat(1);

    expect(start.dy).toBeLessThan(0);
    expect(middle.scale).toBeGreaterThan(1);
    expect(end.dy).toBeCloseTo(0);
    expect(end.scale).toBeCloseTo(1);
    expect(middle.scale).toBeLessThan(1.04);
  });
});


describe("map gate copy", () => {
  it("states the star shortfall without implying cleared levels are stars", () => {
    expect(worldGateCopy("not-enough-stars", 10, 0)).toBe("Earn 10 stars to open this bunch. You have 0.");
  });

  it("keeps an unreached bunch separate from a star shortfall", () => {
    expect(worldGateCopy("not-reached", 10, 0)).toBe("Clear the previous bunch to reach this one.");
  });
});
