import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";

import { makeRng, shardMotion, subdivide } from "./shards.js";
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
  readonly g: Container;
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
  /**
   * The token's own art, if it has any. Each shard becomes a sub-rectangle of
   * this, so the pieces carry the real glass rather than a flat approximation.
   * Without it the shards are coloured quads and everything else is identical.
   */
  readonly texture?: Texture | undefined;
  /** Fixed seed for tests. Reseeded per break otherwise, so no two are alike. */
  readonly seed?: number | undefined;
}

const DURATION_MS = 420;
/** §7: a brief bright flash at the break, gone before the eye settles. */
const FLASH_MS = 90;
/** Debris FALLS rather than sprays (§7). Design pixels per second squared. */
const GRAVITY = 900;

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
    this.startX = cx;
    this.startY = cy;

    // Reseeded per break, so no two shatters in a session are identical.
    const rng = makeRng(options.seed ?? (Math.random() * 0xffffffff) >>> 0);
    const pieces = subdivide(options.w, options.h, rng);

    for (const piece of pieces) {
      /*
       * Each shard is the sub-rectangle of the token it came from, positioned
       * where that part of the token was. It therefore starts as an exact copy
       * of the token, in pieces — the break is invisible on frame one and then
       * comes apart, which is what breaking looks like.
       */
      const local = {
        x: piece.x - options.w / 2 + piece.w / 2,
        y: piece.y - options.h / 2 + piece.h / 2,
      };

      let node: Container;
      if (options.texture) {
        // Carry the real art: this shard shows exactly its own part of it.
        const frame = options.texture.frame;
        const sprite = new Sprite(
          new Texture({
            source: options.texture.source,
            frame: new Rectangle(
              frame.x + (piece.x / options.w) * frame.width,
              frame.y + (piece.y / options.h) * frame.height,
              (piece.w / options.w) * frame.width,
              (piece.h / options.h) * frame.height,
            ),
          }),
        );
        sprite.width = piece.w;
        sprite.height = piece.h;
        sprite.anchor.set(0.5);
        node = sprite;
      } else {
        // Procedural fallback: a flat quad of the token's colour.
        node = new Graphics()
          .rect(-piece.w / 2, -piece.h / 2, piece.w, piece.h)
          .fill(options.colour);
      }

      node.position.set(cx + local.x, cy + local.y);

      const motion = shardMotion(piece, options.w, options.h, rng);
      // Outward from the BREAK POINT, so a shard from the left edge goes left.
      const angle = Math.atan2(local.y, local.x || 0.0001);
      this.shards.push({
        g: node,
        vx: Math.cos(angle) * motion.speed * options.w * 0.9,
        vy: Math.sin(angle) * motion.speed * options.h * 0.9,
        vr: motion.spin,
        toTarget: motion.toTarget,
      });
      this.container.addChild(node);
    }

    // §7: a brief bright flash at the break.
    this.flash = new Graphics()
      .circle(cx, cy, Math.max(options.w, options.h) * 0.55)
      .fill({ color: 0xffffff, alpha: 0.85 });
    this.flash.blendMode = "add";
    this.container.addChild(this.flash);
  }

  private readonly flash: Graphics;

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
      // Debris FALLS rather than spraying (§7): gravity on the outward arc,
      // before the pull toward the target takes over.
      const seconds = this.elapsed / 1000;
      const by = this.startY + shard.vy * burst + 0.5 * GRAVITY * seconds * seconds;
      shard.g.position.set(
        bx + (this.targetX - bx) * pull,
        by + (this.targetY - by) * pull,
      );
      shard.g.rotation += shard.vr * (deltaMs / 1000);
      shard.g.scale.set(1 - t * 0.75);
      shard.g.alpha = 1 - Math.pow(t, 1.6);
    }

    // The flash is over almost before it registers — it marks the break rather
    // than lighting the scene.
    const flashT = Math.min(1, this.elapsed / FLASH_MS);
    this.flash.alpha = 0.85 * (1 - flashT) ** 2;
    this.flash.scale.set(1 + flashT * 0.6);

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
