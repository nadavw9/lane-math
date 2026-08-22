import { Container, Graphics, Matrix, Sprite, Text, TextStyle, type Texture } from "pixi.js";

import { radical } from "./emblems.js";
import { PALETTE } from "./layout.js";
import {
  numeralCentre,
  opacityFor,
  spriteFor,
  spriteNameForVariant,
  type TokenState,
} from "./sprites.js";

/**
 * The shared grain (GDD §9.6).
 *
 * ONE 64x64 tileable texture for every token type and for the pool tray, set
 * once at startup. Held in a module variable rather than threaded through every
 * call because it is a property of the material, not of any particular token —
 * and because tokens are built synchronously inside draw(), which cannot await
 * an asset.
 *
 * Absent until it loads, and absent forever if it fails: every draw below
 * checks, so a missing texture costs the game its grain and nothing else.
 */
let grain: Texture | null = null;

export function setGrainTexture(texture: Texture | null): void {
  grain = texture;
}

/**
 * Lay the grain over a shape that has already been filled.
 *
 * Drawn at a fixed world scale so the grain does not stretch with the token:
 * tokens range from 46 to 92px (§9.2) and a texture scaled to fit would give
 * the small dense boards a visibly finer material than the large sparse ones,
 * which is the opposite of one shared substance.
 */
function grainOver(g: Graphics, draw: (g: Graphics) => Graphics, alpha: number): void {
  if (!grain) return;
  draw(g).fill({ texture: grain, alpha, matrix: new Matrix(0.5, 0, 0, 0.5, 0, 0) });
}

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

/**
 * The game's typeface — bundled, not inherited (GDD §9.0).
 *
 * Outfit at 800. CHOSEN BY MEASUREMENT: the four candidates were rendered at
 * 55px and scored on how unlike the confusable digit pairs look. Outfit won on
 * both the worst pair (0.33 against Nunito's 0.25) and the mean (0.43 against
 * 0.36), which matters more here than anywhere — §9.2 says digits are the whole
 * UI and a maths puzzle dies if a 6 reads as an 8.
 *
 * The previous stack named DIN Alternate, Roboto Condensed and Arial Narrow,
 * NONE of which exist on Android, so every digit in the game rendered in
 * whatever Roboto the device happened to have. The typography was not chosen.
 *
 * One typeface for one game. Swapping it is this constant plus the @font-face
 * in index.html.
 */
export const DIGIT_FONT = 'Outfit, system-ui, sans-serif';

/** UI text uses the same face. One typeface for one game (§9.0). */
export const UI_FONT = DIGIT_FONT;

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

/**
 * The recessed panel and its numeral, drawn over whatever the plate is.
 *
 * Shared by the sprite and procedural paths so the cut is identical either way
 * — the panel is the thing that makes the numeral legible (§5), and it must not
 * differ depending on whether art happens to be loaded.
 */
function recessedPanel(w: number, h: number, value: string, style: TokenStyle): Container {
  const panel = new Container();
  /*
   * THE RECESSED PANEL (ART_DIRECTION §5).
   *
   * The numeral does not sit on the brass. Measured, plaque brass is L 0.206 —
   * a mid-tone that crowds text from both directions: ink navy reaches only
   * 3.54:1 against it and cream 3.41:1, both under the 4.5:1 text bar, and the
   * near-black that would pass reads harsh on warm metal. A dark panel is inset
   * into the plaque instead and the numeral drawn in cream on that, which
   * measures 14.50:1 and is what an engraved instrument nameplate actually is:
   * a darkened inset with the marking cut into it.
   *
   * Sized to the numeral rather than to a fraction of the plate, so a two-digit
   * target does not crowd the cut that a one-digit target leaves half empty.
   */
  const text = label(value, Math.min(h * 0.52, 30), style.text);
  const inset = new Graphics();
  const padX = text.height * 0.34;
  const padY = text.height * 0.16;
  const panelW = Math.min(w * 0.74, text.width + padX * 2);
  const panelH = Math.min(h * 0.66, text.height + padY * 2);
  const panelX = (w - panelW) / 2;
  const panelY = (h - panelH) / 2;
  const radius = Math.min(panelW, panelH) * 0.2;

  inset.roundRect(panelX, panelY, panelW, panelH, radius).fill({ color: PALETTE.felt });

  /*
   * What makes it read as CUT rather than painted on: with one light from the
   * upper left, the inside of the top wall is the surface turned away from it,
   * so a cut carries a soft dark band there and a thin lit edge along the
   * bottom where the far wall catches the light. Painted-on dark has neither.
   */
  const bands = Math.max(2, Math.round(panelH * 0.12));
  for (let i = 0; i < bands; i++) {
    inset
      .moveTo(panelX + radius * 0.7, panelY + 0.5 + i)
      .lineTo(panelX + panelW - radius * 0.7, panelY + 0.5 + i)
      .stroke({ width: 1, color: 0x000000, alpha: 0.3 * (1 - i / bands) });
  }
  inset
    .moveTo(panelX + radius * 0.7, panelY + panelH - 0.75)
    .lineTo(panelX + panelW - radius * 0.7, panelY + panelH - 0.75)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.13 });

  panel.addChild(inset);
  text.position.set(w / 2, h / 2);
  panel.addChild(text);
  return panel;
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
  /**
   * How far off the surface the token is sitting, 1 = resting (§9.5).
   *
   * Scales the existing drop shadow rather than changing any colour or shape,
   * so it is feel and not art: a lifted tile throws a longer, softer shadow
   * exactly as it would on a table, and that shadow is most of what makes the
   * lift read as height rather than as the tile simply getting bigger.
   */
  readonly elevation?: number | undefined;
}

