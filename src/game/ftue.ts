import type { BinaryOp } from "../solver/index.js";

export type FtuePulse = "pool" | "minus" | "queue" | "multiply" | null;
export type FtueCueTarget =
  | { readonly kind: "tile"; readonly tileId: number }
  | { readonly kind: "operator"; readonly op: BinaryOp }
  | { readonly kind: "commit" };

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
  readonly target?: FtueCueTarget;
}

export interface FtueCueState {
  readonly targetIndex: number;
  readonly tiles: readonly { readonly id: number; readonly value: number; readonly consumed: boolean }[];
  readonly leftTileId: number | null;
  readonly op: BinaryOp | null;
  readonly rightTileId: number | null;
}

const liveId = (state: FtueCueState, value: number): number | null =>
  state.tiles.find((tile) => !tile.consumed && tile.value === value)?.id ?? null;

function exactSequence(state: FtueCueState, key: "subtraction" | "multiply", op: BinaryOp, leftValue: number, rightValue: number): FtueCue | null {
  if (state.targetIndex > 0) return null;
  if (state.op !== op) return { key, line: `Tap ${op === "*" ? "×" : "−"}.`, pulse: key === "multiply" ? "multiply" : "minus", target: { kind: "operator", op } };
  const leftId = liveId(state, leftValue);
  if (state.leftTileId !== leftId && leftId !== null) return { key, line: key === "multiply" ? "Choose 3 and 8." : "Choose 9, then 5.", pulse: "pool", target: { kind: "tile", tileId: leftId } };
  const rightId = liveId(state, rightValue);
  if (state.rightTileId !== rightId && rightId !== null) return { key, line: `Now choose ${rightValue}.`, pulse: "pool", target: { kind: "tile", tileId: rightId } };
  return { key, line: "Press = to make the target.", pulse: "queue", target: { kind: "commit" } };
}

/** One short instruction attached to one exact live action. */
export function ftueCue(levelId: string, state: FtueCueState): FtueCue | null {
  if (levelId === "1-01" && state.targetIndex === 0) {
    const nine = liveId(state, 9);
    if (state.leftTileId === null && nine !== null) return { key: "tap_number", line: "Tap the 9.", pulse: "pool", target: { kind: "tile", tileId: nine } };
    if (state.op !== "+") return { key: "choose_sign", line: "Tap +.", pulse: "minus", target: { kind: "operator", op: "+" } };
    const leftValue = state.tiles.find((tile) => tile.id === state.leftTileId)?.value;
    const partnerValue = leftValue === 5 ? 9 : 5;
    const five = liveId(state, partnerValue);
    if (state.rightTileId === null && five !== null) return { key: "make_target", line: `Now tap the ${partnerValue}.`, pulse: "pool", target: { kind: "tile", tileId: five } };
    return { key: "make_target", line: "Press = to make 14.", pulse: "queue", target: { kind: "commit" } };
  }
  if (levelId === "1-03") return exactSequence(state, "subtraction", "-", 9, 5);
  if (levelId === "2-01") return exactSequence(state, "multiply", "*", 3, 8);
  // Stop after the first move so replay boards do not become HUD chrome.
  if (state.targetIndex > 0) return null;
  switch (levelId) {
    case "1-02": return { key: "multiple_ways", line: "There can be more than one way.", pulse: "pool" };
    // TODO(P1): migrate 1-02, 1-04 and 1-06 to exact shared teach-cue sequences.
    case "1-05": return { key: "repeat_trap", line: "Try that idea again.", pulse: "queue" };
    case "1-06":
    case "1-07":
    case "1-08":
    case "1-09":
    case "1-10": return { key: "scan_queue", line: "Look at the whole queue.", pulse: "queue" };
    default: return null;
  }
}
