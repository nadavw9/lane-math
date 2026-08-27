import { Container, Graphics, Sprite, type Texture } from "pixi.js";

import { spriteFor } from "../renderer/sprites.js";

/**
 * THE SHABBY VEIL (ART_DIRECTION §6).
 *
 * The veil is the mechanism, not the objects. Sixteen objects across four rooms
 * means any single object is a small change; an object PLUS a quarter of the
 * darkness retreating is a large one. So this has to carry the progression on
 * its own, and it is built before any object exists precisely so that claim can
 * be tested rather than assumed.
 *
 * §6's start state, verbatim: brightness -45%, saturation -60%, cool grey cast,
 * dust-sheet shapes over the painted-in furniture. End state: the room as
 * shipped, no scrim. Four equal steps between.
 *
 * WHY A TINT AND NOT A FILTER. Pixi's ColorMatrixFilter would do this exactly,
 * and costs a render target per vignette — four of them on the most-visited
 * screen in the game, on a phone. Sprite tint plus two stacked overlays lands
 * within a few percent of the same numbers with no target at all, and the same
 * reasoning already decided the contact shadows and the brass lighting bands.
 */

/** Restoration state for one room: how many of its four objects are bought. */
export type Restored = 0 | 1 | 2 | 3 | 4;

/** §6: brightness -45% at step 0, none at step 4. */
export function brightnessAt(restored: Restored): number {
  return 1 - 0.45 * (1 - restored / 4);
}

/** §6: saturation -60% at step 0, none at step 4. Approximated by a grey mix. */
export function greyMixAt(restored: Restored): number {
  return 0.6 * (1 - restored / 4);
}

/**
 * A cool grey, mixed over the room to take saturation out.
 *
 * Cool rather than neutral because §6 asks for a cool cast, and because every
 * one of the four rooms is warm — a neutral grey would read as fog on all of
 * them and as nothing in particular.
 */
const COOL_GREY = 0x6b7480;

/**
 * Dust sheets over the furniture that is painted INTO the room.
 *
 * Overlays can add an object; they cannot remove a bookshelf that is already in
 * the background plate. The sheets are what make the room read as closed up
 * rather than merely dark, and they retreat one at a time so the first purchase
 * has something visible to do.
 *
 * Positions are fractions of the room half, chosen to sit where each scene's
 * furniture actually is rather than scattered: low and wide, against the walls.
 */
