import { describe, expect, it } from "vitest";

import {
  AUTOMATON_DESK,
  CONTENT_RANGE,
  DESIGN,
  TOKEN_SIZE,
  type BoardSize,
  bands,
  operatorSlot,
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
    for (let operators = 1; operators <= 5; operators++) {
      BOARDS.push({ targets, tiles, hints: 0, operators });
    }
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
  it("caps rendered tokens at the real-art coverage ceiling", () => {
    expect(TOKEN_SIZE.max).toBe(120);
  });

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
      for (let operators = 1; operators <= 5; operators++) {
        let previous = Infinity;
        for (let tiles = CONTENT_RANGE.tiles.min; tiles <= CONTENT_RANGE.tiles.max; tiles++) {
          const { grid } = bands({ targets, tiles, operators, hints: 0 });
          expect(grid.size, `${targets} targets, ${tiles} tiles, ${operators} operators`).toBeLessThanOrEqual(previous);
          previous = grid.size;
        }
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

  it("gives every operator exact size parity with number tiles", () => {
    for (const board of BOARDS) {
      const layout = bands(board);
      expect(layout.operatorGrid.size).toBe(layout.grid.size);
      for (let index = 0; index < board.operators; index++) {
        const slot = operatorSlot(index, board.operators, layout.operators, layout.operatorGrid);
        expect(slot.width).toBe(layout.grid.size);
        expect(slot.height).toBe(layout.grid.size);
      }
    }
  });

  it("settles sparse World 1 at shared token parity", () => {
    // Was 106 before LANE_HEADER grew for SAFE_TOP HUD air (Scout REJECT PR #8).
    const layout = bands({ targets: 3, tiles: 6, hints: 0, operators: 2 });
    expect(layout.grid.size).toBe(102);
    expect(layout.operatorGrid.size).toBe(102);
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

  it("pins the shipped 4-01 casual worst case, bottom-anchored at 888", () => {
    /*
     * Moved 2026-08-22: token 59 -> 58 and lane.y 12 -> 16, because
     * HINT_LINE_H went 16 -> 22 so the hint mark could read as a cut gem rather
     * than a gold dot. On the densest board those 6px come out of the pool.
     *
     * Moved 2026-09-05 (Scout REJECT PR #8): SAFE_TOP 36 -> 56 and LANE_HEADER
     * 44 -> 72 so HUD stars clear status chrome with honest air inside the lane.
     * Bottom edge stays 888 (§9.1); top slack is incidental.
     */
    const layout = bands({ targets: 6, tiles: 14, hints: 1, operators: 5 });
    expect(layout.grid.size).toBe(55);
    expect(layout.status.y + layout.status.height).toBe(888);
    // Incidental top slack — not an anchor.
    expect(layout.lane.y).toBe(18);
  });

  it("bottom-anchors every board at 888, whatever the hint count (§9.1)", () => {
    // The invariant the test above was mistaken for. Cheap, and it would have
    // caught the hint-row change being judged against the wrong property.
    for (const board of BOARDS) {
      for (const hints of [0, 1, 3]) {
        const layout = bands({ ...board, hints });
        expect(
          layout.status.y + layout.status.height,
          `board ${board.targets}/${board.tiles} with ${hints} hints`,
        ).toBe(888);
      }
    }
  });

  it("keeps every operator inside its band across the complete matrix", () => {
    for (const board of BOARDS) {
      for (const hints of [0, 1, 3]) {
        const layout = bands({ ...board, hints });
        for (let index = 0; index < board.operators; index++) {
          const slot = operatorSlot(index, board.operators, layout.operators, layout.operatorGrid);
          expect(slot.x).toBeGreaterThanOrEqual(layout.operators.x - 1e-9);
          expect(slot.x + slot.width).toBeLessThanOrEqual(
            layout.operators.x + layout.operators.width + 1e-9,
          );
          expect(slot.y).toBeGreaterThanOrEqual(layout.operators.y - 1e-9);
          expect(slot.y + slot.height).toBeLessThanOrEqual(
            layout.operators.y + layout.operators.height + 1e-9,
          );
        }
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

describe("automaton desk (PE-01)", () => {
  it("repairs dense 5-across boards so the companion is not postage", () => {
    const b = bands({ targets: 5, tiles: 10, operators: 3, hints: 0 });
    expect(b.pool.x).toBeGreaterThanOrEqual(AUTOMATON_DESK - 1e-9);
    expect(b.pool.x + b.pool.width).toBeLessThanOrEqual(DESIGN.width - 12 + 1e-9);
  });

  it("keeps a readable left gutter on mid boards that already had slack", () => {
    const b = bands({ targets: 5, tiles: 11, operators: 3, hints: 0 });
    expect(b.pool.x).toBeGreaterThanOrEqual(96);
    expect(b.grid.size).toBeGreaterThanOrEqual(60);
  });
});
