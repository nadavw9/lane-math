/**
 * Save schema, versioned from the first write.
 *
 * GDD §13 Severity 3: "Version the save schema from day one (City Repair
 * migration precedent)." The migration hook below has nothing to migrate yet;
 * that is the point. Adding versioning after saves exist in the wild is the
 * expensive path, and the cost of writing it now is a switch with one arm.
 *
 * Backup / recovery (P0 SAVE-LOSS): a single primary key used to be both the
 * only copy and the write target. loadSave → emptySave → Economy.regenerate →
 * writeSave could overwrite an unreadable primary and destroy the only raw
 * payload. Backup holds the last validated primary; recovery holds the first
 * unreadable raw string and is never replaced by later failures.
 */
export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_KEY = "lane-math.save.v1";
/** Previous validated primary — written only after parse+migrate success. */
export const SAVE_BACKUP_KEY = "lane-math.save.backup.v1";
/** First unreadable raw primary payload — written once, never replaced. */
export const SAVE_RECOVERY_KEY = "lane-math.save.recovery.v1";

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

export interface SaveLoadStatus {
  readonly save: SaveData;
  /** True when primary was unreadable and a validated backup was used instead. */
  readonly recoveredFromBackup: boolean;
  /** True when SAVE_RECOVERY_KEY holds a preserved unreadable raw payload. */
  readonly hasRecoveryRaw: boolean;
  /** True when primary was missing-parse/migrate failure (not a clean miss). */
  readonly primaryUnreadable: boolean;
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
  /**
   * False when the most recent `write` was swallowed (quota / private mode).
   * Callers must not claim "saved" when this is false.
   */
  lastWriteOk = true;

  read(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      // getItem throw (private/unavailable) — treat as miss; never clear keys.
      return null;
    }
  }
  write(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
      this.lastWriteOk = true;
    } catch {
      // Private mode or a full quota. Losing progress is bad; crashing is worse.
      // Do not removeItem / clear — existing durable bytes stay untouched.
      this.lastWriteOk = false;
    }
  }
  /**
   * Best-effort remove for future callers. Never throws; on failure leaves
   * existing data in place (does not clear other keys).
   */
  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* private/unavailable — leave store untouched */
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
    levels,
    lives: migrated.lives ?? 0,
    lastLifeGrantedAt: migrated.lastLifeGrantedAt ?? 0,
    clockHighWater: migrated.clockHighWater ?? migrated.lastLifeGrantedAt ?? 0,
    totalStars: migrated.totalStars ?? 0,
    starsSpent: migrated.starsSpent ?? 0,
    restored: migrated.restored ?? {},
    selectedMode: migrated.selectedMode ?? "normal",
    muted: migrated.muted ?? false,
  };
}

function tryParseMigrate(raw: string): SaveData | null {
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

function safeRead(store: SaveStore, key: string): string | null {
  try {
    return store.read(key);
  } catch {
    return null;
  }
}

function safeWrite(store: SaveStore, key: string, value: string): boolean {
  try {
    store.write(key, value);
  } catch {
    return false;
  }
  // LocalStorageStore swallows quota/private throws internally — surface via lastWriteOk.
  if (store instanceof LocalStorageStore) return store.lastWriteOk;
  return true;
}

function refreshBackup(store: SaveStore, validated: SaveData): void {
  safeWrite(store, SAVE_BACKUP_KEY, JSON.stringify(validated));
}

/** Preserve the first unreadable primary raw; never replace a later failure. */
function preserveRecoveryRawOnce(store: SaveStore, raw: string): void {
  if (safeRead(store, SAVE_RECOVERY_KEY) !== null) return;
  // Best-effort: if storage throws/quota, still proceed to emptySave/backup try.
  safeWrite(store, SAVE_RECOVERY_KEY, raw);
}

/** Never throws — unavailable storage → null (export helpers stay safe). */
export function readRecoveryRaw(store: SaveStore): string | null {
  return safeRead(store, SAVE_RECOVERY_KEY);
}

/** Never throws. */
export function hasRecoveryRaw(store: SaveStore): boolean {
  return safeRead(store, SAVE_RECOVERY_KEY) !== null;
}

export interface WriteSaveOptions {
  /**
   * When false, write primary only — do not replace backup. Used when the
   * runtime fell back to emptySave after an unreadable primary so a valid
   * backup (or an absent one) is not overwritten by an empty shell, and so a
   * ctor clock refresh cannot destroy the only remaining progress copy.
   */
  readonly mirrorBackup?: boolean;
}

/**
 * Persist a working save. By default mirrors to backup (healthy path).
 * Pass `{ mirrorBackup: false }` for empty/fallback commits that must not
 * clobber a validated backup.
 *
 * Returns true when the primary write succeeded. False means durable store
 * may lag in-memory (quota/private/throw) — do not claim "saved".
 * Never throws; never clears existing keys on failure.
 */
export function writeSave(store: SaveStore, data: SaveData, opts: WriteSaveOptions = {}): boolean {
  const payload = JSON.stringify(data);
  const primaryOk = safeWrite(store, SAVE_KEY, payload);
  if (opts.mirrorBackup === false) return primaryOk;
  // Never park corrupt JSON in backup — SaveData always serialises cleanly.
  const backupOk = safeWrite(store, SAVE_BACKUP_KEY, payload);
  return primaryOk && backupOk;
}

/**
 * Load with backup/recovery protection.
 *
 * 1. Successful primary parse+migrate → refresh backup from validated save.
 * 2. Unreadable primary → stash exact raw in recovery once, then try backup.
 * 3. Valid backup → use as working save (caller should rewrite primary).
 * 4. No backup → emptySave for runtime; recovery raw survives later writes.
 */
export function loadSaveStatus(store: SaveStore, now: number, maxLives: number): SaveLoadStatus {
  const recoveryPresent = () => safeRead(store, SAVE_RECOVERY_KEY) !== null;
  const raw = safeRead(store, SAVE_KEY);

  if (raw === null) {
    return {
      save: emptySave(now, maxLives),
      recoveredFromBackup: false,
      hasRecoveryRaw: recoveryPresent(),
      primaryUnreadable: false,
    };
  }

  const migrated = tryParseMigrate(raw);
  if (migrated) {
    refreshBackup(store, migrated);
    return {
      save: migrated,
      recoveredFromBackup: false,
      hasRecoveryRaw: recoveryPresent(),
      primaryUnreadable: false,
    };
  }

  // Unreadable: JSON fail, migrate null, or unsupported newer schema.
  preserveRecoveryRawOnce(store, raw);

  const backupRaw = safeRead(store, SAVE_BACKUP_KEY);
  if (backupRaw !== null) {
    const fromBackup = tryParseMigrate(backupRaw);
    if (fromBackup) {
      return {
        save: fromBackup,
        recoveredFromBackup: true,
        hasRecoveryRaw: true,
        primaryUnreadable: true,
      };
    }
  }

  return {
    save: emptySave(now, maxLives),
    recoveredFromBackup: false,
    hasRecoveryRaw: true,
    primaryUnreadable: true,
  };
}

export function loadSave(store: SaveStore, now: number, maxLives: number): SaveData {
  return loadSaveStatus(store, now, maxLives).save;
}
