/**
 * Economy tuning. GDD §5.2: "The refill rate must be remote-configurable or at
 * minimum a single JSON value deployable without a store release. This number
 * will be wrong on first guess and only retention data will show it."
 *
 * Every number the economy uses lives here and nowhere else. Nothing below is
 * allowed to be repeated as a literal in game code.
 */
export interface EconomyConfig {
  readonly maxLives: number;
  readonly lifeRegenMinutes: number;
  /** GDD §7.6: lives are introduced at 2-8, granted at full. */
  readonly livesUnlockLevelId: string;
  /** GDD §7.2: World 1 runs with lives off entirely. */
  readonly livesDisabledWorlds: readonly number[];
  /** GDD §5.1 star thresholds, by failures accumulated on the level. */
  readonly starsByFailures: readonly { readonly maxFailures: number; readonly stars: number }[];
  /**
   * Hard-lock fallback (GDD §13). Guaranteed regeneration that ignores lives,
   * gold, ads and connectivity. See `grantHardLockLife`.
   */
  readonly hardLockGraceMinutes: number;
}

export const DEFAULT_ECONOMY: EconomyConfig = {
  maxLives: 5,
  lifeRegenMinutes: 20,
  livesUnlockLevelId: "2-08",
  livesDisabledWorlds: [1],
  starsByFailures: [
    { maxFailures: 0, stars: 3 },
    { maxFailures: 1, stars: 2 },
    { maxFailures: Number.POSITIVE_INFINITY, stars: 1 },
  ],
  hardLockGraceMinutes: 30,
};

/** GDD §5.1: 0 failures = 3 stars, 1 = 2 stars, 2+ = 1 star. */
export function starsFor(failures: number, config: EconomyConfig = DEFAULT_ECONOMY): number {
  for (const band of config.starsByFailures) {
    if (failures <= band.maxFailures) return band.stars;
  }
  return 1;
}

/** Ladder ids sort lexicographically ("1-01" < "2-08" < "4-10"). */
export function livesActiveFor(
  levelId: string,
  config: EconomyConfig = DEFAULT_ECONOMY,
): boolean {
  const world = Number(levelId.split("-")[0]);
  if (config.livesDisabledWorlds.includes(world)) return false;
  return levelId >= config.livesUnlockLevelId;
}
