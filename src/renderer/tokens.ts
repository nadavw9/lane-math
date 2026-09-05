import { Container, Graphics, Matrix, Sprite, Text, TextStyle, type Texture } from "pixi.js";

import { hintDiamond, radical } from "./emblems.js";
import { PALETTE } from "./layout.js";

/** §4 brass, the frame's two tones. */
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
   * Sized to the plate's cast recess (rivet-to-rivet), not to the glyph bounds,
   * so a front-target `3` seats in the same brass window as a two-digit value.
   */
  const text = label(value, Math.min(h * 0.52, 30), style.text);
  const inset = new Graphics();
  /*
   * Well size follows the BRASS FRAME, not the glyph.
   *
   * Sizing to the numeral left single-digit targets (a front `3`) as a tiny felt
   * postage stamp floating inside the cast recess between the rivets — phone-eye
   * read that as plaque misfit. The atlas plaques already cut a fixed recess;
   * the procedural felt must fill that same window so short and long values
   * share one seating.
   */
  const panelW = w * 0.58;
  const panelH = h * 0.5;
  const panelX = (w - panelW) / 2;
  // Optical centre: atlas bevels are heavier bottom-right, so geometric centre
  // reads low inside the casting. Nudge the felt well slightly toward the light.
  const panelY = (h - panelH) / 2 - h * 0.04;
  const radius = Math.min(panelW, panelH) * 0.2;
  // PE-02 Scout REJECT: seat numeral in the FELT WELL, not brass plate centre.
  // Well is nudged up; text at (w/2,h/2) parked short digits low vs board cube.
  const wellCX = panelX + panelW / 2;
  const wellCY = panelY + panelH / 2;
  // Short glyphs (esp. 1) read left-heavy in tabular figures — nudge right.
  const numeralX = wellCX + (value.length === 1 ? panelW * 0.03 : 0);
  // Cream digits read heavy; mild lift seats like board cube numerals.
  const numeralY = wellCY - panelH * 0.055;

  inset.roundRect(panelX, panelY, panelW, panelH, radius).fill({ color: PALETTE.felt });
  if (style.outline !== undefined) {
    /*
     * Cool lip on the felt well — the live-target signal when atlas brass and a
     * Graphics hex cannot share an edge. Seated on the recess the eye already
     * reads as the answer window.
     */
    inset.roundRect(panelX, panelY, panelW, panelH, radius).stroke({
      width: Math.max(2, (style.outlineWidth ?? 3.5) * 0.55),
      color: style.outline,
      alpha: 0.95,
      alignment: 1,
    });
  }

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
  text.position.set(numeralX, numeralY);
  panel.addChild(text);
  return panel;
}

/**
 * THE REMAINING-USES COUNTER (GDD §6, §7.6, §8.2).
 *
 * Normal counts operator uses and Expert consumes them, and the board never
 * said how many were left — so §8.2's traps, which assume the player plans
 * around scarcity, could not be planned around at all. If you cannot see there
 * is one divide, you cannot reserve it.
 *
 * A CHIP, NOT PIPS, and the reasons are measured:
 *
 *  - budgets never exceed 5 across the shipped ladder (1x92, 2x74, 3x45, 4x16,
 *    5x2), so this is ALWAYS a single digit — it never needs to grow;
 *  - dials range 55-106 design px and the binding case is 55, where five pips
 *    around the rim would be about 4px each;
 *  - the knurled rim is the dial's brightest, busiest feature — measured
 *    dragging the light centroid by +5.9 degrees — so it is the worst surface
 *    to put state on.
 *
 * Lower-right because §3 puts the specular upper-left: the chip sits where the
 * dial's own shading falls away, which is where the most contrast is available
 * and where it competes with the highlight least.
 *
 * Same treatment as the plaque numeral (§5): a dark inset with a cream marking
 * cut into it, which is the language the board already speaks.
 */
