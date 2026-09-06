import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commit key atlas on disk", () => {
  it("ships idle/armed/unavailable @2x (no pressed twin)", () => {
    for (const face of ["idle", "armed", "unavailable"] as const) {
      expect(existsSync(`public/assets/ui/commit-key/ui-commit-key-${face}@2x.png`)).toBe(true);
      expect(existsSync(`public/assets/ui/commit-key/ui-commit-key-${face}@3x.png`)).toBe(true);
    }
    expect(existsSync("public/assets/ui/commit-key/ui-commit-key-pressed@2x.png")).toBe(false);
  });
});
