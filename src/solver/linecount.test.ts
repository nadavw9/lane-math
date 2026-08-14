import { describe, expect, it } from "vitest";

import { countLines } from "./solve.js";
import { solve } from "./solve.js";
import { analyse } from "./analyse.js";
import { CANONICAL } from "./__fixtures__/canonical.js";
import { DEFAULT_RULES, type Level } from "./types.js";

/**
 * countLines() and solve().winningPaths must agree on how many ways a level can
 * be won. They walk the tree differently — one counts terminal states, the
 * other collects prefixes — so a disagreement means one of them is wrong, and
 * `survivalRate` (GDD §8.4) is built on both.
 */
describe("countLines agrees with solve() on winning lines", () => {
  it("canonical level: one winning line out of the lines available", () => {
    const budget = CANONICAL.operators.casual;
    const counted = countLines(CANONICAL, budget);
    const solved = solve(CANONICAL, budget);

    expect(counted.winning).toBe(solved.winningPaths.length);
    expect(counted.winning).toBe(1);
    expect(counted.total).toBeGreaterThan(counted.winning);
    expect(counted.truncated).toBe(false);
  });

  it("counts every dead end as a line, not only the winning ones", () => {
    // 8 = 2x4 or 3+5; 3 = 1+2, 5-2 or 1x3; 15 = 3x5.
    // Winning: 2*4 -> 1+2 -> 3*5. Dead: 3+5 branch (2 continuations),
    // and 2*4 followed by 5-2 or 1*3.
    const counted = countLines(CANONICAL, CANONICAL.operators.casual);
    expect(counted.total).toBe(5);
    expect(counted.winning).toBe(1);
  });

  it("a forced level has exactly one line and a 100% survival rate", () => {
    const forced: Level = {
      id: "forced",
      pool: [1, 2, 3, 4],
      targets: [3, 7],
      operators: { casual: { "+": null }, normal: { "+": null }, expert: { "+": 2 } },
      rules: DEFAULT_RULES,
    };
    const counted = countLines(forced, "casual");
    expect(counted.winning).toBe(counted.total);
  });

  it("agrees with the solutionPaths metric analyse() reports", () => {
    const budget = CANONICAL.operators.casual;
    expect(countLines(CANONICAL, budget).winning).toBe(
      analyse(CANONICAL, budget).solutionPaths,
    );
  });

  /**
   * Regression: the legal-move cache was keyed by stateKey, a value-class
   * multiset. A pool with repeated values reaches one signature by consuming
   * different tiles, so the second state received moves naming ids it did not
   * hold — applyMove's id filter removed nothing and the pool never shrank.
   *
   * These boards repeat values heavily, which is exactly when two distinct
   * states collide on one value signature.
   */
  describe("legal moves are cached by tile id, not by value class", () => {
    const repeated: Level[] = [
      {
        id: "repeat-4s",
        pool: [4, 4, 4, 2, 6, 8],
        targets: [8, 6, 12],
        operators: {
          casual: { "+": null, "-": null, "*": null, "/": null },
          normal: { "+": null, "-": null, "*": null, "/": null },
          expert: { "+": null, "-": null, "*": null, "/": null },
        },
        rules: DEFAULT_RULES,
      },
      {
        id: "repeat-9s",
        pool: [9, 9, 9, 3, 1, 2, 6, 4],
        targets: [12, 10, 3, 10],
        operators: {
          casual: { "+": null, "-": null, "*": null, "/": null },
          normal: { "+": null, "-": null, "*": null, "/": null },
          expert: { "+": null, "-": null, "*": null, "/": null },
        },
        rules: DEFAULT_RULES,
      },
    ];

    it.each(repeated)("$id: countLines and solve agree", (level) => {
      const counted = countLines(level, "casual");
      const solved = solve(level, "casual", { maxCollected: 500000 });
      expect(solved.truncated).toBe(false);
      expect(counted.winning).toBe(solved.winningPaths.length);
    });

    it.each(repeated)("$id: every winning path consumes two tiles per target", (level) => {
      // The symptom of the bug: a move whose ids are absent removes nothing,
      // so the pool stops shrinking while the queue advances.
      for (const path of solve(level, "casual", { maxCollected: 2000 }).winningPaths) {
        const binary = path.filter((m) => m.kind === "binary");
        const consumed = new Set<number>();
        for (const move of binary) {
          if (move.kind !== "binary") continue;
          expect(consumed.has(move.leftId), `${level.id} reused tile ${move.leftId}`).toBe(false);
          expect(consumed.has(move.rightId), `${level.id} reused tile ${move.rightId}`).toBe(false);
          consumed.add(move.leftId);
          consumed.add(move.rightId);
        }
        expect(consumed.size).toBe(2 * level.targets.length);
      }
    });
  });
});
