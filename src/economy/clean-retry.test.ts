import { describe, expect, it } from "vitest";

import { Economy } from "./economy.js";
import { MemoryStore } from "./save.js";

describe("rewarded clean retry", () => {
  it("preserves failure history but restores 3-star eligibility once", () => {
    const economy = new Economy(new MemoryStore(), () => 1_700_000_000_000);
    economy.recordFailure("2-08");
    expect(economy.progressFor("2-08").failCount).toBe(1);

    expect(economy.beginCleanRetry("2-08")).toBe(true);
    expect(economy.starsForAttempt("2-08")).toBe(3);
    expect(economy.beginCleanRetry("2-08")).toBe(false);

    const clear = economy.recordClear("2-08");
    expect(clear.stars).toBe(3);
    expect(economy.progressFor("2-08").failCount).toBe(1);
  });

  it("taints the clean attempt if the restarted run fails", () => {
    const economy = new Economy(new MemoryStore(), () => 1_700_000_000_000);
    economy.recordFailure("2-08");
    economy.beginCleanRetry("2-08");
    economy.recordFailure("2-08");
    expect(economy.starsForAttempt("2-08")).toBe(1);
  });
});
