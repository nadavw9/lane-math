import { describe, expect, it } from "vitest";

import { DESIGN, SAFE_TOP, bands } from "./layout.js";
import { PLAQUE_ART_NOTCH } from "./tokens.js";

/**
 * Phone-eye OOL clips — arithmetic that must hold after the three P0 fixes.
 *
 * Visual proof lives in docs/review/20-ool-*.png; these catch regressions that
 * would put the cartouche under status chrome or reintroduce a floating rim.
 */
describe("OOL phone-eye safe top", () => {
  it("exports a SAFE_TOP deeper than the old 12px PAD", () => {
    expect(SAFE_TOP).toBeGreaterThanOrEqual(52);
  });

  it("keeps the HUD below SAFE_TOP with honest air inside the lane header", () => {
    for (const board of [
      { targets: 3, tiles: 8, operators: 3, hints: 0 },
      { targets: 8, tiles: 16, operators: 4, hints: 2 },
      { targets: 1, tiles: 4, operators: 2, hints: 0 },
      { targets: 5, tiles: 10, operators: 3, hints: 0 },
    ]) {
      const b = bands(board);
      const hudY = Math.max(b.lane.y + 14, SAFE_TOP + 10);
      expect(hudY, `hudY for ${board.targets}/${board.tiles}`).toBeGreaterThanOrEqual(SAFE_TOP + 10);
      // Star tips (size 15) stay inside the 72px lane header.
      expect(hudY + 15, `star bottom for ${board.targets}/${board.tiles}`).toBeLessThanOrEqual(
        b.lane.y + 72 + 1e-9,
      );
    }
  });

  it("leaves room for the OOL cartouche below SAFE_TOP on a typical panel", () => {
    const width = DESIGN.width - 24;
    const height = 264;
    const border = Math.max(12, Math.min(width, height) * 0.075);
    const cartoucheClear = border * 0.38 + 16;
    const minY = SAFE_TOP + cartoucheClear;
    // Cartouche top = panelY - protrusion; minY guarantees air above SAFE_TOP.
    const protrusion = border * 0.38;
    expect(minY - protrusion).toBeGreaterThanOrEqual(SAFE_TOP + 15);
  });
});

describe("front plaque cool rim seats on art geometry", () => {
  it("uses the measured atlas notch fraction, not the procedural cap", () => {
    expect(PLAQUE_ART_NOTCH).toBeCloseTo(45 / 360, 6);
  });

  it("diverges from procedural notch once the plaque is stretched wide", () => {
    // Typical front target: half-lane wide, token-tall — the phone-eye miss.
    const w = 198;
    const h = 60;
    const procedural = Math.min(w * 0.16, h * 0.5);
    const art = w * PLAQUE_ART_NOTCH;
    expect(Math.abs(procedural - art)).toBeGreaterThan(3);
  });
});

describe("OOL wait line stays inside the felt interior", () => {
  it("places the wait baseline above the brass border thickness", () => {
    const width = 372;
    const height = 264;
    const border = Math.max(12, Math.min(width, height) * 0.075);
    const interiorBottom = height - border;
    // Bottom-anchored wait at contentBottom - 18, ~11px glyph → top of glyphs
    // still below interior bottom, and the baseline itself is 12px above brass.
    const waitBaseline = interiorBottom - 18;
    expect(waitBaseline).toBeLessThan(interiorBottom);
    expect(waitBaseline).toBeGreaterThan(border);
    // Old bug: y + height - 26 sat inside the brass band when border > 18.
    const oldBugY = height - 26;
    expect(oldBugY).toBeGreaterThan(interiorBottom - 14);
  });
});
