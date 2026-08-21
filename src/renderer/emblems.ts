import { Container, Graphics } from "pixi.js";

/**
 * The signature emblems, drawn as objects (ART_DIRECTION §3, §4, §8).
 *
 * WHY THESE ARE NOT GLYPHS. The star, the life marker and the hint mark were
 * `★ ♥ ◆` in a text run. Outfit contains none of them — verified against the
 * upstream font's cmap — so every one was silently falling through to
 * `system-ui`, and the game's entire reward currency was being rendered by
 * whatever dingbat the device happened to ship. A typeface cannot supply these,
 * so asking it was always going to end here.
 *
 * They are also the wrong thing to delegate. The star is the reward currency
 * and appears on the map, the cleared screen and the HUD; it is the one shape a
 * player should recognise across all three. §3's rules are not decoration on
 * top of a glyph, they are what makes an object read as a small physical thing:
 *
 *   one light source, upper-left, warm       every emblem, same direction
 *   a specular highlight on every object     upper-left quadrant, opaque metal
 *   a contact shadow — it sits on something  soft, warm, directly beneath
 *   rounded everything, no sharp corners     round-joined stroke on the fill
 *   readable silhouette                      five points, a disc, a diamond
 *   slight asymmetry                         fixed tilt and off-centre specular
 *   no outlines                              separation is light and shadow
 *
 * NOTHING HERE IS RANDOM. The board is rebuilt every frame, so a randomised
 * highlight would shimmer. Asymmetry is a constant, and per-item variation is
 * indexed, never sampled.
 *
 * Every dimension derives from `size`, so an emblem is specified once and scales
 * from the 11px HUD to the 26px cleared-screen arrival without a second set of
 * numbers to keep in step.
 */

/** §4 palette. Gold is the accent — "ready, armed, earned. Stars." */
const GOLD = 0xffc94a;
const GOLD_LIT = 0xfff0c0;
const GOLD_DEEP = 0xb07d18;
/** §4 brass, the gradient's two ends. */
const BRASS = 0xc9a227;
const BRASS_DEEP = 0x8a6d1f;
const BRASS_SPENT = 0x4f4526;
/** §4 felt, for an empty socket. */
const FELT = 0x241812;
/** The warm contact shadow. Never neutral grey — the light is warm (§3). */
const SHADOW = 0x2b1a10;

/**
 * A soft shadow without a blur filter.
 *
 * Stacked ellipses with falling alpha. A filter would mean a render target per
 * emblem, and there are up to eight on the map at once; this is three fills.
 */
function contactShadow(g: Graphics, cx: number, cy: number, rx: number, ry: number): void {
  for (let i = 3; i >= 1; i--) {
    const spread = 1 + i * 0.22;
    g.ellipse(cx, cy, rx * spread, ry * spread).fill({ color: SHADOW, alpha: 0.1 });
  }
}

/**
 * The specular highlight, upper-left (§3).
 *
 * Brass and gold are opaque, so the highlight sits in the upper-left quadrant
 * facing the source. Glass would concentrate it lower-right instead — that is
 * the same light, not drift, and the two must never be compared (§9).
 */
function specular(g: Graphics, cx: number, cy: number, r: number): void {
  g.ellipse(cx, cy, r, r * 0.72).fill({ color: 0xffffff, alpha: 0.16 });
  g.ellipse(cx, cy, r * 0.55, r * 0.4).fill({ color: 0xffffff, alpha: 0.34 });
}

/** Five-pointed star path, a point straight up before the tilt is applied. */
function starPath(g: Graphics, r: number): Graphics {
  const inner = r * 0.48;
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  return g.closePath();
}

/**
 * THE STAR — the game's reward currency (§4 gold accent).
 *
 * `earned` is gold and lit and sits on the surface. `empty` is the same
 * silhouette as a socket in the surface: §5's language for a spent thing is
 * that the light goes out, so it is not a paler star, it is a dark recess. It
 * gets no contact shadow, because a hole does not sit on anything.
 *
 * The points are rounded by stroking the fill with a round-joined pen rather
 * than by curving ten corners by hand, which keeps the silhouette honest at
 * 11px where hand-placed curves collapse into mush.
 */
