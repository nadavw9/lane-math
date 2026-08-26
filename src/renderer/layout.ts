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
   * The clear colour behind the room scenes.
   *
   * No longer a "placeholder desk": the four desk-in-room backgrounds ship, so
   * this is only what shows if one fails to load, plus the letterbox. The
   * `placeholderDesk` alias is gone — it named a surface the game no longer
   * draws, and the brightness gate must measure the ROOM, never this.
   */
  background: 0x704a32,

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
  /**
   * A transformed tile is the SAME WOOD, freshly cut (§9.6).
   *
   * It was purple, which is not in the palette. Same hue, lighter value: the
   * tile has been changed, not replaced by a different kind of object.
   */
  tileTransformed: 0x4a3524,
  operator: 0x22333b,

  /** Digits on the tokens: cream, drawn from the paper (§9.2). */
  tokenInk: 0xf4ead8,

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
  slotFilled: 0x2b3a4c,

  /**
   * The armed `=` button: GOLD ON DARK (§9.6).
   *
   * It was green, and green belonged to nothing else in the design — the one
   * place a colour appeared without a reason, which is what made it read as a
   * default rather than a decision. Gold already means ready, on the front
   * plate and on the stars, so the button that is ready wears it too.
   */
  armed: 0x1e2a3a,

  /** The single accent. Every "ready", "armed" or "earned" state (§9.6). */
  highlight: 0xe0c060,
  /** The same intent as `highlight`, for text on paper, where gold vanishes. */
  highlightInk: 0x8a5a12,

  /** The pool tray: light wood, warm, translucent over the paper (§9.6). */
  tray: 0xc9a678,
  /** Dark brown felt under every real tile and dial. */
  felt: 0x241812,
  /** Ink navy is reserved for numerals drawn over the glass sprite. */
  glassNumeral: 0x1e2a3a,

  /**
   * KEPT, and outside the §9.6 palette. Flagged rather than removed: §9.4's
   * failure signal is the lane refusing the number, and the refused plate going
   * red is part of how that reads. Removing it is a change to a SIGNAL, not to
   * a material, so it is not this pass's call to make.
   */
  failed: 0x7a2020,
} as const;

/**
 * Dim is LESS PRESENCE, not a different substance (§9.6).
 *
 * A dimmed token keeps its own colour and gives up opacity, elevation and
 * shadow. The previous greys were a second palette hiding inside the first, and
 * they read as disabled web controls rather than as objects pushed into the
 * background.
 *
 * The opacity floor is set by the brightness gate, not by taste. A dimmed art
 * token is still measured against the felt liner that physically holds it.
 *
 * Most of the dimming therefore has to come from elevation and shadow, which
 * cost no contrast at all: a token lying flat on the surface casting nothing is
 * plainly not pickable, however close its colour still is. That is the whole
 * reason §9.6's formulation works on a light ground — presence is not only
 * opacity.
 */
export const DIM = {
  alpha: 0.78,
  elevation: 0,
  bevel: 0.12,
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
 * The felt-lined trays, rather than the placeholder desk, are the measured
 * token surface. This veil only separates non-token UI from the room.
 */
export const BACKDROP = { colour: 0xffffff, alpha: 0.2 } as const;

/**
 * How solid the pool tray is (§9.6).
 *
 * The wooden rim is translucent decoration; the opaque felt lining is the
 * physical surface the tokens touch and the surface the art gate measures.
 */
export const TRAY_ALPHA = 0.55;

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
  /** Operator pieces present for this level and mode, spent or unspent. */
  readonly operators: number;
  /** Hint lines currently owned; the strip vanishes when there are none. */
  readonly hints: number;
}

const PAD = 12;
const GAP = 8;

/**
 * Token size bounds (§9.2: token size scales inversely with board size).
 *
 * MIN is the tap floor — 46px at design scale is ~43 CSS px on a 393px phone,
 * at the platform minimum, and the densest 16-tile board must still be playable
 * with a thumb. MAX is the "not childish" ceiling: past roughly a fifth of the
 * screen width a number tile stops reading as a game piece you spend and starts
 * reading as a menu button. The cap is also the physical-art coverage limit:
 * 120 design px at 3x DPR is the 360px atlas frame size.
 */
export const TOKEN_SIZE = { min: 46, max: 120 } as const;

const TARGET_GAP = 6;
/** Grids wider than this stop being scannable regardless of what fits. */
const POOL_MAX_PER_ROW = 6;
const EQUATION_ROW_H = 60;
const EQUATION_PAD = 10;
/**
 * One hint line. Exported because the renderer draws the rows and was carrying
 * its own copy of the number — two places to change, one of which would be
 * forgotten.
 *
 * 22 rather than 16: the line is led by a cut-gem mark (emblems.ts) which needs
 * to read as a faceted stone, and facets need pixels.
 */
