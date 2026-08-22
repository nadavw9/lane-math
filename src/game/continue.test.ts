import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { enumerate, enumerateTransforms } from "../solver/index.js";
import { Director } from "./director.js";
import type { Command, LadderLevel, ViewState } from "./types.js";

/**
 * GDD §9.4's CONTINUE — the paid rewind to the branch point.
 *
 * This is the game's only mechanic where money changes the board, so the rules
 * around it are worth more than the feature itself:
 *
 *   - it rewinds to a state a win was still reachable from, not to the start
 *     (that is Restart) and not to one move back (which may still be doomed);
 *   - it is capped, so a level cannot be bought outright;
 *   - it does NOT clear the failure count, so it cannot buy a 3-star clear.
 *
 * The last one is the one a future change is most likely to break by accident,
 * because "undo the failure" reads like the kind thing to do.
 */
const LEVELS = "levels";
/**
 * A level that reliably dead-ends under the strategy below, with a branch point
 * behind it. Chosen by probing the whole ladder rather than assumed: the first
 * level tried here did not dead-end at all, which is how the original version
 * of this file came to pass six vacuous tests.
 */
const TRAPPED = "1-03";

function load(id: string): LadderLevel {
  return JSON.parse(readFileSync(join(LEVELS, `${id}.json`), "utf8")) as LadderLevel;
}

function stateOf(commands: readonly Command[]): ViewState {
  const render = commands.find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
}

/**
 * Drive the board into a failed state.
 *
 * Uses the SOLVER to pick moves, exactly as the debug harness does, because a
 * hand-rolled tap sequence does not commit anything: an earlier version of this
 * helper tapped tile/slot/operator directly and never advanced past target 0,
 * so all six tests passed by falling through their guards. Vacuous green is the
 * failure mode this file is most exposed to, which is why `reachedFailure`
 * exists and is asserted.
 *
 * Taking the LAST enumerated decomposition walks into trouble on a trapped
 * board, since the natural-looking move is enumerated first.
 */
function playIntoFailure(director: Director, level: LadderLevel): ViewState {
  let state = stateOf(director.handle({ type: "tick" }));
  for (let guard = 0; guard < 30 && state.phase === "playing"; guard++) {
    const live = state.tiles
      .filter((t) => !t.consumed)
      .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
    const target = state.targets[state.targetIndex];
    if (target === undefined) break;

    const decomps = enumerate(live, target, state.budget, level.rules);
    if (decomps.length > 0) {
      const pick = decomps[decomps.length - 1]!;
      director.handle({ type: "tapTile", id: pick.leftId });
      director.handle({ type: "tapOperator", op: pick.op });
      director.handle({ type: "tapTile", id: pick.rightId });
      state = stateOf(director.handle({ type: "tapCommit" }));
      continue;
    }
    const transforms = enumerateTransforms(live, state.budget, level.rules);
    if (transforms.length > 0) {
      director.handle({ type: "tapUnary", op: transforms[0]!.op });
      state = stateOf(director.handle({ type: "tapTile", id: transforms[0]!.tileId }));
      continue;
    }
    break;
  }
  return state;
}

describe("§9.4 continue", () => {
  function fresh(id = TRAPPED): { director: Director; level: LadderLevel } {
    const level = load(id);
    return { director: new Director(level, "normal"), level };
  }

  it("offers nothing while the level is still playable", () => {
    const { director } = fresh();
    const state = stateOf(director.handle({ type: "tick" }));
    expect(state.phase).toBe("playing");
    // The exit exists ONLY once failure has read, so a renderer cannot draw a
    // monetisation panel over a live board.
    expect(state.exit).toBeNull();
  });

  it("reaches a real failure with a branch point behind it", () => {
    /*
     * THE GUARD ON EVERY TEST BELOW. If the helper stops dead-ending — a
     * recuration, a solver change — these tests would otherwise keep passing
     * while asserting nothing, which is exactly how they were first written.
     */
    const { director, level } = fresh();
    const state = playIntoFailure(director, level);
    expect(state.phase).toBe("failed");
    expect(state.exit).not.toBeNull();
    expect(state.exit?.canContinue).toBe(true);
    expect(state.exit?.continuesLeft).toBe(2);
  });

  it("rewinds to a state a win was still reachable from", () => {
    const { director, level } = fresh();
    const failed = playIntoFailure(director, level);
    const after = stateOf(director.handle({ type: "continueFromBranch" }));

    expect(after.phase).toBe("playing");
    // Strictly earlier than where the level died — not the same dead end, and
    // not the start either, which is what Restart does.
    expect(after.targetIndex).toBeLessThan(failed.targetIndex);
  });

  it("does not wipe the failure count — a continue buys position, not stars", () => {
    const { director, level } = fresh();
    const failed = playIntoFailure(director, level);
    const after = stateOf(director.handle({ type: "continueFromBranch" }));
    expect(after.failures).toBe(failed.failures);
  });

  it("is capped at two per attempt", () => {
    const { director, level } = fresh();
    let granted = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const failed = playIntoFailure(director, level);
      if (failed.phase !== "failed") break;
      if (failed.exit?.canContinue !== true) break;
      director.handle({ type: "continueFromBranch" });
      granted++;
    }
    expect(granted).toBe(2);

    // And the third refusal is explicit rather than silent.
    const spent = stateOf(director.handle({ type: "tick" }));
    if (spent.phase === "failed") expect(spent.exit?.continuesLeft).toBe(0);
  });

  it("charges a life only where lives exist and §5.2 has been used", () => {
    /*
     * The free-case headline fires on `restartCostsLife === false`, so what
     * that flag means is copy, not just state. §5.2's exemption is
     * `livesActive && !cleared && !firstFailureUsed`, and the flag was
     * originally just `!exempt` — which claims a life cost on any level where
     * lives are NOT ACTIVE at all, because nothing can be exempt there. World 1
     * would have told the player a life was gone that never existed.
     */
    const { director, level } = fresh();
    const failed = playIntoFailure(director, level);
    expect(failed.phase).toBe("failed");
    // 1-03 is World 1, where §7.2 keeps lives off entirely.
    expect(failed.economy?.livesActive ?? false).toBe(false);
    expect(failed.exit?.restartCostsLife).toBe(false);
  });

  it("refuses to continue from a board that has not failed", () => {
    const { director } = fresh();
    director.handle({ type: "tick" });
    const commands = director.handle({ type: "continueFromBranch" });
    expect(commands.some((c) => c.type === "reject")).toBe(true);
  });
});