/**
 * Target plate — hexagonal, cool, flat, recessed (§9.2).
 *
 * Recessed rather than raised on purpose: targets are the thing you spend
 * tiles ON, so they must not read as pickable.
 */
export function targetPlate(
  w: number,
  h: number,
  value: string,
  style: TokenStyle,
  variant = 0,
): Container {
  /*
   * The engraved brass plaque (ART_DIRECTION §5), when there is art for it.
   *
   * Two base variants, chosen from the target's own index so a column of
   * plaques does not repeat one casting. The FRONT-TARGET state is not a
   * separate sprite: §8 lists a lit plaque as its own asset and it has not been
   * delivered, and the gold rim and glow that state needs are drawn here
   * anyway, over whichever base is showing.
   */
  const art = spriteBase("plaque", "idle", w, h, Math.abs(variant) % 2);
  if (art) {
    if (style.outline !== undefined) {
      art.container.addChild(hexPath(new Graphics(), w, h).stroke({ width: 3, color: style.outline }));
    }
    art.container.addChild(recessedPanel(w, h, value, style));
    return art.container;
  }

  const token = new Container();
  const g = new Graphics();

  hexPath(g, w, h).fill(style.fill);
  // The same substance as the tiles (§9.6) — one grain across every token type.
  grainOver(g, (gr) => hexPath(gr, w, h), 0.13);

  // Recess: dark along the top edge, light along the bottom. The plates are
  // spent ON rather than picked up, so they sit deeper in the page than a tile.
  hexPath(g, w, h).stroke({ width: 2, color: 0x000000, alpha: 0.35, alignment: 1 });
  g.moveTo(w * 0.16, h - 1)
    .lineTo(w * 0.84, h - 1)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.1 });

  if (style.outline !== undefined) {
    hexPath(g, w, h).stroke({ width: 3, color: style.outline });
  }
  token.addChild(g);

  token.addChild(recessedPanel(w, h, value, style));
  return token;
}


/**
 * Pool number tile — rounded square, warm, bevelled, tactile (§9.2).
 *
 * "Chunky bevelled tiles, Scrabble weight, slight drop shadow." Text reads as
 * information; a tile reads as a finite thing you spend.
 */
/**
 * Draw a token from the atlas if there is art for it (ART_DIRECTION §5).
 *
 * Returns null when there is no texture, which is the signal to fall back to
 * the procedural path below rather than to give up. The numeral is NOT part of
 * the art (§8) and is drawn over the base by the caller, positioned on the
 * frame's content box so the contact shadow does not push it low.
 */
function spriteBase(
  base: string,
  state: TokenState,
  w: number,
  h: number,
  variant = 0,
): { container: Container; numeral: { x: number; y: number } } | null {
  const entry = spriteFor(spriteNameForVariant(base, state, variant));
  if (!entry) return null;

  const container = new Container();
  const sprite = new Sprite(entry.texture);
  sprite.width = w;
  sprite.height = h;
  container.addChild(sprite);
  container.alpha = opacityFor(state);

  return { container, numeral: numeralCentre(entry.frame, w, h) };
}

