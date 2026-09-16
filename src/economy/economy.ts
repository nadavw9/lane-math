import type { Mode } from "../solver/index.js";
import { furthestReached } from "./unlocks.js";
import { DEFAULT_ECONOMY, livesActiveFor, starsFor, type EconomyConfig } from "./config.js";
import {
  EMPTY_PROGRESS,
  SAVE_KEY,
  attemptWriteSave,
  hasRecoveryRaw as storeHasRecoveryRaw,
  loadSaveStatus,
  migrate,
  preserveRecoveryRawOnce,
  safeReadResult,
  type LevelProgress,
  type SaveData,
  type SaveLoadStatus,
  type SaveStore,
} from "./save.js";

/**
 * Result of the last durable commit attempt.
 *
 * - persisted: primary write succeeded (callers may claim saved)
 * - memory_only: in-memory updated; durable writes blocked for the session
 * - persist_failed: write attempted but durable store rejected it
 * - rejected_stale: foreign validated primary detected; stale mutation not
 *   published; newest validated save adopted into memory; do NOT claim saved
 */
export type DurableCommitResult =
  | "persisted"
  | "memory_only"
  | "persist_failed"
  | "rejected_stale";

export interface FailureOutcome {
  readonly failCount: number;
  readonly lifeSpent: boolean;
  /** True when GDD §5.2's free first failure absorbed this one. */
  readonly firstFailureExempt: boolean;
  readonly livesRemaining: number;
  readonly starsIfCleared: number;
  /**
   * False when a stale-write conflict rejected the failure (after one adopt
   * retry). Callers must not debit lives / bump fail UI / telemeter from a
   * rejected mutation.
   */
  readonly applied: boolean;
}

export interface ClearOutcome {
  readonly stars: number;
  readonly bestStars: number;
  readonly improved: boolean;
  readonly totalStars: number;
  /**
   * Exact stars this successful clear mutation added to `totalStars`
   * (`bestStars - previousBest`). Always 0 when `applied` is false.
   * Use this for star-bank telemetry — never `totalStars - starsBefore`,
   * which overcounts foreign-tab stars adopted during a retry.
   */
  readonly starsAdded: number;
  /**
   * False when a stale-write conflict rejected the clear (after one adopt
   * retry). Callers must not award stars, claim win telemetry, or show
   * "cleared — N stars" against a save that lacks the clear.
   */
  readonly applied: boolean;
}

/** Wall clock, injectable so tests can move time without waiting. */
export type Clock = () => number;

const MINUTE = 60_000;

/**
 * Stars, lives and save data. Owns nothing about gameplay — the Director
 * reports what happened and this decides what it costs.
 */
export class Economy {
  private save: SaveData;

  /**
   * Whether commit should mirror primary → backup (generational park).
   * False only while running on an emptySave fallback after an unreadable
   * primary with no valid backup — so ctor regenerate cannot wipe recovery
   * or replace a still-valid backup with an empty shell. Flips on once the
   * player earns real progress (or when load recovered from backup).
   */
  private mirrorBackup: boolean;

  /**
   * When false, commit updates in-memory state only — no durable primary or
   * backup writes. Set for read-unavailable sessions, and for empty fallback
   * until recovery is genuinely secured.
   */
  private allowDurableWrites: boolean;

  /**
   * False when the last durable writeSave failed (quota/private/throw) or when
   * durable writes are blocked for the session. In-memory `state` may still be
   * current — do not claim "saved" when false.
   */
  private persistOk = true;

  /**
   * Exact SAVE_KEY payload this session last loaded or successfully wrote.
   * `null` means we expect no validated primary (missing / empty-fallback start).
   * Used for compare-before-write foreign detection — not an atomic CAS token.
   */
  private expectedPrimaryRaw: string | null = null;

  /** Outcome of the most recent commit / adoptFromStore path. */
  private commitResult: DurableCommitResult = "persisted";

  private storageReadableFlag: boolean;
  private recoverySecuredFlag: boolean;
  private pendingRecoveryRaw: string | null;
  private readonly recoveredFromBackupFlag: boolean;
  private readonly primaryUnreadableFlag: boolean;

