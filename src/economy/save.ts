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
 *
 * #30 harden: tri-state reads (found/missing/unavailable) so a throw is never
 * treated as a clean first launch; recovery preserve must be genuinely secured
 * before any empty/fallback durable write; generational backup parks the
 * previous validated primary before replacing SAVE_KEY.
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

/**
 * Tri-state durable read. Callers must not treat `unavailable` as a clean miss
 * (first launch) — that path enables emptySave fallback writes.
 */
export type ReadResult =
  | { readonly status: "found"; readonly value: string }
  | { readonly status: "missing" }
  | { readonly status: "unavailable" };

export interface SaveLoadStatus {
  readonly save: SaveData;
  /** True when primary was unreadable and a validated backup was used instead. */
  readonly recoveredFromBackup: boolean;
  /**
   * True when SAVE_RECOVERY_KEY holds a confirmed preserved unreadable raw.
   * Never hard-coded true — only existing key or successful preserve.
   */
  readonly hasRecoveryRaw: boolean;
  /** True when primary was present but failed parse/migrate (not a clean miss). */
  readonly primaryUnreadable: boolean;
  /**
   * False when a durable read threw / storage is absent. Not a clean first launch.
   * Sessions with storageReadable=false must not perform fallback durable writes.
   */
  readonly storageReadable: boolean;
  /** Alias of hasRecoveryRaw — recovery key genuinely secured on the store. */
  readonly recoverySecured: boolean;
  /**
   * Unreadable primary bytes retained in memory when preserve did not secure,
   * for a later retry. Null when secured or no unreadable primary.
   */
  readonly pendingRecoveryRaw: string | null;
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

/**
 * Anything that can hold a string. Swapped for Capacitor Preferences later.
 * `read` returns null for a missing key; **throw** to signal unavailable storage
 * (so callers can distinguish miss vs read failure via `safeReadResult`).
 */
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
   * False when the most recent `write` was swallowed (quota / private mode /
   * absent localStorage). Callers must not claim "saved" when this is false.
   */
  lastWriteOk = true;

