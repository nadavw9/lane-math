import { describe, expect, it } from "vitest";

import type { RecordedEvent } from "./events.js";
import { buildExport, summarise } from "./export.js";

/**
 * The funnel export (GDD §7.8).
 *
 * The delivery side needs a browser, but the part that can be wrong quietly is
 * the SUMMARY — and it is the whole reason the export exists. If the headline
 * number is computed wrongly, a playtest reads as a design failure that never
 * happened, or worse, as a success that did not.
 */
function firstTap(levelId: string, ms: number, session = 1): RecordedEvent {
  return { at: 0, session, event: { name: "first_tap_latency", level_id: levelId, ms } };
}

describe("the headline: first-tap latency by world", () => {
  it("groups by world and reports a median per world", () => {
    /*
     * §7.8 expects ~1s in World 1 rising to 10-30s by World 3. The export has
     * to make that shape visible at a glance, because the claim it tests — that
     * the player stops and plans — is exactly what a designer cannot judge from
     * playing their own game.
     */
    const summary = summarise([
      firstTap("1-01", 900),
      firstTap("1-02", 1100),
      firstTap("1-03", 1000),
      firstTap("3-01", 12000),
      firstTap("3-02", 20000),
      firstTap("3-03", 28000),
    ]);

    expect(summary.firstTapMedianByWorld).toEqual({ world_1: 1000, world_3: 20000 });
    expect(summary.firstTapSamplesByWorld).toEqual({ world_1: 3, world_3: 3 });
  });

  it("uses the median, so one interruption cannot fake engagement", () => {
    // A phone call mid-level produces a latency of minutes. A mean would report
    // that as deep planning; the median reports what a typical board cost.
    const summary = summarise([
      firstTap("1-01", 800),
      firstTap("1-02", 900),
      firstTap("1-03", 1000),
      firstTap("1-04", 1100),
      firstTap("1-05", 600000),
    ]);
    expect(summary.firstTapMedianByWorld["world_1"]).toBe(1000);
  });

  it("reports no worlds rather than a zero when nothing was played", () => {
    const summary = summarise([]);
    expect(summary.firstTapMedianByWorld).toEqual({});
    expect(summary.sessions).toBe(0);
  });
});

describe("the rest of the funnel", () => {
  it("counts starts, completions, failures and distinct sessions", () => {
    const summary = summarise([
      { at: 0, session: 1, event: { name: "level_start", level_id: "1-01", attempt: 1, mode: "normal" } },
      { at: 1, session: 1, event: { name: "level_complete", level_id: "1-01", stars: 3, ms: 40 } },
      { at: 1, session: 1, event: { name: "level_clear", level_id: "1-01", stars: 3 } },
      { at: 2, session: 2, event: { name: "level_start", level_id: "1-02", attempt: 1, mode: "normal" } },
      { at: 3, session: 2, event: { name: "level_fail", level_id: "1-02", target_index: 1, moves: 2 } },
    ] as unknown as RecordedEvent[]);

    expect(summary.levelsStarted).toBe(2);
    expect(summary.levelsCompleted).toBe(1);
    expect(summary.levelsFailed).toBe(1);
    expect(summary.sessions).toBe(2);
  });
});

describe("an export can be attributed to a build and a session", () => {
  it("carries the build hash, session index and event count", () => {
    const events = [firstTap("1-01", 1000, 4)];
    const payload = buildExport(events, "abc12345", 4);

    // Without these two, sessions from different builds look like one
    // inconsistent session, which is worse than no data.
    expect(payload.build).toBe("abc12345");
    expect(payload.sessionIndex).toBe(4);
    expect(payload.eventCount).toBe(1);
    expect(payload.events).toEqual(events);
    expect(Date.parse(payload.exportedAt)).not.toBeNaN();
  });

  it("keeps the raw events, not only the summary", () => {
    // The summary answers today's question; the raw events answer the ones
    // asked after reading it.
    const events = [firstTap("2-01", 5000), firstTap("2-02", 7000)];
    expect(buildExport(events, "b", 1).events).toHaveLength(2);
  });
});
