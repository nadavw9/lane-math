import { readdirSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

/**
 * Background luminance, measured several ways — DARK END FIRST.
 *
 * The surfaces are light and the tokens are dark (§9.1), so the binding
 * constraint is now the darkest background point, not the brightest: a dark
 * digit dies in a shadow, not in a highlight. The bright end is kept only to
 * confirm the surfaces are as uniformly lit as the direction claims.
 *
 * Percentiles are reported alongside the extremes because one pixel moves a
 * minimum and moves nothing else.
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
    min: values[0],
    p001: at(0.0001),
    p01: at(0.001),
    p1: at(0.01),
    p5: at(0.05),
    mean,
    max: values[values.length - 1],
    size: `${info.width}x${info.height}`,
  };
}

/** Token ceiling: the luminance a token must stay below to clear `ratio`:1. */
const ceilingFor = (backgroundLum, ratio = 3) => (backgroundLum + 0.05) / ratio - 0.05;

for (const dir of ["assets/bg-raw", "assets/bg"]) {
  process.stdout.write(`\n=== ${dir} ===\n`);
  process.stdout.write(
    `file            size        min      p0.01    p0.1     p1       p5       mean     max\n`,
  );
  const mins = [];
  for (const name of readdirSync(dir).filter((f) => /^world-[1-4]\./.test(f)).sort()) {
    const m = await measure(join(dir, name));
    mins.push({ name, min: m.min, p01: m.p01 });
    process.stdout.write(
      `${name.padEnd(15)} ${m.size.padEnd(11)} ` +
        `${m.min.toFixed(4)}   ${m.p001.toFixed(4)}   ${m.p01.toFixed(4)}   ` +
        `${m.p1.toFixed(4)}   ${m.p5.toFixed(4)}   ${m.mean.toFixed(4)}   ${m.max.toFixed(4)}\n`,
    );
  }
  const darkest = mins.reduce((a, b) => (b.min < a.min ? b : a));
  process.stdout.write(
    `  darkest point across the set: ${darkest.min.toFixed(4)} (${darkest.name})\n` +
      `  tokens must stay below ${ceilingFor(darkest.min).toFixed(4)} luminance for 3:1\n`,
  );
}
