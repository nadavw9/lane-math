import { describe, expect, it } from "vitest";

import { SHARD_MAX, SHARD_MIN, makeRng, shardMotion, subdivide } from "./shards.js";

/**
 * What makes a shatter read as GLASS rather than as a sliced image.
 *
 * The rejected design was a uniform 3x3, and the objection to it was not that
 * it looked bad in the abstract — it was that every shard is the same size and
 * every edge lines up with two others, so for the frame before the pieces
 * separate the viewer sees a grid. These tests pin the properties that stop
 * that: enough pieces, varied sizes, no slivers, complete coverage, and a
 * different break every time.
 */
const TOKEN = { w: 92, h: 92 };

function shards(seed: number) {
  return subdivide(TOKEN.w, TOKEN.h, makeRng(seed));
}

describe("subdivision produces a break, not a grid", () => {
  it("yields 8 to 14 shards across many seeds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pieces = shards(seed);
      expect(pieces.length, `seed ${seed}`).toBeGreaterThanOrEqual(SHARD_MIN);
      expect(pieces.length, `seed ${seed}`).toBeLessThanOrEqual(SHARD_MAX);
    }
  });

  it("covers the whole token with no gaps and no overlaps", () => {
    /*
     * Coverage matters visually: the shards start as an exact copy of the token
     * in pieces, so the break is invisible on frame one and then comes apart. A
     * gap would show as a hole in the token a frame before it breaks.
     */
    for (let seed = 1; seed <= 50; seed++) {
      const pieces = shards(seed);
      const area = pieces.reduce((sum, p) => sum + p.w * p.h, 0);
      expect(area, `seed ${seed}`).toBe(TOKEN.w * TOKEN.h);

      const grid = new Set<string>();
      for (const p of pieces) {
        for (let y = p.y; y < p.y + p.h; y++) {
          for (let x = p.x; x < p.x + p.w; x++) {
            const key = `${x},${y}`;
            expect(grid.has(key), `seed ${seed} overlap at ${key}`).toBe(false);
            grid.add(key);
          }
        }
      }
      expect(grid.size).toBe(TOKEN.w * TOKEN.h);
    }
  });

  it("varies shard size — the whole point of rejecting the grid", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const areas = shards(seed).map((p) => p.w * p.h);
      const largest = Math.max(...areas);
      const smallest = Math.min(...areas);
      // A uniform 3x3 would score 1.0 here. Real breaks are lumpy.
      expect(largest / smallest, `seed ${seed}`).toBeGreaterThan(2);
    }
  });

  it("produces no slivers", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const p of shards(seed)) {
        // A one-pixel splinter costs a draw call and shows nothing.
        expect(Math.min(p.w, p.h), `seed ${seed}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("breaks differently every time", () => {
    // Reseeded per shatter, so a player never sees the same break twice.
    const a = JSON.stringify(shards(1));
    const b = JSON.stringify(shards(2));
    const again = JSON.stringify(shards(1));
    expect(a).not.toBe(b);
    // ...but a fixed seed replays exactly, which is what makes this testable.
    expect(a).toBe(again);
  });
});

describe("shard motion has mass (ART_DIRECTION §7)", () => {
  it("throws small shards further and faster than large ones", () => {
    const rng = makeRng(7);
    const big = shardMotion({ x: 0, y: 0, w: 80, h: 80 }, 92, 92, rng);
    const small = shardMotion({ x: 0, y: 0, w: 12, h: 12 }, 92, 92, rng);
    expect(small.speed).toBeGreaterThan(big.speed);
  });

  it("spins small shards faster — uniform motion is what reads as fake", () => {
    // Sampled, because spin carries a random sign and magnitude per shard.
    const rng = makeRng(11);
    let bigSpin = 0;
    let smallSpin = 0;
    for (let i = 0; i < 200; i++) {
      bigSpin += Math.abs(shardMotion({ x: 0, y: 0, w: 80, h: 80 }, 92, 92, rng).spin);
      smallSpin += Math.abs(shardMotion({ x: 0, y: 0, w: 10, h: 10 }, 92, 92, rng).spin);
    }
    expect(smallSpin).toBeGreaterThan(bigSpin * 2);
  });

  it("draws light shards further into the target than heavy ones", () => {
    const rng = makeRng(3);
    const big = shardMotion({ x: 0, y: 0, w: 92, h: 92 }, 92, 92, rng);
    const small = shardMotion({ x: 0, y: 0, w: 8, h: 8 }, 92, 92, rng);
    expect(small.toTarget).toBeGreaterThan(big.toTarget);
    expect(big.toTarget).toBeGreaterThanOrEqual(0.55);
    expect(small.toTarget).toBeLessThanOrEqual(1);
  });
});