  /** Session-monotonic ms since the player ran out. Not persisted, by design. */
  private lockoutSince: number | null = null;

  constructor(
    private readonly store: SaveStore,
    private readonly now: Clock = () => Date.now(),
    readonly config: EconomyConfig = DEFAULT_ECONOMY,
    /**
     * A clock that only moves forward and cannot be set by the player. Used
     * solely by the hard-lock fallback, which must work when the wall clock is
     * broken or has been wound backward.
     */
    private readonly monotonic: Clock = () => performance.now(),
  ) {
    const loaded = loadSaveStatus(store, this.now(), config.maxLives);
    this.save = loaded.save;
    this.storageReadableFlag = loaded.storageReadable;
    this.recoverySecuredFlag = loaded.recoverySecured;
    this.pendingRecoveryRaw = loaded.pendingRecoveryRaw;
    this.recoveredFromBackupFlag = loaded.recoveredFromBackup;
    this.primaryUnreadableFlag = loaded.primaryUnreadable;

    // P0-A: read-unavailable → never fallback primary/backup writes.
    // P0-B: unreadable primary + no valid backup + recovery not secured →
    // block ALL durable fallback writes including SAVE_KEY.
    // Valid backup recovery may safely restore primary even if preserve failed.
    if (!loaded.storageReadable) {
      this.allowDurableWrites = false;
      this.mirrorBackup = false;
      this.persistOk = false;
    } else if (loaded.recoveredFromBackup) {
      this.allowDurableWrites = true;
      this.mirrorBackup = true;
    } else if (loaded.primaryUnreadable && !loaded.recoverySecured) {
      this.allowDurableWrites = false;
      this.mirrorBackup = false;
      this.persistOk = false;
    } else {
      // Healthy load, or empty fallback with recovery already secured.
      this.allowDurableWrites = true;
      this.mirrorBackup = !loaded.primaryUnreadable || loaded.recoveredFromBackup;
    }

    // Session expected-primary token from the durable bytes we actually observed.
    const primaryAtLoad = safeReadResult(store, SAVE_KEY);
    if (primaryAtLoad.status === "found") {
      // Raw string is the fingerprint even when unreadable — recovery rewrite
      // below publishes a new expected token on success.
      this.expectedPrimaryRaw = primaryAtLoad.value;
    } else {
      this.expectedPrimaryRaw = null;
    }

    if (loaded.recoveredFromBackup && this.allowDurableWrites) {
      // Restore a healthy primary immediately so later commits are not writing
      // over corrupt bytes without a validated working copy on SAVE_KEY.
      // Skip expectedPrimary guard: we are intentionally replacing unreadable
      // primary with validated backup (not a stale multi-tab publish).
      const rewritten = attemptWriteSave(this.store, this.save, { mirrorBackup: true });
      this.persistOk = rewritten.status === "written";
      this.commitResult = this.persistOk ? "persisted" : "persist_failed";
      if (rewritten.status === "written") {
        this.expectedPrimaryRaw = JSON.stringify(this.save);
      }
    }
    this.regenerate();
    if (this.save.lives <= 0) this.lockoutSince = this.monotonic();
  }

  /** Load outcome for UI + tests (backup recovery / preserved raw / readability). */
  get loadStatus(): Omit<SaveLoadStatus, "save" | "pendingRecoveryRaw"> {
    return {
      recoveredFromBackup: this.recoveredFromBackupFlag,
      hasRecoveryRaw: this.recoverySecuredFlag || storeHasRecoveryRaw(this.store),
      primaryUnreadable: this.primaryUnreadableFlag,
      storageReadable: this.storageReadableFlag,
      recoverySecured: this.recoverySecuredFlag || storeHasRecoveryRaw(this.store),
    };
  }

  get hasRecoveryRaw(): boolean {
    return this.recoverySecuredFlag || storeHasRecoveryRaw(this.store);
  }

  get recoveredFromBackup(): boolean {
    return this.recoveredFromBackupFlag;
  }

  get storageReadable(): boolean {
    return this.storageReadableFlag;
  }

