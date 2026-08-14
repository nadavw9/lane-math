import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { enumerate, enumerateTransforms, solve, type Move } from "../solver/index.js";
import { Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};

const load = (id: string): LadderLevel =>
  JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

/**
 * Replay a fatal branch, then keep playing legal moves until the lane stalls.
 *
 * A fatal move makes the level unwinnable, but GDD §4.1 does NOT fail on that —
 * failure fires only when the FRONT target cannot be produced. The gap between
 * the two is the entire design (trap depth), so a level is still "playing"
 * immediately after a fatal move and the test has to play on to reach the wall.
 */
function playThroughDirector(level: LadderLevel, path: readonly Move[]): ViewState {
  const director = new Director(level, "normal");
  let state = stateOf(director.handle({ type: "loadLevel", id: level.id }));

  const play = (move: Move): void => {
    if (move.kind === "unary") {
      state = stateOf(director.handle({ type: "tapUnary", op: move.op }));
      state = stateOf(director.handle({ type: "tapTile", id: move.tileId }));
      return;
    }
    state = stateOf(director.handle({ type: "tapTile", id: move.leftId }));
    state = stateOf(director.handle({ type: "tapOperator", op: move.op }));
    state = stateOf(director.handle({ type: "tapTile", id: move.rightId }));
    state = stateOf(director.handle({ type: "tapCommit" }));
  };

  for (const move of path) play(move);

  // Play on, any legal move, until the board offers nothing.
  for (let guard = 0; guard < 20 && state.phase === "playing"; guard++) {
    const live = state.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = state.targets[state.targetIndex];
    if (target === undefined) break;

    const decomps = enumerate(live, target, state.budget, level.rules);
    if (decomps[0]) {
      play({ ...decomps[0], kind: "binary", targetIndex: state.targetIndex });
      continue;
    }
    const transforms = enumerateTransforms(live, state.budget, level.rules);
    if (transforms[0]) {
      play({ ...transforms[0], kind: "unary", targetIndex: state.targetIndex });
      continue;
    }
    break;
  }
  return state;
}

describe("walking into a fatal branch always ends the level (GDD §4.1)", () => {
  // 1-04 is deliberately absent: it is the scripted trap and warns in every
  // mode (GDD §7.5), so its fatal branch is intercepted rather than committed.
  // 1-06 is the same structural shape with the warning off, which is exactly
  // where the lesson is meant to bite.
  const ids = ["4-03", "1-06", "2-10", "3-10", "4-10"];

  it.each(ids)("%s: every fatal branch the solver finds is failed by the Director", (id) => {
    const level = load(id);
    const budget = level.modes.normal!.budget;
    const result = solve(
      { id, pool: level.pool, targets: level.targets, operators: { casual: budget, normal: budget, expert: budget }, rules: level.rules },
      budget,
      { maxCollected: 40 },
    );

    const branches = result.fatalMoves.slice(0, 8);
    expect(branches.length).toBeGreaterThan(0);

    for (const branch of branches) {
      const state = playThroughDirector(level, [...branch.prefix, branch.move]);
      expect(
        state.phase,
        `${id}: played a fatal branch to exhaustion but phase is ${state.phase}`,
      ).toBe("failed");
    }
  });

  it("4-03: reaching front target 45 with a dead pool fails", () => {
    const level = load("4-03");
    const budget = level.modes.normal!.budget;
    const result = solve(
      {
        id: "4-03",
        pool: level.pool,
        targets: level.targets,
        operators: { casual: budget, normal: budget, expert: budget },
        rules: level.rules,
      },
      budget,
      { maxCollected: 200 },
    );

    // The report's board: three targets cleared, front target 45.
    const atTarget3 = result.fatalMoves.find(
      (f) => f.targetIndex === 3 || f.diesAtTargetIndex === 3,
    );
    if (!atTarget3) return; // nothing to reproduce on this budget

    const state = playThroughDirector(level, [...atTarget3.prefix, atTarget3.move]);
    expect(state.targets[state.targetIndex] ?? null).not.toBeNull();
    expect(state.phase).toBe("failed");
  });
});
