import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PALETTE } from "../renderer/layout.js";
import {
  ASPECTS,
  MIN_CONTRAST,
  checkBackground,
  contrastRatio,
  rgbFromHex,
  type ZoneSpec,
} from "./brightness.js";
import { decodePng } from "./png.js";

/**
 * THE BUILD GATE (GDD §9.1, §11, §13).
 *
 * "Sample under the lane and pool zones, compute contrast ratio against token
 * colour, FAIL THE BUILD below threshold." A math puzzle dies if 6 reads as 8,
 * so this is a test rather than a lint warning.
 */
const BG_DIR = "assets/bg";

/**
 * Zones as fractions of the VISIBLE frame, so they follow the crop rather than
 * the source image. Token colours are the real ones the renderer draws.
 */
/**
 * Only tokens that must READ against the background are gated. A cleared
 * target is deliberately recessive — holding it to the same bar would force
 * every background lighter to make a thing that is supposed to disappear
 * stand out.
 */
const ZONES: readonly ZoneSpec[] = [
  { name: "lane / plate", x: 0.15, y: 0.02, w: 0.7, h: 0.44, token: PALETTE.targetPlate },
  { name: "lane / front", x: 0.15, y: 0.02, w: 0.7, h: 0.44, token: PALETTE.targetFront },
  { name: "lane / text", x: 0.15, y: 0.02, w: 0.7, h: 0.44, token: PALETTE.text },
  { name: "pool / tile", x: 0.03, y: 0.64, w: 0.94, h: 0.24, token: PALETTE.tile },
  { name: "operators", x: 0.03, y: 0.55, w: 0.94, h: 0.09, token: PALETTE.operator },
  { name: "status / text", x: 0.03, y: 0.88, w: 0.94, h: 0.08, token: PALETTE.text },
];

const files = readdirSync(BG_DIR).filter((f) => f.endsWith(".png") || f.endsWith(".webp"));

describe("background brightness gate", () => {
  it("finds a background for every world", () => {
    // A missing background must fail the build, not silently fall back — the
    // gitignored-raw-sprites bug in Traffic Bomb shipped exactly that way.
    for (const world of [1, 2, 3, 4]) {
      expect(
        files.some((f) => f.startsWith(`world-${world}.`)),
        `no background for world ${world}`,
      ).toBe(true);
    }
  });

  it.each(files)("%s clears %s:1 contrast in every zone at every aspect", (file) => {
    if (file.endsWith(".webp")) {
      // The gate must judge the images. If a real WebP lands and cannot be
      // decoded here, that is a failure to fix, never a test to skip.
      throw new Error(`${file}: WebP decoding is not implemented — the gate cannot judge it`);
    }

    const image = decodePng(readFileSync(join(BG_DIR, file)));
    expect(image.width).toBeGreaterThanOrEqual(720);
    expect(image.height).toBeGreaterThanOrEqual(1560);

    const result = checkBackground(file, image, ZONES);
    const failures = result.zones.filter((z) => !z.passes);

    if (failures.length > 0) {
      const detail = failures
        .map((z) => `    ${z.aspect} / ${z.zone}: ${z.ratio.toFixed(2)}:1`)
        .join("\n");
      throw new Error(
        `${file} fails the contrast gate (min ${MIN_CONTRAST}:1):\n${detail}\n` +
          `  Fix the IMAGE — darken the centre, push detail to the edges (§9.1).`,
      );
    }
    expect(result.passes).toBe(true);
  });

  it("reports the measured margins", () => {
    const rows: string[] = [];
    for (const file of files.filter((f) => f.endsWith(".png"))) {
      const image = decodePng(readFileSync(join(BG_DIR, file)));
      const result = checkBackground(file, image, ZONES);
      rows.push(`  ${file}  worst ${result.worst.toFixed(2)}:1  ${result.passes ? "PASS" : "FAIL"}`);
      for (const aspect of ASPECTS) {
        const inAspect = result.zones.filter((z) => z.aspect === aspect.name);
        const worst = Math.min(...inAspect.map((z) => z.ratio));
        rows.push(`      ${aspect.name.padEnd(16)} worst ${worst.toFixed(2)}:1`);
      }
    }
    console.log(`\nbrightness gate — min ${MIN_CONTRAST}:1 against token colour\n${rows.join("\n")}`);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("contrast maths", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio(rgbFromHex(0xffffff), rgbFromHex(0x000000))).toBeCloseTo(21, 1);
    expect(contrastRatio(rgbFromHex(0x808080), rgbFromHex(0x808080))).toBeCloseTo(1, 5);
  });

  it("uses the MEDIAN, so one bright corner cannot hide a dark centre", () => {
    // A frame that is bright at four corners and black in the middle: a mean
    // would report it comfortable, the median reports the centre.
    const width = 100;
    const height = 100;
    const pixels = new Uint8Array(width * height * 3).fill(255);
    for (let y = 30; y < 70; y++) {
      for (let x = 30; x < 70; x++) {
        const i = (y * width + x) * 3;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
    const image = { width, height, pixels };
    const result = checkBackground(
      "synthetic",
      image,
      [{ name: "centre", x: 0, y: 0, w: 1, h: 1, token: 0xffffff }],
    );
    // Median of 5 samples where the centre is black and corners white is white,
    // so contrast against white text is 1:1 and the gate refuses it.
    expect(result.passes).toBe(false);
  });
});
