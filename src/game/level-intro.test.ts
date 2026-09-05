import { describe, expect, it } from "vitest";
import { shouldShowLevelIntro } from "./level-intro.js";

const UNLOCK = "2-01";

describe("level intro sequencing", () => {
  it("keeps World 1 free of intro and hint-ad surfaces", () => {
    expect(shouldShowLevelIntro("1-10", new Set(), UNLOCK)).toBe(false);
  });

  it("puts the first 2-01 visit on the board before the intro veil", () => {
    expect(shouldShowLevelIntro("2-01", new Set(), UNLOCK)).toBe(false);
  });

  it("restores the intro on a later 2-01 visit", () => {
    expect(shouldShowLevelIntro("2-01", new Set(["2-01"]), UNLOCK)).toBe(true);
  });

  it("does not change the existing intro behavior for later levels", () => {
    expect(shouldShowLevelIntro("2-02", new Set(), UNLOCK)).toBe(true);
  });
});
