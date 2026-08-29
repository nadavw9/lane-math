import { describe, expect, it } from "vitest";

import { Director } from "./director.js";
import type { Mode } from "../solver/index.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

/**
 * §1's CANONICAL EXAMPLE, played wrong on purpose.
 *
 *   Pool   1, 2, 2, 3, 4, 5
 *   Queue  8 → 3 → 15
 *
 * "Three fatal branches, all of which look correct at the time." The first is
 * `3 + 5 = 8` at target 0, and §1 states where it lands: "The failure surfaces
 * at the THIRD target, two moves after the mistake. That gap is the game."
 *
 * A player reported failure firing at the fatal move rather than at the wall,
 * which if true would collapse trap depth to zero and delete the design. This
 * plays the canonical trap and asserts where each thing fires.
 */

const CANONICAL: LadderLevel = {
  id: "canonical-1",
  world: 1,
  pool: [1, 2, 2, 3, 4, 5],
  targets: [8, 3, 15],
  rules: { allowNegative: false, integerOnly: true },
  surplus: 0,
  modes: {
    // Free operators everywhere, so the ONLY thing under test is §4.1's front
    // target rule — an exhausted budget would be a second reason to be stuck.
    casual: { budget: { "+": 9, "-": 9, "*": 9, "/": 9 } },
    normal: { budget: { "+": 9, "-": 9, "*": 9, "/": 9 } },
    expert: { budget: { "+": 9, "-": 9, "*": 9, "/": 9 } },
  },
} as unknown as LadderLevel;

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};

/** Combine the first live tile of each value, in order: left op right. */
function open(mode: Mode): { director: Director; state: () => ViewState } {
  const director = new Director(CANONICAL, mode);
  let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));
  return {
    director,
    state: () => state,
  };
}

function play(
  director: Director,
  current: ViewState,
  left: number,
  op: "+" | "-" | "*" | "/",
  right: number,
): ViewState {
  const free = current.tiles.filter((t) => !t.consumed);
  const l = free.find((t) => t.value === left);
  const r = free.find((t) => t.value === right && t.id !== l?.id);
  if (!l || !r) throw new Error(`no live ${left} / ${right}`);
  stateOf(director.handle({ type: "tapTile", id: l.id }));
  stateOf(director.handle({ type: "tapOperator", op }));
  return stateOf(director.handle({ type: "tapTile", id: r.id }));
}

describe("§1's canonical trap, in Expert — no assistance in the way", () => {
  it("does NOT fail on the fatal move; it fails two targets later", () => {
    const { director } = open("expert");
    let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));

    // THE FATAL MOVE. 3 + 5 = 8 clears target 0 and reserves nothing for 15.
    state = play(director, state, 3, "+", 5);
    state = stateOf(director.handle({ type: "tapCommit" }));

    expect(state.phase, "the fatal move must not fail the level").toBe("playing");
    expect(state.targetIndex, "target 0 was legitimately cleared").toBe(1);

    // Target 1 is 3, still makeable from {1, 2, 2, 4}. Staging it does not
    // fail either — the front target is 3 and 3 is reachable.
    state = play(director, state, 1, "+", 2);
    expect(state.phase, "alive while target 1 is the front").toBe("playing");

    /*
     * Committing target 1 advances the front to 15, and {2, 4} cannot make it.
     * THIS is where §4.1 fires — one commit later than the trap, two targets
     * after the mistake, exactly as §1 describes.
     */
    state = stateOf(director.handle({ type: "tapCommit" }));
    expect(state.targetIndex, "the front is now target 2").toBe(2);
    expect(state.phase, "and only NOW does the level fail").toBe("failed");
  });

  it("fails on the FRONT target being unreachable, and says which number", () => {
    const { director } = open("expert");
    let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));
    state = play(director, state, 3, "+", 5);
    state = stateOf(director.handle({ type: "tapCommit" }));
    state = play(director, state, 1, "+", 2);
    state = stateOf(director.handle({ type: "tapCommit" }));

    expect(state.phase).toBe("failed");
    expect(state.message).toContain("15");
    expect(state.targets[state.targetIndex]).toBe(15);
  });

  it("wins on §1's stated line, so the board itself is not broken", () => {
    const { director } = open("expert");
    let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));
    for (const [l, op, r] of [
      [2, "*", 4],
      [1, "+", 2],
      [3, "*", 5],
    ] as const) {
      state = play(director, state, l, op, r);
      state = stateOf(director.handle({ type: "tapCommit" }));
    }
    expect(state.phase).toBe("won");
  });
});