export function operatorCount(size: number, remaining: number): Container {
  const chip = new Container();
  const d = size * 0.34;
  const r = d / 2;
  const text = label(String(remaining), d * 0.62, PALETTE.tokenInk);

  const g = new Graphics();
  g.circle(0, 0, r).fill({ color: PALETTE.felt });
  // The cut reads by its lighting, not by an outline (§3): dark inside the top
  // wall, a thin lit edge along the bottom where the far wall catches light.
  g.arc(0, 0, r - 0.75, Math.PI * 1.08, Math.PI * 1.92)
    .stroke({ width: Math.max(1, r * 0.2), color: 0x000000, alpha: 0.34 });
  g.arc(0, 0, r - 0.75, Math.PI * 0.12, Math.PI * 0.88)
    .stroke({ width: Math.max(1, r * 0.16), color: 0xffffff, alpha: 0.16 });
  chip.addChild(g);

  text.position.set(0, 0);
  chip.addChild(text);
  return chip;
}

/*
 * EVERY MODAL SURFACE IN THE GAME IS THIS ONE (§9.0).
 *
 * Swept once, after the same defect appeared three times — the warning panel,
 * the hint shop, and out-of-lives were each a flat card with a stroke, and each
 * was fixed only when pointed at. Two instances of a rule means look for the
 * third rather than wait for it to surface.
 *
 * The seven that use it: cleared, failure, warning, hint shop, out-of-lives,
 * the Academy shelf, the Academy confirm. `PALETTE.card` — the cream surface
 * they all used to be — now has no callers at all.
 *
 * WHAT LEGITIMATELY IS NOT A FRAMED PANEL, and why:
 *
 *   woodenTray, feltLinedTray   furniture the board sits ON, not a surface
 *                               laid OVER it. A tray inside a brass frame
 *                               would be a box inside a box.
 *   recessedPanel               the numeral inset INSIDE a token, at a scale
 *                               where a frame would be all frame.
 *   ghostPlaque, ghostSlot,     the absence of a token, drawn stroke-only:
 *   emptySlot                   framing a hole would make it an object.
 *   the equation band veil      a band TINT, the same derived value the lane
 *                               uses, not a panel at all.
 *
 * Anything new that reads as a panel laid over the board belongs here. If it
 * does not, say why beside it.
 */
/**
 * A FRAMED PANEL — the modal shell for §9.4's failure options.
 *
 * Composition taken from Traffic Bomb's lose-frame: an ornate border floating
 * over a dimmed board, corner details, a centre cartouche, and a clear interior
 * for content. The MATERIAL is not taken — that frame is cracked dark stone
 * with an orange glow, which is that game's world. This is brass and felt
 * (ART_DIRECTION §4), the same two surfaces the trays, the lane and the plaques
 * are already made of, so the panel reads as another object on the same desk
 * rather than as UI arriving from somewhere else.
 *
 * Every §3 rule the tokens follow applies here at panel scale: one light from
 * the upper left, so the top and left faces of the frame catch it and the
 * bottom and right fall away; a specular on the upper-left; a contact shadow
 * beneath, because it floats; and no outlines — the frame is separated from
 * the board by its own lighting.
 *
 * Returns the interior rect so callers place content against the opening
 * rather than against the outer edge, which is what keeps content off the
 * border however the frame's thickness changes.
 */
