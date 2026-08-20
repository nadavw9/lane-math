import { EASE, Tween, effectSpeed } from "./tween.js";

/**
 * How screens ARRIVE (GDD §9.0 motion standard, §9.5 register, ART_DIRECTION §7).
 *
 * Every screen in this game used to appear between one frame and the next —
 * `root.visible = true`. The feel layer was good and covered interactions, and
 * did nothing at all for arrivals, which is a standard failed on all six
 * screens at once.
 *
 * THE REGISTER IS THINGS BEING SET DOWN. Objects drop a short distance onto
 * their resting place and settle, with the same 3% overshoot the rest of the
 * feel layer uses. Deliberately NOT: sliding in from off-screen, scaling up
 * from zero, or springing — all three read as energy, and this is a world of
 * brass and glass on a desk, where the heaviest thing that happens is somebody
 * putting an object down.
 *
 * STAGGER LEADS THE EYE. Elements land in bands, and the focal point lands
 * LAST, because the eye follows the sequence and rests where it stops. An
 * arrival where everything lands together is just a slower version of appearing.
 */

/** How far above its resting place an element starts. A short drop, not a fly-in. */
const DROP = 14;
/** Gap between bands. Long enough to read as a sequence, short enough to sit through. */
const STAGGER_MS = 55;
const BAND_MS = 260;

export interface EntrySample {
  /** Pixels to add to y. Positive is down; starts negative and resolves to 0. */
  readonly dy: number;
  readonly alpha: number;
}

/**
 * A staggered arrival across N bands.
 *
 * Bands rather than individual elements: a board has forty objects on it and
 * forty separate arrivals is noise, not choreography. A band is a group that
 * belongs together — the furniture, the pool, the queue — and the ordering of
 * bands is the whole design.
 */
export class Entrance {
  private readonly tweens: Tween[];

  constructor(bands: number, stagger = STAGGER_MS, duration = BAND_MS) {
    this.tweens = Array.from(
      { length: Math.max(1, bands) },
      (_, i) => new Tween(duration, EASE.settle, i * stagger),
    );
  }

  /** @returns true while any band is still arriving. */
  advance(deltaMs: number): boolean {
    let running = false;
    for (const tween of this.tweens) if (tween.advance(deltaMs)) running = true;
    return running;
  }

  get done(): boolean {
    return this.tweens.every((t) => t.done);
  }

  /**
   * Where band `index` is right now.
   *
   * The value may exceed 1 briefly — that is the settle overshoot, and it means
   * the element dips very slightly past its resting place and comes back, which
   * is what gives an object weight as it lands.
   */
  sample(index: number): EntrySample {
    const tween = this.tweens[Math.min(index, this.tweens.length - 1)];
    if (!tween) return { dy: 0, alpha: 1 };
    const value = tween.value;
    return {
      dy: -DROP * (1 - value),
      // Fades faster than it falls, so an element is legible for most of its
      // drop rather than arriving as a ghost.
      alpha: Math.min(1, tween.raw * 2.6),
    };
  }
}

/**
 * Bands on the BOARD, in landing order.
 *
 * The furniture is set down first because it is what everything else rests on —
 * the tray and the rail exist before the pieces do. The queue lands from the
 * back forward, and THE FRONT TARGET LANDS LAST because it is the focal point:
 * it carries the gold rim, it is where the lane converges, and it is the one
 * thing the player must look at before they can plan anything.
 */
export const BOARD_BANDS = {
  furniture: 0,
  pool: 1,
  operators: 2,
  equation: 3,
  /** Queued targets, back of the queue first. */
  queue: 4,
  /** The front target — the focal point, and therefore last. */
  front: 5,
  status: 6,
} as const;

/**
 * Bands on the MAP, in landing order.
 *
 * Header, then the four world trays top to bottom, then the OPEN level plate.
 * The open level lands last because it is the only thing on the map the player
 * can act on — forty plates and one of them is a door.
 */
export const MAP_BANDS = {
  header: 0,
  world1: 1,
  world2: 2,
  world3: 3,
  world4: 4,
  open: 5,
  footer: 6,
} as const;

/**
 * Bands on the CLEARED panel.
 *
 * THE PANEL ARRIVES FIRST, then the rule, then the stars seat into it. It used
 * to pop in instantly underneath its own staggered stars, which undercut the
 * best motion in the game — the stars were landing in a container that had not
 * arrived.
 */
export const CLEARED_BANDS = {
  panel: 0,
  headline: 1,
  rule: 2,
  /** Stars keep their own §9.5 stagger on top of this. */
  stars: 3,
} as const;

/** Scale a duration by the review clock, so entry slows with everything else. */
export function entrySpeed(): number {
  return effectSpeed();
}
