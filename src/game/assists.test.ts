import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Economy } from "../economy/economy.js";
import { applyMove, enumerate, isWinnable } from "../solver/index.js";
import { MemoryStore } from "../economy/save.js";
import { unlocksFor } from "../economy/unlocks.js";
import { Director, SCRIPTED_TRAP_LEVEL } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};
const rejection = (commands: readonly Command[]): string | null => {
  const r = commands.find((c) => c.type === "reject");
  return r && r.type === "reject" ? r.reason : null;
};

const load = (id: string): LadderLevel =>
  JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

const T0 = 1_700_000_000_000;
const freshEconomy = (store = new MemoryStore()) => new Economy(store, () => T0);

/**
 * 1-04's trap: 3 + 1 = 4 is correct arithmetic that spends the only + and takes
 * a 3, and target 9 can only be made as 3 + 6.
 */
function stageTrapMove(director: Director): ViewState {
  let state = stateOf(director.handle({ type: "loadLevel", id: SCRIPTED_TRAP_LEVEL }));
  const idOf = (value: number) => state.tiles.find((t) => t.value === value && !t.consumed)!.id;
  state = stateOf(director.handle({ type: "tapTile", id: idOf(3) }));
  state = stateOf(director.handle({ type: "tapOperator", op: "+" }));
  state = stateOf(director.handle({ type: "tapTile", id: idOf(1) }));
  return state;
}

/**
 * Every level below 3-10 is reached in Normal, because the mode selector does
 * not unlock until then (§7.6). So a Normal director needs an economy that has
 * actually reached the level, or `fatalWarning` is still locked and the test
 * measures the unlock rather than the mode.
 */
const economyAt = (id: string) => {
  const economy = freshEconomy();
  economy.recordClear(id);
  if (!unlocksFor(economy.state).fatalWarning) throw new Error(`economyAt(${id}) did not unlock the warning`);
  return economy;
};

interface Pick {
  readonly leftId: number;
  readonly rightId: number;
  readonly op: "+" | "-" | "*" | "/";
}

/**
 * Find a legal move at the current target that LOSES the level, using the
 * solver rather than a hand-picked tile.
 *
 * The test this replaces tapped `state.tiles[0]` and asserted no warning. That
 * passes whether or not the warning works, because an arbitrary tile is
 * usually not fatal and a single tap does not commit anything — the same
 * vacuous-green shape continue.test.ts was rewritten to kill. Returning null
 * here is asserted on, so a board that stops having a fatal move fails the
 * test instead of quietly satisfying it.
 */
function fatalMoveOn(state: ViewState, level: LadderLevel): Pick | null {
  const live = state.tiles
    .filter((t) => !t.consumed)
    .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
  const target = state.targets[state.targetIndex];
  if (target === undefined) return null;
  // The runtime check runs in a worker (WinnabilityService); the solver behind
  // it is synchronous, so the test asks the solver directly.
  const solverLevel = {
    id: level.id,
    pool: level.pool,
    targets: level.targets,
    operators: { casual: state.budget, normal: state.budget, expert: state.budget },
    rules: level.rules,
  };
  for (const d of enumerate(live, target, state.budget, level.rules)) {
    const after = applyMove(
      { tiles: live, targetIndex: state.targetIndex, budget: state.budget },
      { ...d, kind: "binary", targetIndex: state.targetIndex },
    );
    if (!isWinnable(solverLevel, state.budget, after)) {
      return { leftId: d.leftId, rightId: d.rightId, op: d.op };
    }
  }
  return null;
}

/** Any legal move at the current target, fatal or not. */
function anyMoveOn(state: ViewState, level: LadderLevel): Pick | null {
  const live = state.tiles
    .filter((t) => !t.consumed)
    .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
  const target = state.targets[state.targetIndex];
  if (target === undefined) return null;
  const d = enumerate(live, target, state.budget, level.rules)[0];
  return d ? { leftId: d.leftId, rightId: d.rightId, op: d.op } : null;
}

const commitMove = (director: Director, pick: Pick): ViewState => {
  director.handle({ type: "tapTile", id: pick.leftId });
  director.handle({ type: "tapOperator", op: pick.op });
  director.handle({ type: "tapTile", id: pick.rightId });
  return stateOf(director.handle({ type: "tapCommit" }));
};

