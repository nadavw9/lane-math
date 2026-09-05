import type { RecordedEvent, TelemetryEvent } from "./events.js";

/**
 * Where events go. Phase 4C ships the local sink only; the remote sink plugs in
 * at Phase 6 by implementing this and adding it to the list.
 */
export interface TelemetrySink {
  send(event: RecordedEvent): void;
}

/** Explicit no-op for builds or tests that do not want collection. */
export class NoopSink implements TelemetrySink {
  send(_event: RecordedEvent): void {
    // Intentionally empty.
  }
}

/** Console sink — the one you actually read during a playtest. */
export class ConsoleSink implements TelemetrySink {
  send({ event }: RecordedEvent): void {
    const { name, ...payload } = event;
    // eslint-disable-next-line no-console
    console.info(`[telemetry] ${name}`, payload);
  }
}

/** Ring-buffered localStorage sink, exportable as JSON. */
export class LocalStorageSink implements TelemetrySink {
  constructor(
    private readonly key = "lane-math.telemetry.v1",
    private readonly limit = 2000,
  ) {}

  send(event: RecordedEvent): void {
    const all = [...this.read(), event];
    // Bounded: a long session must not fill the quota and start throwing.
    const trimmed = all.length > this.limit ? all.slice(all.length - this.limit) : all;
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(trimmed));
    } catch {
      // Quota or private mode. Losing telemetry must never break the game.
    }
  }

  read(): RecordedEvent[] {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      return raw ? (JSON.parse(raw) as RecordedEvent[]) : [];
    } catch {
      return [];
    }
  }

  clear(): void {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      /* nothing to do */
    }
  }
}

export class MemorySink implements TelemetrySink {
  readonly events: RecordedEvent[] = [];
  send(event: RecordedEvent): void {
    this.events.push(event);
  }
}

const SESSION_KEY = "lane-math.session.v1";

/**
 * Records the §7.8 funnel.
 *
 * Deliberately dumb: it timestamps, tags with a session, and fans out to sinks.
 * Anything clever belongs in the analysis, not in the collection — a funnel you
 * cannot trust is worse than no funnel.
 */
export class Telemetry {
  private readonly sinks: TelemetrySink[];
  private readonly now: () => number;
  private sessionIndex = 0;
  /** Set when a board renders; cleared by the first tap on that board. */
  private boardRenderedAt: number | null = null;
  private levelStartedAt: number | null = null;
  private currentLevel: string | null = null;
  private readonly completedWorlds = new Set<number>();
  private opened = false;

  constructor(sinks: TelemetrySink[], now: () => number = () => Date.now()) {
    this.sinks = sinks;
    this.now = now;
  }

  /** GDD §7.8 `app_open`. Session index is persisted so it counts returns. */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    let previous = 0;
    try {
      previous = Number(globalThis.localStorage?.getItem(SESSION_KEY) ?? 0);
    } catch {
      previous = 0;
    }
    this.sessionIndex = previous + 1;
    try {
      globalThis.localStorage?.setItem(SESSION_KEY, String(this.sessionIndex));
    } catch {
      /* fine */
    }
    this.record({
      name: "app_open",
      first_open: previous === 0,
      session_index: this.sessionIndex,
    });
  }

  /** Which session this is. Tags an export so playtests can be told apart. */
  get session(): number {
    return this.sessionIndex;
  }

  record(event: TelemetryEvent): void {
    const recorded: RecordedEvent = { at: this.now(), session: this.sessionIndex, event };
    for (const sink of this.sinks) sink.send(recorded);
  }

  levelStart(levelId: string, attemptNumber: number, mode: string): void {
    this.currentLevel = levelId;
    this.levelStartedAt = this.now();
    this.boardRenderedAt = null;
    this.record({ name: "level_start", level_id: levelId, attempt_number: attemptNumber, mode });
  }

  /**
   * Called when the board is on screen and tappable. Starts the
   * `first_tap_latency` stopwatch.
   */
  boardRendered(): void {
    this.boardRenderedAt = this.now();
  }

  /**
   * Called on the player's first interaction with a board. Only the FIRST tap
   * after a render is timed — later taps are execution, not planning.
   */
  firstTap(): void {
    if (this.boardRenderedAt === null || this.currentLevel === null) return;
    const ms = this.now() - this.boardRenderedAt;
    this.boardRenderedAt = null;
    this.record({ name: "first_tap", level_id: this.currentLevel });
    this.record({ name: "first_tap_latency", level_id: this.currentLevel, ms });
  }

  levelClear(levelId: string, stars: number): void {
    this.record({ name: "level_clear", level_id: levelId, stars });
    const match = /^([0-9]+)-10$/.exec(levelId);
    if (match) this.worldComplete(Number(match[1]));
  }

  worldComplete(world: number): void {
    if (this.completedWorlds.has(world)) return;
    this.completedWorlds.add(world);
    this.record({ name: "world_complete", world });
  }

  mapOpen(focusLevelId: string | null = null): void {
    this.record(focusLevelId === null ? { name: "map_open" } : { name: "map_open", focus_level_id: focusLevelId });
  }

  adOfferShown(placement: string): void { this.record({ name: "ad_offer_shown", placement }); }
  adCompleted(placement: string): void { this.record({ name: "ad_completed", placement }); }
  adDismissed(placement: string): void { this.record({ name: "ad_dismissed", placement }); }
  adFailed(placement: string): void { this.record({ name: "ad_failed", placement }); }

  starBankUpdate(totalStars: number, delta: number, reason: string): void {
    this.record({ name: "star_bank_update", total_stars: totalStars, delta, reason });
  }

  cueShown(levelId: string, cue: string): void {
    this.record({ name: "ftue_cue_shown", level_id: levelId, cue });
  }

  levelComplete(levelId: string, stars: number, attempts: number): void {
    const duration = this.levelStartedAt === null ? 0 : this.now() - this.levelStartedAt;
    this.record({
      name: "level_complete",
      level_id: levelId,
      stars,
      attempts,
      duration_ms: duration,
    });
  }
}
