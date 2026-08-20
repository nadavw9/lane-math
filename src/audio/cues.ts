import type { ViewState } from "../game/types.js";
import { isRewind } from "../renderer/transitions.js";

/**
 * WHAT makes a sound, decided separately from HOW it is made (§9.5, §9.6).
 *
 * Pure: state in, cues out. The synthesiser needs a browser and cannot be
 * tested in node, but the question that actually goes wrong — does the game
 * make a noise it should not, at a moment it should not — is answerable here
 * without one.
 *
 * The register is wooden and papery, never musical. Every name below is an
 * object doing something, not a note being played, which is the whole guard
 * against drifting toward chimes and coins.
 */
export type CueName =
  | "click"
  | "clack"
  | "knock"
  | "knockSoft"
  | "thunk"
  | "scrape"
  | "tear"
  | "fail"
  | "star";

export interface Cue {
  readonly name: CueName;
  /**
   * 0..1, where the sound sits in its own small range. Carries the tile's value
   * so repeated taps on different numbers are not the identical click — the
   * board should sound like a set of distinct objects, not one button.
   */
  readonly tone?: number;
}

/** Map a tile value onto 0..1 without letting a big number run off the top. */
export function toneOf(value: number): number {
  return Math.min(1, Math.log2(Math.max(1, value)) / 6);
}

/**
 * Cues for a state transition.
 *
 * SILENCE IS THE DEFAULT. Anything not listed here makes no sound at all, and
 * in particular: opening a level, restarting, idling, and every frame of every
 * animation. A player planning for twenty seconds hears nothing.
 */
export function cuesFor(
  previous: ViewState | null,
  next: ViewState,
  rejected: boolean,
): Cue[] {
  // A board arriving or rewinding is not an event the player caused a sound
  // with. Retry especially must be silent — it is already the harshest moment
  // in the game and does not need announcing (§9.5).
  if (!previous || isRewind(previous, next)) return [];

  const cues: Cue[] = [];

  /*
   * A refused commit: a dull scrape, never a buzzer.
   *
   * §2 step 4 — wrong arithmetic is NOT a failure state. A punishing sound
   * would contradict a rule the whole difficulty model rests on, by teaching
   * the player that trying things is dangerous.
   */
  if (rejected) cues.push({ name: "scrape" });

  // A target cleared. Fired from this transition and no earlier, which is what
  // keeps the hit-stop silent: the renderer defers exactly this transition.
  if (next.targetIndex > previous.targetIndex) cues.push({ name: "thunk" });

  // The lane refuses the number (§9.4). One note, and only on the edge.
  if (next.phase === "failed" && previous.phase !== "failed") cues.push({ name: "fail" });

  // A tile rewriting itself under a unary operator: paper, not a binary sound.
  for (const tile of next.tiles) {
    if (tile.consumed) continue;
    const was = previous.tiles.find((t) => t.id === tile.id);
    if (was && !was.consumed && was.value !== tile.value) cues.push({ name: "tear" });
  }

  /*
   * Choosing an operator.
   *
   * Was silent, and silent by omission rather than by decision — the sound map
   * listed the pool tile and never mentioned the operator row. An operator is a
   * different shape and a different material from a tile, so it gets its own
   * voice rather than borrowing the tile click.
   */
  if (previous.slots.op === null && next.slots.op !== null) cues.push({ name: "clack" });

  // Tiles entering or leaving the equation row.
  const slots: [number | null, number | null][] = [
    [previous.slots.leftTileId, next.slots.leftTileId],
    [previous.slots.rightTileId, next.slots.rightTileId],
  ];
  for (const [before, after] of slots) {
    if (before === after) continue;
    if (after !== null) {
      const tile = next.tiles.find((t) => t.id === after);
      cues.push({ name: "click", tone: toneOf(tile?.value ?? 1) });
    } else if (before !== null) {
      // Only a tile coming BACK. A tile that was spent left through the
      // shatter and already has its thunk.
      const tile = next.tiles.find((t) => t.id === before);
      if (tile && !tile.consumed) cues.push({ name: "knockSoft" });
    }
  }

  return cues;
}
