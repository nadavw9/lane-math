import sharp from "sharp";

/**
 * How distinctly does each token family read against each surface?
 *
 * World 4 is the only cool-hued surface, so the ink-navy plate has less HUE
 * separation there than on the three warm ones and could in principle read as
 * "part of the paper". Contrast ratio alone will not answer that — two colours
 * can differ hugely in luminance and still look like the same material — so
 * measure hue distance and CIE76 dE alongside it.
 */
const ch = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** sRGB -> CIE Lab, D65. */
function lab(r, g, b) {
  const [R, G, B] = [ch(r), ch(g), ch(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hueAngle = ([, a, bb]) => (Math.atan2(bb, a) * 180) / Math.PI;
function hueGap(a, b) {
  const d = Math.abs(hueAngle(a) - hueAngle(b)) % 360;
  return d > 180 ? 360 - d : d;
}

const TOKENS = {
  "plate (navy)": 0x1e2a3a,
  "front (deep blue)": 0x16324f,
  "tile (walnut)": 0x33241a,
  "operator (teal-slate)": 0x22333b,
};

process.stdout.write(
  `token                   world  surface Lab        token Lab          dE     hue gap  contrast\n`,
);

for (const [name, hex] of Object.entries(TOKENS)) {
  const t = lab((hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff);
  const tokenLum = 0.2126 * ch((hex >> 16) & 0xff) + 0.7152 * ch((hex >> 8) & 0xff) + 0.0722 * ch(hex & 0xff);

  for (const world of [1, 2, 3, 4]) {
    const { data, info } = await sharp(`public/assets/bg/world-${world}.webp`)
      .removeAlpha()
      .resize(1, 1, { fit: "fill" }) // the surface's average colour
      .raw()
      .toBuffer({ resolveWithObject: true });
    void info;
    const s = lab(data[0], data[1], data[2]);
    const surfaceLum = 0.2126 * ch(data[0]) + 0.7152 * ch(data[1]) + 0.0722 * ch(data[2]);
    const contrast = (surfaceLum + 0.05) / (tokenLum + 0.05);

    process.stdout.write(
      `${name.padEnd(23)} ${world}      ` +
        `${s.map((v) => v.toFixed(0).padStart(4)).join(" ")}   ` +
        `${t.map((v) => v.toFixed(0).padStart(4)).join(" ")}   ` +
        `${dE(s, t).toFixed(1).padStart(5)}  ${hueGap(s, t).toFixed(0).padStart(5)}째   ` +
        `${contrast.toFixed(2)}:1\n`,
    );
  }
}