  get recoverySecured(): boolean {
    return this.recoverySecuredFlag || storeHasRecoveryRaw(this.store);
  }

  /** False when the last commit/recover write did not reach durable storage. */
  get lastPersistOk(): boolean {
    return this.persistOk;
  }

  /**
   * Explicit last commit outcome. When `rejected_stale`, the local mutation was
   * not published and memory now mirrors the newest validated foreign primary.
   */
  get lastCommitResult(): DurableCommitResult {
    return this.commitResult;
  }

  /**
   * Exact primary payload string this session expects on SAVE_KEY, or null when
   * no validated primary was established yet. Test/diagnostics aid.
   */
  get expectedPrimaryToken(): string | null {
    return this.expectedPrimaryRaw;
  }

  get state(): SaveData {
    return this.save;
  }

  progressFor(levelId: string): LevelProgress {
    return this.save.levels[levelId] ?? EMPTY_PROGRESS;
  }

  get lives(): number {
    this.regenerate();
    return this.save.lives;
  }

  private trySecurePendingRecovery(): void {
    if (!this.pendingRecoveryRaw) return;
    if (!preserveRecoveryRawOnce(this.store, this.pendingRecoveryRaw)) return;
    this.pendingRecoveryRaw = null;
    this.recoverySecuredFlag = true;
    // Recovery secured: empty-fallback commits may write SAVE_KEY (not backup
    // until real progress), matching the secured empty-fallback path.
    if (this.storageReadableFlag && !this.recoveredFromBackupFlag) {
      this.allowDurableWrites = true;
      this.mirrorBackup = false;
    }
  }

  private commit(next: SaveData): DurableCommitResult {
    if (!this.storageReadableFlag) {
      this.save = next;
      this.persistOk = false;
      this.commitResult = "memory_only";
      if (next.lives <= 0) this.lockoutSince ??= this.monotonic();
      else this.lockoutSince = null;
      return this.commitResult;
    }

    this.trySecurePendingRecovery();

    if (!this.allowDurableWrites) {
      this.save = next;
      this.persistOk = false;
      this.commitResult = "memory_only";
      if (next.lives <= 0) this.lockoutSince ??= this.monotonic();
      else this.lockoutSince = null;
      return this.commitResult;
    }

    // Once the player has any progress after an empty fallback, start mirroring
    // so future healthy commits refresh backup again (generational park).
    if (
      !this.mirrorBackup &&
      (Object.keys(next.levels).length > 0 || next.totalStars > 0 || next.starsSpent > 0)
    ) {
      this.mirrorBackup = true;
    }

    const outcome = attemptWriteSave(this.store, next, {
      mirrorBackup: this.mirrorBackup,
      expectedPrimary: this.expectedPrimaryRaw,
    });

    if (outcome.status === "conflict") {
      // R1: reject stale durable write; adopt newest validated foreign save.
      // Do not park stale into backup (attemptWriteSave already skipped writes).
      this.save = outcome.current;
      this.expectedPrimaryRaw = outcome.currentRaw;
      this.persistOk = false;
      this.commitResult = "rejected_stale";
      if (this.save.lives <= 0) this.lockoutSince ??= this.monotonic();
      else this.lockoutSince = null;
      return this.commitResult;
    }

    this.save = next;
    if (outcome.status === "written") {
      this.expectedPrimaryRaw = JSON.stringify(next);
      this.persistOk = true;
      this.commitResult = "persisted";
    } else if (outcome.status === "incomplete") {
      // Primary confirmed on SAVE_KEY — advance expected token so the next
      // healthy commit does not self-conflict. Full durability still failed.
      this.expectedPrimaryRaw = outcome.primaryRaw;
      this.persistOk = false;
      this.commitResult = "persist_failed";
    } else {
      // Primary not written (or fail-closed preflight). Keep prior expected token.
      this.persistOk = false;
      this.commitResult = "persist_failed";
    }

    // Track when the lockout started, on a clock the player cannot set.
    if (next.lives <= 0) this.lockoutSince ??= this.monotonic();
    else this.lockoutSince = null;
    return this.commitResult;
  }