export function framedPanel(
  w: number,
  h: number,
): { panel: Container; interior: { x: number; y: number; width: number; height: number } } {
  const panel = new Container();
  const border = Math.max(12, Math.min(w, h) * 0.075);
  const radius = border * 1.1;

  // It floats, so it sits on something (§3).
  const shadow = new Graphics();
  for (let i = 3; i >= 1; i--) {
    shadow
      .roundRect(-i * 1.5, h * 0.02 + i * 2.5, w + i * 3, h + i * 2, radius)
      .fill({ color: 0x2b1a10, alpha: 0.13 });
  }
  panel.addChild(shadow);

  const g = new Graphics();
  // Brass body, lit from the upper left: the deep tone underneath, the lit tone
  // laid over the top-left so the frame has a direction rather than a fill.
  g.roundRect(0, 0, w, h, radius).fill({ color: PALETTE.brassDeep });
  /*
   * Light falls off DOWN the frame, built from stacked bands rather than one.
   *
   * A single lit band leaves its own rounded bottom corners showing as a pale
   * tab on the frame's left edge — a shape boundary where there should only be
   * material getting darker. Six overlapping bands put six different curves in
   * six different places, none of which reads as an edge, and the accumulated
   * alpha is the gradient. Same trick as the contact shadows: no filter, no
   * render target, just shapes.
   */
  for (let i = 0; i < 6; i++) {
    g.roundRect(0, 0, w, h * (0.26 + i * 0.07), radius).fill({ color: PALETTE.brass, alpha: 0.19 });
  }
  // The outer top edge catches the light; the bottom falls into shadow.
  g.moveTo(radius, 1.5)
    .lineTo(w - radius, 1.5)
    .stroke({ width: 3, color: 0xffe9a8, alpha: 0.45 });
  g.moveTo(radius, h - 1.5)
    .lineTo(w - radius, h - 1.5)
    .stroke({ width: 3, color: 0x000000, alpha: 0.3 });
  panel.addChild(g);

  // The opening: a felt interior, cut into the brass.
  const ix = border;
  const iy = border;
  const iw = w - border * 2;
  const ih = h - border * 2;
  const inner = new Graphics();
  const innerR = radius * 0.7;
  inner.roundRect(ix, iy, iw, ih, innerR).fill({ color: PALETTE.felt });
  grainOver(inner, (gr) => gr.roundRect(ix, iy, iw, ih, innerR), 0.22);
  // The bright rim tracing the opening, which is what makes the frame read as
  // having thickness rather than being a printed border.
  inner
    .roundRect(ix - 1.5, iy - 1.5, iw + 3, ih + 3, innerR + 1.5)
    .stroke({ width: 2.5, color: 0xffe9a8, alpha: 0.35 });
  // Inside the opening, the top wall is turned away from the light.
  inner
    .moveTo(ix + innerR, iy + 2)
    .lineTo(ix + iw - innerR, iy + 2)
    .stroke({ width: 4, color: 0x000000, alpha: 0.34 });
  panel.addChild(inner);

  // Corner studs — the reference's pyramids, as the rivets the plaques already
  // carry, so the vocabulary is one the board has already taught.
  const studs = new Graphics();
  const sr = border * 0.3;
  for (const [sx, sy] of [
    [border * 0.62, border * 0.62],
    [w - border * 0.62, border * 0.62],
    [border * 0.62, h - border * 0.62],
    [w - border * 0.62, h - border * 0.62],
  ] as const) {
    studs.circle(sx, sy, sr).fill({ color: PALETTE.brassDeep });
    studs.circle(sx - sr * 0.18, sy - sr * 0.18, sr * 0.78).fill({ color: 0xd8b53a });
    studs.circle(sx - sr * 0.3, sy - sr * 0.32, sr * 0.34).fill({ color: 0xffe9a8, alpha: 0.6 });
  }
  panel.addChild(studs);

  // The centre cartouche, carrying the gold mark the hint line already uses.
  const cartouche = new Graphics();
  const cw = border * 2.4;
  const ch = border * 0.92;
  cartouche
    .roundRect(w / 2 - cw / 2, -ch * 0.32, cw, ch, ch * 0.42)
    .fill({ color: PALETTE.brass });
  cartouche
    .roundRect(w / 2 - cw / 2, -ch * 0.32, cw, ch * 0.5, ch * 0.42)
    .fill({ color: 0xffe9a8, alpha: 0.3 });
  panel.addChild(cartouche);
  const gem = hintDiamond(border * 0.72);
  gem.position.set(w / 2, ch * 0.16);
  panel.addChild(gem);

  /*
   * The specular belongs on the FRAME, not floating over the opening. Placed
   * over the interior it read as a smudge on the felt rather than as light on
   * metal, which is the difference between a lit object and a dirty one.
   */
  const hi = new Graphics();
  hi.ellipse(border * 1.6, border * 0.5, border * 1.5, border * 0.28)
    .fill({ color: 0xffffff, alpha: 0.16 });
  panel.addChild(hi);

  return { panel, interior: { x: ix, y: iy, width: iw, height: ih } };
}

/**
 * Native plaque atlas top-edge notch as a fraction of frame width.
 *
 * Measured on plaques.webp (opaque top span 45..314 of 360). Procedural
 * `hexPath` uses min(w*0.16, h*0.5), which diverges once the sprite is
 * stretched away from the atlas aspect — the cool front rim then floats off
 * the brass edge (OOL phone-eye P0).
 */
export const PLAQUE_ART_NOTCH = 45 / 360;