export interface Slot {
  /** Centre of the object, as a fraction of the vignette. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The four slots, shared by the drape and the object beneath it.
 *
 * Sharing them is what makes "the sheet comes off and the thing is underneath"
 * work — a drape at one position and its object at another would read as two
 * unrelated events. Objects are composed base-at-bottom, so `y` is the centre
 * and the base sits at `y + h / 2`.
 */
export const SLOTS: readonly Slot[] = [
  { x: 0.19, y: 0.69, w: 0.30, h: 0.34 },
  { x: 0.83, y: 0.66, w: 0.30, h: 0.40 },
  { x: 0.51, y: 0.74, w: 0.26, h: 0.28 },
  { x: 0.27, y: 0.41, w: 0.22, h: 0.22 },
];

/** Which four objects furnish each world, in purchase order (§6). */
export const OBJECTS: Readonly<Record<number, readonly string[]>> = {
  1: ["lamp", "clock", "globe", "blackboard"],
  2: ["stepladder", "bookcase", "armchair", "orrery"],
  3: ["specimen-case", "flask-rack", "pipework", "balance"],
  4: ["star-chart", "armillary", "shutter", "telescope"],
};


export interface VeilOptions {
  readonly width: number;
  readonly height: number;
  /** Fraction of the height that is ROOM. The desk half is never veiled (§6). */
  readonly roomFraction: number;
  readonly restored: Restored;
}

/**
 * Build the veil layers for a room vignette.
 *
 * Returns a container to lay OVER the room art, and the tint to apply to the
 * art itself. Two parts because tint belongs on the sprite and the overlays do
 * not, and hiding that behind one call would mean the caller could not tint.
 */
export function veil(options: VeilOptions): { overlay: Container; tint: number } {
  const { width, height, roomFraction, restored } = options;
  const roomH = height * roomFraction;
  const overlay = new Container();

  if (restored >= 4) return { overlay, tint: 0xffffff };

  const grey = greyMixAt(restored);

  // The cool cast and the darkening, both confined to the room half.
  const scrim = new Graphics();
  scrim.rect(0, 0, width, roomH).fill({ color: COOL_GREY, alpha: grey * 0.5 });
  scrim.rect(0, 0, width, roomH).fill({ color: 0x0b1016, alpha: (1 - brightnessAt(restored)) * 0.9 });
  overlay.addChild(scrim);

  /*
   * One drape retreats per purchase.
   *
   * A SPRITE, not a rounded rectangle. The rects read as grey blocks at 95px —
   * they said "something is covered" without saying "cloth", and they were the
   * only non-art element on the shelf. One drape casting is reused at all four
   * slots, mirrored and scaled, because a drape has no orientation the eye can
   * check and four copies of one shape at four sizes reads as four sheets.
   *
   * Falls back to nothing rather than to the rectangles: a missing drape leaves
   * a darker room, which is still a legible shabby state, where a grey box
   * would be a visible placeholder shipping to a player.
   */
  const drape = spriteFor("drape");
  /*
   * Cover the slots NOT YET BOUGHT — `restored` onwards.
   *
   * This counted from 0 to `SLOTS.length - restored`, which drapes the slots
   * the player has just PAID for and leaves the empty ones bare: at 2 of 4 the
   * room showed two sheets and none of its new furniture. The object layer
   * underneath was drawing correctly the whole time, hidden by a sheet over the
   * thing it had just revealed.
   */
  for (let i = restored; i < SLOTS.length; i++) {
    const slot = SLOTS[i]!;
    if (!drape) break;
    const sheet = new Sprite(drape.texture);
    const w = slot.w * width * 1.25;
    const h = slot.h * height * 1.15;
    sheet.scale.set(Math.min(w / drape.texture.width, h / drape.texture.height));
    sheet.anchor.set(0.5, 1);
    // Base at the bottom of the slot box, like the object it hides.
    sheet.position.set(slot.x * width, (slot.y + slot.h / 2) * height);
    // Mirrored on alternate slots so the same casting does not read as a repeat.
    if (i % 2 === 1) sheet.scale.x *= -1;
    overlay.addChild(sheet);
  }

  /*
   * The tint darkens the ART, which the scrim alone cannot do without also
   * washing it grey. Applied as a neutral multiply so hue is untouched — the
   * cast comes from the scrim above, where it can be tuned separately.
   */
  const level = Math.round(255 * brightnessAt(restored));
  const tint = (level << 16) | (level << 8) | level;
  return { overlay, tint };
}

/** Apply the veil to a room sprite, returning the overlay to add after it. */
export function veiled(art: Sprite, options: VeilOptions): Container {
  const { overlay, tint } = veil(options);
  art.tint = tint;
  return overlay;
}

export type { Texture };

/**
 * The objects a room has earned, laid out at their slots.
 *
 * Composed base-at-bottom: slots 1-3 stand on a floor and slot 4 sits on a
 * surface, so an object centred in its box would float. Scaled to FIT its box
 * rather than fill it — the sheets normalise apparent size across a family, and
 * for furniture that is wrong (a lamp is not an armchair), so the slot's own
 * dimensions restore the relative scale the art was drawn at.
 */
export function objectsFor(world: number, restored: Restored, width: number, height: number): Container {
  const layer = new Container();
  const names = OBJECTS[world] ?? [];
  for (let i = 0; i < restored && i < names.length; i++) {
    const entry = spriteFor(names[i]!);
    if (!entry) continue;
    const slot = SLOTS[i]!;
    const box = { w: slot.w * width, h: slot.h * height };
    const sprite = new Sprite(entry.texture);
    const fit = Math.min(box.w / entry.texture.width, box.h / entry.texture.height);
    sprite.scale.set(fit);
    sprite.anchor.set(0.5, 1);
    sprite.position.set(slot.x * width, (slot.y + slot.h / 2) * height);
    layer.addChild(sprite);
  }
  return layer;
}
