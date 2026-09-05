import type { BinaryOp } from "../solver/index.js";

export type FtuePulse = "pool" | "minus" | "queue" | "multiply" | null;

/** Stable analytics keys. Display copy may change without splitting a funnel. */
export type FtueCueKey =
  | "tap_number"
  | "choose_sign"
  | "make_target"
  | "multiple_ways"
  | "subtraction"
  | "repeat_trap"
  | "scan_queue"
  | "multiply";

export interface FtueCue {
  readonly key: FtueCueKey;
  readonly line: string;
  readonly pulse: FtuePulse;
}

/** One line plus one visual emphasis: the board remains the teacher. */
export function ftueCue(levelId: string, targetIndex: number, leftTileId: number | null, op: BinaryOp | null): FtueCue | null {
  if (levelId === "1-01") {
    if (leftTileId === null) return { key: "tap_number", line: "Tap a number.", pulse: "pool" };
    if (op === null) return { key: "choose_sign", line: "Choose a sign.", pulse: "minus" };
    return { key: "make_target", line: "Make the target.", pulse: "queue" };
  }
  // Stop after the first move so replay boards do not become HUD chrome.
  if (targetIndex > 0) return null;
  switch (levelId) {
    case "1-02": return { key: "multiple_ways", line: "There can be more than one way.", pulse: "pool" };
    case "1-03": return { key: "subtraction", line: "The minus sign works too.", pulse: "minus" };
    case "1-05": return { key: "repeat_trap", line: "Try that idea again.", pulse: "queue" };
    case "1-06":
    case "1-07":
    case "1-08":
    case "1-09":
    case "1-10": return { key: "scan_queue", line: "Look at the whole queue.", pulse: "queue" };
    case "2-01": return { key: "multiply", line: "New sign: multiply.", pulse: "multiply" };
    default: return null;
  }
}
