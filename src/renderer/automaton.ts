import { Container, Sprite } from "pixi.js";

import type { Rect } from "./layout.js";
import { spriteFor } from "./sprites.js";
import type { ViewState } from "../game/types.js";

/**
 * THE BRASS AUTOMATON (ART_DIRECTION §2), placed as a NON-FLOW OVERLAY.
 *
 * Phone-eye bar: sits on the desk BESIDE the pool with a full readable
 * silhouette. Layout biases spare horizontal slack into the left gutter;
 * this sprite scales so the opaque CONTENT (not the soft contact-shadow
 * frame) clears pool.x. The renderer draws it above pool tiles.
 *
 * Non-interactive — must never steal a hit area from the pool or Restart.
 */

/** GDD §7.5's four states, mapped to what the board is doing. */
export type AutomatonState = "calm" | "thinking" | "delighted" | "worried";

/**
 * How long the player may sit still before the automaton starts thinking.
 * 9s: above a normal World 1 read, below a stuck-player abandon.
 */
export const THINKING_AFTER_MS = 9_000;

export function automatonState(state: ViewState, idleMs: number): AutomatonState {
  if (state.phase === "won") return "delighted";
  if (state.phase === "failed") return "worried";
  if (state.warning !== null) return "worried";
  return idleMs >= THINKING_AFTER_MS ? "thinking" : "calm";
}

/** Preferred height when the gutter has room. */
const HEIGHT = 88;
/** Kept clear of the viewport frame on the left. */
const INSET_X = 4;
/** Air between the opaque body and the pool's left edge. */
const GUTTER_CLEARANCE = 8;

/**
 * @param pool The pool band. Feet on its baseline; opaque body clears pool.x.
 */
export function automaton(state: AutomatonState, pool: Rect): Container | null {
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
  const height = Math.min(HEIGHT, heightFromGutter);
  const scale = height / frameH;
  sprite.scale.set(scale);

  const drawnW = frameW * scale;
  const drawnH = frameH * scale;
  const contentRight = drawnW * contentRightFrac;

  // Place so opaque body clears pool; soft shadow may fall in the air gap only.
  sprite.x = Math.max(INSET_X, pool.x - GUTTER_CLEARANCE - contentRight);
  sprite.y = Math.max(0, pool.y + pool.height - drawnH);
  container.addChild(sprite);
  container.eventMode = "none";
  container.interactiveChildren = false;
  container.zIndex = 50;
  return container;
}
