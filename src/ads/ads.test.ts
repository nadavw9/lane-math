import { describe, expect, it } from "vitest";

import { DEFAULT_ECONOMY } from "../economy/config.js";
import { Economy } from "../economy/economy.js";
import { Ads } from "./ads.js";

/**
 * The rewarded-ad path (GDD §5.2, §12).
 *
 * The plugin is injected, so the reward logic is testable without a device —
 * which matters, because the failure modes here are about what happens when an
 * ad DOESN'T complete, and those are exactly the paths a device test skips.
 */
function economy(): Economy {
  let saved: string | null = null;
  return new Economy({
    read: () => saved,
    write: (raw) => {
      saved = raw;
    },
  });
}

function spend(e: Economy, lives: number): void {
  for (let i = 0; i < lives; i++) e.recordFailure("2-08");
}

/** A plugin that completes, dismisses, or throws. */
function fakePlugin(behaviour: "reward" | "dismiss" | "throw") {
  return {
    initialize: async () => undefined,
    prepareRewardVideoAd: async () => {
      if (behaviour === "throw") throw new Error("no fill");
      return undefined;
    },
    showRewardVideoAd: async () => (behaviour === "reward" ? { type: "reward", amount: 1 } : {}),
  };
}

describe("a rewarded ad buys a life, and only on a genuine reward", () => {
  it("grants a life when the reward callback fires", async () => {
    const e = economy();
    spend(e, 2);
    const before = e.lives;

    const ads = new Ads({ plugin: fakePlugin("reward") });
    await ads.initialize();

    expect(await ads.offerLifeForAd(e)).toBe("rewarded");
    expect(e.lives).toBe(before + 1);
  });

  it("grants NOTHING when the player dismisses it", async () => {
    const e = economy();
    spend(e, 2);
    const before = e.lives;

    const ads = new Ads({ plugin: fakePlugin("dismiss") });
    await ads.initialize();

    expect(await ads.offerLifeForAd(e)).toBe("dismissed");
    // And costs nothing either: the player is never worse off for trying, which
    // is what keeps this a choice rather than a gamble.
    expect(e.lives).toBe(before);
  });

  it("degrades to unavailable when there is no ad to show", async () => {
    const e = economy();
    spend(e, 2);
    const before = e.lives;

    const ads = new Ads({ plugin: fakePlugin("throw") });
    await ads.initialize();

    expect(await ads.offerLifeForAd(e)).toBe("unavailable");
    expect(e.lives).toBe(before);
  });

  it("is simply absent on the web, where there is no plugin", async () => {
    const e = economy();
    const ads = new Ads({ plugin: null });
    await ads.initialize();

    expect(ads.available).toBe(false);
    expect(await ads.offerLifeForAd(e)).toBe("unavailable");
  });
});

describe("an ad buys time, not an advantage (§8.1)", () => {
  it("cannot stockpile lives past the normal ceiling", async () => {
    const e = economy();
    const ads = new Ads({ plugin: fakePlugin("reward") });
    await ads.initialize();

    expect(e.lives).toBe(DEFAULT_ECONOMY.maxLives);
    // Full already: watching an ad must not push past what waiting would give.
    expect(await ads.offerLifeForAd(e)).toBe("rewarded");
    expect(e.lives).toBe(DEFAULT_ECONOMY.maxLives);
  });

  it("does not cancel the refill the player was already waiting for", async () => {
    const e = economy();
    spend(e, 2);
    const anchorBefore = e.state.lastLifeGrantedAt;

    const ads = new Ads({ plugin: fakePlugin("reward") });
    await ads.initialize();
    await ads.offerLifeForAd(e);

    // Moving the regeneration anchor would charge an ad for time already
    // served — the player would lose progress toward the free life.
    expect(e.state.lastLifeGrantedAt).toBe(anchorBefore);
  });
});