describe("modes change assistance, not budget (GDD §6, amended)", () => {
  it("Normal warns on a fatal move — that is the whole difference from Expert", () => {
    const director = new Director(load("3-05"), "normal", economyAt("3-05"));
    const state = stateOf(director.handle({ type: "loadLevel", id: "3-05" }));
    const fatal = fatalMoveOn(state, load("3-05"));
    expect(fatal, "3-05 has a fatal move to warn about").not.toBeNull();
    const warned = commitMove(director, fatal!);
    expect(warned.warning).not.toBeNull();
    // §6: Normal's warning is a warning, not a block.
    expect(warned.warning!.overridable).toBe(true);
  });

  it("Casual BLOCKS the same move — it cannot be committed at all", () => {
    const director = new Director(load("3-05"), "casual", economyAt("3-05"));
    const state = stateOf(director.handle({ type: "loadLevel", id: "3-05" }));
    const fatal = fatalMoveOn(state, load("3-05"));
    const warned = commitMove(director, fatal!);
    expect(warned.warning!.overridable).toBe(false);
    // And the override is refused rather than silently ignored.
    const after = director.handle({ type: "commitAnyway" });
    expect(rejection(after)).not.toBeNull();
    expect(stateOf(after).phase).toBe("playing");
  });

  it("committing anyway in Normal loses the level normally — life, stars, §9.4 exit", () => {
    /*
     * THE POINT OF THE AMENDMENT. Blocking in Normal removed the failure state
     * outright: no failure meant no life lost, no star penalty and no §9.4
     * continue path, in the mode every player is in until 3-10. So this asserts
     * the ordinary failure machinery ran, not merely that the move went through.
     */
    const economy = economyAt("3-05");
    const director = new Director(load("3-05"), "normal", economy, undefined);
    let state = stateOf(director.handle({ type: "loadLevel", id: "3-05" }));
    const fatal = fatalMoveOn(state, load("3-05"));
    state = commitMove(director, fatal!);
    expect(state.warning!.overridable).toBe(true);

    state = stateOf(director.handle({ type: "commitAnyway" }));
    expect(state.warning, "the warning is gone once overridden").toBeNull();
    // §4.1: the move is legal, so the level is not lost until the FRONT target
    // becomes unmakeable. What must be true here is that the move COMMITTED.
    expect(state.targetIndex).toBe(1);

    // Play on to the wall the override walked into.
    for (let guard = 0; guard < 30 && state.phase === "playing"; guard++) {
      if (state.targets[state.targetIndex] === undefined) break;
      const next = fatalMoveOn(state, load("3-05")) ?? anyMoveOn(state, load("3-05"));
      if (!next) break;
      state = commitMove(director, next);
      if (state.warning) state = stateOf(director.handle({ type: "commitAnyway" }));
    }
    expect(state.phase, "the overridden move really does lose the level").toBe("failed");
    expect(state.failures).toBe(1);
    expect(state.exit, "§9.4's way out is offered").not.toBeNull();
  });

  it("going back after a warning takes the equation down and commits nothing", () => {
    const director = new Director(load("3-05"), "normal", economyAt("3-05"));
    let state = stateOf(director.handle({ type: "loadLevel", id: "3-05" }));
    const fatal = fatalMoveOn(state, load("3-05"));
    state = commitMove(director, fatal!);
    state = stateOf(director.handle({ type: "dismissWarning" }));
    expect(state.warning).toBeNull();
    expect(state.targetIndex).toBe(0);
    expect(state.slots.leftTileId).toBeNull();
    expect(state.tiles.every((t) => !t.consumed)).toBe(true);
  });

  it("1-4 stays a BLOCK in every mode — §7.5 is a teaching beat, not an assist", () => {
    for (const mode of ["casual", "normal", "expert"] as const) {
      const director = new Director(load(SCRIPTED_TRAP_LEVEL), mode, freshEconomy());
      stageTrapMove(director);
      const state = stateOf(director.handle({ type: "tapCommit" }));
      expect(state.warning!.overridable, `1-04 in ${mode}`).toBe(false);
    }
  });

  it("Expert does not warn on the same move", () => {
    const director = new Director(load("3-05"), "expert", economyAt("3-05"));
    const state = stateOf(director.handle({ type: "loadLevel", id: "3-05" }));
    const fatal = fatalMoveOn(state, load("3-05"));
    expect(commitMove(director, fatal!).warning).toBeNull();
  });

  it("Normal and Expert now hold the SAME budget — assistance is the only axis", () => {
    for (const id of ["1-01", "2-05", "3-10", "4-10"]) {
      const level = load(id);
      expect(level.modes.normal?.budget, `${id}`).toEqual(level.modes.expert?.budget);
      expect(level.modes.expert?.budget, `${id} has an expert budget at all`).toBeDefined();
    }
  });

  it("all three modes are offered on every ladder level (Phase 2 guarantee)", () => {
    for (const id of ["1-01", "2-05", "3-10", "4-10"]) {
      const level = load(id);
      expect(level.modes.casual, `${id} casual`).toBeDefined();
      expect(level.modes.normal, `${id} normal`).toBeDefined();
      expect(level.modes.expert, `${id} expert`).toBeDefined();
    }
  });

  it("the selected mode persists across a relaunch", () => {
    const store = new MemoryStore();
    const economy = freshEconomy(store);
    expect(economy.selectedMode).toBe("normal"); // default

    economy.selectMode("casual");
    const reopened = new Economy(MemoryStore.from(store.snapshot()), () => T0);
    expect(reopened.selectedMode).toBe("casual");
  });
});

