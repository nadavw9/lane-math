import { readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  CONTENT_RANGE,
  DESIGN,
  LANE_FELT_ALPHA,
  PALETTE,
  TRAY_ALPHA,
  type Rect,
  bands,
} from "../renderer/layout.js";
import {
  comparisonDirection,
  INACTIVE_MIN_CONTRAST,
  MIN_CONTRAST,
  MIN_TEXT_CONTRAST,
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

const EXTREMES = [1, 5].flatMap((operators) =>
  [
    { targets: CONTENT_RANGE.targets.min, tiles: CONTENT_RANGE.tiles.min, operators, hints: 0 },
    { targets: CONTENT_RANGE.targets.max, tiles: CONTENT_RANGE.tiles.max, operators, hints: 0 },
    { targets: CONTENT_RANGE.targets.min, tiles: CONTENT_RANGE.tiles.max, operators, hints: 3 },
    { targets: CONTENT_RANGE.targets.max, tiles: CONTENT_RANGE.tiles.min, operators, hints: 3 },
  ].map((size) => bands(size)),
);

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
/** Target plaques sit in the lane, which is the desk itself, not a tray. */
const LANE_ZONE = union(EXTREMES.map((b) => b.lane));
/*
 * THE STAGED POSITION, which this gate never measured.
 *
 * A tile is dragged from the pool into the equation row, and until now the row
 * was the one band with no lining — a dark translucent veil over the room. The
 * gate covered the tile where it starts and not where the player reads it, so
 * "staged tokens are measured against whatever is under them" was true of the
 * pool alone. The row is felt-lined now and it is gated as such.
 */
const EQUATION_ZONE = union(EXTREMES.map((b) => b.equation));

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
  readonly content: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
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
    minimum: MIN_CONTRAST,
    zone: { ...asZone("operators / real brass", OPERATOR_ZONE, PALETTE.operator), furniture: FELT_LINED_TRAY },
  },
  /*
   * Plaques are gated on BOTH grounds, because they are the one family that
   * meets more than one. They sit in the lane, which is the desk surface, and
   * the same casting has to hold up if a plaque is ever shown over felt. The
   * desk is the harder of the two — it is far lighter than the felt lining, so
   * a warm brass object has less separation from it.
   */
  {
    name: "brass plaques on the lane",
    atlas: "plaques",
    minimum: MIN_CONTRAST,
    /*
     * The lane is FELT-LINED now, like every other band that holds tokens, so
     * this measures felt. It used to be bare veiled desk and the plaques
     * measured 1.02:1 against it — the plaque body and the veiled desk are the
     * same luminance. Lining the lane was the fix, per §9.1: the ground moves,
     * not the threshold.
     */
    zone: { ...asZone("lane / real brass", LANE_ZONE, PALETTE.targetPlate), furniture: FELT_LINED_TRAY },
  },
  {
    name: "staged glass tiles",
    atlas: "tiles",
    minimum: MIN_CONTRAST,
    zone: { ...asZone("equation / real glass", EQUATION_ZONE, PALETTE.tile), furniture: FELT_LINED_TRAY },
  },
  {
    name: "staged brass operators",
    atlas: "operators",
    minimum: MIN_CONTRAST,
    zone: { ...asZone("equation / real brass", EQUATION_ZONE, PALETTE.operator), furniture: FELT_LINED_TRAY },
  },
  {
    name: "spent brass dials",
    atlas: "operators-unlit",
    /*
     * INACTIVE COMPONENTS ARE EXEMPT — WCAG 2.2 SC 1.4.11 Non-text Contrast,
     * whose normative text requires 3:1 for user-interface components "except
     * for inactive components". The understanding document goes further: a
     * greyed-out control's low contrast is itself part of communicating that it
     * is unavailable. The requirement it does keep is a non-colour indicator,
     * which the red strike bar the renderer draws over a spent dial supplies.
     *
     * So 2.04:1 is CORRECT behaviour for this family, not a tolerance and not a
     * per-asset exception someone deletes later. What still has to hold is that
     * a spent dial remains perceptible rather than vanishing into the felt, so
     * the floor here is deliberately recessive instead of absent.
     *
     * The active dials are measured against the full 3:1 in their own entry
     * above; this exemption applies only to the unlit set.
     */
    minimum: INACTIVE_MIN_CONTRAST,

    zone: { ...asZone("operators / spent brass", OPERATOR_ZONE, PALETTE.operator), furniture: FELT_LINED_TRAY },
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

async function measuredNumeralGrounds(): Promise<
  Array<{ name: string; colours: ReturnType<typeof measureSpriteColours> }>
> {
  const data = JSON.parse(readFileSync(join(SPRITE_DIR, "tiles.json"), "utf8")) as AtlasData;
  const sheet = join(SPRITE_DIR, "tiles.webp");
  return Promise.all(
    Object.entries(data.frames)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([name, frame]) => {
        const width = Math.max(1, Math.floor(frame.content.w * 0.42));
        const height = Math.max(1, Math.floor(frame.content.h * 0.42));
        const left = Math.round(frame.content.x + (frame.content.w - width) / 2);
        const top = Math.round(frame.content.y + (frame.content.h - height) / 2);
        const { data: pixels, info } = await sharp(sheet)
          .extract({ left, top, width, height })
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


/**
 * THE FOUR SHIPPED ROOMS — the surfaces the player actually sees.
 *
 * This gate ran against `flatSurface(PALETTE.placeholderDesk)`, and its own
 * test name said "on the placeholder desk". It never sampled a background image
 * in its life. That was survivable only because `setWorld` was a stub and the
 * game really did paint a flat colour; the moment the rooms shipped, every
 * number this file produced described a surface that no longer exists.
 *
 * Loaded from `public/assets/bg` — the directory the game serves, not a staging
 * copy, for the same reason the pipeline writes there directly.
 */
const ROOMS = [
  { world: 1, name: "room 1 classroom" },
  { world: 2, name: "room 2 library" },
  { world: 3, name: "room 3 laboratory" },
  { world: 4, name: "room 4 observatory" },
] as const;

async function loadRoom(world: number): Promise<ImageData> {
  const { data, info } = await sharp(`public/assets/bg/world-${world}.webp`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) };
}

describe("background brightness gate", () => {
  it("uses the approved felt and 3:1 graphical-token bar", () => {
    expect(PALETTE.felt).toBe(0x241812);
    const felt = luminance(rgbFromHex(PALETTE.felt));
    expect((0.223 + 0.05) / (felt + 0.05)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("keeps ink navy numerals above 4.5:1 on every glass content box", async () => {
    expect(MIN_TEXT_CONTRAST).toBe(4.5);
    const ink = rgbFromHex(PALETTE.glassNumeral);
    const failures: string[] = [];
    const rows: string[] = [];
    for (const frame of await measuredNumeralGrounds()) {
      const ratio = contrastRatio(ink, frame.colours.darkestRepresentative);
      rows.push(`  ${frame.name.padEnd(20)} ${ratio.toFixed(2)}:1`);
      if (ratio < MIN_TEXT_CONTRAST) {
        failures.push(`${frame.name}: ${ratio.toFixed(2)}:1`);
      }
    }
    console.log(`\nreal glass numeral gate — ink navy #1E2A3A\n${rows.join("\n")}`);
    expect(failures, `glass numerals below ${MIN_TEXT_CONTRAST}:1:\n${failures.join("\n")}`).toEqual([]);
  });

  /**
   * HOW TRANSPARENT CAN THE LANE BE?
   *
   * The lane's opaque felt lining was the screen's largest occluder — the gate
   * returned identical numbers on all four rooms because no token ever touched
   * one. This sweeps the lining's opacity against each room AT THE LANE'S OWN
   * POSITION and reports the lowest value every plaque still survives, because
   * the observatory's night sky and the classroom's morning windows are not
   * interchangeable grounds.
   *
   * It uses the same zone, the same furniture stack and the same checker as the
   * gate above. A sweep that modelled the composite itself would be measuring
   * its own arithmetic.
   */
  it("solves for the lane lining opacity, and LANE_FELT_ALPHA is at or above it", async () => {
    const frames = await measuredFrames("plaques");
    const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const rows: string[] = [];
    const safest: number[] = [];

    for (const room of ROOMS) {
      const image = await loadRoom(room.world);
      let lowestSafe: number | null = null;
      const perStep: string[] = [];
      for (const feltAlpha of steps) {
        const furniture = [
          { colour: PALETTE.tray, alpha: TRAY_ALPHA },
          { colour: PALETTE.felt, alpha: feltAlpha },
        ] as const;
        let worstRatio = Infinity;
        for (const frame of frames) {
          const result = checkBackground(
            room.name,
            image,
            [{ ...asZone("lane", LANE_ZONE, PALETTE.targetPlate), furniture, name: frame.name, token: frame.colours }],
            MIN_CONTRAST,
          );
          const worst = result.zones.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
          worstRatio = Math.min(worstRatio, worst.ratio);
        }
        perStep.push(`${feltAlpha.toFixed(1)}:${worstRatio.toFixed(2)}`);
        if (worstRatio >= MIN_CONTRAST && lowestSafe === null) lowestSafe = feltAlpha;
      }
      safest.push(lowestSafe ?? 1);
      rows.push(`  ${room.name.padEnd(20)} lowest safe ${(lowestSafe ?? 1).toFixed(1)}   ${perStep.join("  ")}`);
    }

    const strictest = Math.max(...safest);
    const binding = ROOMS[safest.indexOf(strictest)]!.name;
    const report = [
      `lane lining opacity sweep — plaque worst ratio per step (minimum ${MIN_CONTRAST}:1)`,
      ...rows,
      `  strictest: ${strictest.toFixed(1)}, bound by ${binding}`,
      `  shipping LANE_FELT_ALPHA = ${LANE_FELT_ALPHA}`,
    ];
    console.log(report.join("\n"));
    expect(
      LANE_FELT_ALPHA,
      `LANE_FELT_ALPHA ${LANE_FELT_ALPHA} is below what the art supports (${strictest}, bound by ${binding})`,
    ).toBeGreaterThanOrEqual(strictest);
  }, 60_000);

  it("accepts every real glass and brass frame on all four rooms", async () => {
    const rows: string[] = [];
    const failures: string[] = [];
    for (const room of ROOMS) {
    const image = await loadRoom(room.world);
    // Worth running only against the size the game serves.
    expect(image.width, `${room.name} width`).toBe(REQUIRED_SIZE.width);
    expect(image.height, `${room.name} height`).toBe(REQUIRED_SIZE.height);
    rows.push(`  ${room.name}`);
    for (const family of ART_FAMILIES) {
      const frames = await measuredFrames(family.atlas);
      expect(frames.length, `${family.name} atlas has no frames`).toBeGreaterThan(0);
      for (const frame of frames) {
        const result = checkBackground(
          room.name,
          image,
          [{ ...family.zone, name: frame.name, token: frame.colours }],
          family.minimum,
        );
        const worst = result.zones.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
        const representative = worstCaseSpriteColour(frame.colours, worst.background);
        rows.push(
          `    ${family.name.padEnd(16)} ${frame.name.padEnd(20)} ` +
            `${worst.direction.padEnd(10)} ${worst.ratio.toFixed(2)}:1 ` +
            `rgb ${representative.colour.r},${representative.colour.g},${representative.colour.b}`,
        );
        if (!result.passes) {
          failures.push(
            `${room.name} / ${family.name} / ${frame.name}: ${worst.ratio.toFixed(2)}:1 (minimum ${family.minimum}:1)`,
          );
        }
      }
    }
    }
    console.log(
      `\nreal sprite brightness gate — four shipped rooms, every aspect\n${rows.join("\n")}`,
    );
    /*
     * Every family is judged against its OWN minimum and every one of them
     * binds. There is no declared-but-tolerated list any more: the lane was
     * lined, which took the plaques from 1.02:1 to 3.79:1, and the spent dials
     * are exempt by rule under SC 1.4.11 rather than by exception, so they are
     * held to INACTIVE_MIN_CONTRAST instead of being waved past 3:1.
     */
    expect(failures, `real sprite frames below their required contrast:\n${failures.join("\n")}`).toEqual([]);
  }, 90_000); /*
   * Raised from 15s: this went from ONE flat surface to four full-resolution
   * rooms x three aspects x fifteen frames, and 13s alone became a timeout
   * under full-suite contention. It failed as "1 failed" in the suite while
   * passing in isolation — a budget, not a contrast result, and worth naming
   * because a timeout in a gate reads exactly like the art regressing.
   */
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