  /**
   * Browser `storage` event integration point (other same-origin tabs).
   *
   * When `key` is SAVE_KEY (or null = Storage clear), re-read and adopt a
   * validated foreign primary into memory without deleting backup/recovery.
   * Core correctness is covered by commit's compare-before-write and is
   * testable with MemoryStore + two Economy instances; this hook only keeps
   * live UI from staying stale until the next mutation.
   *
   * @returns true when memory was updated from a foreign validated primary.
   */
  adoptFromStore(key: string | null = SAVE_KEY): boolean {
    if (key !== null && key !== SAVE_KEY) return false;
    if (!this.storageReadableFlag) return false;

    const primary = safeReadResult(this.store, SAVE_KEY);
    if (primary.status !== "found") return false;
    if (primary.value === this.expectedPrimaryRaw) return false;

    let parsed: unknown;
    try {
      parsed = JSON.parse(primary.value);
    } catch {
      return false;
    }
    const validated = migrate(parsed);
    if (!validated) return false;

    this.save = validated;
    this.expectedPrimaryRaw = primary.value;
    this.persistOk = false;
    this.commitResult = "rejected_stale";
    if (this.save.lives <= 0) this.lockoutSince ??= this.monotonic();
    else this.lockoutSince = null;
    return true;
  }

  private setProgress(
    levelId: string,
    progress: LevelProgress,
    extra: Partial<SaveData> = {},
  ): DurableCommitResult {
    return this.commit({
      ...this.save,
      ...extra,
      levels: { ...this.save.levels, [levelId]: progress },
    });
  }

  /**
   * Credit regenerated lives.
   *
   * GDD §13 Severity 2, device-clock exploit. The defence is a high-water mark:
   * the effective clock is `max(now, clockHighWater)` and never moves backward.
   *
   * Winding the device back earns nothing, because the effective clock stays at
   * the high-water mark. Winding forward again to where it started also earns
   * nothing, for the same reason — which is the case that matters, since a
   * rollback is only useful to an attacker if the time can then be re-spent.
   *
   * The anchor is NEVER pinned to a rolled-back `now`. An earlier version did
   * that and manufactured the exploit it was meant to prevent: re-anchoring to
   * `now - 24h` and then returning to the present credited a full day.
   *
   * A genuine forward leap is not distinguishable from a legitimately long
   * absence without an authority, so it is allowed and simply capped by
   * `maxLives`. SERVER TIME PLUGS IN HERE: replace `this.now()` with a
   * server-anchored clock and the high-water mark becomes redundant.
   */
  private regenerate(): void {
    const { maxLives, lifeRegenMinutes } = this.config;
    const effectiveNow = Math.max(this.now(), this.save.clockHighWater);

    if (this.save.lives >= maxLives) {
      // Full: keep the anchor current so the next drain starts a fresh window.
      if (this.save.lastLifeGrantedAt !== effectiveNow) {
        this.commit({
          ...this.save,
          lastLifeGrantedAt: effectiveNow,
          clockHighWater: effectiveNow,
        });
      }
      return;
    }

    const period = lifeRegenMinutes * MINUTE;
    const earned = Math.floor((effectiveNow - this.save.lastLifeGrantedAt) / period);

    if (earned <= 0) {
      if (this.save.clockHighWater !== effectiveNow) {
        this.commit({ ...this.save, clockHighWater: effectiveNow });
      }
      return;
    }

    const lives = Math.min(maxLives, this.save.lives + earned);
    const granted = lives - this.save.lives;
    this.commit({
      ...this.save,
      lives,
      lastLifeGrantedAt: this.save.lastLifeGrantedAt + granted * period,
      clockHighWater: effectiveNow,
    });
  }

