import type { Economy } from "../economy/economy.js";
import { furthestReached, unlocksFor } from "../economy/unlocks.js";
import type { TitleView } from "./title.js";

/**
 * WHAT THE TITLE SCREEN SHOWS, derived rather than stored.
 *
 * Pure, and separate from the screen that draws it, for the same reason
 * `mapView` is separate from `MapScreen`: the interesting questions — which
 * level does `continue` open, which room is behind it, is the mode selector
 * there yet — are answerable without a browser.
 */

/** Objects in the Academy: four rooms of four (ART_DIRECTION §6). */
export const RESTORE_TOTAL = 16;

/**
 * The level `continue` opens: the first uncleared level, which is the same
 * frontier the map uses. A player who has cleared everything continues into the
 * last level rather than nothing — replaying for a better star count is the
 * point of §5.4's economy, and a dead button would be worse than a repeat.
 */
export function continueId(economy: Economy, ids: readonly string[]): string {
  const save = economy.state;
  for (const id of ids) {
    if (save.levels[id]?.cleared !== true) return id;
  }
  return ids[ids.length - 1] ?? ids[0]!;
}

export function titleView(economy: Economy, ids: readonly string[]): TitleView {
  const save = economy.state;
  const id = continueId(economy, ids);
  const cleared = ids.filter((each) => save.levels[each]?.cleared === true).length;
  const world = Number(id.split("-")[0]) || 1;
  const restored = [1, 2, 3, 4].reduce((total, w) => total + economy.restoredIn(w), 0);

  return {
    continueId: id,
    cleared,
    total: ids.length,
    starsEarned: save.totalStars,
    restored,
    restoreTotal: RESTORE_TOTAL,
    world,
    muted: economy.muted,
    mode: save.selectedMode,
    // §7.6, amended: modes arrive with the map at 1-10, not at 3-10.
    showModes: unlocksFor(save).modeSelector,
  };
}

/**
 * Does this save get a title screen? (§7.4.)
 *
 * A FIRST run goes straight into 1-01 — no title, no tap-to-start, no decision
 * before the player has seen a board. Anything further on has been here before.
 *
 * TWO CONDITIONS, not one. `furthestReached` is the highest id the save holds,
 * and a player who cleared 1-01 and quit still has only that one entry — so a
 * lexicographic comparison alone would drop them back onto a board with no
 * sense of having returned. Clearing the first level IS progress.
 */
export function titleEarnedFor(economy: Economy): boolean {
  const save = economy.state;
  return furthestReached(save) > "1-01" || save.levels["1-01"]?.cleared === true;
}
