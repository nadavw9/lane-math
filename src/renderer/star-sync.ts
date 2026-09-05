import type { EconomyView } from "../game/types.js";

/**
 * The stars that belong to the clear currently on screen.
 *
 * `bestStars` is durable history and may be higher than this attempt. Outcome
 * surfaces must use the attempt award so the modal, footer and HUD never tell
 * three different stories about the same clear.
 */
export function starsForClear(
  economy: Pick<EconomyView, "starsIfCleared"> | null | undefined,
): number {
  return Math.max(0, Math.min(3, economy?.starsIfCleared ?? 0));
}
