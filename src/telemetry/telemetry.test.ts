import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Economy } from "../economy/economy.js";
import { MemoryStore } from "../economy/save.js";
import { Director } from "../game/director.js";
import type { Command, LadderLevel, ViewState } from "../game/types.js";
import { enumerate } from "../solver/index.js";
import { MemorySink, Telemetry } from "./telemetry.js";
import type { TelemetryEventName } from "./events.js";

const stateOf = (commands: readonly Command[]): ViewState => {
  const render = [...commands].reverse().find((c) => c.type === "render");
  if (!render || render.type !== "render") throw new Error("no render command");
  return render.state;
};

const load = (id: string): LadderLevel =>
  JSON.parse(readFileSync(`levels/${id}.json`, "utf8")) as LadderLevel;

const T0 = 1_700_000_000_000;

function clock(start = T0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

const names = (sink: MemorySink): TelemetryEventName[] =>
  sink.events.map((e) => e.event.name);

const find = <N extends TelemetryEventName>(sink: MemorySink, name: N) =>
  sink.events.find((e) => e.event.name === name)?.event as
    | Extract<import("./events.js").TelemetryEvent, { name: N }>
    | undefined;

describe("first_tap_latency (GDD §7.8)", () => {
  it("measures ms from board render to the first tap, and only the first", () => {
    const sink = new MemorySink();
    const c = clock();
    const telemetry = new Telemetry([sink], c.now);
    const level = load("1-01");

    const director = new Director(level, "normal", new Economy(new MemoryStore(), c.now), telemetry);
    let state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));

    // The player thinks for 4.2 seconds before touching anything.
    c.advance(4200);
    const first = state.tiles.find((t) => !t.consumed)!;
    state = stateOf(director.handle({ type: "tapTile", id: first.id }));

    const latency = find(sink, "first_tap_latency");
    expect(latency).toBeDefined();
    expect(latency!.ms).toBe(4200);
    expect(latency!.level_id).toBe("1-01");

    // Later taps are execution, not planning — exactly one event.
    c.advance(900);
    stateOf(director.handle({ type: "tapOperator", op: "+" }));
    expect(names(sink).filter((n) => n === "first_tap_latency")).toHaveLength(1);
  });

  it("restarts the stopwatch on restart, so each attempt is measured", () => {
    const sink = new MemorySink();
    const c = clock();
    const telemetry = new Telemetry([sink], c.now);
    const director = new Director(
      load("1-01"),
      "normal",
      new Economy(new MemoryStore(), c.now),
      telemetry,
    );

    let state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    c.advance(1000);
    state = stateOf(director.handle({ type: "tapTile", id: state.tiles[0]!.id }));

    stateOf(director.handle({ type: "tapRestart" }));
    c.advance(7000);
    state = stateOf(director.handle({ type: "tapTile", id: state.tiles[0]!.id }));

    const latencies = sink.events
      .filter((e) => e.event.name === "first_tap_latency")
      .map((e) => (e.event as { ms: number }).ms);
    expect(latencies).toEqual([1000, 7000]);
  });

  it("is not triggered by opening the shop — that is not a move", () => {
    const sink = new MemorySink();
    const c = clock();
    const telemetry = new Telemetry([sink], c.now);
    const director = new Director(
      load("1-01"),
      "normal",
      new Economy(new MemoryStore(), c.now),
      telemetry,
    );
    stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    c.advance(500);
    stateOf(director.handle({ type: "toggleShop" }));
    expect(names(sink)).not.toContain("first_tap_latency");
  });
});

