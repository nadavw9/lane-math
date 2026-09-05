import { describe, expect, it } from "vitest";

import { starsForClear } from "./star-sync.js";

describe("clear star truth", () => {
  it("uses the current attempt award, not the durable best", () => {
    expect(starsForClear({ starsIfCleared: 1 })).toBe(1);
  });

  it("returns no stars when the economy is absent", () => {
    expect(starsForClear(null)).toBe(0);
    expect(starsForClear(undefined)).toBe(0);
  });

  it("keeps the modal meter inside the three-star range", () => {
    expect(starsForClear({ starsIfCleared: 8 })).toBe(3);
    expect(starsForClear({ starsIfCleared: -1 })).toBe(0);
  });
});
