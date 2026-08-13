import { describe, expect, it } from "vitest";

import {
  analyse,
  enumerate,
  makePool,
  scarcityOf,
  solve,
  DEFAULT_RULES,
  type Level,
  type Mode,
} from "../solver/index.js";
import { CANONICAL } from "../solver/__fixtures__/canonical.js";
import { casualBudget, distinctUsages, solveExpertBudget, usageOf } from "./budgets.js";
import { construct } from "./construct.js";
import { addDecoys } from "./decoys.js";
import { attempt, bandAgainst, hashBoard, type AttemptContext } from "./pipeline.js";
import { makeRng } from "./rng.js";
import { runTier, DEFAULT_OPTIONS } from "./run.js";
import { TIERS, tierByName } from "./tiers.js";
import { naturalness, peakTemptation, scoreTraps, TEMPTATION_THRESHOLD } from "./temptation.js";

describe("temptation scoring (GDD §13, Severity 2)", () => {
  it("rates + above * above - above /", () => {
    const base = { kind: "binary", left: 3, right: 4, result: 7, leftId: 0, rightId: 1, targetIndex: 0 } as const;
    const score = (op: "+" | "*" | "-" | "/") => naturalness({ ...base, op });
    expect(score("+")).toBeGreaterThan(score("*"));
    expect(score("*")).toBeGreaterThan(score("-"));
    expect(score("-")).toBeGreaterThan(score("/"));
  });

  it("rates smaller operands as more natural", () => {
    const at = (left: number, right: number) =>
      naturalness({
        kind: "binary",
        op: "+",
        left,
        right,
        result: left + right,
        leftId: 0,
        rightId: 1,
        targetIndex: 0,
      });
    expect(at(2, 3)).toBeGreaterThan(at(8, 9));
  });

  it("the canonical level's trap clears the threshold", () => {
    // 3+5=8 (fatal) against 2*4=8 (correct) is the archetype the whole design
    // is built on. If the scoring rejects it, the scoring is wrong.
    const budget = CANONICAL.operators.casual;
    const result = solve(CANONICAL, budget);
    const metrics = analyse(CANONICAL, budget);
    const operands = new Set(metrics.keystoneDetail.flatMap((k) => k.operands));
    const traps = scoreTraps(result, operands);

    const headline = traps.find((t) => t.fatal === "3 + 5 = 8");
    expect(headline).toBeDefined();
    expect(headline!.correct).toBe("2 * 4 = 8");
    expect(headline!.stealsKeystoneOperand).toBe(true);
    expect(peakTemptation(traps)).toBeGreaterThanOrEqual(TEMPTATION_THRESHOLD);
  });
});

describe("dedupe (GDD §13)", () => {
  it("hashes pool order-independently but target order-dependently", () => {
    expect(hashBoard([1, 2, 3], [8, 3])).toBe(hashBoard([3, 2, 1], [8, 3]));
    expect(hashBoard([1, 2, 3], [8, 3])).not.toBe(hashBoard([1, 2, 3], [3, 8]));
  });
});

describe("decoys (GDD §3.1)", () => {
  const rng = makeRng(1);

  it("rejects inert values and reports how many it threw out", () => {
    // Targets reachable only by huge values mean most decoys create nothing.
    const outcome = addDecoys([1, 2], [3], 1, tierByName("tutorial"), { "+": null }, DEFAULT_RULES, rng);
    if (outcome) {
      expect(outcome.decoys[0]!.newDecompositions).toBeGreaterThan(0);
    }
    // Whatever the roll, no accepted decoy is ever inert.
    expect(outcome?.decoys.every((d) => d.newDecompositions > 0) ?? true).toBe(true);
  });

  it("every accepted decoy opens at least one new reading", () => {
    const pool = [1, 2, 2, 3, 4, 5];
    const targets = [8, 3, 15];
    const budget = casualBudget(tierByName("mid"));
    const outcome = addDecoys(pool, targets, 2, tierByName("mid"), budget, DEFAULT_RULES, rng);
    expect(outcome).not.toBeNull();
    for (const decoy of outcome!.decoys) {
      expect(decoy.newDecompositions).toBeGreaterThan(0);
      expect(decoy.affectedTargets.length).toBeGreaterThan(0);
    }
  });
});

