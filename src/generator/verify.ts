import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  analyse,
  enumerate,
  makePool,
  scarcityOf,
  solve,
  validateLevel,
  type Level,
  type Mode,
} from "../solver/index.js";
import type { GeneratedLevel } from "./pipeline.js";
import { tierByName } from "./tiers.js";

/**
 * Re-verify the artifacts on disk, from disk.
 *
 * The generator asserting its own output is worth little — it would be checking
 * the same in-memory objects it just built. This reloads every written JSON and
 * re-derives everything from the level's own declared pool, targets and
 * budgets. A level that fails here is a level that would ship broken.
 */
export interface VerifyFailure {
  readonly id: string;
  readonly problem: string;
}

export interface VerifyResult {
  readonly checked: number;
  readonly failures: readonly VerifyFailure[];
}

const MODES: readonly Mode[] = ["casual", "normal", "expert"];

function findJson(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...findJson(path));
    else if (entry.endsWith(".json") && entry.startsWith("gen-")) out.push(path);
  }
  return out;
}

export function verifyGenerated(outDir: string): VerifyResult {
  const failures: VerifyFailure[] = [];
  let checked = 0;

  let files: string[];
  try {
    files = findJson(outDir);
  } catch {
    return { checked: 0, failures: [] };
  }

  for (const file of files) {
    const published = JSON.parse(readFileSync(file, "utf8")) as GeneratedLevel;
    const fail = (problem: string): void => {
      failures.push({ id: published.id, problem });
    };
    checked++;

    const level: Level = {
      id: published.id,
      pool: published.pool,
      targets: published.targets,
      operators: published.operators,
      rules: published.rules,
    };

    try {
      validateLevel(level);
    } catch (error) {
      fail(`validateLevel: ${(error as Error).message}`);
      continue;
    }

    // The central constraint, checked against the shipped budgets.
    for (const mode of MODES) {
      if (!solve(level, mode, { collectFatalMoves: false, maxCollected: 1 }).solvable) {
        fail(`unsolvable under ${mode}`);
      }
    }

    const tier = tierByName(published.tier);

    // GDD §6: the Expert budget must actually be consumed.
    if (scarcityOf(published.operators.expert, published.targets.length) !== "consumed") {
      fail("expert budget is not consumed");
    }

    // GDD §3.1: N = 2T + S.
    const surplus = published.pool.length - 2 * published.targets.length;
    if (surplus !== published.metrics.surplus) {
      fail(`surplus ${published.metrics.surplus} but pool implies ${surplus}`);
    }

    // GDD §13: keystone uniqueness against the STARTING pool.
    const tiles = makePool(published.pool);
    const budget = published.operators[tier.modeOfRecord];
    for (const index of published.metrics.keystones) {
      const count = enumerate(tiles, published.targets[index]!, budget, published.rules).length;
      if (count !== 1) fail(`keystone ${index} has ${count} decompositions, not 1`);
    }

    // Published metrics must reproduce.
    const fresh = analyse(level, tier.modeOfRecord);
    if (fresh.lookaheadDistance !== published.metrics.lookaheadDistance) {
      fail(
        `lookahead ${published.metrics.lookaheadDistance} does not reproduce (${fresh.lookaheadDistance})`,
      );
    }
    if (fresh.decisionPoints !== published.metrics.decisionPoints) {
      fail(
        `decisionPoints ${published.metrics.decisionPoints} does not reproduce (${fresh.decisionPoints})`,
      );
    }
    if (fresh.keystones.join(",") !== published.metrics.keystones.join(",")) {
      fail(`keystones ${published.metrics.keystones.join(",")} do not reproduce`);
    }
    if (tier.uniqueSolution && fresh.solutionPaths !== 1) {
      fail(`expert tier requires a unique solution, found ${fresh.solutionPaths}`);
    }
  }

  return { checked, failures };
}
