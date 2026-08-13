import type { Tile } from "./types.js";

/**
 * Build a tile pool. The array index becomes the tile id and is stable for the
 * life of the level — pool `[2, 2]` yields two distinguishable tiles, which is
 * what lets the renderer shatter the right one (GDD §3.5).
 */
export function makePool(values: readonly number[]): Tile[] {
  return values.map((value, id) => ({ id, value, transformed: false }));
}

/**
 * The interchangeability class of a tile. Two tiles are interchangeable for
 * solving purposes when they share a class — same value AND same transform
 * state, because a transformed tile can never be transformed again.
 */
export function tileClass(tile: Tile): string {
  return tile.transformed ? `${tile.value}'` : `${tile.value}`;
}

/** Order-independent key for a set of tiles. Used for DFS memoisation. */
export function poolKey(tiles: readonly Tile[]): string {
  return tiles.map(tileClass).sort().join(",");
}

/** Deterministic ordering: value ascending, untransformed first, then id. */
export function compareTiles(a: Tile, b: Tile): number {
  if (a.value !== b.value) return a.value - b.value;
  if (a.transformed !== b.transformed) return a.transformed ? 1 : -1;
  return a.id - b.id;
}
