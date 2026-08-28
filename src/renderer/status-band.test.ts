import { describe, expect, it } from "vitest";

import { CONTENT_RANGE, PALETTE, bands, statusRows } from "./layout.js";
import { contrastRatio, luminance, rgbFromHex, MIN_TEXT_CONTRAST } from "../art/brightness.js";

/**
 * THE STATUS BAND, whose contents used to fall out of it.
 *
 * The map button and the mode chips were placed at `status.y + 44` with a
 * height of 26 inside a 60px band, so they ended 10px below it. Nobody saw it
 * while the band was bare desk — the buttons simply sat on the desk and looked
 * deliberate. Giving the band a tray made them loose objects hanging off its
 * bottom edge, which is the same defect finally being visible.
 */
describe("the status band contains its own controls", () => {
  const boards = [1, 5].flatMap((operators) =>
    [
      { targets: CONTENT_RANGE.targets.min, tiles: CONTENT_RANGE.tiles.min, operators, hints: 0 },
      { targets: CONTENT_RANGE.targets.max, tiles: CONTENT_RANGE.tiles.max, operators, hints: 3 },
    ].map((size) => bands(size)),
  );

  it("keeps both rows inside the band on every board size", () => {
    for (const board of boards) {
      const { status } = board;
      const rows = statusRows(status);
      expect(rows.message, "message row starts below the band top").toBeGreaterThanOrEqual(status.y);
      expect(rows.controlsY, "controls start below the message row").toBeGreaterThan(rows.message + 15);
      expect(
        rows.controlsY + rows.controlH,
        "controls overflow the status band",
      ).toBeLessThanOrEqual(status.y + status.height);
    }
  });
});

/**
 * INK IS CHOSEN AGAINST A GROUND, and the palette carries both sets.
 *
 * `text` / `textDim` / `highlightInk` are the PAPER inks; `tokenInk`,
 * `highlight` and `failedLit` are the FELT ones. The status line, the lives
 * counter and the free-failure line were all drawn in paper inks on felt —
 * 3.03:1, 1.17:1 and 2.92:1 — which is unreadable rather than merely dim.
 *
 * This pins BOTH directions. The felt inks must clear the text bar, and the
 * paper inks must keep failing it, so the pairing cannot be "fixed" by
 * lightening `text` until one colour serves two opposite grounds — which is
 * exactly what the palette comment says the split exists to prevent.
 */
describe("felt inks and paper inks stay separate", () => {
  const felt = rgbFromHex(PALETTE.felt);
  const on = (colour: number): number => contrastRatio(rgbFromHex(colour), felt);

  it("reads the felt inks above 4.5:1", () => {
    for (const [name, colour] of [
      ["tokenInk", PALETTE.tokenInk],
      ["highlight", PALETTE.highlight],
      ["failedLit", PALETTE.failedLit],
    ] as const) {
      expect(on(colour), `${name} on felt`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it("keeps the paper inks unusable on felt, so the split is real", () => {
    for (const [name, colour] of [
      ["text", PALETTE.text],
      ["textDim", PALETTE.textDim],
      ["highlightInk", PALETTE.highlightInk],
    ] as const) {
      expect(on(colour), `${name} on felt`).toBeLessThan(MIN_TEXT_CONTRAST);
    }
    // And they are paper inks because they work on paper.
    expect(luminance(rgbFromHex(PALETTE.card))).toBeGreaterThan(luminance(felt));
    expect(contrastRatio(rgbFromHex(PALETTE.text), rgbFromHex(PALETTE.card))).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });
});
