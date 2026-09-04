import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PALETTE } from "./layout.js";
import { armCueFor } from "./arm-cue.js";

describe("swap arm cue", () => {
  it("adds presence only to the armed operand", () => {
    const armed = armCueFor(0, 0, 0);

    expect(armed).toEqual({
      lift: 3,
      scale: 1.035,
      elevation: 1.75,
      outline: PALETTE.brass,
      outlineWidth: 5,
    });
    expect(armCueFor(2, 0, 0)).toBeNull();
    expect(armCueFor(0, null, 0)).toBeNull();
  });

  it("pulses the brass rim subtly without changing opacity", () => {
    const brightest = armCueFor(2, 2, 600)!;

    expect(brightest.lift).toBe(4);
    expect(brightest.scale).toBeCloseTo(1.045);
    expect(brightest.elevation).toBe(2);
    expect(brightest.outline).not.toBe(PALETTE.brass);
    expect(brightest.outlineWidth).toBeGreaterThan(3);
    expect(brightest).not.toHaveProperty("alpha");
  });

  it("does not reintroduce DIM opacity in the renderer arm path", () => {
    const source = readFileSync("src/renderer/renderer.ts", "utf8");
    const armedPath = source.slice(
      source.indexOf("const armCue ="),
      source.indexOf("const canCommit ="),
    );

    expect(armedPath).toContain("armCueFor");
    expect(armedPath).not.toContain("DIM.alpha");
    expect(armedPath).not.toContain("0.55");
    expect(armedPath).not.toContain("token.alpha");
  });
});
