import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

/**
 * Peak luminance, measured several ways.
 *
 * The reported set (0.0446 / 0.0330 / 0.0221 / 0.0173) disagrees with a
 * per-pixel maximum, so this reports the maximum alongside high percentiles to
 * find which statistic the two measurements actually share. A single specular
 * pixel moves a maximum and moves nothing else.
 */
const ch = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const lum = (r, g, b) => 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);

async function measure(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const values = [];
  for (let i = 0; i < data.length; i += 3) {
    values.push(lum(data[i], data[i + 1], data[i + 2]));
  }
  values.sort((a, b) => a - b);
  const at = (p) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    max: values[values.length - 1],
    p9999: at(0.9999),
    p999: at(0.999),
    p99: at(0.99),
    p95: at(0.95),
    mean,
    size: `${info.width}x${info.height}`,
  };
}

for (const dir of ["assets/bg-raw", "assets/bg"]) {
  process.stdout.write(`\n=== ${dir} ===\n`);
  process.stdout.write(
    `file            size        max      p99.99   p99.9    p99      p95      mean\n`,
  );
  for (const name of readdirSync(dir).filter((f) => /^world-[1-4]\./.test(f)).sort()) {
    const m = await measure(join(dir, name));
    process.stdout.write(
      `${name.padEnd(15)} ${m.size.padEnd(11)} ` +
        `${m.max.toFixed(4)}   ${m.p9999.toFixed(4)}   ${m.p999.toFixed(4)}   ` +
        `${m.p99.toFixed(4)}   ${m.p95.toFixed(4)}   ${m.mean.toFixed(4)}\n`,
    );
  }
}
