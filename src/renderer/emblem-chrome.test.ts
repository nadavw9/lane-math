import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("HUD emblem atlas on disk", () => {
  it("ships @2x stamps for star / life / hint states", () => {
    const files = [
      "ui-star-earned@2x.png",
      "ui-star-empty@2x.png",
      "ui-life-pocket-watch-full@2x.png",
      "ui-life-pocket-watch-spent@2x.png",
      "ui-hint-gem@2x.png",
      "ui-hint-gem-disabled@2x.png",
    ];
    for (const file of files) {
      const path = `public/assets/ui/emblems/${file}`;
      expect(existsSync(path), path).toBe(true);
    }
  });
});
