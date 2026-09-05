import { describe, expect, it } from "vitest";

import { isFirstClearTeach } from "./renderer.js";

describe("first-clear board disclosure", () => {
  it("keeps the first board minimal until its first clear", () => {
    expect(isFirstClearTeach("1-01", false)).toBe(true);
    expect(isFirstClearTeach("1-01", true)).toBe(false);
  });

  it("does not hide controls on later levels", () => {
    expect(isFirstClearTeach("1-02", false)).toBe(false);
  });
});
