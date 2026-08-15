import sharp from "sharp";

/**
 * Which statistic is "the darkest background point"?
 *
 * The approved figure for world 3 is 0.3537. A per-pixel minimum reports
 * 0.1424, so the two are not measuring the same thing — the same disagreement
 * as the earlier peak-luminance case, inverted. This finds the statistic they
 * share, because the gate must assert the one that describes legibility rather
 * than the one that is easiest to compute.
 */
const ch = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = (r, g, b) => 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);

async function minAfterBlur(file, sigma) {
  const pipeline = sharp(file).removeAlpha();
  if (sigma > 0) pipeline.blur(sigma);
  const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  let min = Infinity;
  for (let i = 0; i < data.length; i += 3) {
    const l = lum(data[i], data[i + 1], data[i + 2]);
    if (l < min) min = l;
  }
  return min;
}

async function percentile(file, p) {
  const { data } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const values = [];
  for (let i = 0; i < data.length; i += 3) values.push(lum(data[i], data[i + 1], data[i + 2]));
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * p)];
}

for (const world of [1, 2, 3, 4]) {
  const file = `assets/bg/world-${world}.webp`;
  const blurs = [];
  for (const sigma of [0, 2, 4, 8, 16, 32]) {
    blurs.push(`s${sigma}=${(await minAfterBlur(file, sigma)).toFixed(4)}`);
  }
  const pcts = [];
  for (const p of [0.001, 0.005, 0.01, 0.02, 0.05]) {
    pcts.push(`p${(p * 100).toFixed(1)}=${(await percentile(file, p)).toFixed(4)}`);
  }
  process.stdout.write(`world-${world}\n  min after blur  ${blurs.join("  ")}\n  percentile      ${pcts.join("  ")}\n`);
}