  /**
   * Hard-lock fallback (GDD §13 Severity 2): zero lives, zero gold, ad failed
   * or offline is a state with no exit.
   *
   * Chosen: a guaranteed grant after `hardLockGraceMinutes` of SESSION time,
   * measured on a monotonic clock the player cannot set.
   *
   * Normal regeneration is already unconditional — it needs no gold, no ad and
   * no network — so on a healthy device the player is never locked out and this
   * never fires. It exists for the case where regeneration itself cannot help:
   * a device clock that is broken or has been wound backward, where the
   * high-water defence correctly refuses to credit anything and would otherwise
   * strand the player forever.
   *
   * Preferred over "one free life on cold start" because cold start is
   * player-controlled — force-quitting to mint lives is the same shape as the
   * clock exploit. A monotonic timer cannot be triggered on demand, and
   * restarting the app only resets it, which costs the player time rather than
   * gaining them any.
   */
  grantHardLockLife(): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      this.regenerate();
      if (this.save.lives > 0) return false;
      if (this.lockoutSince === null) {
        this.lockoutSince = this.monotonic();
        return false;
      }
      if (this.monotonic() - this.lockoutSince < this.config.hardLockGraceMinutes * MINUTE) {
        return false;
      }

      const now = Math.max(this.now(), this.save.clockHighWater);
      const result = this.commit({
        ...this.save,
        lives: 1,
        lastLifeGrantedAt: now,
        clockHighWater: now,
      });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.save.lives > 0;
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  /**
   * Grant a life bought with a rewarded ad view (GDD §5.2, §12).
   *
   * Capped at the normal ceiling, so watching ads cannot stockpile lives beyond
   * what waiting would give — the ad buys TIME, not an advantage, which is what
   * keeps it outside the fairness contract in §8.1.
   *
   * Does not touch the regeneration anchor: an ad life is a top-up, and moving
   * the anchor would silently cancel the refill the player was already waiting
   * for, charging them an ad for something they had nearly earned.
   */
  /**
   * Review/harness only — force the life count (and lockout when zero).
   * Resets the regen anchor so a forced zero stays visible for screenshots.
   *
   * Intentionally single-shot (no adopt/retry): not a player-facing mutation.
   * Time regen via `regenerate` similarly stays eventual / tick-driven.
   */
  setLives(n: number): void {
    const lives = Math.max(0, Math.min(this.config.maxLives, Math.floor(n)));
    const now = Math.max(this.now(), this.save.clockHighWater);
    this.commit({ ...this.save, lives, lastLifeGrantedAt: now, clockHighWater: now });
  }

  grantAdLife(): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      this.regenerate();
      if (this.save.lives >= this.config.maxLives) return false;
      const before = this.save.lives;
      const result = this.commit({ ...this.save, lives: this.save.lives + 1 });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.save.lives > before;
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  /** Can the player start this level? Lives are off in World 1 (§7.2). */
  canPlay(levelId: string): boolean {
    if (!livesActiveFor(levelId, this.config)) return true;
    return this.lives > 0;
  }

  /**
   * Record a failure. Debits a life unless the level is unplayed and its free
   * first failure is still available (§5.2).
   */
  recordFailure(levelId: string): FailureOutcome {
    const unapplied = (): FailureOutcome => {
      const p = this.progressFor(levelId);
      return {
        failCount: p.failCount,
        lifeSpent: false,
        firstFailureExempt: false,
        livesRemaining: this.save.lives,
        starsIfCleared: starsFor(p.failCount, this.config),
        applied: false,
      };
    };

    const attempt = (): FailureOutcome => {
      this.regenerate();
      const before = this.progressFor(levelId);
      const failCount = before.failCount + 1;

      const livesActive = livesActiveFor(levelId, this.config);
      const exempt = livesActive && !before.cleared && !before.firstFailureUsed;
      const spend = livesActive && !exempt && this.save.lives > 0;

      const progress: LevelProgress = {
        ...before,
        failCount,
        firstFailureUsed: before.firstFailureUsed || exempt,
        ratingAttempt: "tainted",
      };

      const result = this.setProgress(
        levelId,
        progress,
        spend ? { lives: this.save.lives - 1 } : {},
      );

      if (result === "rejected_stale") return unapplied();

      return {
        failCount: this.progressFor(levelId).failCount,
        lifeSpent: spend,
        firstFailureExempt: exempt,
        livesRemaining: this.save.lives,
        starsIfCleared: starsFor(this.progressFor(levelId).failCount, this.config),
        applied: true,
      };
    };

    const first = attempt();
    if (first.applied) return first;
    if (this.lastCommitResult === "rejected_stale") {
      const second = attempt();
      return second;
    }
    return first;
  }