describe("Casual's fatal-move warning (GDD §6)", () => {
  it("blocks a legal-but-fatal move and consumes nothing", () => {
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "casual", freshEconomy());
    let state = stageTrapMove(director);
    const liveBefore = state.tiles.filter((t) => !t.consumed).length;

    state = stateOf(director.handle({ type: "tapCommit" }));

    expect(state.warning).not.toBeNull();
    expect(state.phase).toBe("playing");
    expect(state.targetIndex).toBe(0); // the queue did not advance
    expect(state.tiles.filter((t) => !t.consumed).length).toBe(liveBefore);
    expect(state.failures).toBe(0); // no failure recorded
  });

  it("names the keystone it would have starved, and the tiles that make it", () => {
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "casual", freshEconomy());
    stageTrapMove(director);
    const state = stateOf(director.handle({ type: "tapCommit" }));

    // 1-04's keystone is target index 1 (value 9), made only by 3 + 6.
    expect(state.warning!.keystoneTarget).toBe(9);
    expect(state.warning!.line).toBe("Wait — what makes the 9?");
    const values = state.warning!.keystoneTileIds
      .map((id) => state.tiles.find((t) => t.id === id)!.value)
      .sort((a, b) => a - b);
    expect(values).toEqual([3, 6]);
  });

  it("dismissing rewinds free — no star, no life, no failure", () => {
    const economy = freshEconomy();
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "casual", economy);
    stageTrapMove(director);
    stateOf(director.handle({ type: "tapCommit" }));

    const state = stateOf(director.handle({ type: "dismissWarning" }));
    expect(state.warning).toBeNull();
    expect(state.phase).toBe("playing");
    expect(state.failures).toBe(0);
    expect(economy.progressFor(SCRIPTED_TRAP_LEVEL).failCount).toBe(0);
    expect(economy.lives).toBe(5);
    expect(state.slots.leftTileId).toBeNull(); // equation rewound
  });

  it("lets a safe move through untouched", () => {
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "casual", freshEconomy());
    let state = stateOf(director.handle({ type: "loadLevel", id: SCRIPTED_TRAP_LEVEL }));
    const idOf = (v: number) => state.tiles.find((t) => t.value === v && !t.consumed)!.id;

    // 9 - 5 = 4 is the safe opening.
    state = stateOf(director.handle({ type: "tapTile", id: idOf(9) }));
    state = stateOf(director.handle({ type: "tapOperator", op: "-" }));
    state = stateOf(director.handle({ type: "tapTile", id: idOf(5) }));
    state = stateOf(director.handle({ type: "tapCommit" }));

    expect(state.warning).toBeNull();
    expect(state.targetIndex).toBe(1);
  });
});

