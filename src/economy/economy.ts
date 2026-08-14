import type { Mode } from "../solver/index.js";
import { DEFAULT_ECONOMY, livesActiveFor, starsFor, type EconomyConfig } from "./config.js";
import {
  EMPTY_PROGRESS,
  loadSave,
  writeSave,
  type LevelProgress,
  type SaveData,
  type SaveStore,
} from "./save.js";

export interface FailureOutcome {
  readonly failCount: number;
  readonly lifeSpent: boolean;
  /** True when GDD §5.2's free first failure absorbed this one. */
  readonly firstFailureExempt: boolean;
  readonly livesRemaining: number;
  readonly starsIfCleared: number;
}

export interface ClearOutcome {
  readonly stars: number;
  readonly bestStars: number;
  readonly improved: boolean;
  readonly totalStars: number;
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
    this.save = loadSave(store, this.now(), config.maxLives);
    this.regenerate();
    if (this.save.lives <= 0) this.lockoutSince = this.monotonic();
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

  private commit(next: SaveData): void {
    this.save = next;
    writeSave(this.store, next);

    // Track when the lockout started, on a clock the player cannot set.
    if (next.lives <= 0) this.lockoutSince ??= this.monotonic();
    else this.lockoutSince = null;
  }

  private setProgress(levelId: string, progress: LevelProgress, extra: Partial<SaveData> = {}): void {
    this.commit({
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
    this.commit({
      ...this.save,
      lives: 1,
      lastLifeGrantedAt: now,
      clockHighWater: now,
    });
    return true;
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
    };

    this.setProgress(levelId, progress, spend ? { lives: this.save.lives - 1 } : {});

    return {
      failCount,
      lifeSpent: spend,
      firstFailureExempt: exempt,
      livesRemaining: this.save.lives,
      starsIfCleared: starsFor(failCount, this.config),
    };
  }

  /**
   * Record a clear. Stars come from failures accumulated on the level, and a
   * replay may improve the stored best (§5.1).
   */
  recordClear(levelId: string): ClearOutcome {
    const before = this.progressFor(levelId);
    const stars = starsFor(before.failCount, this.config);
    const bestStars = Math.max(before.bestStars, stars);
    const improved = bestStars > before.bestStars;

    this.setProgress(
      levelId,
      { ...before, cleared: true, bestStars },
      { totalStars: this.save.totalStars + (bestStars - before.bestStars) },
    );

    return { stars, bestStars, improved, totalStars: this.save.totalStars };
  }

  /** Stars available to spend: banked minus already spent (GDD §5.4). */
  get starsAvailable(): number {
    return this.save.totalStars - this.save.starsSpent;
  }

  get selectedMode(): Mode {
    return this.save.selectedMode;
  }

  selectMode(mode: Mode): void {
    this.commit({ ...this.save, selectedMode: mode });
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
    const before = this.progressFor(levelId);
    if (before.hintsPurchased.includes(hint)) return true;
    if (this.starsAvailable < cost) return false;

    this.setProgress(
      levelId,
      { ...before, hintsPurchased: [...before.hintsPurchased, hint] },
      { starsSpent: this.save.starsSpent + cost },
    );
    return true;
  }

  /**
   * Start a fresh attempt at a cleared level. GDD §5.1: a replay can re-earn a
   * better rating, so the failure counter resets — but only for a level already
   * cleared, and the attempt still costs a life, so it is not farmable.
   */
  beginReplay(levelId: string): void {
    const before = this.progressFor(levelId);
    if (!before.cleared) return;
    this.setProgress(levelId, { ...before, failCount: 0 });
  }
}
