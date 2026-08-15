import { readFileSync, readdirSync } from "node:fs";

import { bands } from "../src/renderer/layout.js";

/**
 * What token size does each shipped level actually get?
 *
 * The size is solved rather than tabulated, so the only honest way to report
 * the range is to run every level through the real layout.
 */
interface Row {
  id: string;
  targets: number;
  tiles: number;
  size: number;
  grid: string;
  poolWidth: number;
  above: number;
}

const rows: Row[] = [];
for (const file of readdirSync("levels").filter((f) => /^\d-\d\d\.json$/.test(f)).sort()) {
  const level = JSON.parse(readFileSync(`levels/${file}`, "utf8")) as {
    targets: number[];
    pool: number[];
  };
  const b = bands({ targets: level.targets.length, tiles: level.pool.length, hints: 0 });
  rows.push({
    id: file.replace(".json", ""),
    targets: level.targets.length,
    tiles: level.pool.length,
    size: b.grid.size,
    grid: `${b.grid.rows}x${b.grid.perRow}`,
    poolWidth: Math.round(b.pool.width),
    above: Math.round(b.lane.y),
  });
}

const shapes = new Map<string, Row>();
for (const row of rows) {
  const key = `${row.targets}/${row.tiles}`;
  if (!shapes.has(key)) shapes.set(key, row);
}

process.stdout.write("targets/tiles  size  grid   pool w  paper above lane  levels\n");
for (const [key, row] of shapes) {
  const ids = rows.filter((r) => `${r.targets}/${r.tiles}` === key);
  process.stdout.write(
    `${key.padEnd(14)}${String(row.size).padStart(4)}  ${row.grid.padEnd(6)}` +
      `${String(row.poolWidth).padStart(6)}${String(row.above).padStart(11)}px` +
      `${String(ids.length).padStart(8)}  ${ids[0]!.id}..${ids[ids.length - 1]!.id}\n`,
  );
}

const sizes = rows.map((r) => r.size);
process.stdout.write(
  `\nscale range across the shipped ladder: ${Math.min(...sizes)}-${Math.max(...sizes)}px\n`,
);
