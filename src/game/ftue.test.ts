import { describe, expect, it } from "vitest";
import { ftueCue } from "./ftue.js";

describe("first-session FTUE cue schedule", () => {
  it("walks the 1-01 action cues", () => {
    expect(ftueCue("1-01", 0, null, null)).toEqual({ key: "tap_number", line: "Tap a number.", pulse: "pool" });
    expect(ftueCue("1-01", 0, 2, null)).toEqual({ key: "choose_sign", line: "Choose a sign.", pulse: "minus" });
    expect(ftueCue("1-01", 0, 2, "+")).toEqual({ key: "make_target", line: "Make the target.", pulse: "queue" });
  });

  it("introduces the World 1 beats and World 2 multiply once", () => {
    expect(ftueCue("1-02", 0, null, null)?.line).toBe("There can be more than one way.");
    expect(ftueCue("1-03", 0, null, null)?.line).toBe("The minus sign works too.");
    expect(ftueCue("1-06", 0, null, null)?.line).toBe("Look at the whole queue.");
    expect(ftueCue("2-01", 0, null, null)).toEqual({ key: "multiply", line: "New sign: multiply.", pulse: "multiply" });
  });

  it("does not leave tutorial copy on later targets or 1-04", () => {
    expect(ftueCue("1-02", 1, null, null)).toBeNull();
    expect(ftueCue("1-04", 0, null, null)).toBeNull();
  });
});