describe("what NORMAL does with the same fatal move (§6, amended)", () => {
  it("says nothing at all — the move commits and the level dies at the wall", () => {
    const { director } = open("normal");
    let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));

    state = play(director, state, 3, "+", 5);
    state = stateOf(director.handle({ type: "tapCommit" }));

    /*
     * THE PANEL THE PLAYER SAW, now gone. It fired here — two targets before
     * the failure — and on a ladder with one solution path it was naming the
     * answer for free, which §5.4 forbids.
     */
    expect(state.warning, "Normal no longer warns").toBeNull();
    expect(state.phase, "the move is simply taken").toBe("playing");
    expect(state.targetIndex, "target 0 cleared, as it legitimately was").toBe(1);

    state = play(director, state, 1, "+", 2);
    state = stateOf(director.handle({ type: "tapCommit" }));
    expect(state.phase, "and §4.1 still fires at the wall, unchanged").toBe("failed");
    expect(state.targets[state.targetIndex]).toBe(15);
  });

  it("matches Expert move for move — the modes now differ only by budget", () => {
    const trace = (mode: Mode): string[] => {
      const director = new Director(CANONICAL, mode);
      let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));
      const seen: string[] = [];
      state = play(director, state, 3, "+", 5);
      state = stateOf(director.handle({ type: "tapCommit" }));
      seen.push(`${state.phase}/${state.targetIndex}/${state.warning ? "warned" : "silent"}`);
      state = play(director, state, 1, "+", 2);
      state = stateOf(director.handle({ type: "tapCommit" }));
      seen.push(`${state.phase}/${state.targetIndex}/${state.warning ? "warned" : "silent"}`);
      return seen;
    };
    expect(trace("normal")).toEqual(trace("expert"));
  });
});

describe("CASUAL keeps the warning, and it still blocks", () => {
  it("blocks the fatal move and nothing is consumed", () => {
    const { director } = open("casual");
    let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));

    state = play(director, state, 3, "+", 5);
    state = stateOf(director.handle({ type: "tapCommit" }));

    expect(state.warning, "Casual warns").not.toBeNull();
    expect(state.warning?.overridable, "§6: Casual BLOCKS").toBe(false);
    expect(state.phase).toBe("playing");
    expect(state.targetIndex, "the move was refused, not taken").toBe(0);
  });
});

describe("no warning fires once the level is already lost (§6, amended)", () => {
  /**
   * THE NAG, which was the second half of the reported problem.
   *
   * `checkFatalMove` asked `isWinnable` of the level AFTER the prospective
   * move. Once a fatal move had been taken the answer was false for every
   * move, so the forced, correct move that clears the next target was warned
   * exactly like the mistake. Casual is the mode that still warns, so it is
   * the mode this has to be proved in.
   */
  it("stays silent on the only legal move remaining", () => {
    const director = new Director(CANONICAL, "casual");
    let state = stateOf(director.handle({ type: "loadLevel", id: CANONICAL.id }));

    // Casual blocks, so the level cannot be killed through the UI. Drive it
    // dead the way a Normal player would, then hand the position to Casual.
    const normal = new Director(CANONICAL, "normal");
    let dead = stateOf(normal.handle({ type: "loadLevel", id: CANONICAL.id }));
    dead = play(normal, dead, 3, "+", 5);
    dead = stateOf(normal.handle({ type: "tapCommit" }));
    expect(dead.targetIndex).toBe(1);

    // The same position in Casual: 1 + 2 = 3 is the ONLY move that clears
    // target 1, and the level is already unwinnable. It must not be warned.
    state = play(director, state, 3, "+", 5);
    state = stateOf(director.handle({ type: "tapCommit" }));
    expect(state.warning, "the genuine mistake is still caught").not.toBeNull();
    state = stateOf(director.handle({ type: "dismissWarning" }));

    // And the winning line is never warned in any mode.
    state = play(director, state, 2, "*", 4);
    state = stateOf(director.handle({ type: "tapCommit" }));
    expect(state.warning, "the correct move is never warned").toBeNull();
    expect(state.targetIndex).toBe(1);
  });
});
