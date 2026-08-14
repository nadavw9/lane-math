import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

/**
 * Report what the raw backgrounds actually are, before anything is assumed
 * about them — dimensions, and how much vertical detail sits in the band that
 * a naive centre-stretch would distort.
 */
const RAW = "assets/bg-raw";

/**
 * Mean absolute vertical gradient per row band.
 *
 * A stretch multiplies vertical extent. Rows carrying strong VERTICAL change —
 * a horizon, a waterline, the top of a rock column — are the ones that visibly
 * smear when stretched; rows of near-uniform colour stretch invisibly.
 */
async function verticalDetail(file) {
  const image = sharp(file);
  const meta = await image.metadata();
  const { data, info } = await image
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bands = 10;
  const rowsPerBand = Math.floor(info.height / bands);
  const scores = [];

  for (let b = 0; b < bands; b++) {
    let total = 0;
    let count = 0;
    const start = b * rowsPerBand;
    const end = Math.min(info.height - 1, start + rowsPerBand);
    for (let y = start; y < end; y++) {
      for (let x = 0; x < info.width; x += 4) {
        total += Math.abs(data[(y + 1) * info.width + x] - data[y * info.width + x]);
        count++;
      }
    }
    scores.push(total / Math.max(1, count));
  }
  return { meta, scores };
}

for (const name of readdirSync(RAW).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()) {
  const { meta, scores } = await verticalDetail(join(RAW, name));
  const aspect = (meta.width / meta.height).toFixed(4);
  const target = Math.round(meta.width * (21 / 9));
  const centre = scores.slice(3, 7);
  const outer = [...scores.slice(0, 3), ...scores.slice(7)];
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  process.stdout.write(
    `${name}\n` +
      `  ${meta.width}x${meta.height}  aspect ${aspect}  format ${meta.format}  channels ${meta.channels}\n` +
      `  21:9 height would be ${target} (needs +${target - meta.height}px)\n` +
      `  vertical detail per decile: ${scores.map((s) => s.toFixed(1)).join(" ")}\n` +
      `  centre 30-70% mean ${mean(centre).toFixed(2)}   outer mean ${mean(outer).toFixed(2)}\n\n`,
  );
}
