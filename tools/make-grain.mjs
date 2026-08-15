import { mkdirSync, statSync } from "node:fs";

import sharp from "sharp";

/**
 * The one grain texture (GDD §9.6).
 *
 *   node tools/make-grain.mjs
 *
 * ONE small tileable tile, shared by every token type and by the pool tray —
 * not per-token art. Generated rather than authored so it is reproducible and
 * so its cost is a line of code instead of an asset nobody can regenerate.
 *
 * Per-pixel noise tiles seamlessly by construction: there is no structure
 * crossing the edges to line up, so the seam is invisible at any offset. That
 * is the whole reason to use grain rather than a fibre or weave pattern, which
 * would need real seam work to tile.
 *
 * Mid-grey with a small deviation: the texture is applied as a soft overlay, so
 * 128 is "leave this pixel alone" and the spread is how far the material is
 * allowed to vary. Too much and tokens look dirty; too little and it is banding
 * noise nobody can see.
 */
const SIZE = 64;
const MEAN = 128;
const SPREAD = 11;

const pixels = Buffer.alloc(SIZE * SIZE);
// Deterministic: a fixed generator means regenerating the texture never
// silently changes the look of the game.
let seed = 0x5eed1e;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

for (let i = 0; i < pixels.length; i++) {
  // Two samples averaged: a flat random field is harsh, and averaging pulls it
  // toward a normal distribution so the grain reads as material rather than as
  // television static.
  const n = (random() + random()) / 2;
  pixels[i] = Math.max(0, Math.min(255, Math.round(MEAN + (n - 0.5) * 2 * SPREAD)));
}

mkdirSync("public/assets", { recursive: true });
const out = "public/assets/grain.png";

await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 1 } })
  .png({ compressionLevel: 9, palette: true, colours: 32 })
  .toFile(out);

process.stdout.write(
  `${out}  ${SIZE}x${SIZE}  mean ${MEAN} +/-${SPREAD}  ${statSync(out).size} bytes\n`,
);
