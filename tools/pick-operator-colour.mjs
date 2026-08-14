/**
 * Choose the operator circle colour.
 *
 * Constraints: luminance above 0.453, and distinguishable from BOTH the target
 * plate (0xa8b8dc, cool blue) and the number tile (0xd9b98a, warm sand).
 *
 * Shape already separates operators from numbers (§9.2), so hue only has to
 * avoid ambiguity — but it should not fight the two families either. A green
 * sits opposite both on the hue circle: away from the blue plates and away
 * from the sand tiles, so it reads as a third family rather than a variant.
 */
const lum = (hex) => {
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * ch((hex >> 16) & 0xff) +
    0.7152 * ch((hex >> 8) & 0xff) +
    0.0722 * ch(hex & 0xff)
  );
};
const ratio = (a, b) => {
  const [hi, lo] = lum(a) >= lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
};
/** Rough perceptual distance, so "distinguishable" is measured not asserted. */
const distance = (a, b) => {
  const dr = ((a >> 16) & 0xff) - ((b >> 16) & 0xff);
  const dg = ((a >> 8) & 0xff) - ((b >> 8) & 0xff);
  const db = (a & 0xff) - (b & 0xff);
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
};

const PLATE = 0xa8b8dc;
const TILE = 0xd9b98a;
const MIN_LUM = 0.453;

const candidates = [
  0x8fd6a4, 0x9adfae, 0xa4e3b4, 0x86d09c, 0x95dcaa,
  0x8ed2b8, 0xa8e0bc, 0x7fd0a0, 0x99e0b0, 0xb0e8c0,
];

const rows = candidates
  .map((hex) => ({
    hex,
    l: lum(hex),
    dPlate: distance(hex, PLATE),
    dTile: distance(hex, TILE),
  }))
  .filter((c) => c.l >= MIN_LUM)
  .sort((a, b) => Math.min(b.dPlate, b.dTile) - Math.min(a.dPlate, a.dTile));

process.stdout.write(
  `plate  0x${PLATE.toString(16)}  luminance ${lum(PLATE).toFixed(4)}\n` +
    `tile   0x${TILE.toString(16)}  luminance ${lum(TILE).toFixed(4)}\n` +
    `min operator luminance ${MIN_LUM}\n\n` +
    `candidate   luminance   dist(plate)  dist(tile)   worst dist\n`,
);
for (const c of rows) {
  process.stdout.write(
    `0x${c.hex.toString(16).padStart(6, "0")}    ${c.l.toFixed(4)}      ` +
      `${c.dPlate.toFixed(0).padStart(6)}      ${c.dTile.toFixed(0).padStart(6)}   ` +
      `${Math.min(c.dPlate, c.dTile).toFixed(0).padStart(6)}\n`,
  );
}

const chosen = rows[0];
process.stdout.write(
  `\nchosen 0x${chosen.hex.toString(16)}  luminance ${chosen.l.toFixed(4)}\n` +
    `  vs plate  ${ratio(chosen.hex, PLATE).toFixed(2)}:1 contrast, distance ${chosen.dPlate.toFixed(0)}\n` +
    `  vs tile   ${ratio(chosen.hex, TILE).toFixed(2)}:1 contrast, distance ${chosen.dTile.toFixed(0)}\n`,
);
