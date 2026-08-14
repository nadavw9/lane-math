import { describe, expect, it } from "vitest";

import { DEFAULT_ECONOMY, livesActiveFor, starsFor } from "./config.js";
import { Economy } from "./economy.js";
import { MemoryStore, SAVE_KEY, SAVE_SCHEMA_VERSION, loadSave, migrate } from "./save.js";

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

/** A clock the test drives by hand. */
function clock(start = T0) {
  let now = start;
  return {
    now: () => now,
    advance: (minutes: number) => {
      now += minutes * MINUTE;
    },
    set: (value: number) => {
      now = value;
    },
  };
}

describe("stars (GDD §5.1)", () => {
  it("0 failures = 3 stars, 1 = 2, 2+ = 1", () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(2)).toBe(1);
    expect(starsFor(9)).toBe(1);
  });

  it("awards stars from the accumulated failure count on clear", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    economy.recordFailure("3-05");
    const outcome = economy.recordClear("3-05");
    expect(outcome.stars).toBe(2);
    expect(outcome.bestStars).toBe(2);
  });

  it("a replay can improve the stored best but never lower it", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    economy.recordFailure("3-05");
    economy.recordFailure("3-05");
    expect(economy.recordClear("3-05").bestStars).toBe(1);

    economy.beginReplay("3-05");
    expect(economy.recordClear("3-05").bestStars).toBe(3);

    // A worse replay leaves the best alone.
    economy.beginReplay("3-05");
    economy.recordFailure("3-05");
    expect(economy.recordClear("3-05").bestStars).toBe(3);
  });

  it("does not reset the failure counter for a level that was never cleared", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    economy.recordFailure("3-05");
    economy.beginReplay("3-05"); // no-op: not cleared
    expect(economy.progressFor("3-05").failCount).toBe(1);
  });
});

describe("the failure counter survives an app kill (GDD §13 Severity 2)", () => {
  it("fail, kill the process, reload — failCount and the star cap persist", () => {
    const c = clock();
    const store = new MemoryStore();

    const first = new Economy(store, c.now);
    first.recordFailure("3-05");
    first.recordFailure("3-05");
    expect(first.progressFor("3-05").failCount).toBe(2);

    // Kill: nothing in memory survives, only what reached the store.
    const afterKill = MemoryStore.from(store.snapshot());
    const reopened = new Economy(afterKill, c.now);

    expect(reopened.progressFor("3-05").failCount).toBe(2);
    // The exploit this guards: force-quit and collect 3 stars anyway.
    expect(reopened.recordClear("3-05").stars).toBe(1);
  });

  it("a cleared level's best stars survive a kill", () => {
    const c = clock();
    const store = new MemoryStore();
    new Economy(store, c.now).recordClear("1-01");

    const reopened = new Economy(MemoryStore.from(store.snapshot()), c.now);
    expect(reopened.progressFor("1-01").bestStars).toBe(3);
    expect(reopened.state.totalStars).toBe(3);
  });

  it("lives spent survive a kill", () => {
    const c = clock();
    const store = new MemoryStore();
    const economy = new Economy(store, c.now);
    economy.recordFailure("3-05"); // free first failure
    economy.recordFailure("3-05"); // costs a life
    const remaining = economy.lives;
    expect(remaining).toBe(DEFAULT_ECONOMY.maxLives - 1);

    const reopened = new Economy(MemoryStore.from(store.snapshot()), c.now);
    expect(reopened.lives).toBe(remaining);
  });
});

