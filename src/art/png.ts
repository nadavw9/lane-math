import { inflateSync } from "node:zlib";

import type { ImageData } from "./brightness.js";

/**
 * Minimal PNG reader for the CI gate.
 *
 * Truecolour 8-bit only, which is what the placeholder generator emits. Real
 * artwork arrives as WebP and will need a decoder here — the gate's job is to
 * judge the images, so it must never be the thing that silently skips them.
 */
export function decodePng(buffer: Buffer): ImageData {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  let bitDepth = 0;
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colourType = data[9]!;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || (colourType !== 2 && colourType !== 6)) {
    throw new Error(`unsupported PNG: bitDepth ${bitDepth}, colourType ${colourType}`);
  }

  const channels = colourType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 3);

  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start]!;
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));

    // PNG filters, per spec. Without these an unfiltered read returns noise.
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = previous[i]!;
      const c = i >= channels ? previous[i - channels]! : 0;
      switch (filter) {
        case 1:
          line[i] = (line[i]! + a) & 0xff;
          break;
        case 2:
          line[i] = (line[i]! + b) & 0xff;
          break;
        case 3:
          line[i] = (line[i]! + ((a + b) >> 1)) & 0xff;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          line[i] = (line[i]! + pr) & 0xff;
          break;
        }
        default:
          break;
      }
    }

    for (let x = 0; x < width; x++) {
      const from = x * channels;
      const to = (y * width + x) * 3;
      pixels[to] = line[from]!;
      pixels[to + 1] = line[from + 1]!;
      pixels[to + 2] = line[from + 2]!;
    }
    previous = line;
  }

  return { width, height, pixels };
}
