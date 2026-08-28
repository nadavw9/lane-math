import { Container, Sprite } from "pixi.js";

import type { Rect } from "./layout.js";
import { spriteFor } from "./sprites.js";
import type { ViewState } from "../game/types.js";

/**
 * THE BRASS AUTOMATON (ART_DIRECTION §2), placed as a NON-FLOW OVERLAY.
 *
 * It cannot join the band stack. Measured across all 40 levels, the worst board
 * (4-06) stacks 873px into the 420x900 design surface, leaving 15px above the
 * lane and 12px below the status row. There is no vertical slack to give it,
 * and taking any would shrink the tokens on every large board.
 *
 * So it is drawn FIRST and the bands are drawn over it. Partial occlusion is
 * the intended state rather than a failure mode: it reads as an object sitting
 * on the desk BEHIND the work, which is what §2 asks for ("sits on the desk
 * beside the board"), and it means the board never has to make room.
 *
 * WHICH margin was a measurement, not a guess. Across the 40 shipped levels:
 *
 *   pool left margin      min 14px   median 43px   max 62px
 *   desk above the lane   min 15px   median 16px   max 64px
 *   desk below the status band                     12px, every level
 *
 * It stood in that last one. The status band spans the full width, so the
 * bottom margin is 12px of desk on EVERY board and the automaton was 92%
 * covered — a brass sliver between two trays, which reads as a rendering fault
 * rather than as scenery. The pool band is the one band that hugs its grid
 * instead of spanning the width, so the strip to its left is the only place on
 * the surface with room, and it is where the automaton now stands.
 *
 * It is also non-interactive. Nothing about it accepts a tap, so it cannot
 * steal a hit area from the pool or the restart button — the failure that cost
 * an export gesture once already.
 */

/** GDD §7.5's four states, mapped to what the board is doing. */
export type AutomatonState = "calm" | "thinking" | "delighted" | "worried";

/**
 * How long the player may sit still before the automaton starts thinking.
 *
 * 9 SECONDS, and the number is a compromise between two failure modes rather
 * than a guess. Lane Math's own telemetry names `first_tap_latency` as the
 * headline FTUE metric precisely because the opening pause is long — the design
 * front-loads all planning (§13: "a strong player solves the level mentally
 * before the first tap"), so a short threshold would fire on the exact moment
 * the game most wants to look calm. Too long and it never fires at all on a
 * 30-second tutorial level.
 *
 * 9s sits above a normal read of a World 1 board and below the point where a
 * stuck player has already given up.
 */
export const THINKING_AFTER_MS = 9_000;

export function automatonState(state: ViewState, idleMs: number): AutomatonState {
  if (state.phase === "won") return "delighted";
  if (state.phase === "failed") return "worried";
  // The warning is a refusal, not a loss — the automaton stays concerned about
  // it, because from the player's side something has just gone wrong.
  if (state.warning !== null) return "worried";
  return idleMs >= THINKING_AFTER_MS ? "thinking" : "calm";
}

/** Height on the design surface. Small: it is scenery, not a participant. */
const HEIGHT = 88;
/**
 * Kept clear of the frame on both axes.
 *
 * §2 asks for partial occlusion BY THE COLUMN. It was sliced by the viewport
 * edge instead — at x=2 with its feet on y=900 the left of its body and the
 * bottom of its base were cut by the screen, which reads as a rendering fault
 * rather than as an object standing behind the board. Occluded by the board is
 * scenery; occluded by the frame is a bug.
 */
const INSET_X = 8;

/**
 * @param pool The pool band. The automaton stands on its baseline, in the strip
 *   of desk to its left — see the measurement above for why that strip.
 */
export function automaton(state: AutomatonState, pool: Rect): Container | null {
  const entry = spriteFor(`automaton-${state}`);
  if (!entry) return null;

  const container = new Container();
  const sprite = new Sprite(entry.texture);
  /*
   * Measure BEFORE scaling. `sprite.height` reports the SCALED height once
   * `scale.set` has run, so reading it afterwards and multiplying by the scale
   * again applies it twice — which put the automaton's feet below the design
   * surface and clipped everything but its head.
   */
  const natural = sprite.height;
  const scale = HEIGHT / natural;
  sprite.scale.set(scale);
  sprite.x = INSET_X;
  /*
   * Feet on the pool band's baseline — the line the tray itself sits on, so the
   * two objects share a floor rather than the automaton floating beside one.
   * Clamped at 0 because a shallow pool on a seven-target board could otherwise
   * push its head off the top of the surface, which is the frame doing the
   * cutting again.
   */
  sprite.y = Math.max(0, pool.y + pool.height - HEIGHT);
  container.addChild(sprite);
  // Scenery. It must never take a hit area from a control.
  container.eventMode = "none";
  container.interactiveChildren = false;
  return container;
}
