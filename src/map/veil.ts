import { Container, Graphics, Sprite, type Texture } from "pixi.js";

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
const SHEETS: readonly { x: number; y: number; w: number; h: number }[] = [
  { x: 0.04, y: 0.52, w: 0.30, h: 0.34 },
  { x: 0.68, y: 0.46, w: 0.30, h: 0.40 },
  { x: 0.38, y: 0.60, w: 0.26, h: 0.28 },
  { x: 0.16, y: 0.30, w: 0.22, h: 0.22 },
];

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
   * One sheet retreats per purchase. Drawn as a soft-cornered drape with a lit
   * top edge, so it reads as cloth over a shape rather than as a grey rectangle
   * — at 95px wide that edge is most of what says "sheet".
   */
  const remaining = SHEETS.length - restored;
  const sheets = new Graphics();
  for (let i = 0; i < remaining; i++) {
    const s = SHEETS[i]!;
    const x = s.x * width;
    const y = s.y * roomH;
    const w = s.w * width;
    const h = s.h * roomH;
    sheets.roundRect(x, y, w, h, Math.min(w, h) * 0.18).fill({ color: 0xd8d2c4, alpha: 0.5 });
    sheets
      .moveTo(x + w * 0.12, y + 1.5)
      .lineTo(x + w * 0.88, y + 1.5)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.28 });
  }
  overlay.addChild(sheets);

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