describe("the scripted trap at 1-4 (GDD §7.5)", () => {
  it("warns in EVERY mode, not just Casual", () => {
    for (const mode of ["casual", "normal", "expert"] as const) {
      const director = new Director(load(SCRIPTED_TRAP_LEVEL), mode, freshEconomy());
      stageTrapMove(director);
      const state = stateOf(director.handle({ type: "tapCommit" }));
      expect(state.warning, `1-04 in ${mode}`).not.toBeNull();
      expect(state.warning!.scripted, `1-04 in ${mode} is scripted`).toBe(true);
    }
  });

  it("1-6 repeats the shape with the warning OFF — that is where it is tested", () => {
    const director = new Director(load("1-06"), "normal", freshEconomy());
    let state = stateOf(director.handle({ type: "loadLevel", id: "1-06" }));
    expect(state.warning).toBeNull();

    // Commit anything legal; Normal must never intercept.
    const live = state.tiles.filter((t) => !t.consumed);
    state = stateOf(director.handle({ type: "tapTile", id: live[0]!.id }));
    expect(state.warning).toBeNull();
  });

  it("1-6 keeps the warning off in EVERY mode, not just Expert", () => {
    // §7.4's TEST beat is a per-level rule. Once Normal warns it is the only
    // thing standing between the amendment and a destroyed teaching beat, and
    // Normal is the mode every player is in at 1-6 (§7.6: selector at 3-10).
    for (const mode of ["casual", "normal", "expert"] as const) {
      const director = new Director(load("1-06"), mode, economyAt("1-06"));
      let state = stateOf(director.handle({ type: "loadLevel", id: "1-06" }));
      const live = state.tiles.filter((t) => !t.consumed);
      state = stateOf(director.handle({ type: "tapTile", id: live[0]!.id }));
      expect(state.warning, `1-06 in ${mode}`).toBeNull();
    }
  });

  it("the warning does not exist before 1-4 introduces it (§7.6)", () => {
    // A fresh save has not reached 1-4, so the device is not unlocked yet.
    const director = new Director(load("1-03"), "normal", freshEconomy());
    let state = stateOf(director.handle({ type: "loadLevel", id: "1-03" }));
    const live = state.tiles.filter((t) => !t.consumed);
    state = stateOf(director.handle({ type: "tapTile", id: live[0]!.id }));
    expect(state.warning).toBeNull();
  });
});