export const HINT_LINE_H = 22;
const STATUS_H = 60;
/** Room for the lives/stars HUD along the top of the lane. */
const LANE_HEADER = 44;

/** How the pool's tiles are arranged, and how big every board token is. */
export interface Grid {
  readonly size: number;
  readonly perRow: number;
  readonly rows: number;
}

export interface Bands {
  readonly lane: Rect;
  readonly equation: Rect;
  readonly operators: Rect;
  readonly pool: Rect;
  readonly hints: Rect;
  readonly status: Rect;
  readonly grid: Grid;
  readonly operatorGrid: Grid;
}

const bandWidth = DESIGN.width - PAD * 2;

/**
 * Arrange `tiles` at a given token size.
 *
 * Rows are BALANCED after the fact: fitting as many as possible per row leaves
 * 13 tiles as 6/6/1, and a row of one reads as a mistake. Spreading the same
 * row count evenly gives 5/5/3.
 */
function gridFor(tiles: number, size: number): Grid {
  const fits = Math.floor((bandWidth + GAP) / (size + GAP));
  const cap = Math.max(1, Math.min(POOL_MAX_PER_ROW, fits));
  const rows = Math.max(1, Math.ceil(Math.max(1, tiles) / cap));
  return { size, perRow: Math.ceil(Math.max(1, tiles) / rows), rows };
}

/** Operators share token scale and wrap only when that shared size requires it. */
function operatorGridFor(operators: number, size: number): Grid {
  const count = Math.max(1, operators);
  const fits = Math.max(1, Math.floor((bandWidth + GAP) / (size + GAP)));
  const perRow = Math.min(count, fits);
  return { size, perRow, rows: Math.ceil(count / perRow) };
}

/**
 * Does the last row hold more than a single tile?
 *
 * Balancing the row count is not enough on its own: 13 tiles four across is
 * 4/4/4/1, and a lone tile on the final row reads as a mistake rather than as a
 * board. The size search treats this as a reason to go a size smaller, which
 * raises the number that fit per row and lands on 5/5/3.
 */
function isBalanced(tiles: number, grid: Grid): boolean {
  return grid.rows === 1 || tiles - (grid.rows - 1) * grid.perRow > 1;
}

function laneHeight(targets: number, size: number): number {
  return LANE_HEADER + Math.max(1, targets) * (size + TARGET_GAP) - TARGET_GAP;
}

function heightsAt(board: BoardSize, size: number): number[] {
  const grid = gridFor(board.tiles, size);
  const operatorGrid = operatorGridFor(board.operators, size);
  return [
    laneHeight(board.targets, size),
    EQUATION_PAD * 2 + EQUATION_ROW_H,
    operatorGrid.rows * (size + GAP) - GAP,
    grid.rows * (size + GAP) - GAP,
    board.hints > 0 ? board.hints * HINT_LINE_H : 0,
    STATUS_H,
  ];
}

function stackHeight(heights: readonly number[]): number {
  // A band with no content contributes no gap either, or an empty hint strip
  // would leave a seam behind.
  const present = heights.filter((h) => h > 0).length;
  return heights.reduce((a, b) => a + b, 0) + GAP * (present - 1);
}

/**
 * The largest token size this board can wear without overflowing the screen.
 *
 * Solved rather than tabulated. A formula mapping tile count to a size would
 * have to be re-tuned every time a band changed height, and would silently
 * overflow when it was wrong; searching downward from MAX cannot overflow,
 * because fitting is the search condition. It also produces the inverse
 * relationship §9.2 asks for as a CONSEQUENCE — a board with more tiles needs
 * more rows, so it runs out of vertical room sooner and settles smaller — which
 * means the two rules cannot drift apart.
 */
function searchSize(board: BoardSize): number {
  const budget = DESIGN.height - PAD * 2;
  const fits = (size: number): boolean => stackHeight(heightsAt(board, size)) <= budget;

  // Prefer a size that both fits AND grids evenly. Fitting is the hard
  // constraint, so it gets the fallback pass on its own — a board that can only
  // be laid out raggedly is still better than one that runs off the screen.
  for (let size = TOKEN_SIZE.max; size > TOKEN_SIZE.min; size--) {
    if (fits(size) && isBalanced(board.tiles, gridFor(board.tiles, size))) return size;
  }
  for (let size = TOKEN_SIZE.max; size > TOKEN_SIZE.min; size--) {
    if (fits(size)) return size;
  }
  return TOKEN_SIZE.min;
}