/**
 * Pool number tile — a glass cube once art lands, a drawn rounded square until
 * then (ART_DIRECTION §5, GDD §9.2).
 *
 * Both paths live here permanently. The procedural one is the fallback for any
 * token without art and the guarantee that a missing texture never blanks the
 * board.
 */
export function numberTile(
  w: number,
  h: number,
  value: string,
  style: TokenStyle,
  state: TokenState = "idle",
  variant = 0,
): Container {
  const art = spriteBase("cube", state, w, h, Math.abs(variant) % 3);
  if (art) {
    const text = label(value, Math.min(h * 0.54, 26), PALETTE.glassNumeral);
    text.position.set(art.numeral.x, art.numeral.y);
    art.container.addChild(text);
    if (style.outline !== undefined) {
      art.container.addChild(
        new Graphics()
          .roundRect(0, 0, w, h, Math.min(w, h) * 0.22)
          .stroke({ width: 3, color: style.outline }),
      );
    }
    return art.container;
  }

  const token = new Container();
  const r = Math.min(w, h) * 0.22;
  const g = new Graphics();

  // Drop shadow first, offset down. It travels with the token's height: a tile
  // held above the table casts further and fainter than one resting on it, and
  // a tile lying flat casts none at all.
  const lift = style.elevation ?? 1;
  if (lift > 0) {
    g.roundRect(1.5 * lift, 3 * lift, w, h, r).fill({
      color: 0x000000,
      alpha: 0.45 / Math.max(1, lift * 0.85),
    });
  }
  g.roundRect(0, 0, w, h, r).fill(style.fill);

  // §9.6: material, not a button. The grain is the same substance on every
  // token type, which is what makes them read as one set of objects.
  grainOver(g, (gr) => gr.roundRect(0, 0, w, h, r), 0.16);

  if (style.bevel > 0) {
    /*
     * §9.6: inner shadow along the TOP edge, rim light along the BOTTOM.
     *
     * The inverse of the usual raised-button bevel, and deliberately so — that
     * lighting says "a control protruding from a page", while this says "a
     * solid thing sitting IN the light of the room, catching it along its
     * lower edge". Combined with the drop shadow below it, the tile reads as an
     * object resting on the paper rather than a rectangle drawn on it.
     */
    g.moveTo(r * 0.6, 1.5)
      .lineTo(w - r * 0.6, 1.5)
      .stroke({ width: 3, color: 0x000000, alpha: 0.34 * style.bevel });
    g.moveTo(r * 0.6, h - 1.5)
      .lineTo(w - r * 0.6, h - 1.5)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.16 * style.bevel });
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
export function operatorToken(
  size: number,
  glyph: string,
  style: TokenStyle,
  state: TokenState = "idle",
): Container {
  const dialBase = {
    "+": "dial-plus",
    "−": "dial-minus",
    "-": "dial-minus",
    "×": "dial-times",
    "*": "dial-times",
    "÷": "dial-divide",
    "/": "dial-divide",
    // Keyed on the ASCII identity, because the character itself is never typed.
    sqrt: "dial-sqrt",
  }[glyph];
  const art = dialBase ? spriteBase(dialBase, state, size, size) : null;
  if (art) {
    // Operators are raised relief in their real dial artwork, not live text.
    return art.container;
  }

  const token = new Container();
  const radius = size / 2;
  const g = new Graphics();

  const lift = style.elevation ?? 1;
  if (lift > 0) {
    g.circle(radius + 1 * lift, radius + 2.5 * lift, radius).fill({
      color: 0x000000,
      alpha: 0.45 / Math.max(1, lift * 0.85),
    });
  }
  g.circle(radius, radius, radius).fill(style.fill);
  grainOver(g, (gr) => gr.circle(radius, radius, radius), 0.14);

  if (style.bevel > 0) {
    /*
     * §9.6: shadow along the top of the disc, rim light along the bottom.
     *
     * moveTo before each arc is REQUIRED, not tidiness: an arc appended to a
     * non-empty path draws a connecting line from wherever the pen was, which
     * put a stray diagonal across the operator row.
     */
    const at = (angle: number): [number, number] => [
      radius + (radius - 1.5) * Math.cos(angle),
      radius + (radius - 1.5) * Math.sin(angle),
    ];

    g.moveTo(...at(Math.PI * 1.15))
      .arc(radius, radius, radius - 1.5, Math.PI * 1.15, Math.PI * 1.85)
      .stroke({ width: 3, color: 0x000000, alpha: 0.3 * style.bevel });

    g.moveTo(...at(Math.PI * 0.2))
      .arc(radius, radius, radius - 1.5, Math.PI * 0.2, Math.PI * 0.8)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.18 * style.bevel });
  }
  if (style.outline !== undefined) {
    g.circle(radius, radius, radius).stroke({ width: 3, color: style.outline });
  }
  token.addChild(g);

  // `√` is not in Outfit at any subset, so typing it would fall back to a
  // system font while the other four dials render in the game's own. Drawn.
  if (glyph === "sqrt") {
    const mark = radical(size * 0.5, style.text);
    mark.position.set(radius, radius);
    token.addChild(mark);
    return token;
  }

  const text = label(glyph, size * 0.5, style.text);
  text.position.set(radius, radius);
  token.addChild(text);
  return token;
}

