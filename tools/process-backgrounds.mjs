import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

/**
 * Turn the raw backgrounds into shippable ones.
 *
 *   node tools/process-backgrounds.mjs                # all worlds
 *   node tools/process-backgrounds.mjs 3              # just world 3
 *   node tools/process-backgrounds.mjs --band 0.7     # wider stretch region
 *
 * Repeatable on purpose: regenerating one world after a re-render is a single
 * command, not a remembered sequence of image-editor steps.
 *
 * The source is 2:3; the game wants 21:9 portrait. The extension is applied
 * ONLY vertically and ONLY away from the margins, because §9.1 puts the visual
 * interest at the edges — distorting those is exactly what must not happen.
 */
const RAW = "assets/bg-raw";
/**
 * Written straight into the served directory, and the gate reads the same one.
 *
 * These used to be two places — the tool wrote assets/bg, the game loaded
 * public/assets/bg, and a copy step in between lived only in someone's memory.
 * That is worse than an inconvenience: the gate judged the tool's output while
 * the player saw the stale copy, so regenerated art could pass a green gate and
 * never ship. One directory, no copy step, nothing to forget.
 */
const OUT = "public/assets/bg";
const TARGET_W = 900;
const TARGET_H = 2100;
const QUALITY = 75;

const args = process.argv.slice(2);
const only = args.find((a) => /^[1-4]$/.test(a));
/**
 * Uniform cover-scale and centre-crop, instead of a vertical stretch.
 *
 * This is the right transform for a work SURFACE and the wrong one for a
 * landscape, which is why it was not available before. The stretch exists only
 * to avoid cropping a composition: reeds and rock columns live at the edges of
 * the frame and cutting 36% of the width would cut the subject. Graph paper has
 * no subject — every part of it is the same sheet — so the width can simply be
 * cropped, and then nothing is stretched at all.
 *
 * It matters more here than it would have there. On a ruled surface the content
 * IS the regularity: measured on the trapezoid output, world 1's grid period
 * runs 52px through the ramp and 68px across the plateau, so the squares are
 * visibly larger in the middle of the sheet and the paper reads as bulged. A
 * uniform scale keeps every square identical and every line the same weight.
 */
const COVER = !args.includes("--stretch");
const bandArg = args.indexOf("--band");
/**
 * Fraction of the source height that carries the stretch.
 *
 * The brief specified 0.4. Measured against these images that is too harsh:
 * it concentrates all 853px of extension into 614px of source — a 2.39x local
 * scale — and worlds 2 and 3 carry MORE vertical detail in the centre than at
 * the edges (2.32 vs 2.07, and 2.01 vs 1.46), which is the reeds and rock
 * columns running straight through it. Measured retention in the stretched
 * band was 30-35% of original, leaving the centre visibly softer than its
 * surroundings (centre/outer 0.57-0.71).
 *
 * Widened to 0.8 with a plateau profile: peak 1.93x and centre/outer
 * 0.77-1.02, so the stretched region reads at the same detail density as the
 * untouched margins. World 3, the worst case, lands at 1.02.
 */
const BAND = bandArg >= 0 ? Number(args[bandArg + 1]) : 0.8;
const UNIFORM = args.includes("--uniform");
const rampArg = args.indexOf("--ramp");
/** Fraction of the band spent easing in and out of the plateau. */
const RAMP = rampArg >= 0 ? Number(args[rampArg + 1]) : 0.25;

/**
 * Build a monotonic output-row -> input-row map.
 *
 * Local vertical scale is 1.0 through the margins and eases up through the
 * band on a raised cosine, so scale is CONTINUOUS at the seams. A hard
 * three-band split leaves scale jumping 1.0 -> 2.39 -> 1.0 at two lines, and
 * that discontinuity reads as a crease across the image.
 */
function buildRowMap(inHeight, outHeight, band, uniform) {
  const marginFraction = (1 - band) / 2;
  const top = Math.round(inHeight * marginFraction);
  const bottom = inHeight - top;
  const bandRows = bottom - top;
  const extra = outHeight - inHeight;

  // Local scale per input row.
  const scale = new Float64Array(inHeight).fill(1);
  if (uniform) {
    const factor = (bandRows + extra) / bandRows;
    for (let y = top; y < bottom; y++) scale[y] = factor;
  } else {
    /*
     * Trapezoid: smooth ramps at the seams, flat plateau between.
     *
     * A raised cosine has no crease but concentrates every extra pixel at the
     * exact centre — measured PEAK 2.59x, worse than the 2.39x of a hard
     * uniform band. A plateau spreads the extension evenly across most of the
     * band while still reaching scale 1.0 continuously at the seams, so it
     * beats both: no crease AND the lowest peak.
     */
    const ramp = RAMP;
    const profile = (u) => {
      if (u < ramp) return 0.5 - 0.5 * Math.cos((Math.PI * u) / ramp);
      if (u > 1 - ramp) return 0.5 - 0.5 * Math.cos((Math.PI * (1 - u)) / ramp);
      return 1;
    };
    // Mean of the profile is (1 - ramp); solve for the plateau amplitude.
    const amplitude = extra / (bandRows * (1 - ramp));
    for (let y = top; y < bottom; y++) {
      scale[y] = 1 + amplitude * profile((y - top) / bandRows);
    }
  }

  // Cumulative output position of each input row boundary.
  const cumulative = new Float64Array(inHeight + 1);
  for (let y = 0; y < inHeight; y++) cumulative[y + 1] = cumulative[y] + scale[y];
  const total = cumulative[inHeight];
  const norm = outHeight / total;

  // Invert by walking both monotonic sequences once.
  const map = new Float64Array(outHeight);
  let cursor = 0;
  for (let outY = 0; outY < outHeight; outY++) {
    const wanted = outY / norm;
    while (cursor < inHeight - 1 && cumulative[cursor + 1] <= wanted) cursor++;
    const span = cumulative[cursor + 1] - cumulative[cursor];
    map[outY] = cursor + (span > 0 ? (wanted - cumulative[cursor]) / span : 0);
  }
  return { map, peakScale: Math.max(...scale), top, bottom };
}

