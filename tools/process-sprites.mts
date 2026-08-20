import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import sharp from "sharp";

/**
 * Sheet -> keyed, sliced, trimmed, downscaled, atlased sprites (ART_DIRECTION §9).
 *
 *   npx vite-node tools/process-sprites.mts --family cubes --expect 3
 *   npx vite-node tools/process-sprites.mts --family dials --expect 5 --size 256
 *
 * The art direction generates related objects TOGETHER on flat magenta, because
 * lighting cannot drift within a single image. Everything after that is
 * deterministic and belongs here rather than in a human's image editor.
 *
 * Built and tested before any real art exists, so that when a sheet arrives the
 * only unknown is the art itself.
 */

interface Options {
  family: string;
  expect: number;
  size: number;
  inner: number;
  outer: number;
  minArea: number;
  source: string;
  out: string;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
  };
  return {
    family: get("family", ""),
    expect: Number(get("expect", "0")),
    size: Number(get("size", "276")),
    inner: Number(get("inner", "60")),
    outer: Number(get("outer", "120")),
    minArea: Number(get("min-area", "400")),
    source: get("source", "assets/sprites-raw"),
    out: get("out", "public/assets/sprites"),
  };
}

/* ------------------------------------------------------------------ *
 * 1. MAGENTA KEY
 * ------------------------------------------------------------------ */

/**
 * Key out #FF00FF with a tolerance band and a feathered edge.
 *
 * TOLERANCE, and why these numbers. Generated magenta is never exact: the model
 * paints it, and the PNG round-trip and any resampling smear it further, so a
 * hard equality test would leave a magenta halo on every sprite. Two radii in
 * RGB space, measured as Euclidean distance from (255, 0, 255):
 *
 *   inner 60  — everything closer is FULLY transparent. 60 absorbs about ±35
 *               per channel, which covers generation drift and mild compression
 *               without reaching any colour the game actually uses.
 *   outer 120 — everything further is FULLY opaque, and the 60-unit band
 *               between the two becomes partial alpha. That feather is the
 *               whole point: a hard threshold produces stair-stepped edges on
 *               exactly the rounded, tumbled shapes §3 asks for.
 *
 * This can be generous BECAUSE OF THE PALETTE. §4 is brass, amber, deep wood,
 * ink navy, cream and one dark red — there is no magenta-adjacent hue anywhere
 * in the game, so a wide key cannot eat real pixels. On a palette containing
 * purple this would have to be much tighter, and that is a property of this
 * project rather than of chroma keying.
 */
function keyMagenta(
  data: Buffer,
  width: number,
  height: number,
  inner: number,
  outer: number,
): Buffer {
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;

    const distance = Math.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2);
    let alpha = distance <= inner ? 0 : distance >= outer ? 255 : Math.round(((distance - inner) / (outer - inner)) * 255);

    // Keep whatever alpha the source already had (generated sheets are opaque,
    // but a re-run over processed output must not resurrect keyed pixels).
    alpha = Math.min(alpha, data[i + 3]!);

    /*
     * DESPILL — on every pixel, not only the semi-transparent ones.
     *
     * The obvious version only despills the feathered edge, and that is not
     * where most of the contamination is. A SOFT CONTACT SHADOW (§3) is painted
     * as a gradient from dark into the magenta ground, so its mid-tones are
     * genuinely part-magenta at FULL opacity — measured at 3,718 opaque tinted
     * pixels on the test sheet, tinting every shadow violet.
     *
     * The metric is min(r, b) − g, not the more obvious (r+b)/2 − g. Magenta is
     * high in red AND blue at once, so the minimum of the two is what actually
     * detects it. The average does not: §4's failure red #7A2020 scores +45 on
     * the average and would have been quietly desaturated by its own keyer,
     * while scoring 0 on the minimum and being left alone.
     */
    let rOut = r;
    let bOut = b;
    const spill = Math.min(r, b) - g;
    if (spill > 0) {
      rOut = Math.max(0, Math.round(r - spill));
      bOut = Math.max(0, Math.round(b - spill));
    }

    out[p] = rOut;
    out[p + 1] = g;
    out[p + 2] = bOut;
    out[p + 3] = alpha;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. AUTO-SLICE
 * ------------------------------------------------------------------ */

