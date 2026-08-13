import { describe, expect, it } from "vitest";

import { analyse, solve, DEFAULT_RULES, type Level } from "../solver/index.js";
import { casualBudget, distinctUsages, solveExpertBudget } from "./budgets.js";
import { construct } from "./construct.js";
import { enumerate, makePool } from "../solver/index.js";
import { makeRng } from "./rng.js";
import { tierByName } from "./tiers.js";

/**
 * Not an assertion suite — a stopwatch. Phase 1/2 verification is the test
 * suite, so timing evidence lives here rather than in a throwaway script.
 * Kept cheap enough to run with everything else.
 */
describe("where generation time goes on an expert-shaped board", () => {
  it("attributes cost per stage", () => {
    const tier = tierByName("expert");
    const rng = makeRng(4242);
    const casual = casualBudget(tier);
    const count = (pool: readonly number[], target: number): number =>
      enumerate(makePool(pool), target, casual, DEFAULT_RULES).length;

    const timings: Record<string, number> = {
      construct: 0,
      casualSolve: 0,
      distinctUsages: 0,
      expertBudget: 0,
      analyse: 0,
    };
    let surviving = 0;
    let pathTotal = 0;
    let usageTotal = 0;

    for (let i = 0; i < 60; i++) {
      let t = performance.now();
      const built = construct(tier, rng, "directed", count);
      timings.construct! += performance.now() - t;
      if (!built) continue;

      const level: Level = {
        id: `p${i}`,
        pool: built.pool,
        targets: built.targets,
        operators: { casual, normal: casual, expert: casual },
        rules: DEFAULT_RULES,
      };

      t = performance.now();
      const result = solve(level, casual, { maxCollected: 4000 });
      timings.casualSolve! += performance.now() - t;
      if (!result.solvable) continue;
      surviving++;
      pathTotal += result.winningPaths.length;

      t = performance.now();
      const usages = distinctUsages(result.winningPaths);
      timings.distinctUsages! += performance.now() - t;
      usageTotal += usages.length;

      t = performance.now();
      solveExpertBudget(level, usages, true);
      timings.expertBudget! += performance.now() - t;

      t = performance.now();
      analyse(level, casual, { maxCollected: 4000, reuse: result });
      timings.analyse! += performance.now() - t;
    }

    const total = Object.values(timings).reduce((a, b) => a + b, 0);
    const lines = Object.entries(timings)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k.padEnd(16)} ${v.toFixed(0)}ms  ${((100 * v) / total).toFixed(1)}%`);

    console.log(
      `\nexpert-shaped, 60 constructions, ${surviving} solvable\n` +
        `  avg winning paths per solvable board: ${(pathTotal / Math.max(1, surviving)).toFixed(0)}\n` +
        `  avg distinct op usages:               ${(usageTotal / Math.max(1, surviving)).toFixed(1)}\n` +
        lines.join("\n"),
    );

    expect(total).toBeGreaterThan(0);
  });
});