/** Flat-top hexagon path, inset into its box. */
function hexPath(g: Graphics, w: number, h: number, notchX?: number): Graphics {
  const notch = notchX ?? Math.min(w * 0.16, h * 0.5);
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
  /** Override the 3px token rim when a state needs a firmer silhouette. */
  readonly outlineWidth?: number | undefined;
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
    /*
     * No floating Graphics hex over atlas plaques (phone-eye: cool stroke never
     * shared an edge with the stretched casting). Live-target emphasis is the
     * cool lip on the felt well inside recessedPanel — geometry that matches.
     */
    // Felt well + cream numeral, seated on the content centre (not the shadow frame).
    const well = recessedPanel(w, h, value, style);
    well.position.set(art.numeral.x - w / 2, art.numeral.y - h / 2);
    art.container.addChild(well);
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
    // Inner alignment: the rim is a lip on the plate, not a floating halo.
    hexPath(g, w, h).stroke({
      width: style.outlineWidth ?? 3,
      color: style.outline,
      alignment: 1,
    });
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
          .stroke({ width: style.outlineWidth ?? 3, color: style.outline }),
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
    g.roundRect(0, 0, w, h, r).stroke({ width: style.outlineWidth ?? 3, color: style.outline });
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
/**
 * Seat the chip on the dial's lower-right diagonal, at 0.62R.
 *
 * 0.62 rather than 0.70 because at 0.70 the chip's own edge lands at 0.520 of
 * the token — outside the disc — so it hung off the silhouette and read as
 * stuck on rather than seated in. At 0.62 the edge is at 0.480, inside.
 *
 * THE SIZE IS NOT REDUCED, and that is measured rather than assumed. Symbol
 * occlusion is ~23% worst case (the minus, whose bar spans the dial) and
 * shrinking the chip from 0.34 to 0.22 only moves it to ~19% — four points for
 * a third of the digit. Any chip in this quadrant crosses that bar, so the
 * trade buys nothing. The minus stays unambiguous because the five operators
 * are shape-coded (§9.2) and none is confusable by its right-hand end.
 */
function seatCount(size: number, remaining: number): Container {
  const chip = operatorCount(size, remaining);
  const offset = size * 0.5 * 0.62 * Math.SQRT1_2;
  chip.position.set(size / 2 + offset, size / 2 + offset);
  return chip;
}

export function operatorToken(
  size: number,
  glyph: string,
  style: TokenStyle,
  state: TokenState = "idle",
  /**
   * Uses left, or undefined where the count must not show.
   *
   * Undefined rather than -1 or Infinity: Casual has unlimited operators (§6)
   * and §7.6 is explicit that an unlimited count is not a smaller number, so
   * there is nothing to draw rather than a symbol meaning "many".
   */
  remaining?: number | undefined,
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
    if (remaining !== undefined) art.container.addChild(seatCount(size, remaining));
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
  if (remaining !== undefined) token.addChild(seatCount(size, remaining));
  return token;
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

  /*
   * A CONTACT SHADOW UNDER THE WHOLE TRAY, drawn before it.
   *
   * The tray is translucent wood on a wooden desk, so LUMINANCE CANNOT
   * SEPARATE THEM — measured at 1.32-1.78:1 against the desk median, lowest on
   * room 3. That is not a fixable ratio: tinting the wood or darkening the room
   * would break the token contrast the gate holds, and the two materials are
   * supposed to be the same wood. What tells the eye it is a separate object is
   * geometry — an edge that catches light, a wall that shadows, and the ground
   * darkening beneath it.
   *
   * Stacked offsets rather than one blurred sprite: no filter, no render
   * target, the same trick the framed panel uses.
   */
  const contact = new Graphics();
  for (let i = 4; i >= 1; i--) {
    contact
      .roundRect(-i * 0.6, h * 0.012 + i * 1.9, w + i * 1.2, h + i * 1.4, r + i)
      .fill({ color: 0x1a0f08, alpha: 0.1 });
  }
  tray.addChild(contact);

  g.roundRect(0, 0, w, h, r).fill({ color: colour, alpha });
  grainOver(g, (gr) => gr.roundRect(0, 0, w, h, r), 0.2);

  /*
   * The near wall catches light; the far wall is in shadow. Both were too
   * timid to carry the separation on their own, which they now have to.
   */
  // Far wall: a deeper, wider inner shadow, falling off in two passes so the
  // wall reads as curved rather than as a drawn line.
  g.moveTo(r, 2.5)
    .lineTo(w - r, 2.5)
    .stroke({ width: 7, color: 0x000000, alpha: 0.30 });
  g.moveTo(r, 6)
    .lineTo(w - r, 6)
    .stroke({ width: 5, color: 0x000000, alpha: 0.14 });

  // Near wall: a brighter lit top edge, with a hairline highlight riding it.
  g.moveTo(r, h - 2.5)
    .lineTo(w - r, h - 2.5)
    .stroke({ width: 5, color: 0xffffff, alpha: 0.34 });
  g.moveTo(r, h - 5)
    .lineTo(w - r, h - 5)
    .stroke({ width: 1.5, color: 0xffffff, alpha: 0.16 });

  // The outline carries the sides, where neither wall stroke reaches.
  g.roundRect(0, 0, w, h, r).stroke({ width: 1.5, color: 0x000000, alpha: 0.26 });

  tray.addChild(g);
  return tray;
}

/** The wood frame and opaque felt surface that physically support real art. */
export function feltLinedTray(
  w: number,
  h: number,
  colour: number,
  alpha: number,
  felt: number,
  /**
   * Opacity of the felt LINING. Defaults to opaque, which is what a tray on a
   * desk should be — the pool holds physical objects and must read as one.
   *
   * The LANE passes a lower value. Its lining was opaque too, which made it the
   * screen's largest occluder: the brightness gate measured every token family
   * against felt and returned identical numbers on all four rooms, because no
   * token in the game ever touched a room. Four paintings the player could not
   * see. The lining is not what makes plaques legible either — they read 3.79:1
   * against felt and 4.08:1 against bare room, so the felt was costing the art
   * and buying nothing.
   */
  feltAlpha = 1,
): Container {
  const tray = woodenTray(w, h, colour, alpha);
  const inset = 6;
  const innerW = Math.max(0, w - inset * 2);
  const innerH = Math.max(0, h - inset * 2);
  const lining = new Graphics();
  const drawFelt = (g: Graphics): Graphics =>
    g.roundRect(inset, inset, innerW, innerH, 7);

  drawFelt(lining).fill({ color: felt, alpha: feltAlpha });
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

  // PE-05: lighter felt recess that still invites the next tap. Alpha-0.14
  // black holes read too dead beside glass cubes at phone distance.
  const inset = { color: 0x3a2a1c, alpha: 0.72 };
  const edge = { width: 2.5, color: PALETTE.brassLit, alpha: 0.42 };

  if (shape === "circle") {
    const radius = Math.min(w, h) / 2;
    g.circle(w / 2, h / 2, radius).fill(inset);
    g.circle(w / 2, h / 2, radius).stroke(edge);
    g.circle(w / 2, h / 2, Math.max(1, radius - 2))
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.08 });
  } else {
    const r = Math.min(w, h) * 0.22;
    g.roundRect(0, 0, w, h, r).fill(inset);
    g.roundRect(0, 0, w, h, r).stroke(edge);
    g.roundRect(2, 2, w - 4, h - 4, Math.max(1, r - 2))
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.08 });
  }

  token.addChild(g);
  return token;
}

