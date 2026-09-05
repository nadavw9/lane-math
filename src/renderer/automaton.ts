import { Container, Sprite } from "pixi.js";

import type { Rect } from "./layout.js";
import { spriteFor } from "./sprites.js";
import type { ViewState } from "../game/types.js";
import { TIMING } from "./tween.js";

/**
 * THE BRASS AUTOMATON (ART_DIRECTION §2), placed as a NON-FLOW OVERLAY.
 *
 * Phone-eye bar (PE-01 Scout REJECT fix): sits BESIDE the pool with a full
 * readable silhouette. Layout reserves AUTOMATON_DESK when the natural fit
 * would collapse the companion; this sprite clears pool.x with real air.
 * The renderer draws it above pool tiles.
 *
 * Non-interactive — must never steal a hit area from the pool or Restart.
 *
 * Win/fail MOTION (GDD register: weight, not energy): a short jump on delight,
 * a soft droop on worry — fired once on phase enter, then idle. Pose identity
 * stays the atlas frames; motion is a Y/squash tween on those sprites.
 */

/** GDD §7.5's four states, mapped to what the board is doing. */
export type AutomatonState = "calm" | "thinking" | "delighted" | "worried";

/** One-shot enter motions. Horizontal placement is untouched (PE-01). */
export type AutomatonMotionKind = "jump" | "droop";

/**
 * How long the player may sit still before the automaton starts thinking.
 * 9s: above a normal World 1 read, below a stuck-player abandon.
 */
export const THINKING_AFTER_MS = 9_000;

/** Restrained hop — long enough to read, short of celebration (~300–500ms). */
export const AUTOMATON_JUMP_MS = TIMING.automatonJump;
/** Soft settle into disappointment — not a shake. */
export const AUTOMATON_DROOP_MS = TIMING.automatonDroop;

/** Peak lift in design pixels. Small: brass has mass. */
const JUMP_PX = 10;
/** Soft downward settle when the level fails. */
const DROOP_PX = 5;
/** Soft vertical squash on the fail settle — feet stay planted via bottom pivot. */
const DROOP_SQUASH = 0.04;

export function automatonState(state: ViewState, idleMs: number): AutomatonState {
  if (state.phase === "won") return "delighted";
  if (state.phase === "failed") return "worried";
  if (state.warning !== null) return "worried";
  return idleMs >= THINKING_AFTER_MS ? "thinking" : "calm";
}

/**
 * Which one-shot motion to start when the board phase changes.
 *
 * Warning→worried is a pose only (no droop): the player has not failed yet.
 * Fire once on enter; idle calm/thinking never motion.
 */
export function automatonMotionOnEnter(
  previousPhase: string | null,
  nextPhase: string,
): AutomatonMotionKind | null {
  if (nextPhase === "won" && previousPhase !== "won") return "jump";
  if (nextPhase === "failed" && previousPhase !== "failed") return "droop";
  return null;
}

/** Sampled offset applied on top of PE-01 placement. */
export interface AutomatonMotionSample {
  /** Added to sprite.y. Negative is up (Pixi). */
  readonly dy: number;
  /** Multiplier on drawn scaleY; pivot at feet so the gutter stay clear. */
  readonly scaleY: number;
}

/**
 * Sample the enter motion at raw tween progress 0..1.
 *
 * Ends at rest (dy 0, scaleY 1) so the atlas pose carries the held emotion
 * after the brief physical beat.
 */
export function sampleAutomatonMotion(
  kind: AutomatonMotionKind,
  rawT: number,
): AutomatonMotionSample {
  const t = Math.max(0, Math.min(1, rawT));

  if (kind === "jump") {
    // Single weighty hop: one sine arc up and down. No squash/stretch —
    // that is the elastic bounce register this game does not use. Mass reads
    // from the short amplitude and the 420ms timing, then delighted pose holds.
    const hop = Math.sin(Math.PI * t);
    return {
      dy: -JUMP_PX * hop,
      scaleY: 1,
    };
  }

  // Disappointed settle/slump: ease down, hold the weight, ease back to rest.
  // Ends at identity so clearing automatonFeel does not pop; worried pose holds.
  let settle: number;
  if (t < 0.35) {
    settle = Math.sin((t / 0.35) * (Math.PI / 2));
  } else if (t < 0.55) {
    settle = 1;
  } else {
    const u = (t - 0.55) / 0.45;
    settle = 1 - u * u * (3 - 2 * u);
  }
  return {
    dy: DROOP_PX * settle,
    scaleY: 1 - DROOP_SQUASH * settle,
  };
}

/** Preferred height when the gutter has room. */
const HEIGHT = 88;
/** Readable floor target when desk repair runs (PE-01 Scout REJECT). */
const MIN_HEIGHT = 64;
/** Kept clear of the viewport frame on the left. */
const INSET_X = 4;
/** Air between opaque body and pool — 8px still kissed under tile glow (PE-01). */
const GUTTER_CLEARANCE = 20;

/**
 * @param pool The pool band. Feet on its baseline; opaque body clears pool.x.
 * @param motion Optional one-shot enter sample; null/omit leaves calm placement.
 */
export function automaton(
  state: AutomatonState,
  pool: Rect,
  motion: AutomatonMotionSample | null = null,
): Container | null {
  const entry = spriteFor(`automaton-${state}`);
  if (!entry) return null;

  const container = new Container();
  const sprite = new Sprite(entry.texture);

  const frameW = Math.max(1, entry.frame.w);
  const frameH = Math.max(1, entry.frame.h);
  // Content box excludes the soft contact shadow / glow in the atlas frame.
  const content = entry.frame.content;
  const contentLeft = Math.max(0, content.x - entry.frame.x);
  const contentW = Math.max(1, Math.min(frameW - contentLeft, content.w));
  const contentRightFrac = (contentLeft + contentW) / frameW;

  // Fit so the opaque body (content right edge) clears the pool.
  const gutter = Math.max(0, pool.x - INSET_X - GUTTER_CLEARANCE);
  const maxDrawnW = gutter > 0 ? gutter / contentRightFrac : 1;
  const heightFromGutter = maxDrawnW * (frameH / frameW);
  const height = heightFromGutter >= MIN_HEIGHT
    ? Math.min(HEIGHT, heightFromGutter)
    : Math.max(1, heightFromGutter);
  const scale = height / frameH;

  const motionY = motion?.scaleY ?? 1;
  // Horizontal scale unchanged — PE-01 gutter clearance is a right-edge budget.
  sprite.scale.set(scale, scale * motionY);

  const drawnW = frameW * scale;
  const drawnH = frameH * scale;
  const contentRight = drawnW * contentRightFrac;

  // Place so opaque body clears pool; soft shadow may fall in the air gap only.
  sprite.x = Math.max(INSET_X, pool.x - GUTTER_CLEARANCE - contentRight);
  // Feet on the pool baseline; squash grows downward from the head so the
  // contact stays planted (scaleY < 1 shortens toward the top-left origin).
  const baseY = Math.max(0, pool.y + pool.height - drawnH);
  const drawnHNow = frameH * scale * motionY;
  // Keep feet planted when squashed: shift y so bottom edge stays on baseline.
  sprite.y = baseY + (drawnH - drawnHNow) + (motion?.dy ?? 0);
  container.addChild(sprite);
  container.eventMode = "none";
  container.interactiveChildren = false;
  container.zIndex = 50;
  return container;
}