describe("lives (GDD §5.2, §7.2, §7.6)", () => {
  it("are inactive in World 1 and before 2-08", () => {
    expect(livesActiveFor("1-01")).toBe(false);
    expect(livesActiveFor("1-10")).toBe(false);
    expect(livesActiveFor("2-07")).toBe(false);
    expect(livesActiveFor("2-08")).toBe(true);
    expect(livesActiveFor("4-10")).toBe(true);
  });

  it("failing in World 1 never costs a life", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    for (let i = 0; i < 5; i++) economy.recordFailure("1-04");
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);
    expect(economy.progressFor("1-04").failCount).toBe(5);
  });

  it("the first failure on a never-cleared level costs stars but not a life", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);

    const first = economy.recordFailure("3-05");
    expect(first.firstFailureExempt).toBe(true);
    expect(first.lifeSpent).toBe(false);
    expect(first.starsIfCleared).toBe(2); // stars still cost
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);

    const second = economy.recordFailure("3-05");
    expect(second.firstFailureExempt).toBe(false);
    expect(second.lifeSpent).toBe(true);
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives - 1);
  });

  it("the exemption is per level and consumed once", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    expect(economy.recordFailure("3-05").lifeSpent).toBe(false);
    expect(economy.recordFailure("3-06").lifeSpent).toBe(false);
    expect(economy.recordFailure("3-05").lifeSpent).toBe(true);
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives - 1);
  });

  it("a cleared level gets no exemption on a later failure", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    economy.recordClear("3-05");
    economy.beginReplay("3-05");
    expect(economy.recordFailure("3-05").lifeSpent).toBe(true);
  });

  it("regenerates one life per configured interval, capped at max", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    for (let i = 0; i < 6; i++) economy.recordFailure(`3-0${i}`);
    // 6 levels, each with a free first failure -> no lives spent.
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);

    for (let i = 0; i < 6; i++) economy.recordFailure(`3-0${i}`);
    expect(economy.lives).toBe(0);

    c.advance(DEFAULT_ECONOMY.lifeRegenMinutes);
    expect(economy.lives).toBe(1);

    c.advance(DEFAULT_ECONOMY.lifeRegenMinutes * 2);
    expect(economy.lives).toBe(3);

    c.advance(DEFAULT_ECONOMY.lifeRegenMinutes * 99);
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);
  });

  it("does not credit a partial interval", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    economy.recordFailure("3-05");
    economy.recordFailure("3-05");
    expect(economy.lives).toBe(4);

    c.advance(DEFAULT_ECONOMY.lifeRegenMinutes - 1);
    expect(economy.lives).toBe(4);
    c.advance(1);
    expect(economy.lives).toBe(5);
  });

  it("blocks play at zero lives, but never in World 1", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    for (let i = 0; i < 12; i++) economy.recordFailure("3-05");
    expect(economy.lives).toBe(0);
    expect(economy.canPlay("3-05")).toBe(false);
    expect(economy.canPlay("1-01")).toBe(true);
  });
});

describe("device-clock exploit (GDD §13 Severity 2)", () => {
  it("winding the clock backward credits nothing", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    for (let i = 0; i < 12; i++) economy.recordFailure("3-05");
    expect(economy.lives).toBe(0);

    c.advance(-60 * 24);
    expect(economy.lives).toBe(0);
  });

  it("winding backward then forward again cannot mint lives", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    for (let i = 0; i < 12; i++) economy.recordFailure("3-05");
    expect(economy.lives).toBe(0);

    c.advance(-60 * 24);
    expect(economy.lives).toBe(0);
    // Back to where we started: still inside the first regen window.
    c.advance(60 * 24);
    expect(economy.lives).toBe(0);

    c.advance(DEFAULT_ECONOMY.lifeRegenMinutes);
    expect(economy.lives).toBe(1);
  });

  it("a forward leap still cannot exceed the cap", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    for (let i = 0; i < 12; i++) economy.recordFailure("3-05");
    c.advance(60 * 24 * 365);
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);
  });
});

