import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import {
  GATE_AREA_SIGMA,
  MIN_CONTRAST,
  checkBackground,
  type ImageData,
  type ZoneSpec,
} from "../src/art/brightness.js";
import { CONTENT_RANGE, PALETTE, DESIGN, TRAY_ALPHA, bands } from "../src/renderer/layout.js";

/**
 * How far can a dim token actually be faded? (GDD §9.6)
 *
 * The dim opacity is not a taste decision on a light ground: fading a DARK
 * token toward cream paper costs contrast directly, so there is a hard floor
 * below which a dimmed tile stops clearing 3:1 and the gate is the only thing
 * that knows where it is. This finds it by search rather than by argument.
 */
const BG_DIR = "public/assets/bg";

async function load(file: string): Promise<ImageData> {
  const { data, info } = await sharp(join(BG_DIR, file))
    .removeAlpha()
    .blur(GATE_AREA_SIGMA)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, pixels: new Uint8Array(data) };
}

const b = bands({
  targets: CONTENT_RANGE.targets.max,
  tiles: CONTENT_RANGE.tiles.max,
  hints: 0,
});

const zonesAt = (alpha: number): ZoneSpec[] => [
  {
    name: "pool / tile",
    x: b.pool.x / DESIGN.width,
    y: b.pool.y / DESIGN.height,
    w: b.pool.width / DESIGN.width,
    h: b.pool.height / DESIGN.height,
    token: PALETTE.tile,
    furniture: { colour: PALETTE.tray, alpha: TRAY_ALPHA },
    tokenAlpha: alpha,
  },
  {
    name: "operators",
    x: b.operators.x / DESIGN.width,
    y: b.operators.y / DESIGN.height,
    w: b.operators.width / DESIGN.width,
    h: b.operators.height / DESIGN.height,
    token: PALETTE.operator,
    tokenAlpha: alpha,
  },
];

const files = readdirSync(BG_DIR).filter((f) => /^world-[1-4]\.webp$/.test(f)).sort();
const images = await Promise.all(files.map(load));

process.stdout.write(`dim alpha   worst ratio across all four worlds\n`);
let floor = 1;
for (let alpha = 1; alpha >= 0.5; alpha -= 0.02) {
  let worst = Infinity;
  for (const image of images) {
    worst = Math.min(worst, checkBackground("x", image, zonesAt(alpha)).worst);
  }
  const ok = worst >= MIN_CONTRAST;
  if (ok) floor = alpha;
  process.stdout.write(
    `  ${alpha.toFixed(2)}      ${worst.toFixed(2)}:1  ${ok ? "" : "  <-- below 3:1"}\n`,
  );
  if (!ok) break;
}

process.stdout.write(`\nlowest alpha that still clears ${MIN_CONTRAST}:1 — ${floor.toFixed(2)}\n`);