export function star(size: number, state: "earned" | "empty" = "earned"): Container {
  const emblem = new Container();
  const r = size / 2;
  const round = r * 0.3;
  // Stroking expands the shape by half the pen, so the path is drawn smaller.
  const body = r - round / 2;

  if (state === "earned") {
    const shadow = new Graphics();
    contactShadow(shadow, 0, r * 0.82, r * 0.62, r * 0.2);
    emblem.addChild(shadow);
  }

  const g = new Graphics();
  const fill = state === "earned" ? GOLD : FELT;
  const alpha = state === "earned" ? 1 : 0.5;
  starPath(g, body).fill({ color: fill, alpha });
  starPath(g, body).stroke({ width: round, color: fill, alpha, join: "round", cap: "round" });

  if (state === "earned") {
    // Form: the lower-right falls away from the light, the upper-left catches
    // it. Drawn as two tinted stars rather than a gradient so the shading
    // follows the silhouette instead of a box around it.
    const g2 = new Graphics();
    starPath(g2, body * 0.92).fill({ color: GOLD_DEEP, alpha: 0.42 });
    g2.position.set(r * 0.12, r * 0.14);
    emblem.addChild(g);
    emblem.addChild(g2);

    const g3 = new Graphics();
    starPath(g3, body * 0.66).fill({ color: GOLD_LIT, alpha: 0.5 });
    g3.position.set(-r * 0.1, -r * 0.12);
    emblem.addChild(g3);

    // The one specular, off the geometric centre — perfect placement reads as
    // procedural (§3).
    const hi = new Graphics();
    specular(hi, -r * 0.26, -r * 0.3, r * 0.24);
    emblem.addChild(hi);
  } else {
    // A recess: dark along the top inside edge, the faintest rim light along
    // the bottom, the same way a target plate expresses being sunk into the
    // page rather than sitting on it.
    emblem.addChild(g);
    const rim = new Graphics();
    starPath(rim, body).stroke({ width: Math.max(1, r * 0.12), color: 0x000000, alpha: 0.3, join: "round" });
    rim.position.set(0, -r * 0.06);
    emblem.addChild(rim);
  }

  // Slight asymmetry (§3): a hand would not set it dead upright.
  emblem.rotation = -0.05;
  return emblem;
}

/**
 * THE LIFE MARKER — a brass pocket-watch, not a heart (§8).
 *
 * §8 specifies the watch explicitly, and it is the better object: lives refill
 * on a timer, so the thing that represents one should be a clock. A heart in
 * the Academy of Small Wonders is a mobile-game sticker; a pocket-watch is a
 * small brass instrument on a desk, which is what every other object here is.
 *
 * `spent` keeps the case and loses the light — an unlit object rather than a
 * faded one (§5), so "gone" and "not yet" never read the same.
 */
export function pocketWatch(size: number, state: "full" | "spent" = "full"): Container {
  const emblem = new Container();
  const r = size / 2;
  // The case hangs below the crown, so the disc is not centred in the box.
  const caseR = r * 0.82;
  const cy = r * 0.16;
  const lit = state === "full";

  const shadow = new Graphics();
  contactShadow(shadow, 0, cy + caseR * 0.92, caseR * 0.74, caseR * 0.2);
  emblem.addChild(shadow);

  const g = new Graphics();

  /*
   * DRAWN FOR 14px, WHICH IS THE SIZE IT IS ACTUALLY USED AT.
   *
   * The first version gave it a cream dial and a minute hand. At 14px the dial
   * was nearly as wide as the case and far brighter than it, so five of them in
   * a row read as a row of fried eggs rather than as instruments — the internal
   * detail was outcompeting the silhouette it was supposed to sit inside.
   *
   * So the case carries the object and the face is the same metal, one step
   * lighter. What survives at this size is the disc, the crown, and the
   * brightness difference between a life you have and one you have spent.
   */
  // The crown is half the silhouette's job — without it this is a disc, and the
  // board already has discs for operators. Wide enough to survive at 14px, and
  // sat clear of the case rather than tucked into its edge.
  const crownW = caseR * 0.54;
  const crownH = caseR * 0.3;
  g.roundRect(-crownW / 2, cy - caseR - crownH * 0.82, crownW, crownH, crownH * 0.4).fill({
    color: lit ? BRASS : BRASS_SPENT,
  });

  // Bezel, then the face inside it — one ring of separation, no outline.
  g.circle(0, cy, caseR).fill({ color: lit ? BRASS_DEEP : BRASS_SPENT });
  g.circle(0, cy, caseR * 0.82).fill({ color: lit ? BRASS : BRASS_SPENT });

  // The light across the face: lower-right falls away, upper-left catches it.
  // Both stay inside the face, so the silhouette is never eaten by the shading.
  g.circle(caseR * 0.14, cy + caseR * 0.16, caseR * 0.68).fill({
    color: lit ? BRASS_DEEP : 0x000000,
    alpha: lit ? 0.45 : 0.3,
  });
  g.circle(-caseR * 0.14, cy - caseR * 0.16, caseR * 0.52).fill({
    color: lit ? GOLD : BRASS,
    alpha: lit ? 0.35 : 0.12,
  });
  emblem.addChild(g);

  if (lit) {
    /*
     * DETAIL HAS TO EARN ITS PIXELS.
     *
     * A chapter ring and a hand at 14px did not read as a dial, they read as a
     * scribble on a disc — five in a row looked like faces. At this size what
     * identifies a pocket-watch is the circle plus the stem on top, and nothing
     * else survives. So the movement is drawn only when there is room for it,
     * and the HUD gets the clean object it can actually resolve.
     */
    if (size >= 20) {
      const face = new Graphics();
      face
        .circle(0, cy, caseR * 0.54)
        .stroke({ width: Math.max(0.75, caseR * 0.07), color: 0x4a3a14, alpha: 0.3 });
      face
        .moveTo(0, cy)
        .lineTo(caseR * 0.26, cy - caseR * 0.26)
        .stroke({ width: Math.max(1, caseR * 0.12), color: 0x3a2c14, alpha: 0.55, cap: "round" });
      emblem.addChild(face);
    }

    const hi = new Graphics();
    specular(hi, -caseR * 0.34, cy - caseR * 0.4, caseR * 0.22);
    emblem.addChild(hi);
  }

  emblem.rotation = 0.04;
  return emblem;
}