  /**
   * Record a clear. Stars come from failures accumulated on the level, and a
   * replay may improve the stored best (§5.1).
   */
  recordClear(levelId: string): ClearOutcome {
    const unapplied = (): ClearOutcome => {
      const p = this.progressFor(levelId);
      return {
        stars: 0,
        bestStars: p.bestStars,
        improved: false,
        totalStars: this.save.totalStars,
        starsAdded: 0,
        applied: false,
      };
    };

    const attempt = (): ClearOutcome => {
      const before = this.progressFor(levelId);
      const stars = before.ratingAttempt === "clean" ? 3 : starsFor(before.failCount, this.config);
      const bestStars = Math.max(before.bestStars, stars);
      const improved = bestStars > before.bestStars;
      const starsAdded = bestStars - before.bestStars;

      const result = this.setProgress(
        levelId,
        { ...before, cleared: true, bestStars, ratingAttempt: "tainted" },
        { totalStars: this.save.totalStars + starsAdded },
      );

      if (result === "rejected_stale") return unapplied();

      return {
        stars,
        bestStars: this.progressFor(levelId).bestStars,
        improved,
        totalStars: this.save.totalStars,
        starsAdded,
        applied: true,
      };
    };

    const first = attempt();
    if (first.applied) return first;
    if (this.lastCommitResult === "rejected_stale") return attempt();
    return first;
  }

  /* Rating for the current attempt, including a rewarded clean retry. */
  starsForAttempt(levelId: string): number {
    const progress = this.progressFor(levelId);
    return progress.ratingAttempt === "clean" ? 3 : starsFor(progress.failCount, this.config);
  }

  canStartCleanRetry(levelId: string): boolean {
    if (levelId < this.config.cleanRetryUnlockLevelId) return false;
    const progress = this.progressFor(levelId);
    return progress.failCount > 0 && progress.ratingAttempt !== "clean";
  }

  /* Mint the persisted clean-rating token exactly once after a verified ad. */
  beginCleanRetry(levelId: string): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      if (!this.canStartCleanRetry(levelId)) return false;
      const before = this.progressFor(levelId);
      const result = this.setProgress(levelId, { ...before, ratingAttempt: "clean" });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.progressFor(levelId).ratingAttempt === "clean";
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  /***
   * Milliseconds until the next life regenerates, or 0 when already full.
   *
   * The out-of-lives screen must ALWAYS show this, running, whether or not an
   * ad is available (§5.2). An ad is a way to skip the wait, never the only way
   * out — a screen whose only exit is a video is a screen that has taken the
   * player hostage.
   */
  msUntilNextLife(): number {
    this.regenerate();
    if (this.save.lives >= this.config.maxLives) return 0;
    const period = this.config.lifeRegenMinutes * MINUTE;
    const elapsed = Math.max(this.now(), this.save.clockHighWater) - this.save.lastLifeGrantedAt;
    return Math.max(0, period - (elapsed % period));
  }

  /** The life ceiling, so the map can draw empty pips as well as full ones. */
  get maxLivesAllowed(): number {
    return this.config.maxLives;
  }

  get starsAvailable(): number {
    return this.save.totalStars - this.save.starsSpent;
  }

  get selectedMode(): Mode {
    return this.save.selectedMode;
  }

  /**
   * Persist preferred mode. Adopt/re-check/retry-once on stale conflict so a
   * mode tap is not silently dropped while the board reopens under the old mode.
   * @returns false when the mode was not applied after one adopt retry.
   */
  selectMode(mode: Mode): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      if (this.save.selectedMode === mode) return true;
      const result = this.commit({ ...this.save, selectedMode: mode });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.save.selectedMode === mode;
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  /** Audio off. Persisted, so the choice survives a relaunch. Default ON. */
  get muted(): boolean {
    return this.save.muted;
  }

