/**
 * Background contrast gate (GDD §9.1, §11, §13).
 *
 * Ported from Traffic Bomb's per-world 5-point median sampler and pointed at
 * the zones that matter here: under the lane and under the pool. A math puzzle
 * dies if `6` reads as `8`, so this is a build gate rather than a warning —
 * **fail the build below threshold**.
 *
 * §13 Severity 3: sample at the EXTREMES of the supported aspect range, not
 * only the 9:21 design ratio. A background that passes tall and fails short is
 * a background that ships broken on half the devices.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface ImageData {
  readonly width: number;
  readonly height: number;
  /** RGB triples, row-major, no alpha. */
  readonly pixels: Uint8Array;
}

/** Relative luminance, WCAG 2.1. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1:1 to 21:1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export function rgbFromHex(hex: number): Rgb {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function pixelAt(image: ImageData, x: number, y: number): Rgb {
  const cx = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const i = (cy * image.width + cx) * 3;
  return { r: image.pixels[i]!, g: image.pixels[i + 1]!, b: image.pixels[i + 2]! };
}

/**
 * The 5-point median: four corners and the centre of a zone.
 *
 * Median rather than mean, because a mean is dragged around by one bright
 * corner and reports a comfortable average over a background that is actually
 * unreadable in the middle.
 */
export function medianLuminance(
  image: ImageData,
  zone: { x: number; y: number; w: number; h: number },
): number {
  const points: Rgb[] = [
    pixelAt(image, zone.x + zone.w * 0.15, zone.y + zone.h * 0.15),
    pixelAt(image, zone.x + zone.w * 0.85, zone.y + zone.h * 0.15),
    pixelAt(image, zone.x + zone.w * 0.5, zone.y + zone.h * 0.5),
    pixelAt(image, zone.x + zone.w * 0.15, zone.y + zone.h * 0.85),
    pixelAt(image, zone.x + zone.w * 0.85, zone.y + zone.h * 0.85),
  ];
  const values = points.map(luminance).sort((a, b) => a - b);
  return values[2]!;
}

export function medianColour(
  image: ImageData,
  zone: { x: number; y: number; w: number; h: number },
): Rgb {
  const points: Rgb[] = [
    pixelAt(image, zone.x + zone.w * 0.15, zone.y + zone.h * 0.15),
    pixelAt(image, zone.x + zone.w * 0.85, zone.y + zone.h * 0.15),
    pixelAt(image, zone.x + zone.w * 0.5, zone.y + zone.h * 0.5),
    pixelAt(image, zone.x + zone.w * 0.15, zone.y + zone.h * 0.85),
    pixelAt(image, zone.x + zone.w * 0.85, zone.y + zone.h * 0.85),
  ];
  const byLuminance = points
    .map((rgb) => ({ rgb, l: luminance(rgb) }))
    .sort((a, b) => a.l - b.l);
  return byLuminance[2]!.rgb;
}

/**
 * The BRIGHTEST pixel in a zone — the worst single point for a dark background.
 *
 * A median tells you what the zone is typically like; it says nothing about the
 * one bright highlight a digit happens to land on. Since the tokens are light
 * on dark art, the failure mode is a bright spot, so the gate is measured
 * against the extreme rather than the average.
 *
 * Sampled on a grid rather than every pixel: a full scan of 900x2100 per zone
 * per aspect is slow enough to discourage running the gate, and a gate that is
 * not run is not a gate.
 */
export function worstPointColour(
  image: ImageData,
  zone: { x: number; y: number; w: number; h: number },
  token: Rgb,
  step = 3,
): Rgb {
  let worst = pixelAt(image, zone.x, zone.y);
  let worstRatio = Infinity;

  for (let y = zone.y; y < zone.y + zone.h; y += step) {
    for (let x = zone.x; x < zone.x + zone.w; x += step) {
      const rgb = pixelAt(image, x, y);
      const ratio = contrastRatio(rgb, token);
      if (ratio < worstRatio) {
        worstRatio = ratio;
        worst = rgb;
      }
    }
  }
  return worst;
}

/**
 * Supported aspect range. §13: sample at the extremes, not just the design
 * ratio — 9:21 is the tall end and 3:4 covers a short tablet.
 */
export const ASPECTS = [
  { name: "21:9 (design)", ratio: 9 / 21 },
  { name: "16:9 (common)", ratio: 9 / 16 },
  { name: "4:3 (shortest)", ratio: 3 / 4 },
] as const;

/** The shipped background size. Anything else must fail loudly. */
export const REQUIRED_SIZE = { width: 900, height: 2100 } as const;

export interface ZoneSpec {
  readonly name: string;
  /** Fractions of the visible frame, so they follow the crop. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Token colour drawn over this zone. */
  readonly token: number;
}

export interface ZoneResult {
  readonly aspect: string;
  readonly zone: string;
  readonly ratio: number;
  readonly background: Rgb;
  readonly passes: boolean;
}

export interface GateResult {
  readonly file: string;
  readonly worst: number;
  readonly passes: boolean;
  readonly zones: readonly ZoneResult[];
}

/** WCAG AA for large text. Digits are the entire UI; 3:1 is the floor. */
export const MIN_CONTRAST = 3;

/**
 * Crop the image to an aspect the way the game does: §9.1 generates at 9:21
 * with a safe zone and CROPS FROM THE EDGES for shorter devices, so a short
 * screen sees the middle of the image.
 */
function visibleFrame(
  image: ImageData,
  ratio: number,
): { x: number; y: number; w: number; h: number } {
  const imageRatio = image.width / image.height;
  if (ratio >= imageRatio) {
    // Wider than the source: full width, crop top and bottom.
    const h = image.width / ratio;
    return { x: 0, y: (image.height - h) / 2, w: image.width, h };
  }
  const w = image.height * ratio;
  return { x: (image.width - w) / 2, y: 0, w, h: image.height };
}

export function checkBackground(
  file: string,
  image: ImageData,
  zones: readonly ZoneSpec[],
  minContrast = MIN_CONTRAST,
): GateResult {
  const results: ZoneResult[] = [];

  for (const aspect of ASPECTS) {
    const frame = visibleFrame(image, aspect.ratio);
    for (const zone of zones) {
      const box = {
        x: frame.x + frame.w * zone.x,
        y: frame.y + frame.h * zone.y,
        w: frame.w * zone.w,
        h: frame.h * zone.h,
      };
      // Worst single point, not the median: the tokens are light on dark art,
      // so the thing that breaks legibility is one bright spot under a digit.
      const background = worstPointColour(image, box, rgbFromHex(zone.token));
      const ratio = contrastRatio(background, rgbFromHex(zone.token));
      results.push({
        aspect: aspect.name,
        zone: zone.name,
        ratio,
        background,
        passes: ratio >= minContrast,
      });
    }
  }

  const worst = Math.min(...results.map((r) => r.ratio));
  return { file, worst, passes: results.every((r) => r.passes), zones: results };
}
