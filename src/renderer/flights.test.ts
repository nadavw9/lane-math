import { describe, expect, it } from "vitest";

import { FlightTable, type Flight } from "./flights.js";
import { EASE, TIMING, Tween } from "./tween.js";

/**
 * THE TAP-LATENCY REGRESSION (Phase 5F investigation).
 *
 * Bisected to the feel commit: the two commits before it are flat at 0.2-0.4ms
 * across 600 taps, the feel commit runs 2.8ms to 38.9ms. Counting showed
 * exactly one thing growing — flights, at two per tap, with the renderer's
 * child count tracking it at 22 + 2x and the heap reaching 3.7GB.
 *
 * WHAT IS ASSERTED HERE, AND WHY IT IS NOT MILLISECONDS.
 *
 * A wall-clock assertion would be machine-dependent and flaky, and it would
 * also be measuring the wrong thing: the latency is a SYMPTOM of how many
 * tokens each redraw has to draw. So this pins the cause instead — the number
 * of flights, which is the per-tap draw work — and asserts it is bounded by a
 * constant no matter how much input arrives. Bounded draw work is what "600
 * taps costs the same as 100 taps" actually means.
 *
 * The tests deliberately never advance the clock between launches, because that
 * is the failing condition: flights used to be pruned only when the ticker ran,
 * so any burst of input without a frame in between grew the collection without
 * limit.
 */
function flightTo(slotIndex: 0 | 1 | 2, kind: Flight["kind"] = "toSlot"): Flight {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  return {
    kind,
    slotIndex,
    tileId: slotIndex,
    label: "1",
    from: box,
    to: box,
    tween: new Tween(TIMING.place, EASE.settle),
  };
}

describe("flights are bounded by construction", () => {
  it("stays flat across 600 taps with no frame in between", () => {
    const flights = new FlightTable();

    // 600 taps, each staging and returning — the exact benchmark that took tap
    // cost from 3ms to 36ms, and with the ticker never running.
    for (let tap = 0; tap < 600; tap++) {
      flights.launch(flightTo(0, "toSlot"));
      flights.launch(flightTo(0, "toPool"));
    }

    // One seat, one thing in the air. Before the fix this was 1200.
    expect(flights.size).toBe(1);
  });

  it("never exceeds the number of equation slots, whatever the input", () => {
    const flights = new FlightTable();
    for (let i = 0; i < 500; i++) {
      flights.launch(flightTo((i % 3) as 0 | 1 | 2, i % 2 === 0 ? "toSlot" : "toPool"));
      expect(flights.size).toBeLessThanOrEqual(3);
    }
  });

  it("draw work per tap does not grow with taps taken", () => {
    /*
     * The machine-independent form of "latency at 600 taps is within a bounded
     * multiple of latency at 100". Every active flight draws one token per
     * redraw, so active() is the per-frame cost, and it has to be flat.
     */
    const flights = new FlightTable();
    const workAt = new Map<number, number>();

    for (let tap = 1; tap <= 600; tap++) {
      flights.launch(flightTo(0, "toSlot"));
      flights.launch(flightTo(1, "toPool"));
      if ([100, 200, 400, 600].includes(tap)) workAt.set(tap, flights.active().length);
    }

    expect(workAt.get(600)).toBeLessThanOrEqual(workAt.get(100)! * 1.5);
    expect([...workAt.values()].every((w) => w <= 3)).toBe(true);
  });

  it("supersedes a stale flight rather than stacking a second on the same seat", () => {
    // Two tokens travelling to one seat were drawn on top of each other.
    const flights = new FlightTable();
    flights.launch(flightTo(1, "toSlot"));
    flights.launch(flightTo(1, "toPool"));

    expect(flights.size).toBe(1);
    expect(flights.active()[0]!.kind).toBe("toPool");
    expect(flights.arrivingAt(1)).toBe(false);
  });
});

describe("flights still behave", () => {
  it("reports what landed, once, and then forgets it", () => {
    const flights = new FlightTable();
    flights.launch(flightTo(0, "toSlot"));

    expect(flights.advance(TIMING.place / 2)).toEqual([]);
    expect(flights.size).toBe(1);

    const landed = flights.advance(TIMING.place);
    expect(landed.map((f) => f.kind)).toEqual(["toSlot"]);
    expect(flights.size).toBe(0);
    // Landing is announced exactly once, or a placement would knock twice.
    expect(flights.advance(TIMING.place)).toEqual([]);
  });

  it("answers what the draw pass needs to know", () => {
    const flights = new FlightTable();
    flights.launch(flightTo(2, "toSlot"));
    expect(flights.arrivingAt(2)).toBe(true);
    expect(flights.arrivingAt(0)).toBe(false);

    flights.launch({ ...flightTo(0, "toPool"), tileId: 7 });
    expect(flights.returningTile(7)).toBe(true);
    expect(flights.returningTile(9)).toBe(false);
  });

  it("drops everything on a rewind", () => {
    const flights = new FlightTable();
    flights.launch(flightTo(0));
    flights.launch(flightTo(1));
    flights.clear();
    expect(flights.size).toBe(0);
  });
});
