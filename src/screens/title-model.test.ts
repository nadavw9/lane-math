import { describe, expect, it } from "vitest";

import { Economy } from "../economy/economy.js";
import { emptySave, SAVE_SCHEMA_VERSION, type SaveData } from "../economy/save.js";
import { continueId, titleEarnedFor, titleView, RESTORE_TOTAL } from "./title-model.js";

const IDS = ["1-01", "1-02", "1-03", "1-10", "2-01", "2-02"];

function economyWith(cleared: readonly string[], extra: Partial<SaveData> = {}): Economy {
  const now = Date.parse("2026-08-29T00:00:00Z");
  const levels: Record<string, unknown> = {};
  for (const id of cleared) {
    levels[id] = { bestStars: 3, failCount: 0, cleared: true, firstFailureUsed: true, hintsPurchased: [] };
  }
  const save: SaveData = {
    ...emptySave(now, 5),
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels: levels as SaveData["levels"],
    totalStars: cleared.length * 3,
    ...extra,
  };
  let stored = JSON.stringify(save);
  return new Economy(
    { read: () => stored, write: (_k, v) => { stored = v; } },
    () => now,
  );
}

/**
 * §7.4: A FIRST RUN MEETS A BOARD, NOT A MENU.
 *
 * The title screen is for the returning player. Getting this backwards would
 * put a menu in front of the one moment §7.4 protects — the first thirty
 * seconds, where the game has to teach by being played rather than described.
 */
describe("who gets a title screen (§7.4)", () => {
  it("does not show it on a cold start", () => {
    expect(titleEarnedFor(economyWith([]))).toBe(false);
  });

  it("still does not show it while the player is on 1-01", () => {
    // Reached but not cleared: a failure on the first level must not conjure a
    // menu the player has never seen.
    const economy = economyWith([]);
    economy.recordFailure("1-01");
    expect(titleEarnedFor(economy)).toBe(false);
  });

  it("shows it once 1-01 is cleared, even before 1-02 is touched", () => {
    /*
     * The save holds ONE entry at that point, so a lexicographic test against
     * "1-01" alone reads as no progress and drops a returning player straight
     * back onto a board. Clearing the first level is progress.
     */
    expect(titleEarnedFor(economyWith(["1-01"]))).toBe(true);
  });

  it("shows it once the player has gone further than 1-01", () => {
    const economy = economyWith([]);
    economy.recordFailure("1-02");
    expect(titleEarnedFor(economy)).toBe(true);
  });
});

describe("what the title screen says", () => {
  it("continues into the first uncleared level", () => {
    expect(continueId(economyWith(["1-01", "1-02"]), IDS)).toBe("1-03");
  });

  it("continues into the last level rather than nothing when all are cleared", () => {
    // A dead primary control is worse than a repeat: §5.4's economy exists to
    // make replaying for a better star count worth doing.
    expect(continueId(economyWith(IDS), IDS)).toBe("2-02");
  });

  it("reports the three numbers, and the room the player is in", () => {
    const view = titleView(economyWith(["1-01", "1-02", "1-03", "1-10"]), IDS);
    expect(view.cleared).toBe(4);
    expect(view.total).toBe(IDS.length);
    expect(view.starsEarned).toBe(12);
    expect(view.restored).toBe(0);
    expect(view.restoreTotal).toBe(RESTORE_TOTAL);
    expect(view.continueId).toBe("2-01");
    expect(view.world, "the room behind is the world continue opens into").toBe(2);
  });

  it("hides the mode selector until 1-10, and shows it after (§6, §7.6)", () => {
    expect(titleView(economyWith(["1-01"]), IDS).showModes).toBe(false);
    expect(titleView(economyWith(["1-01", "1-02", "1-03", "1-10"]), IDS).showModes).toBe(true);
  });
});