describe("budgets are solved for, never authored", () => {
  it("a consumed budget derived from a winning line sums to T", () => {
    const result = solve(CANONICAL, CANONICAL.operators.casual);
    const usage = usageOf(result.winningPaths[0]!);
    const total = [...usage.binary.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(CANONICAL.targets.length);
  });

  it("derives an Expert budget the canonical level can actually be solved under", () => {
    // Last session's finding: GDD §10's published expert block cannot be
    // solved. A derived one can.
    const casual = CANONICAL.operators.casual;
    const usages = distinctUsages(solve(CANONICAL, casual).winningPaths);
    const outcome = solveExpertBudget(CANONICAL, usages, true);

    expect(outcome.chosen).not.toBeNull();
    expect(scarcityOf(outcome.chosen!.budget, CANONICAL.targets.length)).toBe("consumed");
    expect(solve(CANONICAL, outcome.chosen!.budget).solvable).toBe(true);
    expect(outcome.chosen!.solutionPaths).toBe(1);

    // And confirm the published one still is not solvable.
    expect(solve(CANONICAL, CANONICAL.operators.expert).solvable).toBe(false);
  });
});

describe("banding", () => {
  it("passes the canonical level against no tier it does not fit", () => {
    const metrics = analyse(CANONICAL, CANONICAL.operators.casual);
    // T=3, S=0, lookahead 2, decisionPoints 2 — tutorial wants lookahead 1.
    expect(bandAgainst(metrics, tierByName("tutorial"))).toContain("lookahead 2");
    // Early wants lookahead 1-2 and decisionPoints 1-2: it fits.
    expect(bandAgainst(metrics, tierByName("early"))).toEqual([]);
  });
});

describe("the central constraint — accepted levels are valid in all three modes", () => {
  const modes: Mode[] = ["casual", "normal", "expert"];

  // Fast tiers only. Late and Expert take seconds per accepted level, so their
  // integrity is checked by verifyGenerated() against the artifacts the CLI
  // actually wrote — which is the stronger check anyway.
  const sample = ["tutorial", "early", "mid"].flatMap((name) =>
    runTier(tierByName(name as "tutorial"), "directed", {
      ...DEFAULT_OPTIONS,
      attemptsPerTier: 600,
      targetAccepted: 3,
      tiers: TIERS,
    }).levels,
  );

  it("produced at least one level to check", () => {
    expect(sample.length).toBeGreaterThan(0);
  });

  const asLevel = (level: (typeof sample)[number]): Level => ({
    id: level.id,
    pool: level.pool,
    targets: level.targets,
    operators: {
      casual: level.modes.casual?.budget ?? {},
      normal: level.modes.normal?.budget ?? {},
      expert: level.modes.expert?.budget ?? {},
    },
    rules: level.rules,
  });

  it("every mode a level offers is solvable under that mode's own budget", () => {
    for (const level of sample) {
      for (const mode of modes) {
        const block = level.modes[mode];
        if (!block) continue; // GDD §10: a mode may legitimately be absent.
        expect(
          solve(asLevel(level), block.budget).solvable,
          `${level.id} unsolvable in ${mode}`,
        ).toBe(true);
      }
    }
  });

  it("always offers casual", () => {
    for (const level of sample) {
      expect(level.modes.casual, level.id).toBeDefined();
    }
  });

  it("every offered mode's published metrics reproduce from a fresh analyse()", () => {
    for (const level of sample) {
      for (const mode of modes) {
        const block = level.modes[mode];
        if (!block) continue;
        const fresh = analyse(asLevel(level), block.budget);
        const where = `${level.id}/${mode}`;
        expect(fresh.lookaheadDistance, where).toBe(block.metrics.lookaheadDistance);
        expect(fresh.decisionPoints, where).toBe(block.metrics.decisionPoints);
        expect(fresh.solutionPaths, where).toBe(block.metrics.solutionPaths);
        expect([...fresh.keystones], where).toEqual([...block.metrics.keystones]);
        expect([...fresh.dStart], where).toEqual([...block.metrics.dStart]);
        expect([...fresh.dPath], where).toEqual([...block.metrics.dPath]);
      }
    }
  });

  it("decisionPoints is computed from dPath, not dStart (GDD §8.4)", () => {
    for (const level of sample) {
      for (const mode of modes) {
        const block = level.modes[mode];
        if (!block) continue;
        const fromPath = block.metrics.dPath.filter((d) => d >= 2).length;
        expect(block.metrics.decisionPoints, `${level.id}/${mode}`).toBe(fromPath);
        expect(block.metrics.dPath.every((d) => d >= 1), `${level.id}/${mode}`).toBe(true);
      }
    }
  });

  it("every accepted level satisfies N = 2T + S with S inside the tier band", () => {
    for (const level of sample) {
      const tier = tierByName(level.generator.targetTier);
      const surplus = level.pool.length - 2 * level.targets.length;
      expect(surplus, level.id).toBe(level.surplus);
      expect(surplus, level.id).toBeGreaterThanOrEqual(tier.surplus.min);
      expect(surplus, level.id).toBeLessThanOrEqual(tier.surplus.max);
    }
  });

  it("every accepted level has a positive-integer pool and integer targets", () => {
    for (const level of sample) {
      for (const value of level.pool) {
        expect(Number.isInteger(value) && value > 0, `${level.id} pool ${value}`).toBe(true);
      }
      for (const target of level.targets) {
        expect(Number.isInteger(target) && target > 0, `${level.id} target ${target}`).toBe(true);
      }
    }
  });

  it("every offered Expert budget is consumed and totals T + U", () => {
    for (const level of sample) {
      const block = level.modes.expert;
      if (!block) continue;
      const path = solve(asLevel(level), block.budget).winningPaths[0]!;
      const unary = path.filter((m) => m.kind === "unary").length;
      expect(
        scarcityOf(block.budget, level.targets.length, unary),
        `${level.id} expert budget`,
      ).toBe("consumed");

      const total = Object.values(block.budget).reduce<number>((a, b) => a + (b ?? 0), 0);
      expect(total, `${level.id} expert budget total`).toBe(level.targets.length + unary);
    }
  });

  it("keystones have exactly one dStart decomposition", () => {
    for (const level of sample) {
      const tier = tierByName(level.generator.targetTier);
      const block = level.modes[tier.modeOfRecord];
      if (!block) continue;
      const tiles = makePool(level.pool);
      for (const index of block.metrics.keystones) {
        const decomps = enumerate(tiles, level.targets[index]!, block.budget, level.rules);
        expect(decomps.length, `${level.id} keystone ${index}`).toBe(1);
      }
    }
  });

  it("emits every key GDD §10 specifies", () => {
    for (const level of sample) {
      for (const key of ["id", "world", "pool", "targets", "rules", "modes", "surplus"] as const) {
        expect(level[key], `${level.id} missing ${key}`).toBeDefined();
      }
      for (const mode of modes) {
        const block = level.modes[mode];
        if (!block) continue;
        expect(block.budget, `${level.id}/${mode} budget`).toBeDefined();
        expect(block.metrics, `${level.id}/${mode} metrics`).toBeDefined();
        expect(block, `${level.id}/${mode} tier`).toHaveProperty("tier");
      }
    }
  });
});

describe("construction samples inside the legal range", () => {
  // Regression: buildPair used to roll operands freely and discard results that
  // did not fit, which threw away ~70% of attempts at the top tiers before any
  // design rule ran — and made the measured yield an artefact of the sampler.
  it.each(["tutorial", "early", "mid", "late", "expert"] as const)(
    "%s wastes almost no attempts on construction misses",
    (name) => {
      const tier = tierByName(name);
      const rng = makeRng(31337);
      const casual = casualBudget(tier);
      const count = (pool: readonly number[], target: number): number =>
        enumerate(makePool(pool), target, casual, DEFAULT_RULES).length;

      let misses = 0;
      const trials = 400;
      for (let i = 0; i < trials; i++) {
        if (!construct(tier, rng, "random", count)) misses++;
      }
      expect(misses / trials, `${name} construction miss rate`).toBeLessThan(0.05);
    },
  );

  it("never emits a target above the tier ceiling or a non-positive pool value", () => {
    for (const tier of TIERS) {
      const rng = makeRng(777);
      const casual = casualBudget(tier);
      const count = (pool: readonly number[], target: number): number =>
        enumerate(makePool(pool), target, casual, DEFAULT_RULES).length;

      for (let i = 0; i < 200; i++) {
        const built = construct(tier, rng, "random", count);
        if (!built) continue;
        for (const target of built.targets) {
          expect(target, `${tier.name} target`).toBeGreaterThan(0);
          expect(target, `${tier.name} target`).toBeLessThanOrEqual(tier.targetMax);
        }
        for (const value of built.pool) {
          expect(Number.isInteger(value) && value > 0, `${tier.name} pool ${value}`).toBe(true);
        }
        expect(built.pool.length).toBe(2 * built.targets.length);
      }
    }
  });
});

describe("construction is backwards — a solution exists before anything is measured", () => {
  it("never emits a candidate that was accepted while unsolvable in casual", () => {
    const tier = tierByName("early");
    const ctx: AttemptContext = {
      tier,
      allTiers: TIERS,
      rng: makeRng(99),
      strategy: "random",
      seed: 99,
      seen: new Set(),
      rules: DEFAULT_RULES,
      maxCollected: 2000,
      temptationThreshold: TEMPTATION_THRESHOLD,
      requireAllModes: false,
    };
    for (let i = 0; i < 200; i++) {
      const outcome = attempt(ctx, i);
      if (!outcome.accepted) continue;
      const casualBlock = outcome.level.modes.casual!;
      const asLevel: Level = {
        id: outcome.level.id,
        pool: outcome.level.pool,
        targets: outcome.level.targets,
        operators: {
          casual: casualBlock.budget,
          normal: casualBlock.budget,
          expert: casualBlock.budget,
        },
        rules: outcome.level.rules,
      };
      expect(solve(asLevel, "casual").solvable).toBe(true);
    }
  });
});