/**
 * The lane: a strip of SQUARED PAPER (§9.6).
 *
 * Furniture carries the theme rather than being a neutral panel. The white
 * veil is still doing the separation job (§9.1) — the ruling is drawn on top of
 * it, so the band reads as a piece of graph paper laid on the desk rather than
 * as a rectangle of lighter background.
 *
 * Procedural, so it costs nothing and scales with the band: the pitch is fixed
 * in design units, which means the squares stay square whatever the lane's
 * height turns out to be for a given board.
 */
export function squaredPaper(
  w: number,
  h: number,
  veil: { colour: number; alpha: number },
): Container {
  const panel = new Container();
  const g = new Graphics();
  const pitch = 22;

  g.roundRect(0, 0, w, h, 8).fill({ color: veil.colour, alpha: veil.alpha });

  // Ruling, drawn INSIDE the rounded corners so it never pokes out of the strip.
  const ruled = new Graphics();
  for (let x = pitch; x < w; x += pitch) ruled.moveTo(x, 0).lineTo(x, h);
  for (let y = pitch; y < h; y += pitch) ruled.moveTo(0, y).lineTo(w, y);
  ruled.stroke({ width: 1, color: PALETTE.rule, alpha: 0.16 });

  const clip = new Graphics().roundRect(0, 0, w, h, 8).fill(0xffffff);
  ruled.mask = clip;

  panel.addChild(g, clip, ruled);
  return panel;
}

/**
 * The pool: a shallow WOODEN TRAY the tiles sit in (§9.6).
 *
 * Translucent rather than opaque, which matters for more than looks — the
 * brightness gate measures tokens against what is actually behind them, and an
 * opaque tray would replace the measured paper with an unmeasured surface. At
 * this alpha the tray tints the ground warm and the gate composites it, so what
 * is judged is what ships.
 *
 * Shallow: an inner shadow along the top wall and a rim light along the bottom,
 * the same lighting the tokens use, so tray and tiles agree about where the
 * light is.
 */
export function woodenTray(w: number, h: number, colour: number, alpha: number): Container {
  const tray = new Container();
  const g = new Graphics();
  const r = 10;

  g.roundRect(0, 0, w, h, r).fill({ color: colour, alpha });
  grainOver(g, (gr) => gr.roundRect(0, 0, w, h, r), 0.2);

  // The near wall catches light; the far wall is in shadow.
  g.moveTo(r, 2)
    .lineTo(w - r, 2)
    .stroke({ width: 4, color: 0x000000, alpha: 0.16 });
  g.moveTo(r, h - 2)
    .lineTo(w - r, h - 2)
    .stroke({ width: 3, color: 0xffffff, alpha: 0.22 });
  g.roundRect(0, 0, w, h, r).stroke({ width: 1, color: 0x000000, alpha: 0.14 });

  tray.addChild(g);
  return tray;
}

