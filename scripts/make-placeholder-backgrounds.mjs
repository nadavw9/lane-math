import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * Four PLACEHOLDER backgrounds at ship resolution, so the loader and the
 * brightness gate are exercised end to end before any real art exists.
 *
 * GDD §9.1 requires: dark, desaturated, LOW-DETAIL CENTRE with interest pushed
 * to the edges — because a math puzzle dies if `6` reads as `8`. These
 * placeholders deliberately obey that: a vignette that darkens toward the
 * middle, exactly where the lane and pool sit.
 *
 * Written as PNG rather than WebP because Node has zlib but no WebP encoder,
 * and the point is to exercise the pipeline, not to ship these. The real
 * artwork arrives as ~720x1560 WebP q75 and drops into the same folder.
 */
const WIDTH = 720;
const HEIGHT = 1560;
const OUT = "assets/bg";

/** Per-world hue, all dark and desaturated (§9.1). */
const WORLDS = [
  { id: 1, name: "basics", top: [26, 32, 46], bottom: [12, 14, 20] },
  { id: 2, name: "multiply", top: [34, 26, 44], bottom: [14, 11, 20] },
  { id: 3, name: "divide", top: [22, 38, 40], bottom: [10, 17, 19] },
  { id: 4, name: "roots", top: [40, 30, 26], bottom: [18, 13, 11] },
];

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });

for (const world of WORLDS) {
  // Each row is a filter byte followed by RGB triples.
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  let offset = 0;

  for (let y = 0; y < HEIGHT; y++) {
    raw[offset++] = 0; // filter: none
    const v = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x++) {
      const u = x / (WIDTH - 1);
      // Vertical gradient, then darkened toward the centre so the playfield
      // stays the quietest part of the frame.
      const centre = 1 - Math.hypot((u - 0.5) * 1.15, (v - 0.5) * 0.8) * 1.5;
      const vignette = 1 - Math.max(0, centre) * 0.45;
      for (let c = 0; c < 3; c++) {
        const base = world.top[c] + (world.bottom[c] - world.top[c]) * v;
        raw[offset++] = Math.max(0, Math.min(255, Math.round(base * vignette)));
      }
    }
  }

  const file = join(OUT, `world-${world.id}.png`);
  writeFileSync(file, png(WIDTH, HEIGHT, raw));
  process.stdout.write(`wrote ${file} (${WIDTH}x${HEIGHT}, ${world.name})\n`);
}
