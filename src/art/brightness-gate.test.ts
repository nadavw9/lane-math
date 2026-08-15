import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  CONTENT_RANGE,
  DESIGN,
  DIM,
  PALETTE,
  TRAY_ALPHA,
  type Rect,
  bands,
} from "../renderer/layout.js";
import {
  ASPECTS,
  GATE_AREA_SIGMA,
  MIN_CONTRAST,
  REQUIRED_SIZE,
  checkBackground,
  contrastRatio,
  rgbFromHex,
  worstPointColour,
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
 * INVERTED for the work-surface direction: the grounds are light and the tokens
 * are dark, so the binding constraint is the DARKEST point under a token, not
 * the brightest. Measured over an area rather than a pixel — see
 * GATE_AREA_SIGMA for why an opaque token is judged by its silhouette.
 */
/**
 * The SERVED directory, which is also the tool's output directory.
 *
 * Deliberately not a separate build-artefact folder: the gate has to judge the
 * bytes the player receives, and when these were two paths with a manual copy
 * between them, the gate could go green on art that never reached the game.
 */
const BG_DIR = "public/assets/bg";

/**
 * Zones DERIVED from the layout, not hardcoded.
 *
 * Bands size to content now, so there is no single rectangle a token lives in.
 * Hardcoded fractions would keep passing while measuring somewhere the tokens
 * had moved away from, which is the worst thing a gate can do — so take the
 * union of the band across the content extremes the shipped ladder contains.
 *
 * §9.1: measured against the BARE background, with no backdrop. Band opacity is
 * separation, not contrast, and the white veil only ever helps a dark token.
 */
function union(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}

const EXTREMES = [
  { targets: CONTENT_RANGE.targets.min, tiles: CONTENT_RANGE.tiles.min, hints: 0 },
  { targets: CONTENT_RANGE.targets.max, tiles: CONTENT_RANGE.tiles.max, hints: 0 },
  { targets: CONTENT_RANGE.targets.min, tiles: CONTENT_RANGE.tiles.max, hints: 3 },
  { targets: CONTENT_RANGE.targets.max, tiles: CONTENT_RANGE.tiles.min, hints: 3 },
].map((size) => bands(size));

/** Design-space rect -> fractions of the frame the background is fitted to. */
function asZone(name: string, rect: Rect, token: number): ZoneSpec {
  return {
    name,
    x: rect.x / DESIGN.width,
    y: rect.y / DESIGN.height,
    w: rect.width / DESIGN.width,
    h: rect.height / DESIGN.height,
    token,
  };
}

const LANE_ZONE = union(EXTREMES.map((b) => b.lane));
const POOL_ZONE = union(EXTREMES.map((b) => b.pool));
const OPERATOR_ZONE = union(EXTREMES.map((b) => b.operators));
const EQUATION_ZONE = union(EXTREMES.map((b) => b.equation));

/** The pool tray sits between the paper and every tile (§9.6). */
const TRAY = { colour: PALETTE.tray, alpha: TRAY_ALPHA } as const;

/*
 * DIM STATES ARE STILL TOKENS and must still clear 3:1 (§9.6).
 *
 * They are the reason this gate grew compositing. A dim token is the same
 * colour at reduced opacity, so on a LIGHT ground it is pulled toward the
 * paper — dimming costs contrast directly, and the amount it can be dimmed is
 * therefore a measured limit rather than a taste decision. Checking only the
 * lit states would have left the floor unguarded.
 */
const ZONES: readonly ZoneSpec[] = [
  asZone("lane / plate", LANE_ZONE, PALETTE.targetPlate),
  asZone("lane / front", LANE_ZONE, PALETTE.targetFront),
  { ...asZone("pool / tile", POOL_ZONE, PALETTE.tile), furniture: TRAY },
  { ...asZone("pool / tile DIM", POOL_ZONE, PALETTE.tile), furniture: TRAY, tokenAlpha: DIM.alpha },
  {
    ...asZone("pool / transformed", POOL_ZONE, PALETTE.tileTransformed),
    furniture: TRAY,
  },
  asZone("operators", OPERATOR_ZONE, PALETTE.operator),
  { ...asZone("operators DIM", OPERATOR_ZONE, PALETTE.operator), tokenAlpha: DIM.alpha },
  asZone("equation / armed", EQUATION_ZONE, PALETTE.armed),
  { ...asZone("equation / armed DIM", EQUATION_ZONE, PALETTE.armed), tokenAlpha: DIM.alpha },
];

async function load(file: string): Promise<ImageData> {
  // sharp decodes WebP, so the gate can judge what actually ships. Refusing a
  // format here would silently exempt the real artwork from the gate.
  //
  // Blurred first: the gate measures the darkest AREA a token sits against, not
  // the darkest pixel, because an opaque token hides whatever is behind it and
  // is judged only on its silhouette.
  const { data, info } = await sharp(join(BG_DIR, file))
    .removeAlpha()
    .blur(GATE_AREA_SIGMA)
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

  /*
   * The monotonic-darkening assertion is GONE (§9.1: superseded, void).
   *
   * It is not commented out or skipped, because it was never a legibility
   * constraint — it described an ordering that emerged from the old subjects
   * and was then promoted to a rule. The surfaces are classroom work surfaces
   * now and have no reason to darken with difficulty. What survives is the only
   * thing that ever mattered: 3:1 between token and ground.
   */

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

  it("catches a dark patch a median would hide", () => {
    // Mostly paper with one dark blotch: the failure mode for a DARK token, and
    // exactly what a median reports as comfortable. The inverse of the case
    // this test guarded under the previous art direction.
    const width = 100;
    const height = 100;
    const pixels = new Uint8Array(width * height * 3).fill(230);
    for (let y = 40; y < 60; y++) {
      for (let x = 40; x < 60; x++) {
        const i = (y * width + x) * 3;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 20;
      }
    }
    const result = checkBackground("synthetic", { width, height, pixels }, [
      { name: "all", x: 0, y: 0, w: 1, h: 1, token: PALETTE.tile },
    ]);
    expect(result.passes).toBe(false);
  });

  it("picks the worst point from the TOKEN, not from a fixed direction", () => {
    // Guards the claim in worstPointColour: it minimises contrast ratio, so it
    // hunts the dark blotch under a dark token and the bright paper under a
    // light one, with no notion of which art direction is in force.
    const width = 100;
    const height = 100;
    const pixels = new Uint8Array(width * height * 3).fill(230);
    for (let y = 40; y < 60; y++) {
      for (let x = 40; x < 60; x++) {
        const i = (y * width + x) * 3;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 20;
      }
    }
    const image = { width, height, pixels };
    const zone = { x: 0, y: 0, w: width, h: height };

    expect(worstPointColour(image, zone, rgbFromHex(PALETTE.tile)).r).toBe(20);
    expect(worstPointColour(image, zone, rgbFromHex(PALETTE.tokenInk)).r).toBe(230);
  });
});