/**
 * THE HINT MARK — a small gold diamond (§4 gold accent).
 *
 * A rounded square turned 45°, so it is the same family of geometry as the
 * tokens rather than a fourth idea. Marks the hint line, so it must read at
 * 12px and must not compete with the star.
 */
export function hintDiamond(size: number): Container {
  const emblem = new Container();
  const r = size / 2;

  const shadow = new Graphics();
  contactShadow(shadow, 0, r * 0.86, r * 0.5, r * 0.16);
  emblem.addChild(shadow);

  const face = new Container();
  const g = new Graphics();
  /*
   * The corner radius is the whole design here. At 0.26 of the side the four
   * points rounded away and nine pixels of gold read as a dot, not a diamond —
   * "rounded everything" (§3) has to stop short of erasing the silhouette it is
   * softening. 0.13 keeps the points while still tumbling the edges.
   */
  const side = r * 1.24;
  g.roundRect(-side / 2, -side / 2, side, side, side * 0.13).fill({ color: GOLD });
  g.roundRect(-side / 2 + side * 0.12, -side / 2 + side * 0.2, side * 0.88, side * 0.8, side * 0.12).fill({
    color: GOLD_DEEP,
    alpha: 0.4,
  });
  face.addChild(g);
  face.rotation = Math.PI / 4;
  emblem.addChild(face);

  const hi = new Graphics();
  specular(hi, -r * 0.18, -r * 0.26, r * 0.16);
  emblem.addChild(hi);
  return emblem;
}

/**
 * THE RADICAL — `√`, drawn rather than typed.
 *
 * The other four operators (`+ − × ÷`) are in Outfit and stay as text. U+221A
 * is not, in any subset, so it was falling back like the star was. It only
 * shows on the procedural path — §8 bakes the radical into the operator dial
 * art — but the procedural path is what a player sees whenever the atlas is
 * absent, which is the state the game shipped in for months.
 *
 * Drawn with the same round cap as everything else here, in the colour the
 * caller uses for its other glyphs so the five dials stay one set.
 */
export function radical(size: number, colour: number): Container {
  const emblem = new Container();
  const g = new Graphics();
  const w = size;
  const h = size;
  const stroke = Math.max(1.5, size * 0.115);

  // Short entry stroke, the deep V, then the long bar over the radicand.
  g.moveTo(-w * 0.46, -h * 0.04)
    .lineTo(-w * 0.24, -h * 0.04)
    .lineTo(-w * 0.04, h * 0.42)
    .lineTo(w * 0.24, -h * 0.42)
    .lineTo(w * 0.5, -h * 0.42)
    .stroke({ width: stroke, color: colour, join: "round", cap: "round" });
  emblem.addChild(g);
  return emblem;
}

/**
 * A meter of `total` emblems with `filled` of them lit, laid out left to right.
 *
 * Returns a container whose origin is the LEFT EDGE of the row, because every
 * caller is placing it after a text run and wants to butt it against one.
 */
export function emblemMeter(
  kind: "star" | "life",
  filled: number,
  total: number,
  size: number,
  gap = size * 0.22,
): Container {
  const row = new Container();
  const step = size + gap;
  for (let i = 0; i < total; i++) {
    const lit = i < filled;
    const emblem =
      kind === "star" ? star(size, lit ? "earned" : "empty") : pocketWatch(size, lit ? "full" : "spent");
    // Emblems draw around their own centre; the row is measured from its edge.
    emblem.position.set(size / 2 + i * step, size / 2);
    row.addChild(emblem);
  }
  return row;
}

/** Width of a meter, so callers can centre a row without measuring bounds. */
export function meterWidth(total: number, size: number, gap = size * 0.22): number {
  return total <= 0 ? 0 : total * size + (total - 1) * gap;
}
