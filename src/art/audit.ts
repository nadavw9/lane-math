/**
 * Sprite consistency audit (ART_DIRECTION §9).
 *
 * Measures the three things §9 names — lighting direction, specular position
 * and palette — across a completed sprite set, so outliers are flagged by
 * number rather than by eye across forty assets.
 *
 * WHY THIS LIVES IN src/art AND NOT IN THE TOOL. It was inside
 * tools/process-sprites.mts, which runs on import, so it could not be unit
 * tested — and it shipped a geometry bug for exactly that reason. Measurement
 * code in this project belongs beside brightness.ts, where a test can reach it.
 */

export interface Audit {
  readonly name: string;
  /** Degrees, 0 = right, 90 = up. §3 wants the light upper-LEFT, so ~135. */
  readonly lightAngle: number;
  /** Brightest point, as a fraction of the CONTENT box (not the padded frame). */
  readonly specularX: number;
  readonly specularY: number;
  readonly meanHue: number;
  readonly meanSaturation: number;
  readonly coverage: number;
  /**
   * Content box as a fraction of the padded frame.
   *
   * Apparent SCALE is drift too: a dial generated half again as large as its
   * siblings is as wrong as one lit from the right, and just as invisible until
   * they sit side by side on a board.
   */
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly boxX: number;
  readonly boxY: number;
  /** The object's own aspect, w/h. Reported so a reader can see the shape. */
  readonly aspect: number;
}

/**
 * THE LIGHT ANGLE, IN FRACTIONAL COORDINATES.
 *
 * This used to be `atan2(centreY - cy, cx - centreX)` over PIXEL offsets from
 * the middle of the padded frame, and that is wrong in two separate ways.
 *
 * The aspect ratio rotated the answer. A specular one tenth of the way left of
 * centre is 3px on a 60px-wide dial and 57px on a 1133px-wide plaque; the
 * vertical offset does not scale with it, so atan2 returns a different angle
 * for the SAME position on the object. Measured on real sheets, plaques at
 * aspect 4.12 read 167 degrees against square dials at 131 — a 33-degree
 * rejection of art whose light was within a degree of the baseline once the
 * shape was divided out.
 *
 * It also measured from the frame's centre rather than the object's, so
 * padding and an off-centre contact shadow moved the angle.
 *
 * Dividing each offset by the content box's own width and height makes the
 * measurement dimensionless: it asks where the light sits ON THE OBJECT, which
 * is the question, instead of how many pixels away it is, which is a fact about
 * the canvas. ART_DIRECTION §9 records this as the second false rejection
 * produced by a metric's geometry rather than by the art.
 */
export function lightAngleFrom(
  centroidX: number,
  centroidY: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): number {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (w <= 0 || h <= 0) return 0;

  // Fraction of the way across the object, then offset from its centre.
  const fx = (centroidX - box.x0) / w - 0.5;
  // Screen y grows downward; negate so "up" is positive and the angle reads
  // the way a person would describe it.
  const fy = 0.5 - (centroidY - box.y0) / h;

  let angle = (Math.atan2(fy, fx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

export function auditSprite(name: string, rgba: Buffer, width: number, height: number): Audit {
  let sumX = 0;
  let sumY = 0;
  let weight = 0;
  let brightest = -1;
  let specX = 0;
  let specY = 0;
  let opaque = 0;
  let hueX = 0;
  let hueY = 0;
  let satSum = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3]!;
      if (a < 128) continue;
      opaque++;

      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Lighting direction: the centroid of the brightest material, weighted
      // steeply so a broad warm body cannot outvote a small bright highlight.
      const w = Math.pow(luma / 255, 6);
      sumX += x * w;
      sumY += y * w;
      weight += w;

      if (luma > brightest) {
        brightest = luma;
        specX = x;
        specY = y;
      }

      // Hue as a vector, so the average of 350 and 10 degrees is 0 rather than
      // 180 — brass sits near the wrap point and would otherwise average to its
      // opposite.
      const delta = max - min;
      if (delta > 0) {
        let hue: number;
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
        const radians = (hue * Math.PI) / 180;
        hueX += Math.cos(radians);
        hueY += Math.sin(radians);
        satSum += max === 0 ? 0 : delta / max;
      }
    }
  }

  // Content bounds at full opacity: the solid object, excluding the soft
  // contact shadow, which is what "how big does this look" means.
  let bx0 = width;
  let by0 = height;
  let bx1 = 0;
  let by1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! < 200) continue;
      if (x < bx0) bx0 = x;
      if (y < by0) by0 = y;
      if (x > bx1) bx1 = x;
      if (y > by1) by1 = y;
    }
  }

  const hasBox = bx1 >= bx0 && by1 >= by0;
  const box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  const angle =
    weight > 0 && hasBox ? lightAngleFrom(sumX / weight, sumY / weight, box) : 0;

  let meanHue = (Math.atan2(hueY, hueX) * 180) / Math.PI;
  if (meanHue < 0) meanHue += 360;

  const boxW = hasBox ? bx1 - bx0 + 1 : 0;
  const boxH = hasBox ? by1 - by0 + 1 : 0;

  return {
    name,
    lightAngle: angle,
    // Normalised within the CONTENT box for the same reason as the angle: the
    // frame's padding is not part of the object.
    specularX: boxW > 1 ? (specX - bx0) / (boxW - 1) : 0,
    specularY: boxH > 1 ? (specY - by0) / (boxH - 1) : 0,
    meanHue,
    meanSaturation: opaque > 0 ? satSum / opaque : 0,
    coverage: opaque / (width * height),
    boxWidth: hasBox ? boxW / width : 0,
    boxHeight: hasBox ? boxH / height : 0,
    boxX: hasBox ? bx0 / width : 0,
    boxY: hasBox ? by0 / height : 0,
    aspect: boxH > 0 ? boxW / boxH : 0,
  };
}

/** Circular mean/deviation, so 359 and 1 are two degrees apart. */
export function angularStats(values: number[]): { mean: number; deviation: number } {
  if (values.length === 0) return { mean: 0, deviation: 0 };
  let x = 0;
  let y = 0;
  for (const value of values) {
    const radians = (value * Math.PI) / 180;
    x += Math.cos(radians);
    y += Math.sin(radians);
  }
  let mean = (Math.atan2(y / values.length, x / values.length) * 180) / Math.PI;
  if (mean < 0) mean += 360;

  // RMS, matching the figure §9's recorded baselines were taken with. Changing
  // the angle metric is already one change to the numbers; changing how spread
  // is summarised at the same time would make the two impossible to separate.
  const spread = values.map((v) => {
    const d = Math.abs(v - mean) % 360;
    return d > 180 ? 360 - d : d;
  });
  const deviation = Math.sqrt(spread.reduce((s, d) => s + d * d, 0) / spread.length);
  return { mean, deviation };
}
