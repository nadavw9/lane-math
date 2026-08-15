import type { ViewState } from "../game/types.js";

/**
 * What a state change MEANS, as pure predicates.
 *
 * Split out of the Renderer so they can be tested without standing up PixiJS:
 * these two decide whether a frame is delayed and whether the feel layer is
 * wiped, which is exactly the pair the retry guarantee (§9.5) rests on.
 */

/**
 * A target was cleared — the one transition that holds a frame (§9.5 hit-stop).
 *
 * This is the ONLY thing in the renderer that delays the board, so the retry
 * path staying instantaneous is equivalent to this returning false for a
 * restart.
 */
export function advancesTarget(previous: ViewState, next: ViewState): boolean {
  return next.targetIndex > previous.targetIndex;
}

/**
 * The board went backwards: a restart, or a level reopening.
 *
 * A rewind must drop every running effect, or a board rewound mid-shudder
 * opens still shuddering and the retry looks like it is recovering from the
 * failure rather than starting clean.
 */
export function isRewind(previous: ViewState, next: ViewState): boolean {
  return (
    next.levelId !== previous.levelId ||
    next.targetIndex < previous.targetIndex ||
    (previous.phase !== "playing" && next.phase === "playing")
  );
}