interface Region {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

/**
 * Find connected non-transparent regions — one per object.
 *
 * NOT A GRID. The brief is explicit that the model will not place objects where
 * asked, and a hardcoded 2x3 would slice a sheet whose objects drifted by fifty
 * pixels into five wrong sprites without complaining once. Connected components
 * find whatever is actually there.
 *
 * 8-connected, iterative flood fill: a recursive one stack-overflows on a
 * 1024px blob, which is the normal case here rather than an edge case.
 */
function findRegions(rgba: Buffer, width: number, height: number, minArea: number): Region[] {
  const seen = new Uint8Array(width * height);
  const regions: Region[] = [];
  const stack: number[] = [];
  // Low threshold on purpose: a soft contact shadow (§3 — every object sits on
  // something) fades to near-nothing at its edge, and it is PART OF THE OBJECT.
  const solid = (index: number): boolean => rgba[index * 4 + 3]! > 8;

  for (let start = 0; start < width * height; start++) {
    if (seen[start] === 1 || !solid(start)) continue;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;

    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = (index / width) | 0;

      area++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (seen[next] === 1 || !solid(next)) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    // Specks: keying noise and stray dots. A real token at generation size is
    // hundreds of thousands of pixels, so this threshold is nowhere near it.
    if (area >= minArea) regions.push({ minX, minY, maxX, maxY, area });
  }

  // Reading order, so sprite N in the report is sprite N on the sheet.
  return regions.sort((a, b) => {
    const rowA = Math.round(a.minY / 64);
    const rowB = Math.round(b.minY / 64);
    return rowA === rowB ? a.minX - b.minX : rowA - rowB;
  });
}

/* ------------------------------------------------------------------ *
 * 6. CONSISTENCY AUDIT  (criteria from ART_DIRECTION §9)
 * ------------------------------------------------------------------ */

interface Audit {
  name: string;
  /** Degrees, 0 = right, 90 = up. §3 wants the light upper-LEFT, so ~135. */
  lightAngle: number;
  /** Brightest point, normalised within the sprite's own box. */
  specularX: number;
  specularY: number;
  meanHue: number;
  meanSaturation: number;
  coverage: number;
}

/**
 * Measure the three things §9 names: lighting direction, specular position and
 * palette. Across forty assets this is more reliable than the eye, which is
 * exactly the claim the art direction makes.
 */
function auditSprite(name: string, rgba: Buffer, width: number, height: number): Audit {
  let sumX = 0;
  let sumY = 0;
  let weight = 0;
  let brightest = -1;
  let specX = 0;
  let specY = 0;
  let hueX = 0;
  let hueY = 0;
  let satSum = 0;
  let opaque = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3]!;
      if (a < 128) continue;
      opaque++;

      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Lighting direction: the centroid of the brightest material, weighted
      // steeply so a broad warm body cannot outvote a small bright highlight.
      const w = Math.pow(luma / 255, 6);
      sumX += x * w;
      sumY += y * w;
      weight += w;

      if (luma > brightest) {
        brightest = luma;
        specX = x;
        specY = y;
      }

      // Hue as a vector, so the average of 350 and 10 degrees is 0 rather
      // than 180 — brass sits near the wrap point and would otherwise average
      // to its opposite.
      const delta = max - min;
      if (delta > 0) {
        let hue: number;
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
        const radians = (hue * Math.PI) / 180;
        hueX += Math.cos(radians);
        hueY += Math.sin(radians);
        satSum += max === 0 ? 0 : delta / max;
      }
    }
  }

  const centreX = width / 2;
  const centreY = height / 2;
  const lightX = weight > 0 ? sumX / weight - centreX : 0;
  // Screen y grows downward; negate so "up" is positive and the angle reads
  // the way a person would describe it.
  const lightY = weight > 0 ? centreY - sumY / weight : 0;

  let angle = (Math.atan2(lightY, lightX) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  let meanHue = (Math.atan2(hueY, hueX) * 180) / Math.PI;
  if (meanHue < 0) meanHue += 360;

  return {
    name,
    lightAngle: angle,
    specularX: width > 1 ? specX / (width - 1) : 0,
    specularY: height > 1 ? specY / (height - 1) : 0,
    meanHue,
    meanSaturation: opaque > 0 ? satSum / opaque : 0,
    coverage: opaque / (width * height),
  };
}

