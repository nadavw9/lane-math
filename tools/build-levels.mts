import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RUNTIME_LEVEL_FIELDS, RUNTIME_MODE_FIELDS } from "../src/game/level-fields.js";

/**
 * Derive the shipped level file from the authored ones (GDD §10).
 *
 *   npx vite-node tools/build-levels.mts
 *
 * The repo keeps the full files as the source of truth for curation and CI —
 * keystones, decisionPoints, survivalRate, trap depths, everything §8.6 needs.
 * None of it is read at runtime, and shipping it cost 549KB of a 560KB payload.
 *
 * This copies only the fields in RUNTIME_LEVEL_FIELDS, which is the same list
 * the loader's type is checked against, so the strip cannot remove something
 * the game reads without failing to compile or failing a test first.
 */
const SOURCE = "levels";
const OUT = join("src", "generated", "levels.json");

const files = readdirSync(SOURCE)
  .filter((f) => /^\d-\d\d\.json$/.test(f))
  .sort();

const runtime = files.map((file) => {
  const full = JSON.parse(readFileSync(join(SOURCE, file), "utf8")) as Record<string, unknown>;

  const level: Record<string, unknown> = {};
  for (const field of RUNTIME_LEVEL_FIELDS) {
    if (field === "modes") continue;
    level[field] = full[field];
  }

  // Modes are stripped one level deeper: `budget` and `tier` ship, `metrics`
  // does not. Tier is small and identifies the band a level was curated into,
  // which the loader's type still declares.
  const modes: Record<string, unknown> = {};
  for (const [name, block] of Object.entries((full["modes"] ?? {}) as Record<string, unknown>)) {
    const source = block as Record<string, unknown>;
    const lean: Record<string, unknown> = {};
    for (const field of RUNTIME_MODE_FIELDS) lean[field] = source[field];
    modes[name] = lean;
  }
  level["modes"] = modes;

  return level;
});

writeFileSync(OUT, `${JSON.stringify(runtime)}\n`);

const before = files.reduce((sum, f) => sum + readFileSync(join(SOURCE, f)).length, 0);
const after = readFileSync(OUT).length;
process.stdout.write(
  `${OUT}\n` +
    `  ${files.length} levels\n` +
    `  authored ${before} bytes -> runtime ${after} bytes ` +
    `(${(((before - after) / before) * 100).toFixed(1)}% stripped)\n`,
);
