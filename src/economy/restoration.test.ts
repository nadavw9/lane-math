import { describe, expect, it } from "vitest";

import { Economy } from "./economy.js";
import { MemoryStore, SAVE_SCHEMA_VERSION, migrate, writeSave } from "./save.js";

const T0 = 1_700_000_000_000;
const at = (store: MemoryStore) => new Economy(store, () => T0);

/**
 * A player with an EXACT star balance who has reached a given level.
 *
 * Seeded through the store rather than by clearing levels: clearing is
 * best-ever and only ever adds, so a helper built on `recordClear` cannot
 * produce a small balance — the levels needed to reach World 4 already grant
 * 18★, and a test that wanted 2★ silently got 18 and asserted nothing.
 */
function player(stars: number, furthest = "4-01"): { economy: Economy; store: MemoryStore } {
  const store = new MemoryStore();
  const levels: Record<string, unknown> = {};
  for (const id of ["1-01", furthest]) {
    levels[id] = { cleared: true, bestStars: 3, failCount: 0, hintsPurchased: [] };
  }
  writeSave(store, {
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels: levels as never,
    lives: 5,
    lastLifeGrantedAt: T0,
    clockHighWater: T0,
    totalStars: stars,
    starsSpent: 0,
    restored: {},
    selectedMode: "normal",
    muted: false,
  });
  return { economy: at(store), store };
}

describe("Academy restoration (ART_DIRECTION §6)", () => {
  it("prices 2/2/3/3 and takes 10★ to finish a room", () => {
    const { economy } = player(40);
    const before = economy.starsAvailable;
    expect(before).toBe(40);
    const costs: number[] = [];
    for (let i = 0; i < 4; i++) {
      costs.push(economy.nextRestoreCost(1)!);
      expect(economy.restore(1)).toBe(true);
    }
    expect(costs).toEqual([2, 2, 3, 3]);
    expect(before - economy.starsAvailable).toBe(10);
    expect(economy.restoredIn(1)).toBe(4);
    // A finished room has nothing left to sell.
    expect(economy.nextRestoreCost(1)).toBeNull();
    expect(economy.restore(1)).toBe(false);
  });

  it("SURVIVES AN APP KILL, not just a reload", () => {
    /*
     * §13's force-quit exploit, applied to restoration: a purchase held in
     * memory is refunded by killing the app. So this drops the Economy entirely
     * and rebuilds from the STORE, which is what a cold start does — a reload
     * that reused the same instance would prove nothing.
     */
    const { economy, store } = player(20);
    expect(economy.restore(1)).toBe(true);
    const spent = economy.starsAvailable;

    const afterKill = at(store);
    expect(afterKill.restoredIn(1)).toBe(1);
    expect(afterKill.starsAvailable).toBe(spent);
  });

  it("cannot spend the same star twice", () => {
    // Exactly enough for one 2★ object and nothing more.
    const { economy } = player(2);
    expect(economy.starsAvailable).toBe(2);
    expect(economy.restore(1)).toBe(true);
    expect(economy.starsAvailable).toBe(0);
    // The second purchase is refused, and refused WITHOUT moving the count.
    expect(economy.restore(1)).toBe(false);
    expect(economy.restoredIn(1)).toBe(1);
    expect(economy.starsAvailable).toBe(0);
  });

  it("shares one pool with hints, in both directions", () => {
    const { economy } = player(4);
    expect(economy.restore(1)).toBe(true); // 2★
    expect(economy.starsAvailable).toBe(2);

    // A 3★ hint is now unaffordable because restoration took the stars.
    expect(economy.purchaseHint("1-01", "branch", 3)).toBe(false);
    // A 2★ one fits, and then restoration cannot afford its next object.
    expect(economy.purchaseHint("1-01", "contested", 2)).toBe(true);
    expect(economy.starsAvailable).toBe(0);
    expect(economy.restore(1)).toBe(false);
    expect(economy.restoredIn(1)).toBe(1);
  });

  it("a room does not open before its world is reachable", () => {
    const store = new MemoryStore();
    const economy = at(store);
    for (const id of ["1-01", "1-02", "1-03"]) economy.recordClear(id);

    expect(economy.canRestore(1)).toBe(true);
    expect(economy.canRestore(4)).toBe(false);
    expect(economy.restore(4)).toBe(false);
    expect(economy.restoredIn(4)).toBe(0);

    economy.recordClear("4-01");
    expect(economy.canRestore(4)).toBe(true);
  });

  it("a v1 save climbs to v2 with every room shabby and no stars lost", () => {
    const v1 = {
      schemaVersion: 1,
      levels: { "1-01": { cleared: true, bestStars: 3, failCount: 0, hintsPurchased: [] } },
      lives: 5,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 30,
      starsSpent: 4,
      selectedMode: "normal",
      muted: false,
    };
    const climbed = migrate(v1);
    expect(climbed).not.toBeNull();
    expect(climbed!.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(climbed!.restored).toEqual({});
    expect(climbed!.totalStars).toBe(30);
    expect(climbed!.starsSpent).toBe(4);
  });
});
