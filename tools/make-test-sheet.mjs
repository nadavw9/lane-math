import { mkdirSync } from "node:fs";

import sharp from "sharp";

/**
 * A synthetic sprite sheet, so the pipeline can be proven before any art exists.
 *
 *   node tools/make-test-sheet.mjs
 *
 * Deliberately built to be HARD in the ways a generated sheet will be hard:
 *
 *   - the magenta is NOT exactly #FF00FF; it drifts per pixel, because a model
 *     paints it and a PNG round-trip smears it
 *   - objects are NOT on a grid; they are nudged off their nominal cells, which
 *     is the failure mode a hardcoded slicer hits
 *   - every object has a soft contact shadow that fades to almost nothing, to
 *     prove trimming keeps it
 *   - objects have anti-aliased edges, to prove the key feathers rather than
 *     stair-steps
 *   - ONE object is lit from the wrong side, to prove the audit catches an
 *     outlier that is invisible in isolation
 */
const WIDTH = 1536;
const HEIGHT = 1024;
const COUNT = 5;
/** Index of the deliberately wrong one. */
const OUTLIER = 3;

const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);

let seed = 0xa11ce;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

// Background: magenta with drift, never the exact key colour.
for (let i = 0; i < WIDTH * HEIGHT; i++) {
  pixels[i * 3] = 250 + Math.round(random() * 5);
  pixels[i * 3 + 1] = Math.round(random() * 12);
  pixels[i * 3 + 2] = 248 + Math.round(random() * 7);
}

const objects = [];
for (let i = 0; i < COUNT; i++) {
  // Nominal 3x2 grid, then shoved off it — the model does not place to order.
  const col = i % 3;
  const row = Math.floor(i / 3);
  objects.push({
    cx: 256 + col * 512 + Math.round((random() - 0.5) * 120),
    cy: 256 + row * 512 + Math.round((random() - 0.5) * 90),
    radius: 150 + Math.round(random() * 40),
    litFromLeft: i !== OUTLIER,
  });
}

for (const object of objects) {
  const { cx, cy, radius, litFromLeft } = object;

  // Contact shadow: wide, soft, directly beneath, fading to nearly nothing.
  for (let y = cy + radius - 20; y < cy + radius + 60; y++) {
    for (let x = cx - radius; x < cx + radius; x++) {
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
      const dx = (x - cx) / radius;
      const dy = (y - (cy + radius + 10)) / 40;
      const fall = 1 - Math.min(1, Math.hypot(dx, dy));
      if (fall <= 0) continue;
      const i = (y * WIDTH + x) * 3;
      const k = fall * 0.55;
      pixels[i] = Math.round(pixels[i] * (1 - k) + 60 * k);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - k) + 40 * k);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - k) + 30 * k);
    }
  }

  // Body: a brass-ish sphere with one specular highlight.
  for (let y = cy - radius - 2; y <= cy + radius + 2; y++) {
    for (let x = cx - radius - 2; x <= cx + radius + 2; x++) {
      if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
      const d = Math.hypot(x - cx, y - cy);
      // Anti-aliased rim rather than a hard circle.
      const cover = Math.max(0, Math.min(1, radius - d + 0.5));
      if (cover <= 0) continue;

      const nx = (x - cx) / radius;
      const ny = (y - cy) / radius;
      const lightX = litFromLeft ? -0.6 : 0.6;
      const lambert = Math.max(0, 1 - Math.hypot(nx - lightX, ny + 0.6) / 1.6);
      const spec = Math.pow(Math.max(0, 1 - Math.hypot(nx - lightX * 0.8, ny + 0.5) / 0.35), 3);

      const r = Math.min(255, 120 + lambert * 90 + spec * 140);
      const g = Math.min(255, 90 + lambert * 70 + spec * 130);
      const b = Math.min(255, 30 + lambert * 30 + spec * 110);

      const i = (y * WIDTH + x) * 3;
      pixels[i] = Math.round(pixels[i] * (1 - cover) + r * cover);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - cover) + g * cover);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - cover) + b * cover);
    }
  }
}

mkdirSync("assets/sprites-raw", { recursive: true });
await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
  .png()
  .toFile("assets/sprites-raw/testfamily-sheet.png");

process.stdout.write(
  `assets/sprites-raw/testfamily-sheet.png  ${WIDTH}x${HEIGHT}  ` +
    `${COUNT} objects, #${OUTLIER + 1} lit from the wrong side\n`,
);
