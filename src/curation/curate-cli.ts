import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scarcityOf, solve, type Level, type Mode } from "../solver/index.js";
import { curate, loadCorpus } from "./curate.js";
import { renderCurationReport } from "./report.js";

/**
 * Select and order the 40-level launch ladder.
 *
 *   npx vite-node src/curation/curate-cli.ts [corpusDir] [outDir]
 */
const corpusDir = process.argv[2] ?? "generated";
const outDir = process.argv[3] ?? "levels";

const corpus = loadCorpus(corpusDir);
const result = curate(corpusDir, "total", corpus);
// Same curation with the uniqueness term removed, so its effect on SELECTION
// (not just on the printed score) is measurable.
const withoutUniqueness = curate(corpusDir, "totalWithoutUniqueness", corpus);
const MODES: readonly Mode[] = ["casual", "normal", "expert"];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const failures: string[] = [];

for (const slot of result.ladder) {
  const source = slot.candidate.level;

  // Re-key to the ladder id and world (GDD §10 uses "1-04" form), keeping the
  // generated board and its solved budgets untouched.
  const level = {
    id: slot.id,
    world: slot.world,
    pool: source.pool,
    targets: source.targets,
    rules: source.rules,
    modes: source.modes,
    surplus: source.surplus,
    generator: source.generator,
    curation: {
      role: slot.role,
      slot: slot.slot,
      compositeScore: slot.breakdown.total,
      scoreInputs: slot.breakdown,
    },
  };

  // The ladder contract: all three modes, each actually playable.
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

  for (const mode of MODES) {
    const block = level.modes[mode];
    if (!block) {
      failures.push(`${level.id}: missing ${mode} mode`);
      continue;
    }
    const solved = solve(asLevel, block.budget, { collectFatalMoves: false, maxCollected: 1 });
    if (!solved.solvable) failures.push(`${level.id}: unsolvable under ${mode}`);
  }

  const expert = level.modes.expert;
  if (expert) {
    const path = solve(asLevel, expert.budget, { maxCollected: 1 }).winningPaths[0];
    const unary = path?.filter((m) => m.kind === "unary").length ?? 0;
    if (scarcityOf(expert.budget, level.targets.length, unary) !== "consumed") {
      failures.push(`${level.id}: expert budget is not consumed`);
    }
  }

  writeFileSync(join(outDir, `${slot.id}.json`), JSON.stringify(level, null, 2) + "\n");
}

writeFileSync(
  join(outDir, "ladder.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      filled: result.ladder.length,
      slots: result.ladder.map((s) => ({
        id: s.id,
        world: s.world,
        slot: s.slot,
        role: s.role,
        tier: s.candidate.tier.name,
        score: s.breakdown.total,
        sourceId: s.candidate.level.id,
        hash: s.candidate.level.generator.hash,
      })),
      unfilled: result.unfilled,
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(join(outDir, "CURATION.md"), renderCurationReport(result, withoutUniqueness));

process.stdout.write(
  `Curated ${result.ladder.length}/40 slots into ${outDir}/\n` +
    `Pools: ${[...result.poolSizes].map(([t, n]) => `${t}=${n}`).join(" ")}\n`,
);

if (result.unfilled.length > 0) {
  process.stdout.write(`\n${result.unfilled.length} unfilled:\n`);
  for (const slot of result.unfilled) {
    process.stdout.write(`  ${slot.id} (${slot.role}): ${slot.reason}\n`);
  }
}

if (failures.length > 0) {
  process.stdout.write(`\nMODE VERIFICATION FAILED:\n`);
  for (const failure of failures) process.stdout.write(`  ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `\nAll ${result.ladder.length} levels verified: Casual, Normal and Expert budgets all solvable, Expert consumed.\n`,
  );
}
