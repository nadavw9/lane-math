import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { applyMove, enumerate, enumerateTransforms, isWinnable, type Move } from "../solver/index.js";
import { DEFAULT_ECONOMY } from "../economy/config.js";
import { Economy } from "../economy/economy.js";
import { MemoryStore } from "../economy/save.js";
import { Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};

const load = (id: string): LadderLevel =>
  JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

/** Play any legal move until the lane stalls or the level is cleared. */
function playToEnd(director: Director, level: LadderLevel, start: ViewState): ViewState {
  let state = start;
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

  for (let guard = 0; guard < 24 && state.phase === "playing"; guard++) {
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

/**
 * Fail a level by preferring moves the solver marks fatal.
 *
 * Runs on 1-06 rather than 1-04: 1-04 is the scripted trap and warns in every
 * mode (GDD §7.5), so its fatal branch cannot be committed. 1-06 is the same
 * shape with the warning off — §7.4's "TEACH → TEST completed".
 */
const FAILABLE_LEVEL = "1-06";

function failLevel(director: Director): ViewState {
  const level = load(FAILABLE_LEVEL);
  const budget = level.modes.normal!.budget;
  const solverLevel = {
    id: level.id,
    pool: level.pool,
    targets: level.targets,
    operators: { casual: budget, normal: budget, expert: budget },
    rules: level.rules,
  };

  let state = stateOf(director.handle({ type: "loadLevel", id: FAILABLE_LEVEL }));

  for (let guard = 0; guard < 24 && state.phase === "playing"; guard++) {
    const live = state.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = state.targets[state.targetIndex];
    if (target === undefined) break;

    const options = enumerate(live, target, state.budget, level.rules);
    if (options.length === 0) break;

    // Prefer a move that loses the level, so the lane actually stalls.
    const fatal = options.find((option) => {
      const next = applyMove(
        { tiles: live, targetIndex: state.targetIndex, budget: state.budget },
        { ...option, kind: "binary", targetIndex: state.targetIndex },
      );
      return !isWinnable(solverLevel, state.budget, next);
    });
    const pick = fatal ?? options[0]!;

    state = stateOf(director.handle({ type: "tapTile", id: pick.leftId }));
    state = stateOf(director.handle({ type: "tapOperator", op: pick.op }));
    state = stateOf(director.handle({ type: "tapTile", id: pick.rightId }));
    state = stateOf(director.handle({ type: "tapCommit" }));
  }
  return state;
}

const T0 = 1_700_000_000_000;

describe("the failure counter survives an app kill, end to end", () => {
  it("fail, kill the process, reload — the counter and the star cap are intact", () => {
    const store = new MemoryStore();
    const level = load(FAILABLE_LEVEL);

    // --- session one: fail the level twice ---
    const first = new Director(level, "normal", new Economy(store, () => T0));
    let state = failLevel(first);
    expect(state.phase).toBe("failed");
    expect(state.failures).toBe(1);

    state = stateOf(first.handle({ type: "tapRestart" }));
    expect(state.failures).toBe(1); // survives restart (Phase 3 behaviour)
    state = failLevel(first);
    expect(state.failures).toBe(2);

    // --- kill: nothing in memory survives, only what reached the store ---
    const afterKill = MemoryStore.from(store.snapshot());

    // --- session two ---
    const second = new Director(level, "normal", new Economy(afterKill, () => T0));
    const reopened = stateOf(second.handle({ type: "loadLevel", id: FAILABLE_LEVEL }));

    expect(reopened.failures).toBe(2);
    // The exploit this guards (GDD §13): fail, force-quit, reopen, collect 3.
    expect(reopened.economy!.starsIfCleared).toBe(1);
  });

  it("a level cleared after two failures banks 1 star, and it survives a kill", () => {
    const store = new MemoryStore();
    const level = load("1-01"); // near-forced: always winnable

    const economy = new Economy(store, () => T0);
    economy.recordFailure("1-01");
    economy.recordFailure("1-01");

    const director = new Director(level, "normal", economy);
    let state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    expect(state.failures).toBe(2);

    state = playToEnd(director, level, state);
    expect(state.phase).toBe("won");
    expect(state.economy!.bestStars).toBe(1);

    const reopened = new Director(level, "normal", new Economy(MemoryStore.from(store.snapshot()), () => T0));
    expect(stateOf(reopened.handle({ type: "loadLevel", id: "1-01" })).economy!.bestStars).toBe(1);
  });

  it("clearing with no failures banks 3 stars", () => {
    const store = new MemoryStore();
    const level = load("1-01");
    const director = new Director(level, "normal", new Economy(store, () => T0));
    let state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    state = playToEnd(director, level, state);
    expect(state.phase).toBe("won");
    expect(state.economy!.bestStars).toBe(3);
    expect(state.economy!.totalStars).toBe(3);
  });
});

describe("lives attach to the existing fail/restart loop", () => {
  it("World 1 failures never cost a life", () => {
    const store = new MemoryStore();
    const economy = new Economy(store, () => T0);
    const director = new Director(load(FAILABLE_LEVEL), "normal", economy);

    const state = failLevel(director);
    expect(state.economy!.livesActive).toBe(false);
    expect(state.economy!.lives).toBe(DEFAULT_ECONOMY.maxLives);
  });

  it("the first failure on a fresh later level is exempt, the second is not", () => {
    const store = new MemoryStore();
    const economy = new Economy(store, () => T0);

    const first = economy.recordFailure("3-05");
    expect(first.lifeSpent).toBe(false);
    expect(first.firstFailureExempt).toBe(true);
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);

    const second = economy.recordFailure("3-05");
    expect(second.lifeSpent).toBe(true);
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives - 1);
  });

  it("a replay resets the counter only for a cleared level", () => {
    const store = new MemoryStore();
    const level = load("1-01");
    const economy = new Economy(store, () => T0);
    const director = new Director(level, "normal", economy);

    let state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    state = playToEnd(director, level, state);
    expect(state.phase).toBe("won");

    economy.recordFailure("1-01");
    expect(economy.progressFor("1-01").failCount).toBe(1);

    state = stateOf(director.replay());
    expect(state.failures).toBe(0);
    expect(state.economy!.bestStars).toBe(3); // best is never lowered
  });
});
