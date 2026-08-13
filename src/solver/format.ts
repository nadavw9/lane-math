import type { Decomposition, Move, Transform } from "./types.js";

export function describeDecomposition(d: Decomposition): string {
  return `${d.left} ${d.op} ${d.right} = ${d.result}`;
}

export function describeTransform(t: Transform): string {
  return `${t.op} ${t.from} -> ${t.to}`;
}

/** Stable, human-readable move label. Used in tests and in debug output. */
export function describeMove(move: Move): string {
  return move.kind === "binary" ? describeDecomposition(move) : describeTransform(move);
}

export function describePath(path: readonly Move[]): string {
  return path.map(describeMove).join(", ");
}
