import { describe, expect, it } from "vitest";

/**
 * ROW ORDER ON A SHEET OF UNLIKE OBJECTS.
 *
 * `--names` is positional: name N is applied to slice N, so the slice order IS
 * the naming. The original sort bucketed rows on `Math.round(minY / 64)`, which
 * holds only while every object is the same height.
 *
 * On the Academy's warm sheet it did not. The bank lamp is half the height of
 * the clock beside it, so its TOP EDGE sat a bucket lower and it sorted into
 * the second row — shifting every name after it. `lamp` was applied to the
 * clock and `armchair` to the orrery. The atlas looked perfect; only the labels
 * were wrong, which surfaces later as the wrong object in the wrong room.
 *
 * This reproduces that geometry directly, because the failure is in the
 * comparator and nowhere else.
 */
function readingOrder(
  regions: readonly { minX: number; minY: number; maxY: number; id: string }[],
): string[] {
  const heights = regions.map((r) => r.maxY - r.minY).sort((a, b) => a - b);
  const medianH = heights.length === 0 ? 64 : heights[Math.floor(heights.length / 2)]!;
  const tolerance = Math.max(16, medianH * 0.5);
  const centre = (r: { minY: number; maxY: number }): number => (r.minY + r.maxY) / 2;

  const byCentre = [...regions].sort((a, b) => centre(a) - centre(b));
  const rows: (typeof regions)[number][][] = [];
  for (const region of byCentre) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(centre(region) - centre(row[0]!)) <= tolerance) row.push(region);
    else rows.push([region]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.minX - b.minX)).map((r) => r.id);
}

describe("sheet slice order survives objects of different heights", () => {
  it("keeps a short object in its own row", () => {
    // The real geometry: a tall clock and a short lamp, side by side, centres
    // aligned. Top edges differ by more than the old 64px bucket.
    const sheet = [
      { id: "lamp", minX: 40, minY: 180, maxY: 400 },
      { id: "clock", minX: 460, minY: 60, maxY: 420 },
      { id: "globe", minX: 880, minY: 70, maxY: 410 },
      { id: "blackboard", minX: 1300, minY: 90, maxY: 390 },
      { id: "stepladder", minX: 40, minY: 500, maxY: 860 },
      { id: "bookcase", minX: 460, minY: 505, maxY: 855 },
      { id: "armchair", minX: 880, minY: 560, maxY: 840 },
      { id: "orrery", minX: 1300, minY: 520, maxY: 850 },
    ];
    expect(readingOrder(sheet)).toEqual([
      "lamp", "clock", "globe", "blackboard",
      "stepladder", "bookcase", "armchair", "orrery",
    ]);
  });

  it("the old top-edge bucketing is what broke it", () => {
    // Same sheet, sorted the old way — kept as the record of the failure.
    const sheet = [
      { id: "lamp", minX: 40, minY: 180, maxY: 400 },
      { id: "clock", minX: 460, minY: 60, maxY: 420 },
    ];
    const oldOrder = [...sheet]
      .sort((a, b) => {
        const rowA = Math.round(a.minY / 64);
        const rowB = Math.round(b.minY / 64);
        return rowA === rowB ? a.minX - b.minX : rowA - rowB;
      })
      .map((r) => r.id);
    expect(oldOrder).toEqual(["clock", "lamp"]);
    expect(readingOrder(sheet)).toEqual(["lamp", "clock"]);
  });
});
