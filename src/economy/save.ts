/**
 * Save schema, versioned from the first write.
 *
 * GDD §13 Severity 3: "Version the save schema from day one (City Repair
 * migration precedent)." The migration hook below has nothing to migrate yet;
 * that is the point. Adding versioning after saves exist in the wild is the
 * expensive path, and the cost of writing it now is a switch with one arm.
 */
export const SAVE_SCHEMA_VERSION = 1;
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
}

export const EMPTY_PROGRESS: LevelProgress = {
  bestStars: 0,
  failCount: 0,
  cleared: false,
  firstFailureUsed: false,
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
  // switch (migrated.schemaVersion) {
  //   case 1: Object.assign(migrated, toV2(migrated)); // falls through
  // }

  // A save written by a newer build, or one this build cannot climb to the
  // current version, is refused rather than half-read.
  if (migrated.schemaVersion !== SAVE_SCHEMA_VERSION) return null;

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels: migrated.levels ?? {},
    lives: migrated.lives ?? 0,
    lastLifeGrantedAt: migrated.lastLifeGrantedAt ?? 0,
    clockHighWater: migrated.clockHighWater ?? migrated.lastLifeGrantedAt ?? 0,
    totalStars: migrated.totalStars ?? 0,
    starsSpent: migrated.starsSpent ?? 0,
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
