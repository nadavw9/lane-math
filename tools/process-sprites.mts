import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import sharp from "sharp";

// The audit lives in src/art so a test can reach it. It shipped a geometry bug
// precisely because it sat in this file, which runs on import.
import { angularStats, auditSprite, type Audit } from "../src/art/audit.js";

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
 *
 * -- TWO THINGS TO READ BEFORE CHANGING THE PALETTE OR THE KEYER --------------
 *
 * THE KEY TOLERANCE DEPENDS ON THE PALETTE. The 60/120 band below is wide, and
 * it is only safe because ART_DIRECTION section 4 contains no magenta-adjacent
 * hue - brass, amber, deep wood, ink navy, cream and one dark red. Nothing in
 * the game sits near #FF00FF, so a generous key cannot eat real pixels. IF A
 * PURPLE OR VIOLET IS EVER ADDED TO THE PALETTE, THIS BAND MUST BE TIGHTENED,
 * or the keyer will punch holes in the art. That is a property of this
 * project's palette, not of chroma keying in general.
 *
 * THE DESPILL METRIC IS min(r, b) - g, NOT (r+b)/2 - g. Magenta is high in red
 * AND blue simultaneously, so the minimum of the two detects it and the average
 * does not. The average scores +45 on section 4's failure red #7A2020 - the
 * keyer would have quietly desaturated one of the two signal colours every time
 * it ran. The minimum scores 0 on that red, -123 on brass and -110 on amber.
 */

