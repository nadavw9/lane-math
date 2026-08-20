/**
 * Breaking a token into shards (ART_DIRECTION §5, §7).
 *
 * Pure geometry, no PixiJS: the thing that decides whether a shatter reads as
 * GLASS BREAKING or as an image sliced into tiles is the subdivision, and that
 * is testable without a renderer.
 *
 * A uniform 3x3 was rejected for exactly that reason. Every shard the same
 * size, every edge aligned with two others, the whole grid visible for the
 * frame before the pieces separate — it reads as a picture cut up, which is
 * what it literally is. Glass does not break into equal rectangles.
 */

export interface ShardRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Deterministic PRNG, so a shatter can be reseeded per break and replayed in a test. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export const SHARD_MIN = 8;
export const SHARD_MAX = 14;

/**
 * Split a token into 8-14 axis-aligned rectangles of varying size.
 *
 * METHOD: recursive random subdivision, area-weighted. Start with the whole
 * token, then repeatedly pick a rectangle with probability proportional to its
 * AREA and cut it at a random position along its longer side.
 *
 * Area weighting is what produces the variation. Always splitting the largest
 * converges on equal sizes, which is the uniform grid again by another route;
 * splitting uniformly at random shatters one corner into dust and leaves the
 * rest whole. Weighting by area means big pieces are likelier to break but not
 * certain to, which is how a real break distributes.
 *
 * Cuts land between 30% and 70% of the side so no shard is a sliver — a
 * one-pixel splinter is invisible in flight and wasted geometry.
 *
 * Axis-aligned throughout: each shard maps to a sub-rectangle of the token's
 * texture, so it can be drawn as a cheap quad carrying the real art. True
 * polygonal shards would need a Mesh with custom UVs for a difference nobody
 * will see at 92px for 420ms.
 */
export function subdivide(
  width: number,
  height: number,
  rng: () => number,
  target = SHARD_MIN + Math.floor(rng() * (SHARD_MAX - SHARD_MIN + 1)),
): ShardRect[] {
  const pieces: ShardRect[] = [{ x: 0, y: 0, w: width, h: height }];
  const wanted = Math.max(1, Math.min(SHARD_MAX, target));

  // A cut has to leave both halves at least this wide, or the shard is a
  // splinter that costs a draw call and shows nothing.
  const minSide = Math.max(4, Math.min(width, height) * 0.12);

  let guard = 0;
  while (pieces.length < wanted && guard++ < 200) {
    const splittable = pieces.filter((p) => Math.max(p.w, p.h) >= minSide * 2);
    if (splittable.length === 0) break;

    // Area-weighted choice.
    const totalArea = splittable.reduce((sum, p) => sum + p.w * p.h, 0);
    let roll = rng() * totalArea;
    let chosen = splittable[splittable.length - 1]!;
    for (const piece of splittable) {
      roll -= piece.w * piece.h;
      if (roll <= 0) {
        chosen = piece;
        break;
      }
    }

    const index = pieces.indexOf(chosen);
    const horizontal = chosen.w >= chosen.h;
    const span = horizontal ? chosen.w : chosen.h;
    const cut = Math.round(span * (0.3 + rng() * 0.4));

    if (cut < minSide || span - cut < minSide) continue;

    pieces.splice(
      index,
      1,
      horizontal
        ? { x: chosen.x, y: chosen.y, w: cut, h: chosen.h }
        : { x: chosen.x, y: chosen.y, w: chosen.w, h: cut },
      horizontal
        ? { x: chosen.x + cut, y: chosen.y, w: chosen.w - cut, h: chosen.h }
        : { x: chosen.x, y: chosen.y + cut, w: chosen.w, h: chosen.h - cut },
    );
  }

  return pieces;
}

/**
 * How a shard of a given size moves (ART_DIRECTION §7).
 *
 * MASS. A big piece of glass and a chip of it do not behave alike, and uniform
 * motion is the other thing — after uniform geometry — that reads as fake. Both
 * speed and spin scale INVERSELY with the shard's size relative to the token:
 * the small pieces fly and tumble, the heavy ones barely move and rotate
 * slowly, which is what makes a break look like it had weight.
 */
export function shardMotion(
  shard: ShardRect,
  width: number,
  height: number,
  rng: () => number,
): { speed: number; spin: number; toTarget: number } {
  const area = (shard.w * shard.h) / Math.max(1, width * height);
  // 0 for a shard that is the whole token, 1 for a vanishing chip.
  const lightness = 1 - Math.min(1, Math.sqrt(area));

  return {
    speed: 0.35 + lightness * 1.15,
    spin: (rng() - 0.5) * (3 + lightness * 16),
    // Heavier pieces are also likelier to fall short of the target rather than
    // being drawn all the way into it.
    toTarget: 0.55 + lightness * 0.45,
  };
}
