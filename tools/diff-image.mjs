import sharp from "sharp";

/** node tools/diff-image.mjs a.png b.png out.png — differences amplified 8x. */
const [a, b, out] = process.argv.slice(2);

const [x, y] = await Promise.all([a, b].map((f) => sharp(f).removeAlpha().raw().toBuffer()));
const meta = await sharp(a).metadata();

const diff = Buffer.alloc(x.length);
const rows = new Map();
for (let i = 0; i < x.length; i += 3) {
  const d = Math.max(
    Math.abs(x[i] - y[i]),
    Math.abs(x[i + 1] - y[i + 1]),
    Math.abs(x[i + 2] - y[i + 2]),
  );
  const v = Math.min(255, d * 8);
  diff[i] = diff[i + 1] = diff[i + 2] = v;
  if (d > 2) {
    const row = Math.floor(i / 3 / meta.width);
    rows.set(row, (rows.get(row) ?? 0) + 1);
  }
}

await sharp(diff, { raw: { width: meta.width, height: meta.height, channels: 3 } })
  .png()
  .toFile(out);

const bands = [...rows.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12);
process.stdout.write(`${out}\nrows with the most differing pixels (row: count)\n`);
for (const [row, count] of bands) process.stdout.write(`  y=${row}: ${count}\n`);
