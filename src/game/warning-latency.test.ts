import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  applyMove,
  createWinnabilityCache,
  enumerate,
  isWinnable,
  makePool,
  type Level,
} from "../solver/index.js";
import type { LadderLevel } from "./types.js";

/**
 * GDD §13 Severity 3: "Measure solver latency on real low-end Android (Casual
 * runs it every commit); keep off the render thread."
 *
 * This is the desktop number, which is a lower bound rather than the answer —
 * but it establishes the order of magnitude and will catch a regression that
 * turns a memo lookup into a search.
 */
const load = (id: string): LadderLevel =>
  JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

describe("fatal-move warning latency", () => {
  it("stays well under a frame on the largest World 4 boards", () => {
    // The heaviest ladder levels: T=7, N=16.
    const ids = ["4-06", "4-07", "4-09", "4-10"];
    const rows: string[] = [];
    let worst = 0;

    for (const id of ids) {
      const level = load(id);
      const budget = level.modes.casual!.budget;
      const solverLevel: Level = {
        id,
        pool: level.pool,
        targets: level.targets,
        operators: { casual: budget, normal: budget, expert: budget },
        rules: level.rules,
      };

      const tiles = makePool(level.pool);
      const options = enumerate(tiles, level.targets[0]!, budget, level.rules);
      expect(options.length).toBeGreaterThan(0);

      // How the game actually calls it: one cache per level, and every option
      // at the current target pre-evaluated in the pause before the commit.
      const cache = createWinnabilityCache();
      const warmStart = performance.now();
      for (const option of options) {
        const next = applyMove(
          { tiles, targetIndex: 0, budget },
          { ...option, kind: "binary", targetIndex: 0 },
        );
        isWinnable(solverLevel, budget, next, cache);
      }
      const warm = performance.now() - warmStart;

      const samples: number[] = [];
      for (const option of options.slice(0, 8)) {
        const next = applyMove(
          { tiles, targetIndex: 0, budget },
          { ...option, kind: "binary", targetIndex: 0 },
        );
        const started = performance.now();
        isWinnable(solverLevel, budget, next, cache);
        samples.push(performance.now() - started);
      }

      // Drop the single worst sample so a GC/timer hitch on CI is not a fail.
      const ranked = [...samples].sort((a, b) => a - b);
      const p90 = ranked[Math.max(0, ranked.length - 2)]!;
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      worst = Math.max(worst, p90);
      rows.push(
        `  ${id}  T=${level.targets.length} N=${level.pool.length}  ` +
          `warm-up ${warm.toFixed(2)}ms (at load)  ` +
          `then mean ${mean.toFixed(3)}ms  p90 ${p90.toFixed(3)}ms  (${samples.length} commits)`,
      );
    }

    console.log(
      `\nfatal-move warning — isWinnable, cache warmed at level load\n${rows.join("\n")}`,
    );

    // A 60fps frame is 16.7ms. Cached lookup is sub-millisecond locally; CI
    // runners have seen ~3ms spikes that are not a search regression (a real
    // search on T=7 N=16 is tens of ms). Hold p90 under half a frame.
    expect(worst).toBeLessThan(8);
  });
});