describe("the funnel records every §7.8 event", () => {
  it("level_start, move_commit and level_complete on a clean win", () => {
    const sink = new MemorySink();
    const c = clock();
    const telemetry = new Telemetry([sink], c.now);
    const level = load("1-01");
    const director = new Director(level, "normal", new Economy(new MemoryStore(), c.now), telemetry);

    let state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    for (let guard = 0; guard < 10 && state.phase === "playing"; guard++) {
      const live = state.tiles
        .filter((t) => !t.consumed)
        .map((t) => ({ id: t.id, value: t.value, transformed: t.transformed }));
      const target = state.targets[state.targetIndex];
      if (target === undefined) break;
      const option = enumerate(live, target, state.budget, level.rules)[0];
      if (!option) break;
      c.advance(1500);
      state = stateOf(director.handle({ type: "tapTile", id: option.leftId }));
      state = stateOf(director.handle({ type: "tapOperator", op: option.op }));
      state = stateOf(director.handle({ type: "tapTile", id: option.rightId }));
      state = stateOf(director.handle({ type: "tapCommit" }));
    }

    expect(state.phase).toBe("won");
    expect(names(sink)).toContain("level_start");
    expect(names(sink)).toContain("move_commit");
    expect(names(sink)).toContain("level_complete");
    expect(names(sink)).toContain("level_clear");
    expect(names(sink)).toContain("equation_commit");
    expect(names(sink).filter((n) => n === "first_tap")).toHaveLength(1);

    expect(sink.events.filter((e) => e.event.name === "equation_commit")).toHaveLength(level.targets.length);
    expect(sink.events.filter((e) => e.event.name === "level_clear")).toHaveLength(1);

    const complete = find(sink, "level_complete")!;
    expect(complete.stars).toBe(3);
    expect(complete.duration_ms).toBeGreaterThan(0);

    const commits = sink.events.filter((e) => e.event.name === "move_commit");
    expect(commits).toHaveLength(level.targets.length);
    expect(commits.every((e) => (e.event as { correct: boolean }).correct)).toBe(true);
  });

  it("emits each FTUE cue once despite repeated renders", () => {
    const sink = new MemorySink();
    const c = clock();
    const telemetry = new Telemetry([sink], c.now);
    const director = new Director(load("1-01"), "normal", new Economy(new MemoryStore(), c.now), telemetry);

    stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    stateOf(director.handle({ type: "tick" }));
    expect(sink.events.filter((e) => e.event.name === "ftue_cue_shown")).toHaveLength(1);

    const state = stateOf(director.handle({ type: "loadLevel", id: "1-01" }));
    c.advance(10);
    stateOf(director.handle({ type: "tapTile", id: state.tiles[0]!.id }));
    stateOf(director.handle({ type: "tick" }));
    expect(sink.events.filter((e) => e.event.name === "first_tap")).toHaveLength(1);
  });

  it("records shell funnel names and de-duplicates world completion", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);

    telemetry.open();
    telemetry.mapOpen("1-02");
    telemetry.worldComplete(1);
    telemetry.worldComplete(1);
    telemetry.adOfferShown("ftue_hint");
    telemetry.adCompleted("ftue_hint");
    telemetry.adDismissed("continue");
    telemetry.adFailed("life_refill");
    telemetry.starBankUpdate(3, 3, "level_clear");

    expect(names(sink)).toEqual([
      "app_open",
      "map_open",
      "world_complete",
      "ad_offer_shown",
      "ad_completed",
      "ad_dismissed",
      "ad_failed",
      "star_bank_update",
    ]);
  });

  it("records an incorrect commit as correct:false without failing the level", () => {
    const sink = new MemorySink();
    const c = clock();
    const telemetry = new Telemetry([sink], c.now);
    /*
     * 2-01, NOT 1-01. §7.7 (amended) filters the pool on 1-01 so a wrong
     * equation cannot be formed there at all — which is the point of that rule
     * and makes 1-01 useless for testing an incorrect commit. Every other level
     * still forms one and refuses it with §9.5's shudder, which is the path
     * this event describes.
     */
    const level = load("2-01");
    const director = new Director(level, "normal", new Economy(new MemoryStore(), c.now), telemetry);
    let state = stateOf(director.handle({ type: "loadLevel", id: "2-01" }));

    /*
     * Pick the operator from the LEVEL's budget rather than naming one. 1-01
     * grants only `+` since Normal took the exact budget (§8.5 amended), and
     * the old fixed "-" was silently rejected — no commit was recorded and the
     * assertion below read `undefined.correct`.
     */
    const op = Object.keys(state.budget)[0] as "+" | "-" | "*" | "/";
    const live = state.tiles.filter((t) => !t.consumed);
    const target = state.targets[state.targetIndex]!;
    /*
     * Wrongness is checked for the ACTUAL operator, not just for `+`. The old
     * predicate returned true for every pair whenever the budget's operator was
     * anything else, so on a level granting `-` it happily picked a CORRECT
     * pair and then asserted the commit was incorrect.
     */
    const evaluate = (a: number, b: number): number | null => {
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b !== 0 && a % b === 0 ? a / b : null;
      }
    };
    const wrong = live
      .flatMap((a) => live.filter((b) => b.id !== a.id).map((b) => [a, b] as const))
      .find(([a, b]) => evaluate(a.value, b.value) !== target);
    expect(wrong, "the level offers an incorrect pair under its own budget").toBeDefined();

    state = stateOf(director.handle({ type: "tapTile", id: wrong![0].id }));
    state = stateOf(director.handle({ type: "tapOperator", op }));
    state = stateOf(director.handle({ type: "tapTile", id: wrong![1].id }));
    state = stateOf(director.handle({ type: "tapCommit" }));

    const commit = find(sink, "move_commit");
    // The assertion this replaced could not fail: a rejected operator records
    // no commit, so `find` returned undefined and the test threw instead of
    // measuring anything.
    expect(commit, "an incorrect commit was actually recorded").toBeDefined();
    expect(commit!.correct).toBe(false);
    expect(state.phase).toBe("playing");
  });

  it("app_open carries first_open and a session index that increments", () => {
    const sink = new MemorySink();
    const telemetry = new Telemetry([sink], () => T0);
    telemetry.open();
    const open = find(sink, "app_open")!;
    expect(open.session_index).toBeGreaterThanOrEqual(1);
    expect(typeof open.first_open).toBe("boolean");
  });
});