describe("hints (GDD §5.4, §13)", () => {
  const withStars = (stars: number) => {
    const store = new MemoryStore();
    const economy = freshEconomy(store);
    for (let i = 0; i < stars / 3; i++) economy.recordClear(`1-0${i + 1}`);
    return { economy, store };
  };

  it("never charges for a hint that would render nothing", () => {
    const { economy } = withStars(9);
    const spentBefore = economy.state.starsSpent;
    // 1-01 is near-forced: every move is the only move, so branch elimination
    // has no fatal option to strike out.
    const director = new Director(load("1-01"), "normal", economy);
    stateOf(director.handle({ type: "loadLevel", id: "1-01" }));

    const out = director.handle({ type: "buyHint", hint: "branch" });
    expect(rejection(out)).toContain("nothing to reveal");
    expect(economy.state.starsSpent).toBe(spentBefore);
    expect(economy.hintsPurchased("1-01")).not.toContain("branch");
  });

  it("costs stars and refuses when unaffordable", () => {
    const economy = freshEconomy();
    const director = new Director(load("3-05"), "normal", economy);
    const out = director.handle({ type: "buyHint", hint: "branch" });
    expect(rejection(out)).toContain("costs");
    expect(stateOf(out).hints).toHaveLength(0);
  });

  it("branch elimination names a legal move that loses the level", () => {
    const { economy } = withStars(9);
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "normal", economy);
    stateOf(director.handle({ type: "loadLevel", id: SCRIPTED_TRAP_LEVEL }));

    const state = stateOf(director.handle({ type: "buyHint", hint: "branch" }));
    const hint = state.hints.find((h) => h.type === "branch");
    expect(hint).toBeDefined();
    expect(hint!.forbidden).not.toBeNull();
    expect(hint!.text).toContain("loses the level");
  });

  it("narrow points at a region without naming the keystone", () => {
    const { economy } = withStars(9);
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "normal", economy);
    stateOf(director.handle({ type: "loadLevel", id: SCRIPTED_TRAP_LEVEL }));
    const state = stateOf(director.handle({ type: "buyHint", hint: "narrow" }));
    const hint = state.hints.find((h) => h.type === "narrow")!;
    expect(hint.text).toMatch(/only one solution/);
    // It must not mark the keystone's tiles — that would BE the answer.
    expect(hint.tileIds).toHaveLength(0);
    expect(hint.targetIndex).toBeNull();
  });

  it("contested names the scarce number, not what needs it", () => {
    const { economy } = withStars(9);
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "normal", economy);
    stateOf(director.handle({ type: "loadLevel", id: SCRIPTED_TRAP_LEVEL }));
    const state = stateOf(director.handle({ type: "buyHint", hint: "contested" }));
    const hint = state.hints.find((h) => h.type === "contested")!;
    expect(hint.text).toMatch(/^The \d+ is contested\.$/);
    expect(hint.targetIndex).toBeNull(); // never points at the keystone target
  });

  it("a hint bought and then failed is still revealed after restart — free", () => {
    const { economy, store } = withStars(9);
    const director = new Director(load(SCRIPTED_TRAP_LEVEL), "normal", economy);
    stateOf(director.handle({ type: "loadLevel", id: SCRIPTED_TRAP_LEVEL }));

    stateOf(director.handle({ type: "buyHint", hint: "branch" }));
    const spentAfterBuy = economy.state.starsSpent;
    expect(spentAfterBuy).toBeGreaterThan(0);

    // Fail and restart.
    stateOf(director.handle({ type: "tapRestart" }));
    const state = stateOf(director.handle({ type: "buyHint", hint: "branch" }));
    expect(state.hints.some((h) => h.type === "branch")).toBe(true);
    // GDD §13: never charge twice for the same information on the same level.
    expect(economy.state.starsSpent).toBe(spentAfterBuy);

    // And it survives a relaunch.
    const reopened = new Economy(MemoryStore.from(store.snapshot()), () => T0);
    expect(reopened.hintsPurchased(SCRIPTED_TRAP_LEVEL)).toContain("branch");
  });
});

describe("progressive disclosure (GDD §7.6)", () => {
  it("a fresh save shows nothing", () => {
    const unlocks = unlocksFor(freshEconomy().state);
    expect(unlocks).toEqual({
      starCounter: false,
      fatalWarning: false,
      worldMap: false,
      lives: false,
      hintShop: false,
      modeSelector: false,
    });
  });

  it("unlocks in schedule order", () => {
    const economy = freshEconomy();
    economy.recordClear("1-01");
    expect(unlocksFor(economy.state).starCounter).toBe(true);
    expect(unlocksFor(economy.state).worldMap).toBe(false);

    economy.recordFailure("1-04");
    expect(unlocksFor(economy.state).fatalWarning).toBe(true);

    economy.recordClear("1-10");
    expect(unlocksFor(economy.state).worldMap).toBe(true);
    expect(unlocksFor(economy.state).lives).toBe(false);

    economy.recordFailure("2-08");
    expect(unlocksFor(economy.state).lives).toBe(true);
    expect(unlocksFor(economy.state).hintShop).toBe(false);

    economy.recordFailure("3-06");
    expect(unlocksFor(economy.state).hintShop).toBe(true);
    expect(unlocksFor(economy.state).modeSelector).toBe(false);

    economy.recordClear("3-10");
    expect(unlocksFor(economy.state).modeSelector).toBe(true);
  });

  it("the Director reports unlocks so the renderer can omit, not grey out", () => {
    const director = new Director(load("1-01"), "normal", freshEconomy());
    const state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    expect(state.unlocks.hintShop).toBe(false);
    expect(state.unlocks.modeSelector).toBe(false);
  });
});
