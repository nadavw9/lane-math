import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { analyse, countLines, scarcityOf, solve, type Level, type Mode } from "../solver/index.js";
import { bandAgainst } from "../generator/pipeline.js";
import { LAUNCH_TIERS, tierByName, type TierName } from "../generator/tiers.js";

/**
 * Re-derive every ladder level from disk under the CURRENT solver and compare
 * against what was published.
 *
 * Written after a legal-move cache keyed by value class was found to corrupt
 * states on boards with repeated tile values. Anything measured before that fix
 * is suspect, so the question is not "did curation pick well" but "are these
 * levels valid at all".
 *
 *   npx vite-node src/curation/verify-ladder-cli.ts [levelsDir]
 */
const dir = process.argv[2] ?? "levels";
const MODES: readonly Mode[] = ["casual", "normal", "expert"];

const files = readdirSync(dir)
  .filter((f) => /^\d-\d\d\.json$/.test(f))
  .sort();

let unsolvable = 0;
let outOfBand = 0;
let metricDrift = 0;
const driftRows: string[] = [];

for (const file of files) {
  const j = JSON.parse(readFileSync(join(dir, file), "utf8"));
  /*
   * Band by the SLOT, not by where the board was born.
   *
   * This read `j.generator.targetTier`, which is provenance: the tier the
   * generator was aiming at. That agreed with the slot only because no board
   * had ever moved between worlds. The moment two Late boards were promoted
   * into World 4 and two World 4 boards took their place in World 3, the
   * verifier banded four correctly-placed levels against the wrong table and
   * reported two of them out of band.
   *
   * §7.2 maps worlds to tiers, and 1-01 is the one slot with its own tier
   * (§7.4's near-forced board), so it is named rather than derived.
   */
  const slotTier: TierName =
    j.id === "1-01"
      ? "tutorial-forced"
      : (LAUNCH_TIERS.find((t) => t.ladderWorld === j.world)?.name ?? (j.generator.targetTier as TierName));
  const tier = tierByName(slotTier);
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

  for (const mode of MODES) {
    const block = j.modes[mode];
    if (!block) continue;
    if (!solve(asLevel, block.budget, { collectFatalMoves: false, maxCollected: 1 }).solvable) {
      unsolvable++;
      driftRows.push(`${j.id} UNSOLVABLE under ${mode}`);
    }
  }

  const expertUnary =
    solve(asLevel, j.modes.expert.budget, { maxCollected: 1 }).winningPaths[0]?.filter(
      (m) => m.kind === "unary",
    ).length ?? 0;
  if (scarcityOf(j.modes.expert.budget, j.targets.length, expertUnary) !== "consumed") {
    driftRows.push(`${j.id} expert budget no longer consumed`);
  }

  /*
   * §8.5 (amended): Normal holds the same exact contract as Expert, so it needs
   * the same gate — and it needs `U`, not the two-argument form. Without the
   * unary count this verifies only that the binary ops sum to T and passes a
   * budget granting more transforms than the line performs.
   *
   * A level failing here is excluded from Normal, and §10 makes all three modes
   * mandatory on the curated 40 — so this is a ladder failure, not a note.
   */
  const normalUnary =
    solve(asLevel, j.modes.normal.budget, { maxCollected: 1 }).winningPaths[0]?.filter(
      (m) => m.kind === "unary",
    ).length ?? 0;
  if (scarcityOf(j.modes.normal.budget, j.targets.length, normalUnary) !== "consumed") {
    driftRows.push(`${j.id} normal budget is not exact (§8.5)`);
  }

  const mode = tier.modeOfRecord;
  const fresh = analyse(asLevel, j.modes[mode].budget, { maxCollected: 500000 });
  const stored = j.modes[mode].metrics;

  const changes: string[] = [];
  if (fresh.decisionPoints !== stored.decisionPoints) {
    changes.push(`dPoints ${stored.decisionPoints}->${fresh.decisionPoints}`);
  }
  if (fresh.lookaheadDistance !== stored.lookaheadDistance) {
    changes.push(`lookahead ${stored.lookaheadDistance}->${fresh.lookaheadDistance}`);
  }
  if (fresh.keystones.length !== stored.keystones.length) {
    changes.push(`keystones ${stored.keystones.length}->${fresh.keystones.length}`);
  }
  if (fresh.maxTrapDepth !== stored.maxTrapDepth) {
    changes.push(`trapDepth ${stored.maxTrapDepth}->${fresh.maxTrapDepth}`);
  }
  if (fresh.solutionPaths !== stored.solutionPaths) {
    changes.push(`paths ${stored.solutionPaths}->${fresh.solutionPaths}`);
  }

  const band = bandAgainst(fresh, tier);
  if (band.length > 0) {
    outOfBand++;
    changes.push(`OUT OF BAND: ${band.join("; ")}`);
  }

  if (changes.length > 0) {
    metricDrift++;
    const counted = countLines(asLevel, j.modes[mode].budget);
    driftRows.push(
      `${j.id} (${mode})  ${changes.join("  ")}   survival ${((100 * counted.winning) / counted.total).toFixed(1)}%`,
    );
  }
}

process.stdout.write(
  `Checked ${files.length} ladder levels under the current solver\n` +
    `  unsolvable in some mode : ${unsolvable}\n` +
    `  out of tier band        : ${outOfBand}\n` +
    `  metric drift            : ${metricDrift}\n\n`,
);
for (const row of driftRows) process.stdout.write(`  ${row}\n`);
