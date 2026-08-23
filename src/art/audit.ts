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
  /**
   * Median RGB of the body, with the brightest decile discarded.
   *
   * EMISSIVE FEATURES DEFEAT SPECULAR CENTROID MEASUREMENT. `lightAngle` finds
   * the brightest point and calls it the highlight; on a character with a
   * glowing lens it finds the lens, which moves with the pose rather than with
   * the light. On the automaton sheet that reads one pose at -29 degrees purely
   * because its iris is a bright dot — the same confound as the glass caustics
   * recorded in ART_DIRECTION section 9.
   *
   * Body colour has no such failure: it is a property of the MATERIAL, and the
   * material does not move when the pose does. Discarding the top decile by
   * luminance removes both the emissive feature and the specular hit.
   */
  readonly bodyColour: readonly [number, number, number];
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

/**
 * How far in from the edge the specular search starts, as a fraction of the
 * object's smaller dimension.
 *
 * ART_DIRECTION §9: silhouette is a third confound. A closed bright rim — the
 * knurled edge of a dial — sits all the way around the object, so it
 * contributes to the luminance centroid from every direction at once and drags
 * it toward the centre; a long straight bevel on a wide plaque contributes from
 * one side only and does not. The two then disagree about where the light is
 * while being lit identically.
 *
 * Eroding the mask first is meant to make the measurement read the FACE, which
 * is the surface the light direction is legible on.
 *
 * SET TO ZERO, BECAUSE THE SWEEP SAYS SO. The expectation was that eroding
 * would converge the dials and the plaques. Measured across both real sheets it
 * does the opposite, on both of the checks §9 names:
 *
 *   erosion   operators mean/sd    plaques mean/sd    cross-family gap
 *      0%       117.8 / 1.3          129.8 / 1.1           12.1
 *      4%       122.2 / 1.9          157.4 / 3.7           35.2
 *      8%       124.7 / 2.6          157.3 / 6.1           32.6
 *     12%       121.6 / 4.7          138.8 / 0.1           17.2
 *     16%       119.1 / 8.8          139.9 / 0.8           20.8
 *     25%       122.4 / 66.8         152.6 / 0.8           30.2
 *
 * The gap is SMALLEST with no erosion, and the operators' within-family spread
 * — the binding check — degrades monotonically as the mask shrinks, breaking
 * the 3-degree limit at 12%.
 *
 * The earlier result that suggested erosion (all five dials +5.9 degrees toward
 * 135) came from a CENTRED CIRCULAR CROP at 0.72R, which is meaningful only for
 * a disc. A general erosion also strips the plaque's border bevel, and that
 * bevel is where a flat plaque's light actually reads — hence the swing to 157
 * degrees at 4-8%. The two operations are not the same test.
 *
 * The machinery stays because the sweep is worth being able to re-run against
 * new art; the value is measured, not assumed. Raising it needs a sweep that
 * says something different.
 */
const FACE_EROSION = 0;

/**
 * Pixels that survive eroding the opaque mask inward by `inset`.
 *
 * Uses a summed-area table so the "is this whole window opaque" test is O(1)
 * per pixel: a naive window scan is O(n * inset^2), which on a 360px sprite
 * with a 40px inset is two hundred million operations for one frame.
 */
function erodedMask(
  rgba: Buffer,
  width: number,
  height: number,
  inset: number,
): (x: number, y: number) => boolean {
  if (inset < 1) return (x, y) => rgba[(y * width + x) * 4 + 3]! >= 200;

  const stride = width + 1;
  const sum = new Int32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += rgba[(y * width + x) * 4 + 3]! >= 200 ? 1 : 0;
      sum[(y + 1) * stride + (x + 1)] = sum[y * stride + (x + 1)]! + row;
    }
  }
  const area = (x0: number, y0: number, x1: number, y1: number): number =>
    sum[(y1 + 1) * stride + (x1 + 1)]! -
    sum[y0 * stride + (x1 + 1)]! -
    sum[(y1 + 1) * stride + x0]! +
    sum[y0 * stride + x0]!;

  const r = Math.round(inset);
  return (x, y) => {
    if (x - r < 0 || y - r < 0 || x + r >= width || y + r >= height) return false;
    const side = 2 * r + 1;
    return area(x - r, y - r, x + r, y + r) === side * side;
  };
}

export function auditSprite(name: string, rgba: Buffer, width: number, height: number): Audit {
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
  const boxW = hasBox ? bx1 - bx0 + 1 : 0;
  const boxH = hasBox ? by1 - by0 + 1 : 0;

  const inset = Math.min(boxW, boxH) * FACE_EROSION;
  let face = erodedMask(rgba, width, height, inset);
  // A thin or small object can erode to nothing; measuring the whole silhouette
  // is a worse answer than measuring the face, but it beats measuring nothing.
  let faceCount = 0;
  for (let y = by0; y <= by1 && hasBox; y++) {
    for (let x = bx0; x <= bx1; x++) if (face(x, y)) faceCount++;
  }
  if (faceCount < 16) face = (x, y) => rgba[(y * width + x) * 4 + 3]! >= 200;

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
      if (rgba[i + 3]! < 128) continue;
      opaque++;

      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // Lighting direction: the centroid of the brightest material on the
      // object's FACE, weighted steeply so a broad warm body cannot outvote a
      // small bright highlight. Edge treatment is excluded above.
      if (face(x, y)) {
        const w = Math.pow(luma / 255, 6);
        sumX += x * w;
        sumY += y * w;
        weight += w;
        if (luma > brightest) {
          brightest = luma;
          specX = x;
          specY = y;
        }
      }

      // Hue as a vector, so the average of 350 and 10 degrees is 0 rather than
      // 180 — brass sits near the wrap point and would otherwise average to its
      // opposite. Measured over the whole object: palette is not directional.
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

  const box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  const angle = weight > 0 && hasBox ? lightAngleFrom(sumX / weight, sumY / weight, box) : 0;

  /*
   * BODY COLOUR — the median of the darkest 90% of opaque pixels.
   *
   * A second, independent consistency metric for sheets whose objects carry an
   * emissive feature. The top decile by luminance is dropped because that is
   * exactly where a glowing lens and a specular hit live; what remains is the
   * material. Median rather than mean so a residual bright cluster cannot drag
   * it.
   */
  const lum: { l: number; r: number; g: number; b: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! < 200) continue;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      lum.push({ l: 0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b });
    }
  }
  lum.sort((a, b) => a.l - b.l);
  const kept = lum.slice(0, Math.max(1, Math.floor(lum.length * 0.9)));
  const channel = (pick: (p: { r: number; g: number; b: number }) => number): number => {
    const xs = kept.map(pick).sort((a, b) => a - b);
    return xs.length === 0 ? 0 : Math.round(xs[Math.floor(xs.length / 2)]!);
  };
  const bodyColour: readonly [number, number, number] = [
    channel((p) => p.r),
    channel((p) => p.g),
    channel((p) => p.b),
  ];

  let meanHue = (Math.atan2(hueY, hueX) * 180) / Math.PI;
  if (meanHue < 0) meanHue += 360;

  return {
    name,
    bodyColour,
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