/** Circular mean/deviation, so 359 and 1 are two degrees apart. */
function angularStats(values: number[]): { mean: number; deviation: number } {
  let x = 0;
  let y = 0;
  for (const value of values) {
    x += Math.cos((value * Math.PI) / 180);
    y += Math.sin((value * Math.PI) / 180);
  }
  let mean = (Math.atan2(y / values.length, x / values.length) * 180) / Math.PI;
  if (mean < 0) mean += 360;

  const spread = values.map((v) => {
    const d = Math.abs(v - mean) % 360;
    return d > 180 ? 360 - d : d;
  });
  const deviation = Math.sqrt(spread.reduce((s, d) => s + d * d, 0) / spread.length);
  return { mean, deviation };
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

const options = parseArgs(process.argv.slice(2));
if (!options.family) {
  process.stderr.write("usage: process-sprites.mts --family <name> --expect <n>\n");
  process.exit(1);
}

const sheets = readdirSync(options.source)
  .filter((f) => f.startsWith(options.family) && /\.(png|jpe?g|webp)$/i.test(f))
  .sort();

if (sheets.length === 0) {
  process.stderr.write(`no sheets for family "${options.family}" in ${options.source}\n`);
  process.exit(1);
}

mkdirSync(options.out, { recursive: true });

interface Sliced {
  name: string;
  rgba: Buffer;
  width: number;
  height: number;
}

const sliced: Sliced[] = [];
let detected = 0;

for (const sheet of sheets) {
  const file = join(options.source, sheet);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const keyed = keyMagenta(data, info.width, info.height, options.inner, options.outer);
  const regions = findRegions(keyed, info.width, info.height, options.minArea);
  detected += regions.length;

  process.stdout.write(
    `${sheet}  ${info.width}x${info.height}  ->  ${regions.length} object(s)\n`,
  );

  regions.forEach((region, index) => {
    /*
     * 3. TRIM to content bounds — which are ALPHA bounds, and the threshold for
     * those is deliberately low. §3 says every object has a soft contact shadow
     * directly beneath it and that the shadow is part of the object; a
     * conventional alpha > 128 trim would slice it off and leave every sprite
     * floating.
     */
    const w = region.maxX - region.minX + 1;
    const h = region.maxY - region.minY + 1;
    const cut = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const from = ((region.minY + y) * info.width + region.minX) * 4;
      keyed.copy(cut, y * w * 4, from, from + w * 4);
    }
    sliced.push({
      name: `${basename(sheet).replace(/\.[^.]+$/, "")}-${index + 1}`,
      rgba: cut,
      width: w,
      height: h,
    });
  });
}

if (options.expect > 0 && detected !== options.expect) {
  process.stderr.write(
    `\nSLICE MISMATCH: expected ${options.expect} objects, found ${detected}.\n` +
      `Refusing to write. A sheet that silently mis-slices is worse than one that fails.\n`,
  );
  process.exit(1);
}

/*
 * 3b. PAD TO A COMMON SIZE so the family shares an origin.
 *
 * Centred horizontally, BOTTOM-ALIGNED vertically: §3 says every object sits on
 * something, so the contact shadow is the family's baseline. Centring
 * vertically instead would make a tall object and a short one appear to float
 * at different heights in the same slot.
 */
const padW = Math.max(...sliced.map((s) => s.width));
const padH = Math.max(...sliced.map((s) => s.height));

const audits: Audit[] = [];
const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};

