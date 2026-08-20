import { describe, expect, it } from "vitest";

import { Economy } from "../economy/economy.js";

import { SLOTS_PER_WORLD, WORLDS, levelId, mapView } from "./model.js";

/**
 * The world map's progression rules (GDD §7.6, §5.4).
 *
 * The map is the first screen in the game that is ABOUT progress rather than
 * about a board, so what it reveals and what it withholds is the whole of it.
 */
const IDS: string[] = [];
for (const world of WORLDS) {
  for (let slot = 1; slot <= SLOTS_PER_WORLD; slot++) IDS.push(levelId(world, slot));
}

/**
 * An in-memory store, so a test never touches localStorage.
 *
 * `failuresFirst` earns a LOWER star count the honest way. Stars are derived
 * from the failure count (§5.4) and cannot be handed out directly, which is
 * exactly the point — the economy has one way to award them.
 */
function economyWith(cleared: readonly string[], failuresFirst = 0): Economy {
  let saved: string | null = null;
  const store = {
    read: () => saved,
    write: (raw: string) => {
      saved = raw;
    },
  };
  const economy = new Economy(store);
  for (const id of cleared) {
    economy.beginReplay(id);
    for (let i = 0; i < failuresFirst; i++) economy.recordFailure(id);
    economy.recordClear(id);
  }
  return economy;
}

/** Stars a level is worth after n failures, so tests assert against the rule. */
function starsAfter(failures: number): number {
  const economy = economyWith(["1-01"], failures);
  return economy.progressFor("1-01").bestStars;
}

describe("what the map opens", () => {
  it("offers exactly one playable level on a fresh save", () => {
    const view = mapView(economyWith([]), IDS);
    const open = view.levels.filter((l) => l.state === "open");
    expect(open.map((l) => l.id)).toEqual(["1-01"]);
    expect(view.levels.filter((l) => l.state === "cleared")).toHaveLength(0);
    expect(view.levels).toHaveLength(40);
  });

  it("advances the frontier by one as levels are cleared", () => {
    const view = mapView(economyWith(["1-01", "1-02"]), IDS);
    expect(view.levels.filter((l) => l.state === "cleared").map((l) => l.id)).toEqual([
      "1-01",
      "1-02",
    ]);
    expect(view.levels.filter((l) => l.state === "open").map((l) => l.id)).toEqual(["1-03"]);
  });

  it("keeps a cleared level open forever, so stars can be improved (§5.4)", () => {
    const view = mapView(economyWith(["1-01", "1-02", "1-03"]), IDS);
    // Replaying for a better count is the point of the economy; a cleared level
    // that closed would make the banked total a one-way ratchet.
    for (const id of ["1-01", "1-02", "1-03"]) {
      expect(view.levels.find((l) => l.id === id)!.state).toBe("cleared");
    }
  });

  it("does not gate progression on stars", () => {
    /*
     * §8.1's fairness contract: the ladder IS the difficulty curve. A star toll
     * on top of it would be a second curve the player cannot see, which is the
     * same objection as hidden difficulty adjustment.
     */
    const poor = mapView(economyWith(["1-01"], 4), IDS);
    const rich = mapView(economyWith(["1-01"], 0), IDS);
    expect(poor.levels.map((l) => l.state)).toEqual(rich.levels.map((l) => l.state));
  });

  it("carries best-ever stars per level, not the current attempt", () => {
    const dropped = starsAfter(4);
    expect(dropped).toBeLessThan(3);

    const view = mapView(economyWith(["1-01"], 4), IDS);
    expect(view.levels.find((l) => l.id === "1-01")!.stars).toBe(dropped);
    // An uncleared level carries none, rather than inheriting a neighbour's.
    expect(view.levels.find((l) => l.id === "1-02")!.stars).toBe(0);
  });
});

describe("progressive disclosure on the map (§7.6)", () => {
  it("hides lives, shop and modes on a fresh save", () => {
    const view = mapView(economyWith([]), IDS);
    // ABSENT, not greyed: a greyed shop still teaches "this is not for me".
    expect(view.showLives).toBe(false);
    expect(view.showShop).toBe(false);
    expect(view.showModes).toBe(false);
  });

  it("reveals each system at its own unlock, and not before", () => {
    const upTo = (last: string): string[] => IDS.slice(0, IDS.indexOf(last) + 1);

    // Lives at 2-8, shop at 3-6, modes cleared 3-10.
    const atW2 = mapView(economyWith(upTo("2-08")), IDS);
    expect(atW2.showLives).toBe(true);
    expect(atW2.showShop).toBe(false);
    expect(atW2.showModes).toBe(false);

    const atW3 = mapView(economyWith(upTo("3-06")), IDS);
    expect(atW3.showShop).toBe(true);
    expect(atW3.showModes).toBe(false);

    const afterW3 = mapView(economyWith(upTo("3-10")), IDS);
    expect(afterW3.showModes).toBe(true);
  });
});

describe("the totals that had nowhere to live", () => {
  it("reports the banked and spendable star counts", () => {
    const view = mapView(economyWith(["1-01", "1-02"]), IDS);
    // Six earned, none spent. These were crowding the lane header before the
    // map existed, which is what produced three star readings on one board.
    expect(view.totalStars).toBe(6);
    expect(view.starsAvailable).toBe(6);
  });

  it("reports lives against the ceiling, so empty pips can be drawn", () => {
    const view = mapView(economyWith([]), IDS);
    expect(view.maxLives).toBeGreaterThan(0);
    expect(view.lives).toBeLessThanOrEqual(view.maxLives);
  });
});
