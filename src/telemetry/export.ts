import type { RecordedEvent } from "./events.js";

/**
 * Getting the §7.8 funnel off a phone (no backend, no dependency).
 *
 * The funnel writes to localStorage, which on a desktop is a DevTools away and
 * on a phone is unreachable. A playtest that cannot be read is not a playtest,
 * so this packages the whole thing as one JSON blob and hands it to whatever
 * the device offers: the share sheet first, the clipboard next, a file last.
 *
 * The one number this exists to surface is FIRST_TAP_LATENCY. §7.8 expects
 * about a second in World 1 rising to 10-30s by World 3, because the game's
 * claim is that the player stops and plans. If it stays near a second, the
 * core design is not landing — and that has to be visible in data rather than
 * inferred from how the game felt to play, which is exactly the thing a
 * designer cannot judge about their own game.
 */

export interface FunnelSummary {
  /** Median first-tap latency per world, in ms. The headline. */
  readonly firstTapMedianByWorld: Record<string, number>;
  readonly firstTapSamplesByWorld: Record<string, number>;
  readonly levelsStarted: number;
  /** Count of GDD-canonical `level_complete`; compatibility `level_clear` is ignored. */
  readonly levelsCompleted: number;
  readonly levelsFailed: number;
  readonly sessions: number;
}

export interface FunnelExport {
  readonly build: string;
  readonly sessionIndex: number;
  readonly exportedAt: string;
  readonly userAgent: string;
  readonly viewport: string;
  readonly eventCount: number;
  readonly summary: FunnelSummary;
  readonly events: readonly RecordedEvent[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/**
 * Summarise the funnel so the headline is readable without tooling.
 *
 * Median rather than mean: one interruption — a phone call, putting the game
 * down mid-level — produces a latency of minutes and would drag an average
 * somewhere meaningless. The median is what a typical board actually cost.
 */
export function summarise(events: readonly RecordedEvent[]): FunnelSummary {
  const byWorld = new Map<string, number[]>();
  let started = 0;
  let completed = 0;
  let failed = 0;
  const sessions = new Set<number>();

  for (const record of events) {
    sessions.add(record.session);
    const event = record.event;

    if (event.name === "first_tap_latency") {
      const world = event.level_id.split("-")[0] ?? "?";
      const list = byWorld.get(world) ?? [];
      list.push(event.ms);
      byWorld.set(world, list);
    }
    if (event.name === "level_start") started++;
    // `level_clear` is a compatibility convenience emitted beside the
    // GDD-canonical event. Counting both would double every completion.
    if (event.name === "level_complete") completed++;
    if (event.name === "level_fail") failed++;
  }

  const medians: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const [world, samples] of [...byWorld.entries()].sort()) {
    medians[`world_${world}`] = median(samples);
    counts[`world_${world}`] = samples.length;
  }

  return {
    firstTapMedianByWorld: medians,
    firstTapSamplesByWorld: counts,
    levelsStarted: started,
    levelsCompleted: completed,
    levelsFailed: failed,
    sessions: sessions.size,
  };
}

export function buildExport(
  events: readonly RecordedEvent[],
  build: string,
  sessionIndex: number,
): FunnelExport {
  return {
    build,
    sessionIndex,
    exportedAt: new Date().toISOString(),
    // Device context, because "10s on a phone" and "10s on a desktop" are not
    // the same observation and a playtest set will mix them.
    userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    viewport:
      typeof window === "undefined" ? "unknown" : `${window.innerWidth}x${window.innerHeight}`,
    eventCount: events.length,
    summary: summarise(events),
    events,
  };
}

export type DeliveryMethod = "share" | "clipboard" | "download" | "failed";

/**
 * Hand the payload to the device, best option first.
 *
 * Share sheet, then clipboard, then a file. On a phone the share sheet is the
 * only one that reaches another app in one gesture — the point is to get the
 * JSON into a message or a note without a cable — and the other two are there
 * because iOS Safari and older Android each withhold one of them.
 */
export async function deliver(payload: FunnelExport): Promise<DeliveryMethod> {
  const json = JSON.stringify(payload, null, 2);
  const filename = `lane-math-funnel-${payload.build}-s${payload.sessionIndex}.json`;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const file =
        typeof File !== "undefined"
          ? new File([json], filename, { type: "application/json" })
          : null;
      // Sharing a FILE keeps it intact; sharing text works everywhere but some
      // targets truncate a long body, which would silently lose the tail of a
      // session.
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Lane Math funnel" });
        return "share";
      }
      await navigator.share({ title: "Lane Math funnel", text: json });
      return "share";
    }
  } catch {
    // A cancelled share sheet lands here too. Fall through and try the rest,
    // so a mis-tap does not lose the export.
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(json);
      return "clipboard";
    }
  } catch {
    /* keep going */
  }

  try {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "download";
  } catch {
    return "failed";
  }
}
