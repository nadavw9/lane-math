import type { Economy } from "../economy/economy.js";

/**
 * Advertising (GDD §12, §5.2).
 *
 * REWARDED VIDEO ONLY, and only for the life refill. There are no
 * interstitials and there is no place one could go: this game's failure already
 * rewinds a whole level, which is the harshest retry in casual puzzle, and an
 * unskippable ad on top of that is the difference between a hard game and a
 * hostile one. Top-grossing puzzle titles do not interrupt the core loop, and
 * §9.5's instantaneous-retry guarantee would be a lie if an ad could land in
 * the middle of it.
 *
 * The rule this file exists to enforce: an ad is something the player CHOSE, in
 * exchange for something they wanted. Never a toll.
 */

/**
 * Google's public test ids. Real ones replace these two constants and the
 * APPLICATION_ID in AndroidManifest.xml, and nothing else changes.
 */
export const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";

export type AdOutcome = "rewarded" | "dismissed" | "unavailable";

/** The slice of the AdMob plugin this game uses. Nothing else is imported. */
interface RewardedPlugin {
  initialize(options: { initializeForTesting?: boolean }): Promise<unknown>;
  prepareRewardVideoAd(options: { adId: string; isTesting?: boolean }): Promise<unknown>;
  showRewardVideoAd(): Promise<{ type?: string; amount?: number }>;
}

export interface AdsOptions {
  /** Injected so the reward path can be tested without a device. */
  readonly plugin?: RewardedPlugin | null;
  readonly rewardedId?: string;
  readonly testing?: boolean;
}

export class Ads {
  private readonly plugin: RewardedPlugin | null;
  private readonly rewardedId: string;
  private readonly testing: boolean;
  private ready = false;

  constructor(options: AdsOptions = {}) {
    this.plugin = options.plugin ?? null;
    this.rewardedId = options.rewardedId ?? TEST_REWARDED_ID;
    this.testing = options.testing ?? true;
  }

  get available(): boolean {
    return this.plugin !== null;
  }

  async initialize(): Promise<void> {
    if (!this.plugin) return;
    try {
      await this.plugin.initialize({ initializeForTesting: this.testing });
      this.ready = true;
    } catch {
      // On the web, or with no network, there is simply no ad. The life refill
      // falls back to waiting, which is the behaviour without ads at all.
      this.ready = false;
    }
  }

  /**
   * Offer a life for a rewarded view (§5.2).
   *
   * Grants only on a genuine reward callback. A dismissed or failed ad grants
   * nothing — but it also costs nothing, so the player is never worse off for
   * having tried, which is what keeps this a choice rather than a gamble.
   */
  async offerLifeForAd(economy: Economy): Promise<AdOutcome> {
    if (!this.plugin || !this.ready) return "unavailable";

    try {
      await this.plugin.prepareRewardVideoAd({ adId: this.rewardedId, isTesting: this.testing });
      const reward = await this.plugin.showRewardVideoAd();
      if (!reward || reward.type === undefined) return "dismissed";

      economy.grantAdLife();
      return "rewarded";
    } catch {
      return "unavailable";
    }
  }
}

/**
 * Load the real plugin, but only where one exists.
 *
 * Returns a BOX rather than the plugin itself, and that is load-bearing.
 * Capacitor's plugin object is a proxy that intercepts every property access,
 * including `then` — so returning it from an async function makes the runtime
 * treat it as a thenable and call `AdMob.then()`, which the web shim throws on.
 * That took the whole app down at module load on the browser: no laneMath, no
 * board, blank canvas. Wrapping it means the proxy is never awaited.
 */
export async function loadAdMob(): Promise<{ plugin: RewardedPlugin | null }> {
  try {
    const mod = (await import("@capacitor-community/admob")) as unknown as {
      AdMob?: RewardedPlugin;
    };
    return { plugin: mod.AdMob ?? null };
  } catch {
    return { plugin: null };
  }
}
