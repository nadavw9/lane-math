/**
 * One coordinate system, every position derived from it.
 *
 * No eyeballed constants: every x/y below comes from the design size and the
 * band heights. Phase 3 is placeholder rects and system font — the point is
 * that the layout is derivable, not that it is pretty.
 */
export const DESIGN = { width: 420, height: 900 } as const;

export const PALETTE = {
  background: 0x14161c,
  lane: 0x1d212b,
  /**
   * Target plates must clear 3:1 against the background they sit on (§9.1
   * gate). The Phase 3 placeholder value 0x2c3a52 could not: its luminance is
   * low enough that even a pure black background reaches only 1.84:1, so the
   * plate read as a hole rather than an object. Lightened until the silhouette
   * survives on the darkest background we would ship.
   */
  targetPlate: 0x5a6a92,
  targetFront: 0x4f86c6,
  targetCleared: 0x232833,
  tile: 0xb0854a,
  tileDim: 0x4a4237,
  tileTransformed: 0x8a6fa8,
  operator: 0x4a6b52,
  operatorDim: 0x333c35,
  slot: 0x262b36,
  slotFilled: 0x3a4152,
  commit: 0x5a8f5a,
  commitDim: 0x333c35,
  highlight: 0xe0c060,
  text: 0xf2f4f8,
  textDim: 0x8a909c,
  won: 0x4f8f4f,
  failed: 0x9a4444,
} as const;

const PAD = 12;

export const LANE = {
  x: PAD,
  y: PAD,
  width: DESIGN.width - PAD * 2,
  height: 380,
} as const;

export const EQUATION = {
  x: PAD,
  y: LANE.y + LANE.height + PAD,
  width: DESIGN.width - PAD * 2,
  height: 90,
} as const;

export const OPERATORS = {
  x: PAD,
  y: EQUATION.y + EQUATION.height + PAD,
  width: DESIGN.width - PAD * 2,
  height: 70,
} as const;

export const POOL = {
  x: PAD,
  y: OPERATORS.y + OPERATORS.height + PAD,
  width: DESIGN.width - PAD * 2,
  height: 200,
} as const;

export const STATUS = {
  x: PAD,
  y: POOL.y + POOL.height + PAD,
  width: DESIGN.width - PAD * 2,
  height: 60,
} as const;

/** Targets stack bottom-up: the FRONT target sits at the bottom (GDD §2). */
export function targetSlot(index: number, count: number): { x: number; y: number; w: number; h: number } {
  const h = Math.min(46, LANE.height / Math.max(count, 1) - 6);
  const w = LANE.width * 0.5;
  return {
    x: LANE.x + (LANE.width - w) / 2,
    y: LANE.y + LANE.height - (index + 1) * (h + 6),
    w,
    h,
  };
}

/** Pool tiles wrap in a grid; index is the tile's position, not its id. */
export function poolSlot(index: number, perRow = 6): { x: number; y: number; w: number; h: number } {
  const gap = 8;
  const w = (POOL.width - gap * (perRow - 1)) / perRow;
  const h = 46;
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  return { x: POOL.x + col * (w + gap), y: POOL.y + row * (h + gap), w, h };
}

export function operatorSlot(index: number, count: number): { x: number; y: number; w: number; h: number } {
  const gap = 8;
  const w = (OPERATORS.width - gap * (count - 1)) / count;
  return { x: OPERATORS.x + index * (w + gap), y: OPERATORS.y, w, h: 52 };
}

/** Three equation slots plus the commit button, across one row. */
export function equationSlot(index: 0 | 1 | 2 | 3): { x: number; y: number; w: number; h: number } {
  const gap = 8;
  const w = (EQUATION.width - gap * 3) / 4;
  return { x: EQUATION.x + index * (w + gap), y: EQUATION.y + 10, w, h: 60 };
}
