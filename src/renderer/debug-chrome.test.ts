import { afterEach, describe, expect, it } from "vitest";

import { debugChrome } from "./layout.js";

/**
 * DEVELOPER OUTPUT MUST NOT SHIP.
 *
 * "3-02 normal target 1/5 fails 0" was drawn at the bottom of every board,
 * including the live Pages build — a player met it in the first three seconds.
 * It is useful during development, so it is gated rather than deleted, and this
 * is what stops the gate being removed by accident.
 */
const w = globalThis as unknown as {
  window?: { laneMathDebug?: boolean; location?: { search: string } };
};

afterEach(() => {
  delete w.window;
});

describe("debug chrome is off unless asked for", () => {
  it("is off with no window at all", () => {
    delete w.window;
    expect(debugChrome()).toBe(false);
  });

  it("is off on a plain page — the shipping case", () => {
    w.window = { location: { search: "" } };
    expect(debugChrome()).toBe(false);
  });

  it("is off for an unrelated query string", () => {
    // `?debugger` and `?nodebug` must not switch it on.
    for (const search of ["?utm=x", "?debugger=1", "?nodebug", "?a=debug"]) {
      w.window = { location: { search } };
      expect(debugChrome(), search).toBe(false);
    }
  });

  it("is on for ?debug, and for the explicit flag", () => {
    for (const search of ["?debug", "?debug=1", "?a=1&debug", "?debug&b=2"]) {
      w.window = { location: { search } };
      expect(debugChrome(), search).toBe(true);
    }
    w.window = { laneMathDebug: true, location: { search: "" } };
    expect(debugChrome()).toBe(true);
  });
});