const prepared = await Promise.all(
  sliced.map(async (sprite) => {
    const canvas = Buffer.alloc(padW * padH * 4);
    const offsetX = Math.round((padW - sprite.width) / 2);
    const offsetY = padH - sprite.height;
    for (let y = 0; y < sprite.height; y++) {
      sprite.rgba.copy(
        canvas,
        ((offsetY + y) * padW + offsetX) * 4,
        y * sprite.width * 4,
        (y + 1) * sprite.width * 4,
      );
    }

    audits.push(auditSprite(sprite.name, canvas, padW, padH));

    /*
     * 4. DOWNSCALE with high-quality resampling — on PREMULTIPLIED pixels.
     *
     * This is not a nicety. The slice box is rectangular and the objects are
     * not, so every sprite carries fully-transparent MAGENTA in its corners.
     * Resampling straight (un-premultiplied) alpha interpolates those RGB
     * values into neighbouring edge pixels, and the result is a purple fringe
     * on every rounded edge in the game — measured at 14,074 fringed pixels on
     * the test sheet before this, with spill reaching a full 255.
     *
     * Premultiplying first makes transparent pixels contribute nothing to the
     * average, whatever colour they nominally hold. Unpremultiply afterwards to
     * get straight alpha back for the atlas.
     */
    const premultiplied = Buffer.alloc(canvas.length);
    for (let i = 0; i < canvas.length; i += 4) {
      const a = canvas[i + 3]!;
      premultiplied[i] = Math.round((canvas[i]! * a) / 255);
      premultiplied[i + 1] = Math.round((canvas[i + 1]! * a) / 255);
      premultiplied[i + 2] = Math.round((canvas[i + 2]! * a) / 255);
      premultiplied[i + 3] = a;
    }

    const { data: small, info: smallInfo } = await sharp(premultiplied, {
      raw: { width: padW, height: padH, channels: 4 },
    })
      // Lanczos3 keeps a specular highlight a highlight rather than a smudge.
      .resize(options.size, options.size, { fit: "inside", kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const straight = Buffer.alloc(small.length);
    for (let i = 0; i < small.length; i += 4) {
      const a = small[i + 3]!;
      const un = (v: number): number => (a === 0 ? 0 : Math.min(255, Math.round((v * 255) / a)));
      straight[i] = un(small[i]!);
      straight[i + 1] = un(small[i + 1]!);
      straight[i + 2] = un(small[i + 2]!);
      straight[i + 3] = a;
    }

    const scaled = await sharp(straight, {
      raw: { width: smallInfo.width, height: smallInfo.height, channels: 4 },
    })
      .png()
      .toBuffer();

    return { name: sprite.name, buffer: scaled };
  }),
);

/*
 * 5. ATLAS — one per family, shelf-packed.
 *
 * Shelf rather than max-rects: a family is 1-5 same-sized sprites, where the
 * difference between packers is a few hundred wasted pixels and the difference
 * in code is a few hundred lines.
 */
const meta = await Promise.all(prepared.map(async (p) => ({ ...p, meta: await sharp(p.buffer).metadata() })));
const cell = Math.max(...meta.map((m) => Math.max(m.meta.width ?? 0, m.meta.height ?? 0)));
const columns = Math.ceil(Math.sqrt(meta.length));
const rows = Math.ceil(meta.length / columns);

const composites = meta.map((m, i) => {
  const x = (i % columns) * cell;
  const y = Math.floor(i / columns) * cell;
  frames[m.name] = { x, y, w: m.meta.width ?? 0, h: m.meta.height ?? 0 };
  return { input: m.buffer, left: x, top: y };
});

const atlasPath = join(options.out, `${options.family}.png`);
await sharp({
  create: {
    width: columns * cell,
    height: rows * cell,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(composites)
  .png({ compressionLevel: 9 })
  .toFile(atlasPath);

writeFileSync(
  join(options.out, `${options.family}.json`),
  `${JSON.stringify({ family: options.family, cell, frames }, null, 2)}\n`,
);

/* 6. Report the audit. */
const light = angularStats(audits.map((a) => a.lightAngle));
const hue = angularStats(audits.map((a) => a.meanHue));

process.stdout.write(`\nconsistency audit — ${options.family}\n`);
process.stdout.write(`  sprite                 light   specular      hue    sat\n`);
for (const a of audits) {
  process.stdout.write(
    `  ${a.name.padEnd(22)} ${a.lightAngle.toFixed(0).padStart(4)}째  ` +
      `${a.specularX.toFixed(2)},${a.specularY.toFixed(2)}  ` +
      `${a.meanHue.toFixed(0).padStart(5)}째  ${a.meanSaturation.toFixed(2)}\n`,
  );
}
process.stdout.write(
  `  mean light ${light.mean.toFixed(0)}째 (sd ${light.deviation.toFixed(1)}째), ` +
    `mean hue ${hue.mean.toFixed(0)}째 (sd ${hue.deviation.toFixed(1)}째)\n`,
);

/*
 * Outliers, flagged rather than fixed. §3 wants ONE light source upper-left
 * across every asset in the game, and a single sprite lit from the other side
 * is invisible in isolation and obvious once they sit side by side on a board.
 */
const problems: string[] = [];
for (const a of audits) {
  const off = Math.abs(a.lightAngle - light.mean) % 360;
  const angular = off > 180 ? 360 - off : off;
  if (angular > Math.max(25, light.deviation * 2)) {
    problems.push(`${a.name}: lit from ${a.lightAngle.toFixed(0)}째, family mean ${light.mean.toFixed(0)}째`);
  }
  if (a.specularX > 0.55) {
    problems.push(`${a.name}: specular on the right (x=${a.specularX.toFixed(2)}) — §3 wants upper-left`);
  }
  const hueOff = Math.abs(a.meanHue - hue.mean) % 360;
  if ((hueOff > 180 ? 360 - hueOff : hueOff) > Math.max(20, hue.deviation * 2)) {
    problems.push(`${a.name}: hue ${a.meanHue.toFixed(0)}째 against family ${hue.mean.toFixed(0)}째`);
  }
}

if (problems.length > 0) {
  process.stdout.write(`\n  OUTLIERS — regenerate these, do not hand-fix:\n`);
  for (const p of problems) process.stdout.write(`    ${p}\n`);
} else {
  process.stdout.write(`\n  no outliers\n`);
}

process.stdout.write(
  `\n${atlasPath}  ${columns}x${rows} cells of ${cell}px  ` +
    `${(statSync(atlasPath).size / 1024).toFixed(1)} KB\n`,
);