interface Options {
  family: string;
  atlas: string;
  names: readonly string[];
  expect: number;
  size: number;
  quality: number;
  minSource: number;
  baseline: number | undefined;
  baselineTolerance: number;
  /**
   * Swap the light-angle consistency check for a BODY-COLOUR one.
   *
   * The angle metric locates the brightest point and treats it as the specular
   * highlight. On an object with an EMISSIVE feature it finds the emitter
   * instead, and an emitter that moves with the pose reads as a light that
   * moves with the pose. The automaton sheet does exactly this: one pose scores
   * -29 degrees purely because its iris is a bright dot. Same confound as the
   * glass caustics (ART_DIRECTION section 9).
   *
   * This does not turn consistency checking OFF. Body colour is a property of
   * the material rather than of the pose, so the sheet is still held to a
   * within-sheet limit — just on a metric the art cannot fool.
   */
  skipAngle: boolean;
  bodyTolerance: number;
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
  const family = get("family", "");
  const names = get("names", "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const baseline = get("baseline", "");
  return {
    family,
    atlas: get("atlas", family),
    names,
    expect: Number(get("expect", "0")),
    size: Number(get("size", "276")),
    quality: Number(get("quality", "85")),
    minSource: Number(get("min-source", "0")),
    baseline: baseline === "" ? undefined : Number(baseline),
    baselineTolerance: Number(get("baseline-tolerance", "5")),
    skipAngle: argv.includes("--skip-angle"),
    bodyTolerance: Number(get("body-tolerance", "12")),
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

interface DespillReport {
  worstBefore: number;
  worstAfter: number;
  saturatedAmberPixels: number;
  worstAmberSaturationLoss: number;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

function despillReport(before: Buffer, after: Buffer): DespillReport {
  let worstBefore = 0;
  let worstAfter = 0;
  let saturatedAmberPixels = 0;
  let worstAmberSaturationLoss = 0;

  for (let i = 0; i < before.length; i += 4) {
    // The report is about pixels that survive the key, never the magenta ground.
    if (after[i + 3]! < 128) continue;
    const r = before[i]!;
    const g = before[i + 1]!;
    const b = before[i + 2]!;
    const rAfter = after[i]!;
    const gAfter = after[i + 1]!;
    const bAfter = after[i + 2]!;
    worstBefore = Math.max(worstBefore, Math.max(0, Math.min(r, b) - g));
    worstAfter = Math.max(worstAfter, Math.max(0, Math.min(rAfter, bAfter) - gAfter));

    // Amber is warm, saturated and ordered red > green > blue. The despill
    // rule must leave these real pixels alone: their blue channel is already
    // below green, so they contain no magenta spill to subtract.
    if (before[i + 3]! >= 200 && r > g && g > b && saturation(r, g, b) >= 0.5) {
      saturatedAmberPixels++;
      worstAmberSaturationLoss = Math.max(
        worstAmberSaturationLoss,
        Math.max(0, saturation(r, g, b) - saturation(rAfter, gAfter, bAfter)),
      );
    }
  }

  return { worstBefore, worstAfter, saturatedAmberPixels, worstAmberSaturationLoss };
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
 *
 * This high-luminance-centroid angle is tool-specific. Judge spread within one
 * sheet (<3 degrees), and compare means only with another sheet of the SAME
 * material against its recorded baseline. `operators-sheet.png` is the brass
 * baseline for this metric (117 degrees mean, 1.2-degree spread); re-derive it
 * if this measurement changes. Never compare brass with glass: they present
 * the same upper-left source differently (ART_DIRECTION §3).
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

const options = parseArgs(process.argv.slice(2));
if (!options.family) {
  process.stderr.write("usage: process-sprites.mts --family <name> --expect <n>\n");
  process.exit(1);
}

const sheets = readdirSync(options.source)
  /*
   * ANCHORED, not a prefix match.
   *
   * `--family operators` used to also pull in `operators-unlit-sheet.png`,
   * because one family's name is a prefix of another's. The slice count caught
   * it — ten objects where five were expected — but only because --expect was
   * set; without it the two sets would have been packed into one atlas in
   * whatever order readdir returned. A family owns `<family>-sheet.*` and
   * `<family>-sheet-N.*`, and nothing else.
   */
  .filter((f) => new RegExp(`^${options.family}-sheet(-\\d+)?\\.(png|jpe?g|webp)$`, "i").test(f))
  .sort();

if (sheets.length === 0) {
  process.stderr.write(`no sheets for family "${options.family}" in ${options.source}\n`);
  process.exit(1);
}

mkdirSync(options.out, { recursive: true });

interface Sliced {
  name: string;
  frameName: string;
  rgba: Buffer;
  width: number;
  height: number;
}

const sliced: Sliced[] = [];
const spills: Array<{ sheet: string; report: DespillReport }> = [];
let detected = 0;

for (const sheet of sheets) {
  const file = join(options.source, sheet);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const keyed = keyMagenta(data, info.width, info.height, options.inner, options.outer);
  spills.push({ sheet, report: despillReport(data, keyed) });
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
      frameName: `${basename(sheet).replace(/\.[^.]+$/, "")}-${index + 1}`,
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

if (options.names.length > 0 && options.names.length !== sliced.length) {
  process.stderr.write(
    `\nNAME MISMATCH: expected ${sliced.length} frame names, received ${options.names.length}.\n` +
      `Refusing to write an atlas with ambiguous renderer names.\n`,
  );
  process.exit(1);
}
if (new Set(options.names).size !== options.names.length) {
  process.stderr.write(`\nNAME MISMATCH: atlas frame names must be unique.\n`);
  process.exit(1);
}
for (const [index, sprite] of sliced.entries()) sprite.frameName = options.names[index] ?? sprite.name;

if (options.minSource > 0) {
  const undersized = sliced.filter((sprite) => Math.min(sprite.width, sprite.height) < options.minSource);
  if (undersized.length > 0) {
    process.stderr.write(`\nSOURCE SIZE MISMATCH: every sprite must be at least ${options.minSource}px before downscale.\n`);
    for (const sprite of undersized) {
      process.stderr.write(`  ${sprite.frameName}: ${sprite.width}x${sprite.height}px\n`);
    }
    process.exit(1);
  }
}

process.stdout.write(`\npre-downscale sprite sizes${options.minSource > 0 ? ` (minimum ${options.minSource}px)` : ""}\n`);
for (const sprite of sliced) {
  process.stdout.write(`  ${sprite.frameName.padEnd(22)} ${sprite.width}x${sprite.height}px\n`);
}
process.stdout.write(`\ndespill verification — retained pixels\n`);
for (const { sheet, report } of spills) {
  process.stdout.write(
    `  ${sheet}: worst spill ${report.worstBefore} -> ${report.worstAfter}; ` +
      `saturated amber ${report.saturatedAmberPixels} px, worst saturation loss ${report.worstAmberSaturationLoss.toFixed(3)}\n`,
  );
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
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The solid object without its contact shadow — where numerals belong. */
  content: { x: number; y: number; w: number; h: number };
}

const frames: Record<string, Frame> = {};

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

    audits.push(auditSprite(sprite.frameName, canvas, padW, padH));

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

    return {
      name: sprite.frameName,
      sourceName: sprite.name,
      sourceWidth: sprite.width,
      sourceHeight: sprite.height,
      buffer: scaled,
    };
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
  const w = m.meta.width ?? 0;
  const h = m.meta.height ?? 0;
  const audit = audits.find((a) => a.name === m.name);

  /*
   * CONTENT BOX, and it is not the same as the frame.
   *
   * A sprite's frame includes its soft contact shadow (§3 — every object sits
   * on something), so the frame's centre sits BELOW the object's visual centre.
   * A numeral centred on the frame would ride low on every token in the game,
   * by exactly the height of the shadow.
   *
   * This is the box of fully-opaque pixels — the solid object without its
   * shadow — and it is what the renderer centres numerals on. Recorded here
   * because only the pipeline can see the pixels; by the time the game has a
   * texture, the shadow is indistinguishable from the object.
   */
  frames[m.name] = {
    x,
    y,
    w,
    h,
    content: {
      x: x + Math.round((audit?.boxX ?? 0) * w),
      y: y + Math.round((audit?.boxY ?? 0) * h),
      w: Math.round((audit?.boxWidth ?? 1) * w),
      h: Math.round((audit?.boxHeight ?? 1) * h),
    },
  };
  return { input: m.buffer, left: x, top: y };
});

const atlasPath = join(options.out, `${options.atlas}.webp`);
await sharp({
  create: {
    width: columns * cell,
    height: rows * cell,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
  })
  .composite(composites)
  .webp({ quality: options.quality, alphaQuality: 100, smartSubsample: true, effort: 6 })
  .toFile(atlasPath);

writeFileSync(
  join(options.out, `${options.atlas}.json`),
  `${JSON.stringify({ family: options.atlas, image: `${options.atlas}.webp`, cell, frames }, null, 2)}\n`,
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
      `${a.meanHue.toFixed(0).padStart(5)}째  ${a.meanSaturation.toFixed(2)}  ${(a.boxWidth * 100).toFixed(0)}x${(a.boxHeight * 100).toFixed(0)}%\n`,
  );
}
process.stdout.write(
  `  mean light ${light.mean.toFixed(0)}째 (sd ${light.deviation.toFixed(1)}째), ` +
    `mean hue ${hue.mean.toFixed(0)}째 (sd ${hue.deviation.toFixed(1)}째)\n`,
);
if (options.baseline !== undefined) {
  const difference = Math.abs(light.mean - options.baseline) % 360;
  const angularDifference = difference > 180 ? 360 - difference : difference;
  process.stdout.write(
    `  same-material baseline ${options.baseline.toFixed(0)}째: delta ${angularDifference.toFixed(1)}째 ` +
      `(limit ${options.baselineTolerance.toFixed(1)}째)\n`,
  );
}

process.stdout.write(`\natlas frame sizes\n`);
for (const sprite of meta) {
  process.stdout.write(
    `  ${sprite.name.padEnd(22)} ${(sprite.meta.width ?? 0)}x${(sprite.meta.height ?? 0)}px ` +
      `(from ${sprite.sourceWidth}x${sprite.sourceHeight}px)\n`,
  );
}

/*
 * Outliers, flagged rather than fixed. §3 wants ONE light source upper-left
 * across every asset in the game, and a single sprite lit from the other side
 * is invisible in isolation and obvious once they sit side by side on a board.
 */
const problems: string[] = [];
if (options.skipAngle) {
  /*
   * BODY COLOUR IN PLACE OF LIGHT ANGLE. Every sprite's material must match
   * every other's: same brass, whatever the pose is doing. The channel spread
   * across the sheet is the equivalent of the angle's within-sheet limit.
   */
  const channels = [0, 1, 2] as const;
  const spreads = channels.map((c) => {
    const xs = audits.map((a) => a.bodyColour[c]!);
    return Math.max(...xs) - Math.min(...xs);
  });
  const worst = Math.max(...spreads);
  process.stdout.write(
    `  body colour spread  r${spreads[0]} g${spreads[1]} b${spreads[2]}  ` +
      `(limit ${options.bodyTolerance})  — angle check skipped, emissive feature
`,
  );
  if (worst > options.bodyTolerance) {
    problems.push(
      `${options.family}: body colour varies by ${worst} across the sheet ` +
        `(limit ${options.bodyTolerance}) — the material drifts between poses`,
    );
  }
} else if (light.deviation >= 3) {
  problems.push(
    `${options.family}: light spread ${light.deviation.toFixed(1)}째 exceeds the 3.0째 within-sheet limit`,
  );
}
if (!options.skipAngle && options.baseline !== undefined) {
  const difference = Math.abs(light.mean - options.baseline) % 360;
  const angularDifference = difference > 180 ? 360 - difference : difference;
  if (angularDifference > options.baselineTolerance) {
    problems.push(
      `${options.family}: mean ${light.mean.toFixed(1)}째 differs from its same-material baseline by ` +
        `${angularDifference.toFixed(1)}째 (limit ${options.baselineTolerance.toFixed(1)}째)`,
    );
  }
}
for (const a of audits) {
  const meanBox = audits.reduce((t, x) => t + x.boxWidth * x.boxHeight, 0) / audits.length;
  const box = a.boxWidth * a.boxHeight;
  if (meanBox > 0 && Math.abs(box - meanBox) / meanBox > 0.25) {
    problems.push(
      `${a.name}: drawn at ${((box / meanBox) * 100).toFixed(0)}% of the family's apparent size`,
    );
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
  `\n${atlasPath}  ${columns}x${rows} cells of ${cell}px, WebP q${options.quality}  ` +
    `${(statSync(atlasPath).size / 1024).toFixed(1)} KB\n`,
);
