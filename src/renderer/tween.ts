/**
 * The feel layer's one source of timing (GDD §9.5).
 *
 * Every effect in the game reads its curves and its clock from here, so the
 * game's feel is tunable in one file rather than scattered across call sites as
 * hand-written interpolations. If the register is wrong, it is wrong here.
 *
 * THE REGISTER IS WEIGHT, NOT ENERGY. Lane Math is contemplative — §7.8 targets
 * a first tap more than twenty seconds after the board opens — so the standard
 * juice vocabulary is actively wrong for it. These curves are chosen to read as
 * mass: things resist starting, carry momentum, and settle. Nothing here
 * bounces, sparkles or celebrates, and there is deliberately no screen shake
 * primitive to reach for.
 */

/**
 * Slow-motion multiplier for the whole feel layer.
 *
 * Exists so the review harness can photograph a 200ms effect mid-flight — a
 * screenshot round-trip is slower than the effect itself, and "trust me, it
 * settles" is not a review. 1 in normal play.
 */
let speed = 1;

/**
 * @param multiplier 1 is normal play. Fractions slow the whole layer down.
 *
 * ZERO PAUSES IT, which is the only way to photograph a frame honestly: a
 * screenshot round-trip is slower than any effect here, so even at the slowest
 * non-zero speed the shutter races the animation and catches whatever it
 * catches. Freezing lets a specific moment be chosen and then proven with
 * feelState(). Negative values are clamped to the pause rather than run
 * backwards, which nothing in the layer is written to survive.
 */
export function setEffectSpeed(multiplier: number): void {
  speed = Math.max(0, multiplier);
}

export function effectSpeed(): number {
  return speed;
}

export type Easing = (t: number) => number;

export const EASE = {
  /** Deceleration only — a tile coming up under a finger. */
  lift: (t: number): number => 1 - Math.pow(1 - t, 3),

  /**
   * Overshoot and settle: mass arriving on a table.
   *
   * The stock back-out constant is 1.70158, which overshoots ~10% and reads as
   * a bounce — a beach ball, not a Scrabble tile. At 0.6 the overshoot is
   * around 3%: enough to see the piece arrive and rock down onto the surface,
   * not enough to look springy.
   */
  settle: (t: number): number => {
    const c = 0.6;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },

  /** Symmetric, no overshoot — something deliberately moved from A to B. */
  slide: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  /**
   * Slow to leave, fast to arrive. Gravity, for the lane advancing: the queue
   * should look like it has weight to shift rather than sliding on rails.
   */
  fall: (t: number): number => t * t,

  /** Ease in and out of a held pose — used for the transform rewrite. */
  pinch: (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t),
} as const;

/**
 * A decaying oscillation, for resistance rather than impact.
 *
 * Used where something REFUSES — an illegal commit, a lane that will not
 * advance. The decay is squared so the motion dies away quickly instead of
 * ringing, which is the difference between "that did not work" and "wheee".
 */
export function shudder(t: number, cycles: number, amplitude: number): number {
  const decay = (1 - t) * (1 - t);
  return Math.sin(t * Math.PI * cycles) * decay * amplitude;
}

/** A single running animation. Holds time only — what it means is the caller's. */
export class Tween {
  private elapsed = 0;

  constructor(
    private readonly durationMs: number,
    private readonly easing: Easing = EASE.slide,
    private readonly delayMs = 0,
  ) {}

  /** @returns true while still running. */
  advance(deltaMs: number): boolean {
    this.elapsed += deltaMs * speed;
    return !this.done;
  }

  /** Raw progress through the active part, 0..1. */
  get raw(): number {
    if (this.elapsed <= this.delayMs) return 0;
    return Math.min(1, (this.elapsed - this.delayMs) / this.durationMs);
  }

  /** Eased progress, 0..1. May exceed 1 briefly under an overshooting curve. */
  get value(): number {
    return this.easing(this.raw);
  }

  get started(): boolean {
    return this.elapsed > this.delayMs;
  }

  get done(): boolean {
    return this.elapsed >= this.delayMs + this.durationMs;
  }
}

/** Linear interpolation, the one place it is spelled out. */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Feel timings, in milliseconds (GDD §9.5).
 *
 * Gathered here rather than inline so the whole game's pacing can be read at a
 * glance and adjusted as a set — the relationship between these numbers is what
 * makes the game feel consistent, and that relationship is invisible when they
 * are scattered.
 */
export const TIMING = {
  /** Press feedback. Long enough to see, short enough to feel instant. */
  lift: 150,
  /** A tile carried into the equation row. */
  place: 260,
  /** Returning home is slightly quicker — undoing should not cost patience. */
  returnHome: 210,
  /**
   * Hit-stop before the shatter (§9.5). The board holds the pre-commit frame,
   * so the payoff lands rather than arriving while the eye is still moving.
   */
  hitStop: 80,
  /** The queue shifting down after a target is cleared. */
  laneAdvance: 340,
  /** An illegal commit being refused. */
  resist: 380,
  /** A tile rewriting itself under a unary operator. */
  rewrite: 340,
  /** Gap between stars arriving, one at a time (§9.5). */
  starGap: 190,
  starArrive: 300,
} as const;
