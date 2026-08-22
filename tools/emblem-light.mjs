import sharp from "sharp";

/**
 * DOES THE EMBLEM CARRY LIGHT, OR IS IT A FLAT FILL?
 *
 *   node tools/emblem-light.mjs shot.png "star" <left> <top> <w> <h>
 *
 * ART_DIRECTION §3 requires one upper-left light source, a specular highlight
 * and a contact shadow on every object. That is easy to write into a draw
 * function and still not get: the hint mark HAD a `contactShadow()` call and a
 * `specular()` call and still read as a flat gold lozenge, because both were
 * sized as fractions of a 10px emblem — a 0.8px highlight paints nothing.
 *
 * THE SEARCH BOX IS A HINT, NOT THE MEASUREMENT. A hand-placed box that misses
 * the object by a few pixels fills the quadrants with background, and uniform
 * background drags every quadrant toward the same number — which reported a
 * visibly shaded star as 3.3% "flat". So the object is found by masking pixels
 * that differ from the background, and every statistic below is computed over
 * THE OBJECT'S OWN PIXELS inside its detected bounding box.
 *
 *   LIT       mean luminance of the object's upper-left half against its
 *             lower-right half, along the light's axis.
 *   SPECULAR  the brightest object pixels sit well above the object's median,
 *             and are a small share of it — a highlight is a small bright area,
 *             not an overall paler colour.
 *   SHADOW    the band under the object against clean surface further down.
 *             NOT "beside": these draw in meters, so a sample one width to the
 *             right lands in the next emblem's shadow.
 */
const [file, label, left, top, w, h] = process.argv.slice(2);
if (!file) {
  process.stdout.write("usage: emblem-light.mjs <png> <label> <left> <top> <w> [h]\n");
  process.exit(1);
}

const L = Math.floor(Number(left));
const T = Math.floor(Number(top));
const W = Math.floor(Number(w));
const H = Math.floor(Number(h ?? w));

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const idx = (x, y) => (y * info.width + x) * 4;
const rgb = (x, y) => {
  const i = idx(x, y);
  return [data[i], data[i + 1], data[i + 2]];
};
const at = (x, y) => lum(...rgb(x, y));

const mean = (x0, y0, bw, bh) => {
  let sum = 0;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(info.height, y0 + bh); y++) {
    for (let x = Math.max(0, x0); x < Math.min(info.width, x0 + bw); x++) {
      sum += at(x, y);
      n++;
    }
  }
  return n ? sum / n : 0;
};

// Background = the modal colour of the search box's border ring, which is the
// surface the object sits on rather than any part of the object.
const ring = [];
for (let x = L; x < L + W; x++) {
  ring.push(rgb(x, T), rgb(x, T + H - 1));
}
for (let y = T; y < T + H; y++) {
  ring.push(rgb(L, y), rgb(L + W - 1, y));
}
const bg = [0, 1, 2].map((c) => {
  const vals = ring.map((p) => p[c]).sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
});

// Object mask: anything meaningfully unlike the surface.
const dist = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]);
const THRESHOLD = 60;
const pixels = [];
let minX = Infinity;
let maxX = -1;
let minY = Infinity;
let maxY = -1;
for (let y = T; y < T + H; y++) {
  for (let x = L; x < L + W; x++) {
    if (dist(rgb(x, y)) > THRESHOLD) {
      pixels.push([x, y, at(x, y)]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (pixels.length < 12) {
  process.stdout.write(`\n${label}: no object found in the search box — check the coordinates\n`);
  process.exit(1);
}

const bw = maxX - minX + 1;
const bh = maxY - minY + 1;
const cx = minX + bw / 2;
const cy = minY + bh / 2;

// Along the light's axis: upper-left half of the object against lower-right.
const ul = pixels.filter(([x, y]) => x - cx + (y - cy) < 0).map((p) => p[2]);
const lr = pixels.filter(([x, y]) => x - cx + (y - cy) >= 0).map((p) => p[2]);
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const upperLeft = avg(ul);
const lowerRight = avg(lr);

const body = pixels.map((p) => p[2]).sort((a, b) => a - b);
const median = body[Math.floor(body.length / 2)];
const p99 = body[Math.floor(body.length * 0.99)];
const brightFraction = body.filter((v) => v > median + (p99 - median) * 0.6).length / body.length;

const band = Math.max(2, Math.round(bh * 0.16));
const under = mean(Math.round(minX + bw * 0.2), maxY + 1, Math.round(bw * 0.6), band);
const clean = mean(Math.round(minX + bw * 0.2), maxY + 1 + Math.round(bh * 0.8), Math.round(bw * 0.6), band);

const pct = (a, b) => (((a - b) / Math.max(1, b)) * 100).toFixed(1);
const verdict = (ok) => (ok ? "PASS" : "FAIL");

process.stdout.write(`\n${label}\n`);
process.stdout.write(`  object    ${bw}x${bh}px at ${minX},${minY}  (${pixels.length} px, surface rgb ${bg.join(",")})\n`);
process.stdout.write(
  `  LIT       upper-left ${upperLeft.toFixed(1)} vs lower-right ${lowerRight.toFixed(1)}  ` +
    `= ${pct(upperLeft, lowerRight)}% brighter  ${verdict(upperLeft > lowerRight * 1.08)}\n`,
);
process.stdout.write(
  `  SPECULAR  median ${median.toFixed(1)}  p99 ${p99.toFixed(1)}  headroom ${(p99 - median).toFixed(1)}  ` +
    `bright area ${(brightFraction * 100).toFixed(1)}%  ${verdict(p99 - median > 24 && brightFraction < 0.32)}\n`,
);
process.stdout.write(
  `  SHADOW    under ${under.toFixed(1)} vs clean ${clean.toFixed(1)}  ` +
    `= ${pct(clean, under)}% darker  ${verdict(under < clean * 0.97)}\n`,
);
