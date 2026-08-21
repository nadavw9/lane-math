import { readFileSync } from "node:fs";

/** Minimal TrueType cmap reader: does this font map this code point to a glyph? */
function cmapLookup(buf) {
  const numTables = buf.readUInt16BE(4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString("ascii", rec, rec + 4) === "cmap") cmapOff = buf.readUInt32BE(rec + 8);
  }
  if (cmapOff < 0) throw new Error("no cmap");

  const n = buf.readUInt16BE(cmapOff + 2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < n; i++) {
    const rec = cmapOff + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const offset = buf.readUInt32BE(rec + 4);
    // Prefer full-repertoire Unicode (3/10, format 12) over BMP (3/1, format 4).
    const score = platform === 3 && encoding === 10 ? 3 : platform === 3 && encoding === 1 ? 2 : platform === 0 ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = cmapOff + offset;
    }
  }

  const format = buf.readUInt16BE(best);
  if (format === 4) {
    const segCount = buf.readUInt16BE(best + 6) / 2;
    const endBase = best + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      for (let s = 0; s < segCount; s++) {
        const end = buf.readUInt16BE(endBase + s * 2);
        if (cp > end) continue;
        const start = buf.readUInt16BE(startBase + s * 2);
        if (cp < start) return 0;
        const delta = buf.readInt16BE(deltaBase + s * 2);
        const rangeOffset = buf.readUInt16BE(rangeBase + s * 2);
        if (rangeOffset === 0) return (cp + delta) & 0xffff;
        const gi = buf.readUInt16BE(rangeBase + s * 2 + rangeOffset + (cp - start) * 2);
        return gi === 0 ? 0 : (gi + delta) & 0xffff;
      }
      return 0;
    };
  }
  if (format === 12) {
    const nGroups = buf.readUInt32BE(best + 12);
    return (cp) => {
      for (let g = 0; g < nGroups; g++) {
        const rec = best + 16 + g * 12;
        const start = buf.readUInt32BE(rec);
        const end = buf.readUInt32BE(rec + 4);
        if (cp >= start && cp <= end) return buf.readUInt32BE(rec + 8) + (cp - start);
      }
      return 0;
    };
  }
  throw new Error(`unsupported cmap format ${format}`);
}

const file = process.argv[2];
const lookup = cmapLookup(readFileSync(file));

const ascii = [];
for (let c = 0x20; c <= 0x7e; c++) ascii.push(String.fromCodePoint(c));
const symbols = ["√", "²", "×", "÷", "−", "—", "♥", "·", "★", "☆", "◆", "…"];

const report = (label, chars) => {
  const present = chars.filter((c) => lookup(c.codePointAt(0)) !== 0);
  const absent = chars.filter((c) => lookup(c.codePointAt(0)) === 0);
  console.log(`  ${label}`);
  console.log(`    present (${present.length}/${chars.length}): ${present.join("")}`);
  console.log(
    `    ABSENT  (${absent.length}): ${absent
      .map((c) => `${c} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
      .join("   ")}`,
  );
};

console.log(`\n${file}`);
report("printable ASCII U+0020-007E", ascii);
report("non-ASCII glyphs the UI draws", symbols);