/** Mean absolute vertical gradient per decile — the smear metric. */
function verticalDetail(data, width, height, channels) {
  const bands = 10;
  const rows = Math.floor(height / bands);
  const scores = [];
  for (let b = 0; b < bands; b++) {
    let total = 0;
    let count = 0;
    for (let y = b * rows; y < Math.min(height - 1, (b + 1) * rows); y++) {
      for (let x = 0; x < width; x += 4) {
        const a = data[(y * width + x) * channels];
        const c = data[((y + 1) * width + x) * channels];
        total += Math.abs(a - c);
        count++;
      }
    }
    scores.push(total / Math.max(1, count));
  }
  return scores;
}

mkdirSync(OUT, { recursive: true });

const files = readdirSync(RAW)
  .filter((f) => /^world-[1-4]\.(png|jpe?g|webp)$/i.test(f))
  .filter((f) => (only ? f.startsWith(`world-${only}.`) : true))
  .sort();

if (files.length === 0) {
  process.stderr.write(`no source images in ${RAW}\n`);
  process.exit(1);
}

for (const name of files) {
  const source = join(RAW, name);
  const image = sharp(source).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const target = join(OUT, name.replace(/\.[^.]+$/, ".webp"));

  if (COVER) {
    const scale = Math.max(TARGET_W / width, TARGET_H / height);
    const scaledW = Math.round(width * scale);
    const scaledH = Math.round(height * scale);
    const scaled = await sharp(data, { raw: { width, height, channels } })
      .resize(scaledW, scaledH, { fit: "fill" })
      .raw()
      .toBuffer();

    await sharp(scaled, { raw: { width: scaledW, height: scaledH, channels } })
      // Centre crop. Nothing is anisotropic, so there is no smear metric to
      // report — the only cost is the uniform upscale, and the only content
      // lost is more of the same surface.
      .extract({
        left: Math.round((scaledW - TARGET_W) / 2),
        top: Math.round((scaledH - TARGET_H) / 2),
        width: TARGET_W,
        height: TARGET_H,
      })
      .webp({ quality: QUALITY })
      .toFile(target);

    const bytes = statSync(target).size;
    process.stdout.write(
      `${name} -> ${target}\n` +
        `  ${width}x${height} -> ${scaledW}x${scaledH} (uniform ${scale.toFixed(3)}x) ` +
        `-> crop ${TARGET_W}x${TARGET_H}\n` +
        `  cropped ${scaledW - TARGET_W}px of width (${(((scaledW - TARGET_W) / scaledW) * 100).toFixed(0)}%), ` +
        `no vertical distortion  ${(bytes / 1024).toFixed(0)} KB\n\n`,
    );
    continue;
  }

  // Extend vertically to 21:9 at the SOURCE width, then resize once. Doing the
  // aspect change first keeps the single resample to the end.
  const extendedH = Math.round(width * (21 / 9));
  if (extendedH <= height) {
    throw new Error(`${name}: already taller than 21:9 (${width}x${height})`);
  }

  const { map, peakScale, top, bottom } = buildRowMap(height, extendedH, BAND, UNIFORM);
  const stretched = Buffer.alloc(width * extendedH * channels);

  for (let outY = 0; outY < extendedH; outY++) {
    const src = map[outY];
    const y0 = Math.floor(src);
    const y1 = Math.min(height - 1, y0 + 1);
    const t = src - y0;
    const rowA = y0 * width * channels;
    const rowB = y1 * width * channels;
    const rowOut = outY * width * channels;
    for (let i = 0; i < width * channels; i++) {
      // Linear interpolation between source rows: a nearest-neighbour lift
      // would band visibly across a smooth gradient.
      stretched[rowOut + i] = data[rowA + i] + (data[rowB + i] - data[rowA + i]) * t;
    }
  }

  const before = verticalDetail(data, width, height, channels);
  const after = verticalDetail(stretched, width, extendedH, channels);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const centreBefore = mean(before.slice(3, 7));
  const centreAfter = mean(after.slice(3, 7));
  const outerAfter = mean([...after.slice(0, 3), ...after.slice(7)]);

  await sharp(stretched, { raw: { width, height: extendedH, channels } })
    .resize(TARGET_W, TARGET_H, { fit: "fill" })
    .webp({ quality: QUALITY })
    .toFile(target);

  const bytes = statSync(target).size;
  process.stdout.write(
    `${name} -> ${target}\n` +
      `  ${width}x${height} -> ${width}x${extendedH} -> ${TARGET_W}x${TARGET_H}\n` +
      `  band ${(BAND * 100).toFixed(0)}% rows ${top}-${bottom}  peak local scale ${peakScale.toFixed(2)}x` +
      `${UNIFORM ? " (uniform)" : ` (plateau, ${(RAMP * 100).toFixed(0)}% ramps)`}\n` +
      `  vertical detail centre ${centreBefore.toFixed(2)} -> ${centreAfter.toFixed(2)} ` +
      `(retained ${((centreAfter / centreBefore) * 100).toFixed(0)}%), outer after ${outerAfter.toFixed(2)}\n` +
      `  centre/outer ratio after ${(centreAfter / outerAfter).toFixed(2)}  ` +
      `${(bytes / 1024).toFixed(0)} KB\n\n`,
  );
}