describe("hard-lock fallback (GDD §13 Severity 2)", () => {
  /**
   * Normal regeneration is already unconditional — no gold, no ad, no network —
   * so on a healthy device nobody is ever locked out and this path never fires.
   * The case it exists for is a clock that cannot help: wound backward, where
   * the high-water defence correctly refuses to credit anything and would
   * otherwise strand the player forever.
   */
  const brokenClockLockout = () => {
    const wall = clock();
    const session = clock(0);
    const economy = new Economy(new MemoryStore(), wall.now, DEFAULT_ECONOMY, session.now);
    for (let i = 0; i < 12; i++) economy.recordFailure("3-05");
    // Wind the device back a year: regeneration will now credit nothing ever.
    wall.advance(-60 * 24 * 365);
    return { economy, wall, session };
  };

  it("regeneration alone strands a player whose clock was wound back", () => {
    const { economy, wall } = brokenClockLockout();
    expect(economy.lives).toBe(0);
    wall.advance(60 * 24 * 30); // a month of "time" that is still in the past
    expect(economy.lives).toBe(0);
    expect(economy.canPlay("3-05")).toBe(false);
  });

  it("grants a life after the grace period on a clock the player cannot set", () => {
    const { economy, session } = brokenClockLockout();
    expect(economy.grantHardLockLife()).toBe(false); // too soon

    session.advance(DEFAULT_ECONOMY.hardLockGraceMinutes);
    expect(economy.grantHardLockLife()).toBe(true);
    expect(economy.lives).toBe(1);
    expect(economy.canPlay("3-05")).toBe(true);
  });

  it("does nothing when the player already has lives", () => {
    const c = clock();
    const economy = new Economy(new MemoryStore(), c.now);
    expect(economy.grantHardLockLife()).toBe(false);
  });

  it("there is always an exit — repeated lockouts keep resolving", () => {
    const wall = clock();
    const session = clock(0);
    const economy = new Economy(new MemoryStore(), wall.now, DEFAULT_ECONOMY, session.now);

    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 12; i++) economy.recordFailure("3-05");
      wall.advance(-60 * 24 * 365); // clock stays broken
      expect(economy.lives).toBe(0);

      session.advance(DEFAULT_ECONOMY.hardLockGraceMinutes);
      expect(economy.grantHardLockLife()).toBe(true);
      expect(economy.lives).toBe(1);
    }
  });

  it("cannot be farmed by force-quitting — a restart only restarts the timer", () => {
    const wall = clock();
    const session = clock(0);
    const store = new MemoryStore();
    const first = new Economy(store, wall.now, DEFAULT_ECONOMY, session.now);
    for (let i = 0; i < 12; i++) first.recordFailure("3-05");
    wall.advance(-60 * 24 * 365);
    expect(first.lives).toBe(0);

    // Force-quit and relaunch: the session clock restarts from zero.
    const restarted = clock(0);
    const second = new Economy(
      MemoryStore.from(store.snapshot()),
      wall.now,
      DEFAULT_ECONOMY,
      restarted.now,
    );
    expect(second.grantHardLockLife()).toBe(false);
    restarted.advance(DEFAULT_ECONOMY.hardLockGraceMinutes);
    expect(second.grantHardLockLife()).toBe(true);
  });
});

describe("save schema (GDD §13 Severity 3)", () => {
  it("stamps a version on the first write", () => {
    const store = new MemoryStore();
    new Economy(store, () => T0).recordFailure("1-01");
    const raw = JSON.parse(store.read(SAVE_KEY)!);
    expect(raw.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it("refuses a save written by a newer build rather than half-reading it", () => {
    expect(migrate({ schemaVersion: SAVE_SCHEMA_VERSION + 1, levels: {} })).toBeNull();
  });

  it("falls back to a clean save on corrupt data instead of failing to launch", () => {
    const store = new MemoryStore();
    store.write(SAVE_KEY, "{not json");
    const save = loadSave(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(save.lives).toBe(DEFAULT_ECONOMY.maxLives);
  });

  it("fills missing fields on a partial save", () => {
    const migrated = migrate({ schemaVersion: SAVE_SCHEMA_VERSION });
    expect(migrated).not.toBeNull();
    expect(migrated!.levels).toEqual({});
    expect(migrated!.totalStars).toBe(0);
  });
});
