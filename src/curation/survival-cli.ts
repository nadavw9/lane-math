import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { countLines, type Level, type Mode } from "../solver/index.js";
import { tierByName } from "../generator/tiers.js";

/**
 * GDD §8.4 survivalRate for the curated ladder.
 *
 *   npx vite-node src/curation/survival-cli.ts [levelsDir]
 */
interface LadderLevel {
  id: string;
  world: number;
  pool: number[];
  targets: number[];
  rules: { allowNegative: boolean; integerOnly: boolean };
  modes: Record<string, { budget: Record<string, number | null>; metrics: { solutionPaths: number } }>;
  generator: { targetTier: string };
  curation: { role: string; compositeScore: number };
}

const dir = process.argv[2] ?? "levels";
const files = readdirSync(dir)
  .filter((f) => /^\d-\d\d\.json$/.test(f))
  .sort();

process.stdout.write(
  `| id | role | mode | winning | total lines | survivalRate |\n|---|---|---|---:|---:|---:|\n`,
);

for (const file of files) {
  const level = JSON.parse(readFileSync(join(dir, file), "utf8")) as LadderLevel;
  const tier = tierByName(level.generator.targetTier as "late");
  const mode = tier.modeOfRecord as Mode;

  const asLevel: Level = {
    id: level.id,
    pool: level.pool,
    targets: level.targets,
    operators: {
      casual: level.modes.casual?.budget ?? {},
      normal: level.modes.normal?.budget ?? {},
      expert: level.modes.expert?.budget ?? {},
    },
    rules: level.rules,
  };

  const counted = countLines(asLevel, level.modes[mode]!.budget);
  const rate = counted.total === 0 ? 0 : counted.winning / counted.total;

  process.stdout.write(
    `| ${level.id} | ${level.curation.role} | ${mode} | ${counted.winning} | ${counted.total}${counted.truncated ? "+" : ""} | ${(rate * 100).toFixed(1)}% |\n`,
  );
}
