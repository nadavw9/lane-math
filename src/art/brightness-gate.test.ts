import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PALETTE } from "../renderer/layout.js";
import {
  ASPECTS,
  MIN_CONTRAST,
  REQUIRED_SIZE,
  checkBackground,
  contrastRatio,
  luminance,
  rgbFromHex,
  type ImageData,
  type ZoneSpec,
} from "./brightness.js";

/**
 * THE BUILD GATE (GDD §9.1, §11, §13).
 *
 * "Sample under the lane and pool zones, compute contrast ratio against token
 * colour, FAIL THE BUILD below threshold." A math puzzle dies if 6 reads as 8,
 * so this is a test rather than a lint warning.
 *
 * Measured at the WORST SINGLE POINT under each zone, not the median — the
 * tokens are light on dark art, so what breaks legibility is one bright spot
 * under a digit, which an average hides.
 */
const BG_DIR = "assets/bg";

/**
 * Zones as fractions of the VISIBLE frame, so they follow the crop.
 *
 * §9.1: the shipped set clears 3:1 with NO backdrop, so these are measured
 * against the bare background. Band opacity is separation, not contrast.
 */
const ZONES: readonly ZoneSpec[] = [
  { name: "lane / plate", x: 0.15, y: 0.02, w: 0.7, h: 0.44, token: PALETTE.targetPlate },
  { name: "lane / front", x: 0.15, y: 0.02, w: 0.7, h: 0.44, token: PALETTE.targetFront },
  { name: "pool / tile", x: 0.03, y: 0.64, w: 0.94, h: 0.24, token: PALETTE.tile },
  { name: "operators", x: 0.03, y: 0.55, w: 0.94, h: 0.09, token: PALETTE.operator },
];

async function load(file: string): Promise<ImageData> {
  // sharp decodes WebP, so the gate can judge what actually ships. Refusing a
  // format here would silently exempt the real artwork from the gate.
  const { data, info } = await sharp(join(BG_DIR, file))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) };
}

const files = readdirSync(BG_DIR)
  .filter((f) => /^world-[1-4]\.(webp|png)$/i.test(f))
  .sort();

describe("background brightness gate", () => {
  it("finds a background for every world", () => {
    for (const world of [1, 2, 3, 4]) {
      expect(
        files.some((f) => f.startsWith(`world-${world}.`)),
        `no background for world ${world}`,
      ).toBe(true);
    }
  });

  it.each(files)("%s is exactly 900x2100", async (file) => {
    const image = await load(file);
    // A wrongly-sized image must fail loudly rather than be silently
    // letterboxed or cover-cropped into something nobody designed.
    expect(
      `${image.width}x${image.height}`,
      `${file} must be ${REQUIRED_SIZE.width}x${REQUIRED_SIZE.height}`,
    ).toBe(`${REQUIRED_SIZE.width}x${REQUIRED_SIZE.height}`);
  });

  it.each(files)("%s clears 3:1 at the worst point in every zone and aspect", async (file) => {
    const image = await load(file);
    const result = checkBackground(file, image, ZONES);
    const failures = result.zones.filter((z) => !z.passes);

    if (failures.length > 0) {
      const detail = failures
        .map(
          (z) =>
            `    ${z.aspect} / ${z.zone}: ${z.ratio.toFixed(2)}:1 ` +
            `(background rgb ${z.background.r},${z.background.g},${z.background.b})`,
        )
        .join("\n");
      throw new Error(
        `${file} fails the contrast gate (min ${MIN_CONTRAST}:1):\n${detail}\n` +
          `  Regenerate the IMAGE — do not loosen the threshold (§9.1).`,
      );
    }
    expect(result.passes).toBe(true);
  });

  it("worlds darken monotonically (§9.1)", async () => {
    /*
     * "Peak luminance" is the 99.9th percentile, not the maximum.
     *
     * A per-pixel maximum is decided by a single specular highlight and does
     * NOT decrease across this set — world 3 reaches 0.0932 on a handful of
     * pixels while being the third-darkest world by every other measure. The
     * percentile is what matches the approved figures (world 2 lands on 0.0330
     * exactly) and is what "how bright is this world" actually means.
     */
    const peaks: { file: string; peak: number }[] = [];
    for (const file of files) {
      const image = await load(file);
      const values: number[] = [];
      for (let i = 0; i < image.pixels.length; i += 3) {
        values.push(
          luminance({ r: image.pixels[i]!, g: image.pixels[i + 1]!, b: image.pixels[i + 2]! }),
        );
      }
      values.sort((a, b) => a - b);
      peaks.push({ file, peak: values[Math.floor(values.length * 0.999)]! });
    }

    console.log(
      `\npeak luminance per world (p99.9)\n` +
        peaks.map((p) => `  ${p.file}  ${p.peak.toFixed(4)}`).join("\n"),
    );

    for (let i = 1; i < peaks.length; i++) {
      expect(
        peaks[i]!.peak,
        `${peaks[i]!.file} is brighter than ${peaks[i - 1]!.file} — worlds must darken`,
      ).toBeLessThan(peaks[i - 1]!.peak);
    }
  });

  it("reports the measured margins", async () => {
    const rows: string[] = [];
    for (const file of files) {
      const image = await load(file);
      const result = checkBackground(file, image, ZONES);
      rows.push(
        `\n  ${file}  worst ${result.worst.toFixed(2)}:1  ${result.passes ? "PASS" : "FAIL"}`,
      );
      for (const aspect of ASPECTS) {
        const inAspect = result.zones.filter((z) => z.aspect === aspect.name);
        for (const zone of inAspect) {
          rows.push(`      ${aspect.name.padEnd(16)} ${zone.zone.padEnd(14)} ${zone.ratio.toFixed(2)}:1`);
        }
      }
    }
    console.log(
      `\nbrightness gate — worst single point, min ${MIN_CONTRAST}:1${rows.join("\n")}`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("contrast maths", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio(rgbFromHex(0xffffff), rgbFromHex(0x000000))).toBeCloseTo(21, 1);
    expect(contrastRatio(rgbFromHex(0x808080), rgbFromHex(0x808080))).toBeCloseTo(1, 5);
  });

  it("catches a bright spot a median would hide", () => {
    // Mostly black with one small blown-out patch: exactly the case that
    // breaks a digit, and exactly what a median reports as comfortable.
    const width = 100;
    const height = 100;
    const pixels = new Uint8Array(width * height * 3).fill(0);
    for (let y = 40; y < 60; y++) {
      for (let x = 40; x < 60; x++) {
        const i = (y * width + x) * 3;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      }
    }
    const result = checkBackground("synthetic", { width, height, pixels }, [
      { name: "all", x: 0, y: 0, w: 1, h: 1, token: PALETTE.text },
    ]);
    expect(result.passes).toBe(false);
  });
});
