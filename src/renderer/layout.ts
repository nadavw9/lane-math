/**
 * One coordinate system, every position derived from it.
 *
 * No eyeballed constants: every x/y below comes from the design size, the token
 * metrics and the board's content counts. Bands SIZE TO CONTENT (§9.1) — a
 * level with 6 tiles does not reserve room for 16 — and whatever is left over
 * becomes visible background rather than dead UI.
 */
export const DESIGN = { width: 420, height: 900 } as const;

export const PALETTE = {
  /**
   * Shown only if a background fails to load. Paper, not void: a dark fallback
   * under dark tokens would be unreadable in exactly the case where the art is
   * missing and legibility is all that is left.
   */
  background: 0xe9e3d6,

  /*
   * TOKENS — dark ink on a light ground (§9.2).
   *
   * Inverted from the previous direction along with the digit ink, because the
   * two only work as a pair: keeping light ink on these fills was measured at
   * 1.99:1 last time the two moved separately.
   */
  targetPlate: 0x1e2a3a,
  /** The front plate is the live one: same family, deeper and bluer. */
  targetFront: 0x16324f,
  tile: 0x33241a,
  tileTransformed: 0x3b2a4d,
  operator: 0x22333b,

  /*
   * Dimming now moves a token TOWARD the paper rather than away from it.
   * On a dark ground an inactive token got darker; on a light ground it has to
   * get lighter, or "inactive" reads as "more emphatic".
   */
  tileDim: 0x6a625a,
  operatorDim: 0x69706f,

  /** Digits on the tokens: cream, drawn from the paper (§9.2). */
  tokenInk: 0xf4ead8,
  tokenInkDim: 0xd8d2c6,

  /*
   * INK ON PAPER — text drawn on the background or on a light panel. Distinct
   * from tokenInk on purpose: the two grounds are opposite, so one colour
   * cannot serve both and every call site has to pick deliberately.
   */
  text: 0x2b2721,
  textDim: 0x6f6558,

  /** A light card laid on the desk — warnings and the shop sit on these. */
  card: 0xf2ecdd,

  /** Sockets and buttons. Filled controls are dark, so they carry tokenInk. */
  slot: 0xd8d0c0,
  slotFilled: 0x3a4152,
  commit: 0x2f6b3a,
  commitDim: 0xc3bcae,

  /** Outline on a dark token — gold reads against every token fill. */
  highlight: 0xe0c060,
  /** The same intent as `highlight`, for text on paper, where gold vanishes. */
  highlightInk: 0x8a5a12,

  won: 0x2f6b3a,
  failed: 0x7a2020,
} as const;

/**
 * Band backdrops (§9.1: separation, not contrast).
 *
 * WHITE, not black. The surfaces are light, so a dark veil would fight them
 * twice over — it would mute the paper the art direction is built on, and it
 * would pull the ground toward the tokens, which are now the dark things.
 * A white veil moves the ground AWAY from the tokens, so separation and
 * contrast stop competing and the backdrop can be judged on separation alone.
 *
 * Alpha derived in tools/derive-backdrop.mjs: sized so the band edge steps
 * three times the paper's local grain, which is where an edge starts reading
 * as an edge rather than as more texture. Measured grain sd is 4.02-4.78 across
 * the four surfaces, needing alpha 0.175-0.204; 0.20 satisfies the grainiest
 * and retains 80% of the texture.
 *
 * The gate still measures the BARE background, so this is free margin rather
 * than something the tokens depend on.
 */
export const BACKDROP = { colour: 0xffffff, alpha: 0.2 } as const;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What the level holds. Sizes are driven by these and nothing else. */
export interface BoardSize {
  /** Targets remaining when the level OPENS, not right now. */
  readonly targets: number;
  /**
   * The level's FULL pool, including tiles already spent.
   *
   * Sizing to the live count would reflow the grid under the player's fingers
   * every time a tile is consumed, and would move the §9.3 ghosts off the holes
   * they are meant to mark.
   */
  readonly tiles: number;
  /** Hint lines currently owned; the strip vanishes when there are none. */
  readonly hints: number;
}

const PAD = 12;
const GAP = 8;

/** Token metrics. Band heights are multiples of these, never round numbers. */
export const TARGET_H = 46;
const TARGET_GAP = 6;
export const TILE_H = 46;
export const POOL_PER_ROW = 6;
const OPERATOR_H = 58;
const EQUATION_ROW_H = 60;
const EQUATION_PAD = 10;
const HINT_LINE_H = 16;
const STATUS_H = 60;
/** Room for the lives/stars HUD along the top of the lane. */
const LANE_HEADER = 44;

