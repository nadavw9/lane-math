import sharp from "sharp";

/**
 * How opaque should a band backdrop be?
 *
 * Re-derived from scratch for the light surfaces rather than carried over. The
 * old value (a dark veil at 0.5-0.6) was chosen against dark landscape art and
 * every assumption behind it has inverted.
 *
 * TWO DECISIONS, in order.
 *
 * 1. COLOUR. White, not black. The tokens are the dark things now, so a dark
 *    veil pulls the ground toward them and costs contrast, while also muting
 *    the paper the whole art direction rests on. A white veil pushes the ground
 *    away from the tokens: separation and contrast stop competing.
 *
 * 2. ALPHA. A backdrop exists to make a band edge visible (§9.1: separation,
 *    not contrast), so the question is how big a luminance step reads as an
 *    edge ON THIS PAPER. An edge is only visible against the texture it sits
 *    in: a 4-unit step is invisible on grainy paper and obvious on smooth
 *    paper. So measure the grain and size the step to it.
 *
 * Grain is the high-pass residual — the pixel minus a blurred copy of itself —
 * which is what "how noisy is this surface" means and is not fooled by the
 * slow shading across the sheet.
 */
const K = 3; // step, in multiples of local grain sd

async function grainAndLevel(file, zone) {
  const image = sharp(file).removeAlpha().greyscale();
  const meta = await image.metadata();
  const box = {
    left: Math.round(meta.width * zone.x),
    top: Math.round(meta.height * zone.y),
    width: Math.round(meta.width * zone.w),
    height: Math.round(meta.height * zone.h),
  };

  const flat = await sharp(file).removeAlpha().greyscale().extract(box).raw().toBuffer();
  const blurred = await sharp(file)
    .removeAlpha()
    .greyscale()
    .extract(box)
    .blur(4)
    .raw()
    .toBuffer();

  let mean = 0;
  for (let i = 0; i < flat.length; i++) mean += flat[i];
  mean /= flat.length;

  let variance = 0;
  for (let i = 0; i < flat.length; i++) variance += (flat[i] - blurred[i]) ** 2;
  const sd = Math.sqrt(variance / flat.length);

  return { mean, sd };
}

/*
 * Band positions vary with content now, so sample generously: the top half
 * covers the lane under every layout, the bottom half covers everything from
 * the equation row down.
 */
const ZONES = [
  { name: "lane", x: 0.05, y: 0.05, w: 0.9, h: 0.45 },
  { name: "equation/pool", x: 0.05, y: 0.5, w: 0.9, h: 0.45 },
];

process.stdout.write(
  `white veil, step = ${K}x local grain\n\n` +
    `world  zone            mean  grain sd   step   alpha\n`,
);

let worst = 0;
for (const world of [1, 2, 3, 4]) {
  for (const zone of ZONES) {
    const { mean, sd } = await grainAndLevel(`assets/bg/world-${world}.webp`, zone);
    const step = K * sd;
    // Compositing is done in sRGB by the renderer: out = (1-a)*bg + a*255.
    const alpha = step / (255 - mean);
    worst = Math.max(worst, alpha);
    process.stdout.write(
      `  ${world}    ${zone.name.padEnd(14)} ${mean.toFixed(1).padStart(5)}  ` +
        `${sd.toFixed(2).padStart(6)}    ${step.toFixed(1).padStart(5)}   ${alpha.toFixed(3)}\n`,
    );
  }
}

process.stdout.write(
  `\nalpha needed on the grainiest surface: ${worst.toFixed(3)}\n` +
    `texture retained at that alpha: ${((1 - worst) * 100).toFixed(0)}%\n`,
);
