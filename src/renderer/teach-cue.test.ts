import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { teachCueSample } from "./teach-cue.js";

describe("shared FTUE teach cue geometry", () => {
  it("lifts and pulses without an opacity field", () => {
    const low = teachCueSample({ x: 20, y: 600, width: 70, height: 70 }, 0);
    const high = teachCueSample({ x: 20, y: 600, width: 70, height: 70 }, 800);
    expect(high.lift).toBeGreaterThan(low.lift);
    expect(high.scale).toBeGreaterThan(low.scale);
    expect(high.ringAlpha).toBeGreaterThan(low.ringAlpha);
    expect(high).not.toHaveProperty("alpha");
  });

  it("keeps the contextual plaque on the design surface and away from the target", () => {
    const top = teachCueSample({ x: 350, y: 60, width: 58, height: 58 }, 0);
    expect(top.plaque.x).toBeGreaterThanOrEqual(12);
    expect(top.plaque.x + top.plaque.width).toBeLessThanOrEqual(408);
    expect(top.plaque.y).toBeGreaterThan(118);
  });

  it("replaces the broad band pulse and footer-only lesson with the shared exact cue", () => {
    const source = readFileSync("src/renderer/renderer.ts", "utf8");
    expect(source).toContain("this.drawTeachCue(s, board, available)");
    expect(source).toContain("s.teachingTarget?.kind === \"tile\"");
    expect(source).toContain("s.teachingTarget?.kind === \"operator\"");
    expect(source).toContain("const banner = (s.teachingTarget ? null : s.teachingLine)");
    expect(source).not.toContain("const pulseRect = s.teachingPulse");
  });
});
