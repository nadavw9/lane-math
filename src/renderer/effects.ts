import { Container, Graphics } from "pixi.js";

import { effectSpeed } from "./tween.js";

/**
 * Re-exported so `setEffectSpeed` keeps its existing import path while the
 * clock itself lives with the rest of the feel layer (§9.5). One multiplier now
 * drives every effect in the game, not just the shatter.
 */
export { setEffectSpeed } from "./tween.js";

/**
 * GDD §9.3 — the commit animation is the emotional core.
 *
 * "The two number tiles and the operator must SHATTER INTO the target — not
 * fade, not slide off. Destruction must read as destruction. This single
 * animation teaches 'gone forever' better than any tutorial text."
 *
 * So: the token breaks into wedges, the wedges are thrown toward the target
 * they paid for, and they burn out on arrival. Nothing drifts gently anywhere.
 */

interface Shard {
  readonly g: Graphics;
  vx: number;
  vy: number;
  vr: number;
  /** 0..1, how far along its flight to the target this shard is. */
  readonly toTarget: number;
}

export interface ShatterOptions {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly colour: number;
  /** Where the debris is pulled — the target this move just paid for. */
  readonly targetX: number;
  readonly targetY: number;
}

const SHARDS = 9;
const DURATION_MS = 420;

/**
 * One shattering token. Owns its own Graphics and removes itself when spent, so
 * the renderer can redraw freely underneath without tracking effect lifetimes.
 */
export class Shatter {
  readonly container = new Container();
  private readonly shards: Shard[] = [];
  private elapsed = 0;
  private readonly targetX: number;
  private readonly targetY: number;

  constructor(options: ShatterOptions) {
    this.targetX = options.targetX;
    this.targetY = options.targetY;

    const cx = options.x + options.w / 2;
    const cy = options.y + options.h / 2;

    for (let i = 0; i < SHARDS; i++) {
      const angle = (i / SHARDS) * Math.PI * 2 + Math.random() * 0.4;
      const spread = 0.35 + Math.random() * 0.5;
      const size = Math.min(options.w, options.h) * (0.16 + Math.random() * 0.16);

      // Irregular triangular wedge: debris, not confetti.
      const g = new Graphics()
        .poly([0, -size, size * 0.9, size * 0.7, -size * 0.8, size * 0.6])
        .fill(options.colour);
      g.position.set(cx, cy);
      g.rotation = Math.random() * Math.PI;

      this.shards.push({
        g,
        vx: Math.cos(angle) * spread * options.w * 0.9,
        vy: Math.sin(angle) * spread * options.h * 0.9,
        vr: (Math.random() - 0.5) * 12,
        toTarget: 0.55 + Math.random() * 0.45,
      });
      this.container.addChild(g);
    }
    this.startX = cx;
    this.startY = cy;
  }

  private readonly startX: number;
  private readonly startY: number;

  /** @returns true while still alive. */
  update(deltaMs: number): boolean {
    this.elapsed += deltaMs * effectSpeed();
    const t = Math.min(1, this.elapsed / DURATION_MS);
    // Fast out, hard stop: an ease that decelerates reads as floating.
    const burst = 1 - Math.pow(1 - t, 3);

    for (const shard of this.shards) {
      // Outward burst, then pulled INTO the target — the tiles are paying for it.
      const pull = Math.pow(t, 2) * shard.toTarget;
      const bx = this.startX + shard.vx * burst;
      const by = this.startY + shard.vy * burst;
      shard.g.position.set(
        bx + (this.targetX - bx) * pull,
        by + (this.targetY - by) * pull,
      );
      shard.g.rotation += shard.vr * (deltaMs / 1000);
      shard.g.scale.set(1 - t * 0.75);
      shard.g.alpha = 1 - Math.pow(t, 1.6);
    }

    if (t >= 1) {
      this.container.destroy({ children: true });
      return false;
    }
    return true;
  }
}

/**
 * GDD §9.4 — the failure moment.
 *
 * "Failure must read as the lane rejecting the number. The front target sits in
 * place, pulses, and refuses to advance." No banner, no modal, no text.
 *
 * The refusal is a hard shudder that decays: the target tries to move and is
 * pushed back, twice, then settles. It never leaves its slot, because not
 * advancing is the whole message.
 */
export class RejectPulse {
  private elapsed = 0;
  private static readonly DURATION = 900;

  /** @returns offset and glow strength to apply to the front target. */
  sample(deltaMs: number): { dx: number; dy: number; glow: number; alive: boolean } {
    this.elapsed += deltaMs * effectSpeed();
    const t = Math.min(1, this.elapsed / RejectPulse.DURATION);
    const decay = 1 - t;

    // Two hard shoves, vertical: the lane will not let it through.
    const shove = Math.sin(t * Math.PI * 6) * decay * decay * 7;
    // A shiver across, so it reads as struggling rather than bouncing.
    const shiver = Math.sin(t * Math.PI * 22) * decay * decay * 2.5;

    return {
      dx: shiver,
      dy: shove,
      glow: 0.35 + 0.65 * decay,
      alive: t < 1,
    };
  }

  reset(): void {
    this.elapsed = 0;
  }

  get finished(): boolean {
    return this.elapsed >= RejectPulse.DURATION;
  }
}