const sizeCache = new Map<string, number>();

/**
 * The fitted size, forced to be NON-INCREASING in tile count.
 *
 * The raw search is not monotonic on its own, because the balance rule can
 * force one board down a size while its larger neighbour grids evenly at the
 * bigger one — measured, 13 tiles landed at 72 and 14 at 80. A player crossing
 * that boundary would watch the tiles GROW as the board got harder, which
 * inverts the signal §9.2 is buying. Taking the running minimum over every
 * smaller board costs one 14-tile board two pixels and makes the rule true.
 */
function fittedSize(board: BoardSize): number {
  const key = `${board.targets}:${board.tiles}:${board.operators}:${board.hints}`;
  const cached = sizeCache.get(key);
  if (cached !== undefined) return cached;

  let size: number = TOKEN_SIZE.max;
  const from = Math.min(CONTENT_RANGE.tiles.min, board.tiles);
  for (let tiles = from; tiles <= board.tiles; tiles++) {
    size = Math.min(size, searchSize({ ...board, tiles }));
  }

  sizeCache.set(key, size);
  return size;
}

/**
 * Stack the bands and ANCHOR LOW.
 *
 * The bottom of a phone is thumb territory and the top is not, so leftover
 * space is spent above the lane where it costs nothing to reach. It reads as a
 * margin at the head of a worksheet rather than as a gap under the controls.
 */
export function bands(board: BoardSize): Bands {
  const size = fittedSize(board);
  const grid = gridFor(board.tiles, size);
  const operatorGrid = operatorGridFor(board.operators, size);
  const heights = heightsAt(board, size);
  const total = stackHeight(heights);

  let y = Math.max(PAD, DESIGN.height - PAD - total);
  const next = (height: number): Rect => {
    const rect = { x: PAD, y, width: bandWidth, height };
    if (height > 0) y += height + GAP;
    return rect;
  };

  const lane = next(heights[0]!);
  const equation = next(heights[1]!);
  const operators = next(heights[2]!);
  const poolBand = next(heights[3]!);
  const hints = next(heights[4]!);
  const status = next(heights[5]!);

  // The pool band hugs its grid rather than spanning the full width: at large
  // token sizes the grid is narrower than the screen, and a full-width backdrop
  // around three big tiles reads as a tray someone forgot to fill.
  const poolWidth = grid.perRow * size + (grid.perRow - 1) * GAP;
  const pool: Rect = {
    x: (DESIGN.width - poolWidth) / 2,
    y: poolBand.y,
    width: poolWidth,
    height: poolBand.height,
  };

  return { lane, equation, operators, pool, hints, status, grid, operatorGrid };
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
export function targetSlot(offset: number, lane: Rect, grid: Grid): Rect {
  const width = lane.width * 0.5;
  return {
    x: lane.x + (lane.width - width) / 2,
    y: lane.y + lane.height - (offset + 1) * (grid.size + TARGET_GAP) + TARGET_GAP,
    width,
    height: grid.size,
  };
}

/**
 * A tile's slot, keyed on its FIXED index in the level's pool (§9.3).
 *
 * Not on its position among the survivors. The pool does not re-pack: a tile
 * occupies the same slot for the whole level, so the player's spatial map of
 * the board — the 7 is second row, third along — survives every move. It also
 * makes ghosts possible at all, since a vacated slot stays vacant and no live
 * tile can ever be sitting on one.
 */
export function poolSlot(index: number, pool: Rect, grid: Grid): Rect {
  const col = index % grid.perRow;
  const row = Math.floor(index / grid.perRow);
  return {
    x: pool.x + col * (grid.size + GAP),
    y: pool.y + row * (grid.size + GAP),
    width: grid.size,
    height: grid.size,
  };
}

/**
 * Operators are game pieces, so their slots use the number grid's solved size.
 *
 * Each row is centred independently. Sparse levels keep their few dials
 * together, while a count that cannot fit at the shared size wraps without
 * changing the size relationship between brass and glass.
 */
export function operatorSlot(
  index: number,
  count: number,
  operators: Rect,
  grid: Grid,
): Rect {
  const row = Math.floor(index / grid.perRow);
  const col = index % grid.perRow;
  const rowCount = Math.min(grid.perRow, count - row * grid.perRow);
  const rowWidth = rowCount * grid.size + Math.max(0, rowCount - 1) * GAP;
  const left = operators.x + (operators.width - rowWidth) / 2;
  return {
    x: left + col * (grid.size + GAP),
    y: operators.y + row * (grid.size + GAP),
    width: grid.size,
    height: grid.size,
  };
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
