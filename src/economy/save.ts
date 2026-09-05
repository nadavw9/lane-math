/**
 * Save schema, versioned from the first write.
 *
 * GDD §13 Severity 3: "Version the save schema from day one (City Repair
 * migration precedent)." The migration hook below has nothing to migrate yet;
 * that is the point. Adding versioning after saves exist in the wild is the
 * expensive path, and the cost of writing it now is a switch with one arm.
 */
export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_KEY = "lane-math.save.v1";

export interface LevelProgress {
  /** Best rating achieved. Replays may improve it (Candy Crush model, §5.1). */
  readonly bestStars: number;
  /**
   * Failures accumulated on this level. GDD §5.1: this must survive restarts
   * AND app kill, or a player can fail, force-quit and collect 3 stars.
   */
  readonly failCount: number;
  readonly cleared: boolean;
  /** GDD §5.2: the per-level free first failure, consumed on first use. */
  readonly firstFailureUsed: boolean;
  /**
   * Hints bought on this level. GDD §13: "Hint bought, level failed, restart —
   * is it still revealed? YES. Never charge twice for the same information on
   * the same level." Persisted per level so a restart re-reveals them free.
   */
  readonly hintsPurchased: readonly string[];
  /* Clean rating is minted only by a verified rewarded retry ad. */
  readonly ratingAttempt?: "tainted" | "clean";
}

export interface SaveData {
  readonly schemaVersion: number;
  readonly levels: Readonly<Record<string, LevelProgress>>;
  readonly lives: number;
  /** Epoch ms of the last life grant. Basis for regeneration and clock checks. */
  readonly lastLifeGrantedAt: number;
  /** Highest wall-clock time this save has legitimately observed. */
  readonly clockHighWater: number;
  readonly totalStars: number;
  readonly starsSpent: number;
  /**
   * Objects restored per world, 0-4 (ART_DIRECTION §6).
   *
   * Persisted for the same reason as the failure counter (§5.1): a purchase
   * that lives only in memory is refunded by a force-quit, and §13 names that
   * exact exploit. Restoration spends from `starsSpent`, the same pool as
   * hints, so the two cannot both spend the same star.
   */
  readonly restored: Readonly<Record<string, number>>;
  /** GDD §6. Persisted so the choice survives a relaunch. */
  readonly selectedMode: "casual" | "normal" | "expert";
  /**
   * Audio off. Default false — sound is ON, per the Phase 5F brief.
   *
   * Additive with a safe default, so it needs no schema bump: `migrate` already
   * coalesces every field, and a save written before audio existed simply reads
   * as unmuted. That is the whole reason the versioning went in before it was
   * needed.
   */
  readonly muted: boolean;
}

export const EMPTY_PROGRESS: LevelProgress = {
  bestStars: 0,
  failCount: 0,
  cleared: false,
  firstFailureUsed: false,
  hintsPurchased: [],
  ratingAttempt: "tainted",
};

export function emptySave(now: number, maxLives: number): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels: {},
    lives: maxLives,
    lastLifeGrantedAt: now,
    clockHighWater: now,
    totalStars: 0,
    starsSpent: 0,
    restored: {},
    // GDD §6 and the Phase 3 brief: Normal is the default. Casual is a choice
    // the player makes once the selector unlocks at 3-10 (§7.6).
    selectedMode: "normal",
    muted: false,
  };
}

/** Anything that can hold a string. Swapped for Capacitor Preferences later. */
export interface SaveStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export class MemoryStore implements SaveStore {
  private readonly map = new Map<string, string>();
  read(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  write(key: string, value: string): void {
    this.map.set(key, value);
  }
  /** Simulates a process kill: the data survives, nothing in memory does. */
  snapshot(): Map<string, string> {
    return new Map(this.map);
  }
  static from(snapshot: ReadonlyMap<string, string>): MemoryStore {
    const store = new MemoryStore();
    for (const [k, v] of snapshot) store.map.set(k, v);
    return store;
  }
}

export class LocalStorageStore implements SaveStore {
  read(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  write(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private mode or a full quota. Losing progress is bad; crashing is worse.
    }
  }
}

/**
 * Migrate a save of any earlier version to the current one.
 *
 * Deliberately written before it is needed. Each future version adds one arm
 * and falls through to the next, so a save can climb several versions in order.
 */
export function migrate(raw: unknown): SaveData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Partial<SaveData> & { schemaVersion?: number };
  if (typeof data.schemaVersion !== "number") return null;

  const migrated: Partial<SaveData> & { schemaVersion: number } = {
    ...data,
    schemaVersion: data.schemaVersion,
  };
  /*
   * v1 -> v2: restoration state added (ART_DIRECTION §6).
   *
   * A v1 save has no `restored` map and every room is shabby, which is exactly
   * what an empty map means — so the climb is additive and cannot lose
   * progress. Written as a real case rather than a comment because this is the
   * first migration the game has actually needed.
   */
  if (migrated.schemaVersion === 1) {
    Object.assign(migrated, { restored: {}, schemaVersion: 2 });
  }

  // A save written by a newer build, or one this build cannot climb to the
  // current version, is refused rather than half-read.
  if (migrated.schemaVersion !== SAVE_SCHEMA_VERSION) return null;

  const levels = Object.fromEntries(Object.entries(migrated.levels ?? {}).map(([id, progress]) => {
    const value = progress as Partial<LevelProgress>;
    return [id, { ...EMPTY_PROGRESS, ...value, hintsPurchased: value.hintsPurchased ?? [], ratingAttempt: value.ratingAttempt === "clean" ? "clean" : "tainted" } satisfies LevelProgress];
  }));

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels,    lives: migrated.lives ?? 0,
    lastLifeGrantedAt: migrated.lastLifeGrantedAt ?? 0,
    clockHighWater: migrated.clockHighWater ?? migrated.lastLifeGrantedAt ?? 0,
    totalStars: migrated.totalStars ?? 0,
    starsSpent: migrated.starsSpent ?? 0,
    restored: migrated.restored ?? {},
    selectedMode: migrated.selectedMode ?? "normal",
    muted: migrated.muted ?? false,
  };
}

export function loadSave(store: SaveStore, now: number, maxLives: number): SaveData {
  const raw = store.read(SAVE_KEY);
  if (raw === null) return emptySave(now, maxLives);
  try {
    const migrated = migrate(JSON.parse(raw));
    return migrated ?? emptySave(now, maxLives);
  } catch {
    // Corrupt save. Starting clean beats refusing to launch.
    return emptySave(now, maxLives);
  }
}

export function writeSave(store: SaveStore, data: SaveData): void {
  store.write(SAVE_KEY, JSON.stringify(data));
}
