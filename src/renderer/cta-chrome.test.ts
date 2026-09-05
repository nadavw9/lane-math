import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CTA_SLICE } from "./cta-chrome.js";

describe("CTA chrome atlas on disk", () => {
  it("ships 360×104 9-slice masters for every primary/secondary state", () => {
    expect(CTA_SLICE.artWidth).toBe(360);
    expect(CTA_SLICE.artHeight).toBe(104);
    for (const variant of ["primary", "secondary"] as const) {
      for (const state of ["idle", "pressed", "armed", "unavailable"] as const) {
        const path = `public/assets/ui/cta/ui-cta-${variant}-${state}@2x.png`;
        expect(existsSync(path), path).toBe(true);
      }
    }
  });
});
