import type { SaveData } from "./save.js";

/**
 * GDD §7.6 progressive disclosure. "Nothing appears on screen before it is
 * needed. Every system is a reward for progress."
 *
 * Gated systems must be ABSENT before their unlock, not greyed out — a greyed
 * shop still teaches "this is not for me", which is the thing the schedule
 * exists to avoid.
 */
export interface Unlocks {
  readonly starCounter: boolean;
  readonly fatalWarning: boolean;
  readonly worldMap: boolean;
  readonly lives: boolean;
  readonly hintShop: boolean;
  readonly modeSelector: boolean;
}

/** Ladder ids sort lexicographically ("1-01" < "2-08" < "4-10"). */
const cleared = (save: SaveData, id: string): boolean => save.levels[id]?.cleared === true;

/** The furthest level the player has touched at all, cleared or not. */
export function furthestReached(save: SaveData): string {
  let furthest = "";
  for (const id of Object.keys(save.levels)) if (id > furthest) furthest = id;
  return furthest;
}

/** Has the player got at least as far as this level? */
const reached = (save: SaveData, id: string): boolean => furthestReached(save) >= id;

export function unlocksFor(save: SaveData): Unlocks {
  return {
    // 1-1 clear: introduced as a prize, not as pre-existing chrome.
    starCounter: cleared(save, "1-01"),
    // 1-4: the teaching device itself.
    fatalWarning: reached(save, "1-04"),
    // 1-10: a reward for finishing World 1, not a hurdle before starting it.
    worldMap: cleared(save, "1-10"),
    // 2-8: after the player can reliably win.
    lives: reached(save, "2-08"),
    // 3-6: only once there are stars to spend. A shop full of unaffordable
    // items teaches "this is not for me".
    hintShop: reached(save, "3-06"),
    /*
     * 1-10, THE FIRST WORLD BOUNDARY — the same moment the map appears.
     *
     * It was 3-10, the thirtieth of forty levels, on the reasoning that
     * choosing a mode before understanding the game is a decision made on zero
     * information. True of a cold start; false by the end of World 1, and the
     * cost was that a player who disliked how Normal played had to play
     * twenty-six more levels to escape it. A player should be able to choose
     * how they play before World 2.
     */
    modeSelector: cleared(save, "1-10"),
  };
}

/** Everything on, for development and for the screenshot harness. */
export const ALL_UNLOCKED: Unlocks = {
  starCounter: true,
  fatalWarning: true,
  worldMap: true,
  lives: true,
  hintShop: true,
  modeSelector: true,
};
