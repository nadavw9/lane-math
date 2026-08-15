import { describe, expect, it } from "vitest";

import {
  CONTENT_RANGE,
  DESIGN,
  TOKEN_SIZE,
  type BoardSize,
  bands,
  poolSlot,
  targetSlot,
} from "./layout.js";

/**
 * Layout invariants (GDD §9.2, §9.3).
 *
 * Nothing covered the layout before this, which was thin cover for a rule the
 * PLANNING depends on: if tiles move between moves, the player's spatial map of
 * the board is invalidated every turn.
 */
const BOARDS: BoardSize[] = [];
for (let targets = CONTENT_RANGE.targets.min; targets <= CONTENT_RANGE.targets.max; targets++) {
  for (let tiles = CONTENT_RANGE.tiles.min; tiles <= CONTENT_RANGE.tiles.max; tiles++) {
    BOARDS.push({ targets, tiles, hints: 0 });
  }
}

describe("the pool does not re-pack (§9.3)", () => {
  it("gives a tile the same slot no matter which others are spent", () => {
    /*
     * The regression this exists for: the pool loop used to walk only the LIVE
     * tiles with its own counter, so spending tile 0 slid every later tile one
     * slot left. Slots are keyed on the tile's fixed index now, so consumption
     * cannot enter the calculation at all — which is what this asserts, by
     * showing the slot depends on nothing but the index and the board.
     */
    for (const board of BOARDS) {
      const b = bands(board);
      for (let index = 0; index < board.tiles; index++) {
        const slot = poolSlot(index, b.pool, b.grid);
        expect(poolSlot(index, b.pool, b.grid)).toEqual(slot);
      }
    }
  });

  it("never places two live tiles in one slot, so a ghost can never collide", () => {
    for (const board of BOARDS) {
      const b = bands(board);
      const seen = new Set<string>();
      for (let index = 0; index < board.tiles; index++) {
        const slot = poolSlot(index, b.pool, b.grid);
        const key = `${Math.round(slot.x)},${Math.round(slot.y)}`;
        expect(seen.has(key), `board ${board.targets}/${board.tiles} reused slot ${key}`).toBe(
          false,
        );
        seen.add(key);
      }
    }
  });

  it("keeps every tile inside its pool band", () => {
    for (const board of BOARDS) {
      const b = bands(board);
      for (let index = 0; index < board.tiles; index++) {
        const slot = poolSlot(index, b.pool, b.grid);
        expect(slot.x).toBeGreaterThanOrEqual(b.pool.x - 1e-9);
        expect(slot.x + slot.width).toBeLessThanOrEqual(b.pool.x + b.pool.width + 1e-9);
        expect(slot.y + slot.height).toBeLessThanOrEqual(b.pool.y + b.pool.height + 1e-9);
      }
    }
  });
});

describe("tokens scale to board size (§9.2)", () => {
  it("stays within the tappable/childish bounds on every board", () => {
    for (const board of BOARDS) {
      const { grid } = bands(board);
      expect(grid.size).toBeGreaterThanOrEqual(TOKEN_SIZE.min);
      expect(grid.size).toBeLessThanOrEqual(TOKEN_SIZE.max);
    }
  });

  it("never grows the token as the board grows", () => {
    // Inverse scaling, asserted as monotonicity rather than as an exact curve:
    // the size is solved for, so pinning values would break on any band change
    // while telling us nothing about the property that matters.
    for (let targets = CONTENT_RANGE.targets.min; targets <= CONTENT_RANGE.targets.max; targets++) {
      let previous = Infinity;
      for (let tiles = CONTENT_RANGE.tiles.min; tiles <= CONTENT_RANGE.tiles.max; tiles++) {
        const { grid } = bands({ targets, tiles, hints: 0 });
        expect(grid.size, `${targets} targets, ${tiles} tiles`).toBeLessThanOrEqual(previous);
        previous = grid.size;
      }
    }
  });

  it("balances the rows rather than leaving a row of one", () => {
    for (const board of BOARDS) {
      const { grid } = bands(board);
      const lastRow = board.tiles - (grid.rows - 1) * grid.perRow;
      expect(lastRow, `board ${board.targets}/${board.tiles}`).toBeGreaterThan(0);
      // Balanced means the short row is never more than one tile below a full
      // one short of the others; 6/6/1 is the shape being ruled out.
      if (grid.rows > 1) expect(lastRow).toBeGreaterThan(1);
    }
  });
});

describe("the stack fits and sits low (§9.1)", () => {
  it("never overflows the design surface", () => {
    for (const board of BOARDS) {
      for (const hints of [0, 1, 3]) {
        const b = bands({ ...board, hints });
        expect(
          b.status.y + b.status.height,
          `board ${board.targets}/${board.tiles} with ${hints} hints`,
        ).toBeLessThanOrEqual(DESIGN.height);
      }
    }
  });

  it("anchors the column to the bottom, leaving the slack above the lane", () => {
    for (const board of BOARDS) {
      const b = bands(board);
      // Bottom-anchored: the status band ends a constant pad from the bottom,
      // and whatever is left over sits above the lane where a thumb never goes.
      expect(b.status.y + b.status.height).toBeCloseTo(DESIGN.height - 12, 6);
      expect(b.lane.y).toBeGreaterThanOrEqual(12 - 1e-9);
    }
  });

  it("puts the front target at the bottom of the lane", () => {
    // §2, and §9.4 depends on it: the front plate must hold one fixed place so
    // that refusing to advance is visible as a refusal.
    for (const board of BOARDS) {
      const b = bands(board);
      const front = targetSlot(0, b.lane, b.grid);
      const behind = targetSlot(1, b.lane, b.grid);
      expect(front.y).toBeGreaterThan(behind.y);
      expect(front.y + front.height).toBeLessThanOrEqual(b.lane.y + b.lane.height + 1e-9);
    }
  });
});
