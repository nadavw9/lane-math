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
  type OperatorBudget,
} from "../solver/index.js";
import type { GeneratedLevel } from "./pipeline.js";

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

/** GDD §8.5: total budget is exactly `T + U`, U = unary transforms in the line. */
function totalBudget(budget: OperatorBudget): number | null {
  let total = 0;
  for (const value of Object.values(budget)) {
    if (value === null) return null;
    if (typeof value === "number") total += value;
  }
  return total;
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

    // --- GDD §10 shape ---
    for (const key of ["id", "world", "pool", "targets", "rules", "modes", "surplus"]) {
      if (!(key in published)) fail(`§10: missing top-level key "${key}"`);
    }
    if (!published.modes || Object.keys(published.modes).length === 0) {
      fail("§10: modes block is empty");
      continue;
    }
    if (!published.modes.casual) fail("§10: casual mode absent (should always exist)");

    const level: Level = {
      id: published.id,
      pool: published.pool,
      targets: published.targets,
      // Solver still takes a per-mode budget map; absent modes fall back to
      // casual so a partially-offered level can still be solved per mode below.
      operators: {
        casual: published.modes.casual?.budget ?? {},
        normal: published.modes.normal?.budget ?? published.modes.casual?.budget ?? {},
        expert: published.modes.expert?.budget ?? published.modes.casual?.budget ?? {},
      },
      rules: published.rules,
    };

    try {
      validateLevel(level);
    } catch (error) {
      fail(`validateLevel: ${(error as Error).message}`);
      continue;
    }

    // GDD §3.1: N = 2T + S.
    const surplus = published.pool.length - 2 * published.targets.length;
    if (surplus !== published.surplus) {
      fail(`surplus ${published.surplus} but pool implies ${surplus}`);
    }

    for (const mode of MODES) {
      const block = published.modes[mode];
      if (!block) continue; // §10: a mode may legitimately be absent.

      // Every offered mode must actually be playable under its own budget.
      const result = solve(level, block.budget, { maxCollected: 4000 });
      if (!result.solvable) {
        fail(`unsolvable under ${mode}`);
        continue;
      }

      // GDD §8.5: Expert is consumed, total budget exactly T + U.
      if (mode === "expert") {
        const unary = result.winningPaths[0]!.filter((m) => m.kind === "unary").length;
        if (scarcityOf(block.budget, published.targets.length, unary) !== "consumed") {
          fail("expert budget is not consumed");
        }
        const total = totalBudget(block.budget);
        const expected = published.targets.length + unary;
        if (total !== expected) {
          fail(`expert budget totals ${total}, expected T+U = ${expected}`);
        }
        if (block.metrics.solutionPaths !== 1) {
          fail(`expert solutionPaths ${block.metrics.solutionPaths}, expected 1`);
        }
      }

      // GDD §13: keystone uniqueness against the STARTING pool.
      const tiles = makePool(published.pool);
      for (const index of block.metrics.keystones) {
        const count = enumerate(tiles, published.targets[index]!, block.budget, published.rules)
          .length;
        if (count !== 1) {
          fail(`${mode} keystone ${index} has ${count} dStart decompositions, not 1`);
        }
      }

      // Published metrics must reproduce from the level alone.
      const fresh = analyse(level, block.budget, { reuse: result });
      const same = (label: string, a: number, b: number): void => {
        if (a !== b) fail(`${mode} ${label} published ${a}, recomputed ${b}`);
      };
      same("decisionPoints", block.metrics.decisionPoints, fresh.decisionPoints);
      same("lookaheadDistance", block.metrics.lookaheadDistance, fresh.lookaheadDistance);
      same(
        "overlappingKeystonePairs",
        block.metrics.overlappingKeystonePairs,
        fresh.overlappingKeystonePairs,
      );
      if (block.metrics.dStart.join(",") !== fresh.dStart.join(",")) {
        fail(`${mode} dStart does not reproduce`);
      }
      if (block.metrics.dPath.join(",") !== fresh.dPath.join(",")) {
        fail(`${mode} dPath does not reproduce`);
      }

      // GDD §8.4: decisionPoints counts dPath >= 2, never dStart.
      const fromPath = block.metrics.dPath.filter((d) => d >= 2).length;
      if (block.metrics.decisionPoints !== fromPath) {
        fail(
          `${mode} decisionPoints ${block.metrics.decisionPoints} does not match dPath (${fromPath})`,
        );
      }
      // dPath >= 1 everywhere: the intended move is always among those counted.
      if (block.metrics.dPath.some((d) => d < 1)) {
        fail(`${mode} dPath contains a zero — intended line is not playable`);
      }
    }
  }

  return { checked, failures };
}
