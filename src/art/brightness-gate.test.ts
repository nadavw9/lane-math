import { readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  CONTENT_RANGE,
  DESIGN,
  PALETTE,
  TRAY_ALPHA,
  type Rect,
  bands,
} from "../renderer/layout.js";
import {
  comparisonDirection,
  MIN_CONTRAST,
  REQUIRED_SIZE,
  checkBackground,
  contrastRatio,
  luminance,
  measureSpriteColours,
  rgbFromHex,
  worstCaseSpriteColour,
  worstPointForDirection,
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
const SPRITE_DIR = "public/assets/sprites";

/**
 * Zones DERIVED from the layout, not hardcoded.
 *
 * Bands size to content now, so there is no single rectangle a token lives in.
 * Hardcoded fractions would keep passing while measuring somewhere the tokens
 * had moved away from, which is the worst thing a gate can do — so take the
 * union of the band across the content extremes the shipped ladder contains.
 *
 * The gate measures the actual token support: wood tray over the room, then an
 * opaque felt lining. It must never judge the superseded paper backgrounds.
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

const POOL_ZONE = union(EXTREMES.map((b) => b.pool));
const OPERATOR_ZONE = union(EXTREMES.map((b) => b.operators));

/** Wood is composited over the room, then the opaque felt is the token surface. */
const FELT_LINED_TRAY = [
  { colour: PALETTE.tray, alpha: TRAY_ALPHA },
  { colour: PALETTE.felt, alpha: 1 },
] as const;

interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface AtlasData {
  readonly frames: Record<string, AtlasFrame>;
}

const ART_FAMILIES = [
  {
    name: "glass tiles",
    atlas: "tiles",
    minimum: MIN_CONTRAST,
    zone: { ...asZone("pool / real glass", POOL_ZONE, PALETTE.tile), furniture: FELT_LINED_TRAY },
  },
  {
    name: "brass operators",
    atlas: "operators",
    minimum: 4.5,
    zone: { ...asZone("operators / real brass", OPERATOR_ZONE, PALETTE.operator), furniture: FELT_LINED_TRAY },
  },
] as const;

async function measuredFrames(atlas: string): Promise<Array<{ name: string; colours: ReturnType<typeof measureSpriteColours> }>> {
  const data = JSON.parse(readFileSync(join(SPRITE_DIR, `${atlas}.json`), "utf8")) as AtlasData;
  const sheet = join(SPRITE_DIR, `${atlas}.webp`);
  return Promise.all(
    Object.entries(data.frames)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([name, frame]) => {
        const { data: pixels, info } = await sharp(sheet)
          .extract({ left: frame.x, top: frame.y, width: frame.w, height: frame.h })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        return {
          name,
          colours: measureSpriteColours({
            width: info.width,
            height: info.height,
            pixels: new Uint8Array(pixels),
          }),
        };
      }),
  );
}

function flatSurface(colour: number): ImageData {
  const rgb = rgbFromHex(colour);
  const pixels = new Uint8Array(REQUIRED_SIZE.width * REQUIRED_SIZE.height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = rgb.r;
    pixels[i + 1] = rgb.g;
    pixels[i + 2] = rgb.b;
  }
  return { width: REQUIRED_SIZE.width, height: REQUIRED_SIZE.height, pixels };
}

const PLACEHOLDER_DESK = flatSurface(PALETTE.placeholderDesk);

describe("background brightness gate", () => {
  it("derives a felt surface that clears brass at 4.5:1", () => {
    const felt = luminance(rgbFromHex(PALETTE.felt));
    expect((0.223 + 0.05) / (felt + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect((0.698 + 0.05) / (felt + 0.05)).toBeGreaterThanOrEqual(8.25);
  });

  it("accepts every real glass and brass frame on the placeholder desk", async () => {
    const rows: string[] = [];
    const failures: string[] = [];
    for (const family of ART_FAMILIES) {
      const frames = await measuredFrames(family.atlas);
      expect(frames.length, `${family.name} atlas has no frames`).toBeGreaterThan(0);
      for (const frame of frames) {
        const result = checkBackground(
          "placeholder desk #4A3428",
          PLACEHOLDER_DESK,
          [{ ...family.zone, name: frame.name, token: frame.colours }],
          family.minimum,
        );
        const worst = result.zones.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
        const representative = worstCaseSpriteColour(frame.colours, worst.background);
        rows.push(
          `  ${family.name.padEnd(16)} ${frame.name.padEnd(20)} ` +
            `${worst.direction.padEnd(10)} ${worst.ratio.toFixed(2)}:1 ` +
            `rgb ${representative.colour.r},${representative.colour.g},${representative.colour.b}`,
        );
        if (!result.passes) {
          failures.push(
            `${family.name} / ${frame.name}: ${worst.ratio.toFixed(2)}:1 (minimum ${family.minimum}:1)`,
          );
        }
      }
    }
    console.log(
      `\nreal sprite brightness gate — placeholder desk #4A3428 with felt-lined tray\n${rows.join("\n")}`,
    );
    expect(failures, `real sprite frames below their required contrast:\n${failures.join("\n")}`).toEqual([]);
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

  it("derives the governing background extreme from measured token brightness", () => {
    const width = 30;
    const height = 30;
    const pixels = new Uint8Array(width * height * 3).fill(140);
    const set = (x: number, y: number, value: number): void => {
      const i = (y * width + x) * 3;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    };
    set(6, 6, 20);
    set(24, 24, 245);
    const image = { width, height, pixels };
    const zone = { x: 0, y: 0, w: width, h: height };

    expect(comparisonDirection(rgbFromHex(0xf0d080), rgbFromHex(0x808080))).toBe("brightest");
    expect(worstPointForDirection(image, zone, "brightest").r).toBe(245);
    expect(comparisonDirection(rgbFromHex(0x1e2a3a), rgbFromHex(0x808080))).toBe("darkest");
    expect(worstPointForDirection(image, zone, "darkest").r).toBe(20);
  });
});