  read(key: string): string | null {
    const ls = globalThis.localStorage;
    if (!ls) {
      // Absent storage is unavailable, not a missing key.
      throw new Error("localStorage unavailable");
    }
    // Let getItem SecurityError/etc. propagate — safeReadResult maps to unavailable.
    return ls.getItem(key);
  }
  write(key: string, value: string): void {
    try {
      const ls = globalThis.localStorage;
      if (!ls) {
        // optional chaining would write nothing while looking "ok" — mark failed.
        this.lastWriteOk = false;
        return;
      }
      ls.setItem(key, value);
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

/** Tri-state read: found / missing / unavailable (throw). Never conflates throw with miss. */
export function safeReadResult(store: SaveStore, key: string): ReadResult {
  try {
    const value = store.read(key);
    if (value === null) return { status: "missing" };
    return { status: "found", value };
  } catch {
    return { status: "unavailable" };
  }
}

function safeWrite(store: SaveStore, key: string, value: string): boolean {
  try {
    store.write(key, value);
  } catch {
    return false;
  }
  // LocalStorageStore swallows quota/private/absent throws internally — surface via lastWriteOk.
  if (store instanceof LocalStorageStore) return store.lastWriteOk;
  return true;
}

/**
 * Seed backup only when missing/invalid. Do not collapse a valid previous
 * generation into a duplicate of the newest primary.
 */
function refreshBackup(store: SaveStore, validated: SaveData): void {
  const backup = safeReadResult(store, SAVE_BACKUP_KEY);
  if (backup.status === "unavailable") return;
  if (backup.status === "found" && tryParseMigrate(backup.value)) return;
  safeWrite(store, SAVE_BACKUP_KEY, JSON.stringify(validated));
}

/**
 * Preserve the first unreadable primary raw; never replace a later failure.
 * Returns whether recovery is genuinely secured on the store (existing key or
 * successful write). Never reports success from a best-effort no-op.
 */
export function preserveRecoveryRawOnce(store: SaveStore, raw: string): boolean {
  const existing = safeReadResult(store, SAVE_RECOVERY_KEY);
  if (existing.status === "found") return true;
  if (existing.status === "unavailable") return false;
  if (!safeWrite(store, SAVE_RECOVERY_KEY, raw)) return false;
  // Confirm — do not claim secured if the write was a silent no-op.
  const confirm = safeReadResult(store, SAVE_RECOVERY_KEY);
  return confirm.status === "found" && confirm.value === raw;
}

function recoverySecuredOnStore(store: SaveStore): boolean {
  return safeReadResult(store, SAVE_RECOVERY_KEY).status === "found";
}

/** Never throws — unavailable storage → null (export helpers stay safe). */
export function readRecoveryRaw(store: SaveStore): string | null {
  const result = safeReadResult(store, SAVE_RECOVERY_KEY);
  return result.status === "found" ? result.value : null;
}

/** Never throws. True only when the recovery key is confirmed present. */
export function hasRecoveryRaw(store: SaveStore): boolean {
  return recoverySecuredOnStore(store);
}

export interface WriteSaveOptions {
  /**
   * When false, write primary only — do not replace backup. Used when the
   * runtime fell back to emptySave after an unreadable primary so a valid
   * backup (or an absent one) is not overwritten by an empty shell, and so a
   * ctor clock refresh cannot destroy the only remaining progress copy.
   */
  readonly mirrorBackup?: boolean;
  /**
   * Session expected-primary token: the exact SAVE_KEY string this writer last
   * loaded or successfully published. When provided (including `null` = expect
   * missing), a validated primary that differs from both this token and the
   * outgoing payload is a foreign durable change — the write is aborted with
   * status "conflict" and neither primary nor backup is touched.
   *
   * This is best-effort compare-before-write, **not** an atomic CAS. There is
   * residual TOCTOU between re-read and setItem across tabs unless a real
   * cross-tab critical section (e.g. navigator.locks) is held. Do not describe
   * this guard as atomic.
   */
  readonly expectedPrimary?: string | null;
}

/** Outcome of attemptWriteSave — richer than writeSave's boolean. */
export type WriteSaveOutcome =
  | { readonly status: "written" }
  /**
   * Primary SAVE_KEY was confirmed written, but backup/durability did not
   * complete. Callers must advance their expected-primary token to `primaryRaw`
   * so the next write does not self-conflict, while treating persist as not OK.
   */
  | { readonly status: "incomplete"; readonly primaryRaw: string }
  | { readonly status: "failed" }
  | {
      readonly status: "conflict";
      readonly currentRaw: string;
      readonly current: SaveData;
    };

/**
 * Persist a working save with optional expected-primary conflict detection.
 *
 * By default uses generational backup: park the previous validated primary into
 * SAVE_BACKUP_KEY before replacing SAVE_KEY. Pass `{ mirrorBackup: false }` for
 * empty/fallback commits that must not clobber a validated backup.
 *
 * When `expectedPrimary` is set and a validated foreign primary is found, returns
 * `{ status: "conflict" }` without parking into backup and without replacing
 * primary — callers must adopt/surface the foreign save and must not claim the
 * stale mutation was saved.
 *
 * Residual TOCTOU: re-read then setItem is not a cross-tab critical section.
 * Never describe this as atomic CAS.
 */
export function attemptWriteSave(
  store: SaveStore,
  data: SaveData,
  opts: WriteSaveOptions = {},
): WriteSaveOutcome {
  const payload = JSON.stringify(data);
  const mirror = opts.mirrorBackup !== false;

  const prev = safeReadResult(store, SAVE_KEY);

  if (opts.expectedPrimary !== undefined) {
    // Fail-closed when an expected token is in play: never write blind.
    if (prev.status === "unavailable") {
      return { status: "failed" };
    }
    // Expected a durable primary but the key is gone (e.g. Storage.clear in
    // another tab). Do not resurrect this session's possibly-stale memory.
    if (opts.expectedPrimary !== null && prev.status === "missing") {
      return { status: "failed" };
    }
    if (prev.status === "found") {
      const validated = tryParseMigrate(prev.value);
      if (validated) {
        if (
          prev.value !== opts.expectedPrimary &&
          prev.value !== payload
        ) {
          // Foreign validated primary — reject stale write; leave both generations.
          return { status: "conflict", currentRaw: prev.value, current: validated };
        }
      } else if (prev.value !== opts.expectedPrimary && prev.value !== payload) {
        // Different corrupt / unmigratable raw: must not overwrite until the
        // unreadable bytes are secured on SAVE_RECOVERY_KEY (#30).
        if (!recoverySecuredOnStore(store)) {
          if (!preserveRecoveryRawOnce(store, prev.value)) {
            return { status: "failed" };
          }
        }
        // Recovery secured (existing or just preserved) — still refuse to
        // replace unreadable primary from a mismatched expected token. Caller
        // must go through load/backup recovery, not a stale session publish.
        return { status: "failed" };
      }
    }
  }

  if (mirror) {
    // Generational: retain previous validated primary as backup before replace.
    // Do not park corrupt/unreadable bytes into backup.
    // Do not park a foreign advanced primary when we are about to publish stale
    // (conflict path above already returned).
    if (prev.status === "found" && tryParseMigrate(prev.value) && prev.value !== payload) {
      safeWrite(store, SAVE_BACKUP_KEY, prev.value);
    }
  }

  const primaryOk = safeWrite(store, SAVE_KEY, payload);
  if (!primaryOk) return { status: "failed" };
  if (!mirror) return { status: "written" };

  // Bootstrap only: if no backup exists yet, seed with current (first write).
  // Do not reduce durability to always duplicating newest into both keys.
  const backup = safeReadResult(store, SAVE_BACKUP_KEY);
  if (backup.status === "missing") {
    if (safeWrite(store, SAVE_BACKUP_KEY, payload)) return { status: "written" };
    // Primary is durable; backup bootstrap failed. Advance expected-primary
    // via incomplete so the next write does not self-conflict.
    return { status: "incomplete", primaryRaw: payload };
  }
  return { status: "written" };
}

/**
 * Persist a working save. Boolean wrapper over attemptWriteSave for existing
 * callers: true only when status === "written". Conflict and failed both return
 * false — use attemptWriteSave when conflict must be distinguished.
 */
export function writeSave(store: SaveStore, data: SaveData, opts: WriteSaveOptions = {}): boolean {
  // incomplete (primary ok, backup not) is not full durability — false.
  return attemptWriteSave(store, data, opts).status === "written";
}

/**
 * Load with backup/recovery protection.
 *
 * 1. Successful primary parse+migrate → ensure backup exists (seed if missing).
 * 2. Unreadable primary → stash exact raw in recovery once (record success),
 *    then try backup.
 * 3. Valid backup → use as working save (caller should rewrite primary).
 * 4. No backup → emptySave for runtime; if recovery not secured, caller must
 *    block ALL durable fallback writes (including SAVE_KEY).
 * 5. Read unavailable → emptySave for runtime; storageReadable=false; caller
 *    must not treat as clean first launch and must not write.
 */
export function loadSaveStatus(store: SaveStore, now: number, maxLives: number): SaveLoadStatus {
  const primary = safeReadResult(store, SAVE_KEY);

  if (primary.status === "unavailable") {
    return {
      save: emptySave(now, maxLives),
      recoveredFromBackup: false,
      hasRecoveryRaw: false,
      primaryUnreadable: false,
      storageReadable: false,
      recoverySecured: false,
      pendingRecoveryRaw: null,
    };
  }

  if (primary.status === "missing") {
    const secured = recoverySecuredOnStore(store);
    return {
      save: emptySave(now, maxLives),
      recoveredFromBackup: false,
      hasRecoveryRaw: secured,
      primaryUnreadable: false,
      storageReadable: true,
      recoverySecured: secured,
      pendingRecoveryRaw: null,
    };
  }

  const migrated = tryParseMigrate(primary.value);
  if (migrated) {
    refreshBackup(store, migrated);
    const secured = recoverySecuredOnStore(store);
    return {
      save: migrated,
      recoveredFromBackup: false,
      hasRecoveryRaw: secured,
      primaryUnreadable: false,
      storageReadable: true,
      recoverySecured: secured,
      pendingRecoveryRaw: null,
    };
  }

  // Unreadable: JSON fail, migrate null, or unsupported newer schema.
  const secured = preserveRecoveryRawOnce(store, primary.value);
  const pending = secured ? null : primary.value;

  const backup = safeReadResult(store, SAVE_BACKUP_KEY);
  if (backup.status === "found") {
    const fromBackup = tryParseMigrate(backup.value);
    if (fromBackup) {
      return {
        save: fromBackup,
        recoveredFromBackup: true,
        hasRecoveryRaw: secured,
        primaryUnreadable: true,
        storageReadable: true,
        recoverySecured: secured,
        pendingRecoveryRaw: pending,
      };
    }
  }

  return {
    save: emptySave(now, maxLives),
    recoveredFromBackup: false,
    hasRecoveryRaw: secured,
    primaryUnreadable: true,
    storageReadable: true,
    recoverySecured: secured,
    pendingRecoveryRaw: pending,
  };
}

export function loadSave(store: SaveStore, now: number, maxLives: number): SaveData {
  return loadSaveStatus(store, now, maxLives).save;
}
