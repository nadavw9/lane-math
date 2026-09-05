import type { BinaryOp } from "../solver/index.js";

export type FtuePulse = "pool" | "minus" | "queue" | "multiply" | null;

export interface FtueCue {
  readonly line: string;
  readonly pulse: FtuePulse;
}

/** One line plus one visual emphasis: the board remains the teacher. */
export function ftueCue(levelId: string, targetIndex: number, leftTileId: number | null, op: BinaryOp | null): FtueCue | null {
  if (levelId === "1-01") {
    if (leftTileId === null) return { line: "Tap a number.", pulse: "pool" };
    if (op === null) return { line: "Choose a sign.", pulse: "minus" };
    return { line: "Make the target.", pulse: "queue" };
  }
  // Stop after the first move so replay boards do not become HUD chrome.
  if (targetIndex > 0) return null;
  switch (levelId) {
    case "1-02": return { line: "There can be more than one way.", pulse: "pool" };
    case "1-03": return { line: "The minus sign works too.", pulse: "minus" };
    case "1-05": return { line: "Try that idea again.", pulse: "queue" };
    case "1-06":
    case "1-07":
    case "1-08":
    case "1-09":
    case "1-10": return { line: "Look at the whole queue.", pulse: "queue" };
    case "2-01": return { line: "New sign: multiply.", pulse: "multiply" };
    default: return null;
  }
}
