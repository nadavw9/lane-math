import { describe, expect, it } from "vitest";
import { ftueCue, type FtueCueState } from "./ftue.js";

const state = (values: number[], patch: Partial<FtueCueState> = {}): FtueCueState => ({
  targetIndex: 0, tiles: values.map((value, id) => ({ id, value, consumed: false })),
  leftTileId: null, op: null, rightTileId: null, ...patch,
});

describe("first-session FTUE cue schedule", () => {
  it("walks the 1-01 action cues", () => {
    const start = state([9, 5, 1, 4, 7, 8]);
    expect(ftueCue("1-01", start)).toMatchObject({ line: "Tap the 9.", target: { kind: "tile", tileId: 0 } });
    expect(ftueCue("1-01", { ...start, leftTileId: 0 })).toMatchObject({ line: "Tap +.", target: { kind: "operator", op: "+" } });
    expect(ftueCue("1-01", { ...start, leftTileId: 0, op: "+" })).toMatchObject({ line: "Now tap the 5.", target: { kind: "tile", tileId: 1 } });
    expect(ftueCue("1-01", { ...start, leftTileId: 0, op: "+", rightTileId: 1 })?.target).toEqual({ kind: "commit" });
  });

  it("introduces the World 1 beats and World 2 multiply once", () => {
    expect(ftueCue("1-02", state([1, 2]))?.line).toBe("There can be more than one way.");
    const minus = state([9, 5, 9, 2, 7, 3]);
    expect(ftueCue("1-03", minus)?.target).toEqual({ kind: "operator", op: "-" });
    expect(ftueCue("1-03", { ...minus, op: "-" })?.target).toEqual({ kind: "tile", tileId: 0 });
    expect(ftueCue("1-06", state([1, 2]))?.line).toBe("Look at the whole queue.");
    const multiply = state([8, 3, 8, 2, 4, 5, 7, 5]);
    expect(ftueCue("2-01", multiply)?.target).toEqual({ kind: "operator", op: "*" });
    expect(ftueCue("2-01", { ...multiply, op: "+" })?.target).toEqual({ kind: "operator", op: "*" });
    expect(ftueCue("2-01", { ...multiply, op: "*" })?.target).toEqual({ kind: "tile", tileId: 1 });
    expect(ftueCue("2-01", { ...multiply, op: "*", leftTileId: 1 })?.target).toEqual({ kind: "tile", tileId: 0 });
  });

  it("does not leave tutorial copy on later targets or 1-04", () => {
    expect(ftueCue("1-02", state([1, 2], { targetIndex: 1 }))).toBeNull();
    expect(ftueCue("1-04", state([1, 2]))).toBeNull();
  });
});
