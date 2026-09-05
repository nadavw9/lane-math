import { describe, expect, it } from "vitest";

import { MemorySink, Telemetry } from "./telemetry.js";

describe("FTUE funnel lifecycle", () => {
  it("records app_open only once per telemetry instance", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink]);
    telemetry.open();
    telemetry.open();
    expect(sink.events.filter((event) => event.event.name === "app_open")).toHaveLength(1);
  });

  it("records map opens with an optional focused level", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink]);
    telemetry.mapOpen();
    telemetry.mapOpen("1-02");
    expect(sink.events.map((event) => event.event)).toEqual([
      { name: "map_open" },
      { name: "map_open", focus_level_id: "1-02" },
    ]);
  });

  it("records each ad offer exactly once with its terminal outcome", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink]);
    telemetry.adOfferShown("continue");
    telemetry.adDismissed("continue");
    telemetry.adOfferShown("life_refill");
    telemetry.adCompleted("life_refill");
    telemetry.adOfferShown("ftue_hint");
    telemetry.adFailed("ftue_hint");
    expect(sink.events.map((event) => event.event)).toEqual([
      { name: "ad_offer_shown", placement: "continue" },
      { name: "ad_dismissed", placement: "continue" },
      { name: "ad_offer_shown", placement: "life_refill" },
      { name: "ad_completed", placement: "life_refill" },
      { name: "ad_offer_shown", placement: "ftue_hint" },
      { name: "ad_failed", placement: "ftue_hint" },
    ]);
  });

  it("closes one live attempt on abandon and ignores later duplicate exits", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink]);
    telemetry.levelStart("1-04", 2, "normal");
    telemetry.levelAbandon("1-04", 2, "map");
    telemetry.levelAbandon("1-04", 2, "app_exit");
    expect(sink.events.map((event) => event.event)).toEqual([
      { name: "level_start", level_id: "1-04", attempt_number: 2, mode: "normal" },
      { name: "level_abandon", level_id: "1-04", attempt_number: 2, reason: "map" },
    ]);
  });

  it("does not abandon an attempt after its canonical terminal event", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink]);
    telemetry.levelStart("1-04", 1, "normal");
    telemetry.levelFail("1-04", 2, 1);
    telemetry.levelAbandon("1-04", 1, "map");
    expect(sink.events.map((event) => event.event.name)).toEqual(["level_start", "level_fail"]);
  });

  it("emits world_complete once when level 10 clears", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink]);
    telemetry.levelClear("1-10", 3);
    telemetry.levelClear("1-10", 3);
    telemetry.levelClear("2-10", 2);
    expect(sink.events.filter((event) => event.event.name === "world_complete").map((event) => event.event)).toEqual([
      { name: "world_complete", world: 1 },
      { name: "world_complete", world: 2 },
    ]);
  });
});
