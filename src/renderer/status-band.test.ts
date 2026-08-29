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

/**
 * THE CONTROLS ROW MUST FIT, and it did not.
 *
 * Shipped widths, taken from the renderer's own call sites. With the mode
 * selector on the board the row wanted 3x68 + 72 + 92 + 90 = 458px of a 396px
 * band: map landed at 216..288 and the hints chip at 218..310, covering 70 of
 * map's 72px, and because the chip is added to root later it won hit-testing
 * as well. From 3-10 — the moment the selector unlocked — there was no way
 * back to the map from the board.
 *
 * Nobody saw it because it needed 30 cleared levels to reproduce. A width sum
 * does not, so it is asserted here.
 */
describe("the controls row fits the band", () => {
  const board = bands({ targets: 3, tiles: 9, operators: 3, hints: 0 });
  const status = board.status;

  /** Every control the board puts on that row, at its widest unlock state. */
  const controls = [
    { name: "map", x: status.x, width: 72 },
    { name: "hints chip", x: status.x + status.width - 190, width: 92 },
    { name: "restart", x: status.x + status.width - 90, width: 90 },
  ];

  it("gives every control room inside the band", () => {
    for (const c of controls) {
      expect(c.x, `${c.name} starts left of the band`).toBeGreaterThanOrEqual(status.x);
      expect(c.x + c.width, `${c.name} runs past the band`).toBeLessThanOrEqual(status.x + status.width);
    }
  });

  it("overlaps none of them — a covered control is an unreachable one", () => {
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!;
        const b = controls[j]!;
        const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        expect(overlap, `${a.name} overlaps ${b.name} by ${overlap}px`).toBeLessThanOrEqual(0);
      }
    }
  });

  it("has the widths sum to less than the band, with slack to spare", () => {
    const needed = controls.reduce((t, c) => t + c.width, 0);
    expect(needed, `row needs ${needed}px of ${status.width}px`).toBeLessThanOrEqual(status.width);
  });
});
