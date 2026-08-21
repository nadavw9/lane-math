import { Assets, Rectangle, Texture } from "pixi.js";

/**
 * The sprite path (ART_DIRECTION §5, §8, §9).
 *
 * Runs ALONGSIDE the procedural path, never instead of it. Every token can
 * still draw itself with Graphics, and does whenever a texture is absent —
 * which is most of the time until the art lands, and permanently for anything
 * that never gets art.
 *
 * A missing texture must degrade VISIBLY and never render nothing. This project
 * has had three silent-blank failures (CLAUDE.md), so the rule here is that a
 * gap in the atlas produces a procedural token plus a named entry in
 * `missingSprites()` — never an empty container, and never a throw.
 */

export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The solid object without its contact shadow. Numerals centre on this. */
  readonly content: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

export interface AtlasData {
  readonly family: string;
  /** Image file is explicit so the atlas can change codec without loader edits. */
  readonly image?: string;
  readonly cell: number;
  readonly frames: Record<string, Frame>;
}

export interface SpriteEntry {
  readonly texture: Texture;
  readonly frame: Frame;
}

/**
 * Off by default. Real art has not landed, and the flag is what lets the path
 * be exercised and reviewed without changing what a player sees.
 */
let enabled = false;
const entries = new Map<string, SpriteEntry>();
const missing = new Set<string>();

export function setSpritesEnabled(on: boolean): void {
  enabled = on;
}

export function spritesEnabled(): boolean {
  return enabled;
}

/**
 * Names the game asked for and did not get.
 *
 * Reported through the renderer's diagnostics so a missing sprite is a visible
 * fact rather than a silent fallback nobody notices for three weeks.
 */
export function missingSprites(): string[] {
  return [...missing].sort();
}

export function loadedSprites(): string[] {
  return [...entries.keys()].sort();
}

/** Look up a sprite, recording the miss if there is not one. */
export function spriteFor(name: string): SpriteEntry | null {
  if (!enabled) return null;
  const entry = entries.get(name);
  if (!entry) {
    missing.add(name);
    return null;
  }
  return entry;
}

/**
 * Load one family's atlas.
 *
 * Failure is not an error path: no atlas simply means the procedural tokens
 * keep drawing, which is the state the game shipped in.
 */
export async function loadAtlas(family: string, base = "/"): Promise<boolean> {
  try {
    // Pixi sees a `frames` field and may claim atlas metadata as a spritesheet
    // before this loader can read its explicit WebP image field. Fetching the
    // small manifest as JSON keeps ownership here and leaves Pixi to load the
    // texture, which is the part it is designed to cache and decode.
    const response = await fetch(`${base}assets/sprites/${family}.json`);
    if (!response.ok) return false;
    const data = (await response.json()) as AtlasData;
    const image = data?.image ?? `${family}.png`;
    const sheet = await Assets.load<Texture>(`${base}assets/sprites/${image}`);
    if (!data?.frames || !sheet) return false;

    for (const [name, frame] of Object.entries(data.frames)) {
      entries.set(name, {
        texture: new Texture({
          source: sheet.source,
          frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
        }),
        frame,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** Testing seam: register a frame without a browser. */
export function registerForTest(name: string, frame: Frame, texture: Texture): void {
  entries.set(name, { texture, frame });
}

export function resetSprites(): void {
  entries.clear();
  missing.clear();
  enabled = false;
}

/**
 * Where a numeral goes on a sprite, in token-local coordinates.
 *
 * THE POINT OF THIS FUNCTION. A sprite's frame includes its soft contact shadow
 * (§3: every object sits on something), so the frame's centre is BELOW the
 * object's visual centre — by exactly half the shadow. Centring a numeral on
 * the frame would ride it low on every token in the game, and the error is
 * invisible in isolation and obvious in a row.
 *
 * The drawn shape's bounds and the sprite's bounds are simply different things,
 * which is why the pipeline records a content box and why this reads it rather
 * than assuming the middle.
 */
export function numeralCentre(
  frame: Frame,
  width: number,
  height: number,
): { x: number; y: number } {
  if (frame.w <= 0 || frame.h <= 0) return { x: width / 2, y: height / 2 };
  const centreX = (frame.content.x - frame.x + frame.content.w / 2) / frame.w;
  const centreY = (frame.content.y - frame.y + frame.content.h / 2) / frame.h;
  return { x: centreX * width, y: centreY * height };
}

/**
 * Sprite name for a token in a given state (ART_DIRECTION §5).
 *
 * FOUR STATES, and the split between sprite and tint is deliberate:
 *
 *   idle        lit sprite
 *   pressed     the SAME lit sprite, transformed — it is the same object moved,
 *               and the feel layer (§9.5) already owns that motion
 *   disabled    the lit sprite at reduced opacity — not usable this step, but
 *               still alive
 *   unavailable a SEPARATE UNLIT SPRITE — permanently spent
 *
 * Why unavailable is not a tint. §5 says a dimmed glass tile means "the light
 * inside goes out", and the glow is baked into the lit sprite as emitted light.
 * Multiplying cannot remove emission: a tint darkens the highlight along with
 * everything else, which reads as an object in shadow rather than an object
 * switched off. The difference matters because §9.0's audit found disabled and
 * unavailable conflated, and "you cannot use this now" and "this is gone" are
 * the two states a resource-planning game most needs to keep apart.
 */
export type TokenState = "idle" | "pressed" | "disabled" | "unavailable";

export function spriteNameFor(base: string, state: TokenState): string {
  return state === "unavailable" ? `${base}-unlit` : `${base}-lit`;
}

/**
 * Related glass frames are selected deterministically from a tile's stable id.
 * Spent art has no variants in this delivery, so it deliberately stays on the
 * exact `*-unlit` name and falls back to procedural rendering when absent.
 */
export function spriteNameForVariant(base: string, state: TokenState, variant: number): string {
  const name = spriteNameFor(base, state);
  return state === "unavailable" || variant <= 0 ? name : `${name}-${variant + 1}`;
}

/** Opacity for a state. Only `disabled` is expressed as opacity. */
export function opacityFor(state: TokenState): number {
  return state === "disabled" ? 0.78 : 1;
}
