import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { DESIGN, bands } from "../src/renderer/layout.js";

/**
 * WHERE IS THERE ANY DESK LEFT, on the levels that actually ship?
 *
 * The bands fill the design surface, so the automaton must overlap one of them.
 * The only question is which overlap leaves the most of it visible, and that is
 * a measurement over the shipped ladder rather than over synthetic extremes.
 */
const files = readdirSync("levels").filter((f) => f.endsWith(".json")).sort();
const left: number[] = [];
const top: number[] = [];
const rows: string[] = [];
for (const file of files) {
  const level = JSON.parse(readFileSync(join("levels", file), "utf8")) as {
    targets: readonly number[];
    pool: readonly number[];
    modes: Record<string, { budget: Record<string, number | null> }>;
  };
  if (!level.targets || !level.pool) continue;
  const size = {
    targets: level.targets.length,
    tiles: level.pool.length,
    operators: Object.keys(level.modes["normal"]?.budget ?? {}).length,
    hints: 0,
  };
  const b = bands(size);
  left.push(b.pool.x);
  top.push(b.lane.y);
  rows.push(
    `${file.replace(".json", "")}  poolLeft ${b.pool.x.toFixed(0).padStart(3)}  poolBottom ${(b.pool.y + b.pool.height).toFixed(0)}  topDesk ${b.lane.y.toFixed(0).padStart(3)}  bottomDesk ${(DESIGN.height - b.status.y - b.status.height).toFixed(0)}`,
  );
}
const stat = (xs: number[]): string => {
  const s = [...xs].sort((a, b) => a - b);
  return `min ${s[0]!.toFixed(0)}  median ${s[Math.floor(s.length / 2)]!.toFixed(0)}  max ${s[s.length - 1]!.toFixed(0)}`;
};
console.log(rows.join("\n"));
console.log(`\npool left margin   ${stat(left)}`);
console.log(`top desk above lane ${stat(top)}`);