/** The wood frame and opaque felt surface that physically support real art. */
export function feltLinedTray(w: number, h: number, colour: number, alpha: number, felt: number): Container {
  const tray = woodenTray(w, h, colour, alpha);
  const inset = 6;
  const innerW = Math.max(0, w - inset * 2);
  const innerH = Math.max(0, h - inset * 2);
  const lining = new Graphics();
  const drawFelt = (g: Graphics): Graphics =>
    g.roundRect(inset, inset, innerW, innerH, 7);

  drawFelt(lining).fill({ color: felt });
  // The shared fine grain reads as a short nap at this restrained opacity.
  grainOver(lining, drawFelt, 0.24);

  // Layered inset strokes soften the join instead of drawing a hard outline.
  drawFelt(lining).stroke({ width: 5, color: 0x000000, alpha: 0.2, alignment: 1 });
  lining
    .roundRect(inset + 2, inset + 2, Math.max(0, innerW - 4), Math.max(0, innerH - 4), 5)
    .stroke({ width: 2, color: 0x000000, alpha: 0.1, alignment: 1 });

  tray.addChild(lining);
  return tray;
}

/**
 * A spent tile's slot — stroke only, in the shape the tile had (§9.3).
 *
 * The pool does not re-pack, so this outline sits exactly where the tile was
 * and can never collide with a live one. It is the visible record of what has
 * been spent: on a 16-tile board the holes are what tells the player the pool
 * is running out, and a gap with no outline reads as a layout that shuffled
 * rather than as a number that is gone forever.
 *
 * Deliberately unfilled. A fill would make a spent slot compete with the live
 * tiles for attention, and the thing being communicated is absence.
 */
/**
 * A cleared target's empty slot (§9.3, applied to the lane).
 *
 * The lane keeps its start-of-level height on purpose — reflowing mid-level
 * would move the board under the player's fingers — so every cleared target
 * used to leave a hole, and by the end of a six-target level most of the lane
 * was void. The pool already solved this: a spent tile leaves a stroke-only
 * ghost on the hole it came from.
 *
 * Same treatment, hexagonal, so the lane reads as a queue that has been WORKED
 * THROUGH rather than one that is mysteriously short. It also shows progress
 * without a counter. The queue still advances underneath it, so §9.4's refusal
 * signal — the front target not moving — is untouched.
 */
export function ghostPlaque(w: number, h: number): Container {
  const token = new Container();
  /*
   * Brass, not the procedural plate's navy. The pool's ghost is drawn in its
   * token's own material (§9.3) and this follows that: the thing that was here
   * is a brass plaque. Navy at this alpha would also be invisible — the lane is
   * felt-lined now, and #1E2A3A on #241812 is barely a line.
   */
  token.addChild(
    hexPath(new Graphics(), w, h).stroke({ width: 2, color: 0xc9a227, alpha: 0.34 }),
  );
  return token;
}

export function ghostSlot(w: number, h: number): Container {
  const token = new Container();
  const r = Math.min(w, h) * 0.22;
  token.addChild(
    new Graphics()
      .roundRect(1, 1, w - 2, h - 2, r)
      .stroke({ width: 2, color: PALETTE.tile, alpha: 0.38 }),
  );
  return token;
}

/**
 * An empty equation slot — a socket, SHAPE-CODED to what belongs in it.
 *
 * The row is number-operator-number, so slots 1 and 3 outline a rounded square
 * and slot 2 outlines a circle. Filled slots already keep the shape of what is
 * in them; leaving the empty ones as three identical rectangles meant the
 * affordance only appeared after the player had guessed right once. Now the
 * empty row states the sentence it wants before anything is placed, and states
 * it in the same channel as the tokens (§9.2: shape-code, don't colour-code).
 */
export function emptySlot(w: number, h: number, shape: "square" | "circle"): Container {
  const token = new Container();
  const g = new Graphics();

  // A hole punched in the paper: darker than the ground, since the ground is
  // now the light thing. Faint enough that a socket never competes with a token.
  const inset = { color: 0x000000, alpha: 0.14 };
  const edge = { width: 2, color: PALETTE.text, alpha: 0.4 };

  if (shape === "circle") {
    const radius = Math.min(w, h) / 2;
    g.circle(w / 2, h / 2, radius).fill(inset);
    g.circle(w / 2, h / 2, radius).stroke(edge);
  } else {
    const r = Math.min(w, h) * 0.22;
    g.roundRect(0, 0, w, h, r).fill(inset);
    g.roundRect(0, 0, w, h, r).stroke(edge);
  }

  token.addChild(g);
  return token;
}
