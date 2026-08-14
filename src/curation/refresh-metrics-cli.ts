import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { analyse, countLines, type Level, type Mode } from "../solver/index.js";

/**
 * Recompute the stored per-mode metrics for the curated ladder, in place.
 *
 * Selection is NOT revisited — same boards, same slots, same order. This only
 * refreshes numbers that were measured under a solver since found to be wrong,
 * and adds `survivalRate` (GDD §8.4).
 *
 *   npx vite-node src/curation/refresh-metrics-cli.ts [levelsDir]
 */
const dir = process.argv[2] ?? "levels";
const MODES: readonly Mode[] = ["casual", "normal", "expert"];

const files = readdirSync(dir)
  .filter((f) => /^\d-\d\d\.json$/.test(f))
  .sort();

let changed = 0;

for (const file of files) {
  const path = join(dir, file);
  const j = JSON.parse(readFileSync(path, "utf8"));

  const asLevel: Level = {
    id: j.id,
    pool: j.pool,
    targets: j.targets,
    operators: {
      casual: j.modes.casual.budget,
      normal: j.modes.normal.budget,
      expert: j.modes.expert.budget,
    },
    rules: j.rules,
  };

  let touched = false;

  for (const mode of MODES) {
    const block = j.modes[mode];
    if (!block) continue;

    const fresh = analyse(asLevel, block.budget, { maxCollected: 500000 });
    const counted = countLines(asLevel, block.budget);

    const next = {
      solvable: fresh.solvable,
      solutionPaths: fresh.solutionPaths,
      dStart: fresh.dStart,
      dPath: fresh.dPath,
      decisionPoints: fresh.decisionPoints,
      keystones: fresh.keystones,
      lookaheadDistance: fresh.lookaheadDistance,
      maxTrapDepth: fresh.maxTrapDepth,
      overlappingKeystonePairs: fresh.overlappingKeystonePairs,
      // GDD §8.4: solutionPaths alone is uninterpretable without the
      // denominator it is a fraction of.
      totalLinesExplored: counted.total,
      survivalRate: counted.total === 0 ? 0 : Math.round((1000 * counted.winning) / counted.total) / 1000,
    };

    if (JSON.stringify(next) !== JSON.stringify(block.metrics)) touched = true;
    block.metrics = next;
  }

  if (touched) changed++;
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
}

process.stdout.write(`Refreshed ${files.length} ladder levels; ${changed} had changed metrics.\n`);
