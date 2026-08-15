import sharp from "sharp";

/**
 * Measure horizontal-line spacing per decile.
 *
 *   node tools/measure-grid.mjs assets/bg/world-1.webp
 *
 * Vertical-gradient "detail" is the wrong metric for a ruled surface. What a
 * player sees on graph paper is not sharpness, it is REGULARITY: if the grid
 * squares are 6px tall at the margin and 12px tall in the middle, the sheet
 * reads as bulged, however crisp the lines are. So measure the dominant
 * vertical period per decile via autocorrelation of the row-mean signal, and
 * compare margins against centre.
 */
const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: node tools/measure-grid.mjs <image>\n");
  process.exit(1);
}

const { data, info } = await sharp(file)
  .removeAlpha()
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;

/** Mean luminance per row: horizontal rulings show up as dips. */
const rowMean = new Float64Array(height);
for (let y = 0; y < height; y++) {
  let total = 0;
  for (let x = 0; x < width; x++) total += data[y * width + x];
  rowMean[y] = total / width;
}

/** Dominant period in [min, max] rows, by autocorrelation of the detrended signal. */
function dominantPeriod(from, to, min = 4, max = 90) {
  const n = to - from;
  const slice = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += rowMean[from + i];
  mean /= n;
  for (let i = 0; i < n; i++) slice[i] = rowMean[from + i] - mean;

  let best = 0;
  let bestScore = -Infinity;
  for (let lag = min; lag <= Math.min(max, Math.floor(n / 3)); lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += slice[i] * slice[i + lag];
    const score = sum / (n - lag);
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return { period: best, strength: bestScore };
}

const bands = 10;
const rows = Math.floor(height / bands);
const periods = [];
for (let b = 0; b < bands; b++) {
  periods.push(dominantPeriod(b * rows, (b + 1) * rows));
}

/*
 * A decile that lands on the minimum lag found no ruling at all — either the
 * surface has none (world 3 is wood grain) or the band is vignetted at the very
 * edge of the frame. Averaging those in reports a spread that is an artefact of
 * the detector rather than a property of the image, so drop them and say how
 * many were dropped.
 */
const MIN_LAG = 4;
const valid = periods.map((p) => p.period).filter((p) => p > MIN_LAG);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

if (valid.length < 2) {
  process.stdout.write(
    `${file}  ${width}x${height}\n` +
      `  period per decile  ${periods.map((p) => String(p.period).padStart(3)).join("")}\n` +
      `  no periodic ruling detected — unruled surface, regularity not applicable\n`,
  );
} else {
  const m = mean(valid);
  const sd = Math.sqrt(mean(valid.map((p) => (p - m) ** 2)));
  process.stdout.write(
    `${file}  ${width}x${height}\n` +
      `  period per decile  ${periods.map((p) => String(p.period).padStart(3)).join("")}\n` +
      `  ruled deciles ${valid.length}/10  mean ${m.toFixed(1)}px  spread ${Math.min(...valid)}-${Math.max(...valid)}px  ` +
      `CoV ${((sd / m) * 100).toFixed(1)}%\n`,
  );
}
