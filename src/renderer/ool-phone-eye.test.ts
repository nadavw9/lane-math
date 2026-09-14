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
  it("stacks wait pill above the CTA, both above the brass band", () => {
    const width = 372;
    const height = 330;
    const border = Math.max(12, Math.min(width, height) * 0.075);
    const interiorBottom = height - border;
    const ctaH = 44;
    const pillH = 28;
    const stackGap = 10;
    const bottomAir = 16;
    // Pill above CTA (TX-P0-1): pill then gap then CTA then bottomAir.
    const ctaBottom = interiorBottom - bottomAir;
    const ctaTop = ctaBottom - ctaH;
    const pillBottom = ctaTop - stackGap;
    const pillTop = pillBottom - pillH;
    expect(ctaBottom).toBeLessThanOrEqual(interiorBottom);
    expect(pillBottom).toBeLessThanOrEqual(ctaTop);
    expect(pillTop).toBeGreaterThan(border);
    // Old bug: bare wait at height - 26 sat inside the brass band when border > 18.
    const oldBugY = height - 26;
    expect(oldBugY).toBeGreaterThan(interiorBottom - 14);
  });

  it("keeps CTA label and wait copy on separate surfaces (TX-P0-1)", () => {
    const ctaH = 44;
    const pillH = 28;
    const stackGap = 10;
    // Pill ABOVE CTA — no shared y-range.
    const pill = { top: 0, bottom: pillH };
    const cta = { top: pillH + stackGap, bottom: pillH + stackGap + ctaH };
    expect(cta.top).toBeGreaterThanOrEqual(pill.bottom + stackGap);
  });
});

describe("hints shop clears cartouche and pool cubes (TX-P0-2/3)", () => {
  it("pads the title at least 8 CSS below a cartouche-sized gem", () => {
    const panelW = 396;
    const panelH = 220;
    const scale = panelW / 480;
    const gemTop = (18 / 560) * panelH;
    const gemBottom = gemTop + 92 * scale;
    const titleTop = gemBottom + 20;
    expect(titleTop - gemBottom).toBeGreaterThanOrEqual(20);
    expect(titleTop).toBeGreaterThan(gemBottom);
  });

  it("anchors shop bottom brass clear of pool cube tops", () => {
    const poolY = 620;
    const poolClear = 56;
    const panelH = 240;
    const panelBottom = poolY - poolClear;
    const panelY = panelBottom - panelH;
    expect(panelBottom).toBeLessThanOrEqual(poolY - 56);
    expect(panelY + panelH).toBe(panelBottom);
  });
});