export function poolRows(tiles: number): number {
  return Math.max(1, Math.ceil(tiles / POOL_PER_ROW));
}

function laneHeight(targets: number): number {
  return LANE_HEADER + Math.max(1, targets) * (TARGET_H + TARGET_GAP) - TARGET_GAP;
}

export interface Bands {
  readonly lane: Rect;
  readonly equation: Rect;
  readonly operators: Rect;
  readonly pool: Rect;
  readonly hints: Rect;
  readonly status: Rect;
}

/**
 * Stack the bands and centre the result.
 *
 * Centred rather than top- or bottom-anchored: the freed space is real estate
 * the background gets back, and splitting it between the two ends reads as a
 * margin around the work. Pushed to one end it reads as a UI that has come
 * loose from its edge.
 */
export function bands(size: BoardSize): Bands {
  const width = DESIGN.width - PAD * 2;
  const heights = [
    laneHeight(size.targets),
    EQUATION_PAD * 2 + EQUATION_ROW_H,
    OPERATOR_H,
    poolRows(size.tiles) * (TILE_H + GAP) - GAP,
    size.hints > 0 ? size.hints * HINT_LINE_H : 0,
    STATUS_H,
  ];
  // A band with no content contributes no gap either, or an empty hint strip
  // would leave a seam behind.
  const present = heights.filter((h) => h > 0).length;
  const total = heights.reduce((a, b) => a + b, 0) + GAP * (present - 1);

  let y = Math.max(PAD, (DESIGN.height - total) / 2);
  const next = (height: number): Rect => {
    const rect = { x: PAD, y, width, height };
    if (height > 0) y += height + GAP;
    return rect;
  };

  return {
    lane: next(heights[0]!),
    equation: next(heights[1]!),
    operators: next(heights[2]!),
    pool: next(heights[3]!),
    hints: next(heights[4]!),
    status: next(heights[5]!),
  };
}

/**
 * Targets stack bottom-up: the FRONT target sits at the bottom (GDD §2).
 *
 * `offset` is the distance from the front, NOT the target's index in the level.
 * Cleared targets are removed and the queue slides down (§2), so the front is
 * always offset 0 and always in the same place — which is what makes §9.4's
 * failure signal legible: the lane refusing to advance only reads as a refusal
 * if advancing is what normally happens.
 */
export function targetSlot(offset: number, lane: Rect): Rect {
  const width = lane.width * 0.5;
  return {
    x: lane.x + (lane.width - width) / 2,
    y: lane.y + lane.height - (offset + 1) * (TARGET_H + TARGET_GAP) + TARGET_GAP,
    width,
    height: TARGET_H,
  };
}

/** Pool tiles wrap in a grid; index is the tile's position, not its id. */
export function poolSlot(index: number, pool: Rect): Rect {
  const width = (pool.width - GAP * (POOL_PER_ROW - 1)) / POOL_PER_ROW;
  const col = index % POOL_PER_ROW;
  const row = Math.floor(index / POOL_PER_ROW);
  return {
    x: pool.x + col * (width + GAP),
    y: pool.y + row * (TILE_H + GAP),
    width,
    height: TILE_H,
  };
}

/**
 * Operators size to content across the row too, not only down the screen.
 *
 * Dividing the full width by the count put two operators at the quarter points
 * with 130px of nothing between them, which reads as a row missing its middle
 * rather than as a row of two. Capped and centred, two operators look like two
 * operators and six still fill the row.
 */
export function operatorSlot(index: number, count: number, operators: Rect): Rect {
  const width = Math.min((operators.width - GAP * (count - 1)) / count, OPERATOR_H + 6);
  const row = width * count + GAP * (count - 1);
  const left = operators.x + (operators.width - row) / 2;
  return { x: left + index * (width + GAP), y: operators.y, width, height: OPERATOR_H };
}

/** Three equation slots plus the commit button, across one row. */
export function equationSlot(index: 0 | 1 | 2 | 3, equation: Rect): Rect {
  const width = (equation.width - GAP * 3) / 4;
  return {
    x: equation.x + index * (width + GAP),
    y: equation.y + EQUATION_PAD,
    width,
    height: EQUATION_ROW_H,
  };
}

/**
 * The content extremes the shipped ladder actually contains.
 *
 * The brightness gate needs the zones a token can EVER occupy, and with bands
 * sized to content that is no longer one fixed rectangle. Deriving the gate's
 * zones from these instead of hardcoding fractions keeps the gate honest when
 * the layout changes — a hardcoded zone would go on passing while measuring
 * somewhere the tokens no longer are.
 */
export const CONTENT_RANGE = {
  targets: { min: 3, max: 7 },
  tiles: { min: 6, max: 16 },
} as const;
