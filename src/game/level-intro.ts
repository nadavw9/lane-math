/**
 * Decide whether the level-intro veil may appear for an opened level.
 *
 * The first level that introduces a new operator is deliberately board-first:
 * its live board cue must be visible before any optional assistance competes
 * for attention. Later opens retain the existing intro and its monetization
 * affordance.
 */
export function shouldShowLevelIntro(
  levelId: string,
  openedLevelIds: ReadonlySet<string>,
  introUnlockLevelId: string,
): boolean {
  if (levelId < introUnlockLevelId) return false;
  return levelId !== introUnlockLevelId || openedLevelIds.has(levelId);
}
