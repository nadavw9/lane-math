import { Container, Graphics, Text, TextStyle } from "pixi.js";

import { PALETTE } from "./layout.js";

/**
 * Tokens, drawn procedurally (GDD §9.2).
 *
 * Rounded squares, hexagons and circles are geometry. Graphics renders them
 * crisp at any scale with no atlas, no compression step and no resolution
 * ceiling, and recolouring for state is a parameter rather than a second sprite.
 *
 * **Shape-codes, never colour-codes.** Targets are hexagonal plates, pool
 * numbers are rounded squares, operators are circles — so a colourblind player
 * still knows what goes where, and nobody wonders whether a thing is a number
 * or an operator.
 */

/** Heavy geometric sans, tabular figures. Digits are the entire UI. */
export const DIGIT_FONT =
  '"DIN Alternate", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif';

export function digitStyle(size: number, fill: number): TextStyle {
  return new TextStyle({
    fontFamily: DIGIT_FONT,
    fontSize: size,
    fontWeight: "900",
    fill,
    // Tabular figures matter here — a 1 must occupy the same width as an 8 or a
    // queue of targets jitters as it advances. Pixi's TextStyle has no
    // font-variant-numeric, so the effect comes from the font stack: DIN
    // Alternate and Roboto Condensed are tabular by default, and the anchored
    // centre keeps single digits from drifting regardless.
    letterSpacing: 0.5,
  });
}

export function label(value: string, size: number, fill: number): Text {
  const text = new Text({ text: value, style: digitStyle(size, fill) });
  text.anchor.set(0.5);
  text.resolution = 2; // crisp digits when the canvas is scaled to fit
  return text;
}

/** Flat-top hexagon path, inset into its box. */
function hexPath(g: Graphics, w: number, h: number): Graphics {
  const notch = Math.min(w * 0.16, h * 0.5);
  return g.poly([
    notch, 0,
    w - notch, 0,
    w, h / 2,
    w - notch, h,
    notch, h,
    0, h / 2,
  ]);
}

export interface TokenStyle {
  readonly fill: number;
  readonly text: number;
  /** Bevel highlight/shadow strength. 0 flattens the token (recessed plates). */
  readonly bevel: number;
  readonly outline?: number | undefined;
}

/**
 * Target plate — hexagonal, cool, flat, recessed (§9.2).
 *
 * Recessed rather than raised on purpose: targets are the thing you spend
 * tiles ON, so they must not read as pickable.
 */
export function targetPlate(w: number, h: number, value: string, style: TokenStyle): Container {
  const token = new Container();
  const g = new Graphics();

  hexPath(g, w, h).fill(style.fill);
  // Recess: dark along the top edge, light along the bottom — the inverse of
  // the pool tiles, so the two read as opposite kinds of object.
  hexPath(g, w, h).stroke({ width: 2, color: 0x000000, alpha: 0.35, alignment: 1 });
  g.moveTo(w * 0.16, h - 1)
    .lineTo(w * 0.84, h - 1)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.08 });

  if (style.outline !== undefined) {
    hexPath(g, w, h).stroke({ width: 3, color: style.outline });
  }
  token.addChild(g);

  const text = label(value, Math.min(h * 0.52, 30), style.text);
  text.position.set(w / 2, h / 2);
  token.addChild(text);
  return token;
}

/**
 * Pool number tile — rounded square, warm, bevelled, tactile (§9.2).
 *
 * "Chunky bevelled tiles, Scrabble weight, slight drop shadow." Text reads as
 * information; a tile reads as a finite thing you spend.
 */
export function numberTile(w: number, h: number, value: string, style: TokenStyle): Container {
  const token = new Container();
  const r = Math.min(w, h) * 0.22;
  const g = new Graphics();

  // Drop shadow first, offset down.
  g.roundRect(1.5, 3, w, h, r).fill({ color: 0x000000, alpha: 0.45 });
  g.roundRect(0, 0, w, h, r).fill(style.fill);

  if (style.bevel > 0) {
    // Raised bevel: light top-left, dark bottom-right.
    g.roundRect(2, 2, w - 4, h - 4, r * 0.8).stroke({
      width: 2,
      color: 0xffffff,
      alpha: 0.22 * style.bevel,
      alignment: 0,
    });
    g.moveTo(r, h - 2)
      .lineTo(w - r, h - 2)
      .stroke({ width: 3, color: 0x000000, alpha: 0.3 * style.bevel });
  }
  if (style.outline !== undefined) {
    g.roundRect(0, 0, w, h, r).stroke({ width: 3, color: style.outline });
  }
  token.addChild(g);

  const text = label(value, Math.min(h * 0.54, 26), style.text);
  text.position.set(w / 2, h / 2);
  token.addChild(text);
  return token;
}

/**
 * Operator token — a circle (§9.2). Different shape from numbers means the
 * player can never wonder what goes where.
 */
export function operatorToken(size: number, glyph: string, style: TokenStyle): Container {
  const token = new Container();
  const radius = size / 2;
  const g = new Graphics();

  g.circle(radius + 1, radius + 2.5, radius).fill({ color: 0x000000, alpha: 0.45 });
  g.circle(radius, radius, radius).fill(style.fill);
  if (style.bevel > 0) {
    g.circle(radius, radius, radius - 2).stroke({
      width: 2,
      color: 0xffffff,
      alpha: 0.2 * style.bevel,
    });
  }
  if (style.outline !== undefined) {
    g.circle(radius, radius, radius).stroke({ width: 3, color: style.outline });
  }
  token.addChild(g);

  const text = label(glyph, size * 0.5, style.text);
  text.position.set(radius, radius);
  token.addChild(text);
  return token;
}

/** An empty equation slot: a dashed rounded square, clearly a socket. */
export function emptySlot(w: number, h: number): Container {
  const token = new Container();
  const g = new Graphics()
    .roundRect(0, 0, w, h, Math.min(w, h) * 0.22)
    .fill({ color: 0x000000, alpha: 0.28 })
    .roundRect(0, 0, w, h, Math.min(w, h) * 0.22)
    .stroke({ width: 2, color: PALETTE.textDim, alpha: 0.5 });
  token.addChild(g);
  return token;
}