/**
 * THE COMMIT KEY — a heavy brass instrument key (§9.2, §9.6).
 *
 * It was a flat navy rectangle sitting beside operator dials with knurled rims
 * and specular highlights: the most important control in the game, and the only
 * one with no material. Brass puts it in the same family as the operators it
 * sits with, and heavier — a deeper body, a broader bevel and a stronger
 * contact shadow — because it is the commit rather than a choice.
 *
 * Armed stays GOLD per §9.6. Gold means ready, and this is the one control that
 * is ever properly ready.
 */
export function commitKey(w: number, h: number, armed: boolean): Container {
  const key = new Container();
  const r = Math.min(w, h) * 0.24;

  /*
   * NO DROP SHADOW HERE. This is the material face `button` paints over its own
   * body, and the button already casts — and pulls that cast in on press. A
   * second shadow inside the face would sit under the key rather than under the
   * button, and would not move when the button sank.
   */
  const g = new Graphics();

  /*
   * A BEZEL AND A FACE, not one filled rectangle.
   *
   * The first attempt was a single roundRect with five sheen bands over it, and
   * it photographed as a flat khaki slab beside operator dials that have a
   * knurled rim and a specular ring. Brass does not read as brass from a fill
   * colour; it reads from the way light crosses a curved surface. So the key is
   * built the way the dials are: an outer bezel, an inset face, a gradient
   * swept across that face in enough steps to be smooth, and a glyph CUT into
   * it rather than printed on it.
   *
   * Lit and unlit are the same construction with the light turned down —
   * `brassSpent` is the palette's unlit brass and is what §5's spent dials
   * already use, so the disarmed key is this key in shadow rather than a
   * different, slightly sick material.
   */
  const body = armed ? PALETTE.brass : PALETTE.brassSpent;
  const deep = armed ? PALETTE.brassDeep : 0x3a3220;

  // The bezel: the wall of the key, darkest where it meets the row.
  g.roundRect(0, 0, w, h, r).fill(deep);

  const inset = Math.max(2.5, h * 0.09);
  const fr = Math.max(1, r - inset * 0.6);
  const fw = w - inset * 2;
  const fh = h - inset * 2;

  // The face, then the sweep across it. 18 bands rather than 5: at five the
  // steps are visible as stripes, which is what made the first key look flat.
  g.roundRect(inset, inset, fw, fh, fr).fill(body);
  const BANDS = 18;
  /*
   * THE UNLIT KEY IS LIT WITH BRASS, NOT WITH BRASS-WHITE.
   *
   * `brassLit` is a near-white highlight. Swept over the dark `brassSpent` body
   * it desaturates rather than lightens, and the key photographed as flat olive
   * — a different material, which is exactly what the armed/disarmed pair must
   * not look like. Unlit brass keeps its hue and only loses its specular, so
   * the sweep uses `brass` itself when the key is disarmed.
   */
  const sheen = armed ? PALETTE.brassLit : PALETTE.brass;
  for (let i = 0; i < BANDS; i++) {
    const t = i / BANDS;
    g.roundRect(inset, inset, fw, fh * (1 - t), fr).fill({
      color: sheen,
      alpha: (armed ? 0.036 : 0.055) * (1 - t),
    });
  }
  // And the shadow gathering along the bottom of the face, the other half of
  // the same curve.
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const band = fh * 0.34 * (1 - t);
    g.roundRect(inset, inset + fh - band, fw, band, fr).fill({
      color: 0x1a0f08,
      alpha: 0.075 * (1 - t),
    });
  }
  grainOver(g, (gr) => gr.roundRect(inset, inset, fw, fh, fr), armed ? 0.14 : 0.1);

  // The bezel's own lighting: lit along the top, dark along the bottom wall.
  g.moveTo(r, 1.5).lineTo(w - r, 1.5).stroke({
    width: 3,
    color: armed ? PALETTE.brassLit : PALETTE.brass,
    alpha: armed ? 0.55 : 0.4,
  });
  g.moveTo(r, h - 1.5).lineTo(w - r, h - 1.5).stroke({ width: 3, color: 0x000000, alpha: 0.34 });
  // The step from bezel to face, which is what makes the face read as inset.
  g.roundRect(inset, inset, fw, fh, fr).stroke({ width: 1.5, color: 0x000000, alpha: 0.30 });
  g.roundRect(0, 0, w, h, r).stroke({ width: 2, color: 0x000000, alpha: 0.30 });
  if (armed) {
    g.roundRect(1.5, 1.5, w - 3, h - 3, r).stroke({ width: 2, color: PALETTE.highlight, alpha: 0.75 });
  }
  key.addChild(g);

  /*
   * THE GLYPH IS ENGRAVED, not printed.
   *
   * A `=` in cream text on top of the key would sit on the material like a
   * sticker. Cut, it is two grooves: a dark trough with a lit lower lip, which
   * is the same way light works everywhere else on this key. It is drawn here
   * rather than passed as the button's label so it moves, lights and dims as
   * part of the material.
   */
  const cut = new Graphics();
  const barW = fw * 0.46;
  const barH = Math.max(3, fh * 0.11);
  const barX = inset + (fw - barW) / 2;
  const gap = barH * 1.5;
  const midY = inset + fh / 2;
  for (const y of [midY - gap / 2 - barH / 2, midY + gap / 2 - barH / 2]) {
    cut.roundRect(barX, y, barW, barH, barH / 2).fill({ color: 0x1a0f08, alpha: armed ? 0.55 : 0.5 });
    cut
      .roundRect(barX, y + barH * 0.62, barW, barH * 0.5, barH / 3)
      .fill({ color: armed ? PALETTE.highlight : PALETTE.brass, alpha: armed ? 0.85 : 0.5 });
  }
  key.addChild(cut);
  return key;
}