  /**
   * Persist mute preference. Adopt/re-check/retry-once on stale conflict so a
   * mute toggle is not silently ignored after a foreign tab advanced.
   * @returns false when mute was not applied after one adopt retry.
   */
  setMuted(muted: boolean): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      if (this.save.muted === muted) return true;
      const result = this.commit({ ...this.save, muted });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.save.muted === muted;
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  hintsPurchased(levelId: string): readonly string[] {
    return this.progressFor(levelId).hintsPurchased;
  }

  /**
   * Buy a hint, or re-reveal one already bought on this level.
   *
   * GDD §13: "Hint bought, level failed, restart — is it still revealed? YES.
   * Never charge twice for the same information on the same level." A hint
   * already in the list is free and always returns true.
   */
  purchaseHint(levelId: string, hint: string, cost: number): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      const before = this.progressFor(levelId);
      if (before.hintsPurchased.includes(hint)) return true;
      if (this.starsAvailable < cost) return false;

      const result = this.setProgress(
        levelId,
        { ...before, hintsPurchased: [...before.hintsPurchased, hint] },
        { starsSpent: this.save.starsSpent + cost },
      );
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.progressFor(levelId).hintsPurchased.includes(hint);
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  /**
   * ACADEMY RESTORATION (ART_DIRECTION §6).
   *
   * Prices are 1/1/2/2 per room — 6★ a world, 24★ across the ladder — set
   * against the STRUGGLING player's income rather than the 120★ ceiling, so
   * someone earning one star a level finishes the Academy as they finish the
   * game. (Track A reprice from 2/2/3/3 totaling 10★/room.)
   */
  static readonly RESTORE_COSTS: readonly number[] = [1, 1, 2, 2];

  /** Objects restored in a world, 0-4. */
  restoredIn(world: number): number {
    return this.save.restored[String(world)] ?? 0;
  }

  /** Cost of the next object in a world, or null when the room is finished. */
  nextRestoreCost(world: number): number | null {
    const done = this.restoredIn(world);
    return done >= 4 ? null : Economy.RESTORE_COSTS[done]!;
  }

  /**
   * Can this room be worked on at all?
   *
   * A room unlocks with its world: no furnishing the observatory before World 4
   * is reachable. `furthestReached` is lexicographic on ladder ids, so reaching
   * "4-01" is what opens room 4.
   */
  canRestore(world: number): boolean {
    return furthestReached(this.save) >= `${world}-01`;
  }

  /**
   * Buy the next object in a room.
   *
   * Spends from `starsSpent` — the SAME pool as hints, so a star cannot fund
   * both — and commits immediately, because a purchase held in memory is
   * refunded by a force-quit and §13 names that exploit by name.
   *
   * @returns false when the room is finished, locked, or unaffordable. Never
   * partially applies: the star and the object move together or not at all.
   */
  restore(world: number): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      if (!this.canRestore(world)) return false;
      const cost = this.nextRestoreCost(world);
      if (cost === null) return false;
      if (this.starsAvailable < cost) return false;

      const before = this.restoredIn(world);
      const result = this.commit({
        ...this.save,
        starsSpent: this.save.starsSpent + cost,
        restored: { ...this.save.restored, [String(world)]: before + 1 },
      });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.restoredIn(world) === before + 1;
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }

  /**
   * Start a fresh attempt at a cleared level. GDD §5.1: a replay can re-earn a
   * better rating, so the failure counter resets — but only for a level already
   * cleared, and the attempt still costs a life, so it is not farmable.
   */
  /**
   * Reset failCount for a cleared level. Adopt/re-check/retry-once on stale
   * conflict so a replay cannot start without the fail counter reset.
   * @returns false when not cleared, or when the reset did not apply after one
   * adopt retry.
   */
  beginReplay(levelId: string): boolean {
    let hitStale = false;
    const attempt = (): boolean => {
      const before = this.progressFor(levelId);
      if (!before.cleared) return false;
      if (before.failCount === 0) return true;
      const result = this.setProgress(levelId, { ...before, failCount: 0 });
      if (result === "rejected_stale") {
        hitStale = true;
        return false;
      }
      return this.progressFor(levelId).failCount === 0;
    };

    if (attempt()) return true;
    if (hitStale) return attempt();
    return false;
  }
}
