import sharp from "sharp";

/**
 * Max per-channel difference between two screenshots inside a region.
 *
 * Proves the §9.3 invariant the eye cannot: that a surviving tile occupies the
 * SAME pixels before and after other tiles are spent. "Looks like it did not
 * move" and "did not move" are different claims, and only one of them is worth
 * asserting about a rule the player's spatial memory depends on.
 *
 *   node tools/diff-region.mjs a.png b.png <left> <top> <w> <h>
 */
const [a, b, left, top, width, height] = process.argv.slice(2);
const box = { left: Number(left), top: Number(top), width: Number(width), height: Number(height) };

const [x, y] = await Promise.all(
  [a, b].map((f) => sharp(f).removeAlpha().extract(box).raw().toBuffer()),
);

let max = 0;
let differing = 0;
for (let i = 0; i < x.length; i++) {
  const d = Math.abs(x[i] - y[i]);
  if (d > max) max = d;
  if (d > 2) differing++;
}

process.stdout.write(
  `region ${box.width}x${box.height} at ${box.left},${box.top}\n` +
    `  max channel difference: ${max}\n` +
    `  samples differing by >2: ${differing} of ${x.length} ` +
    `(${((differing / x.length) * 100).toFixed(3)}%)\n`,
);
