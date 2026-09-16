import { describe, expect, it } from "vitest";

import { DEFAULT_ECONOMY } from "./config.js";
import {
  MemoryStore,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_RECOVERY_KEY,
  SAVE_SCHEMA_VERSION,
  emptySave,
  loadSaveStatus,
  migrate,
  reviewHarnessEnabled,
  writeSave,
  type SaveData,
} from "./save.js";

const T0 = 1_700_000_000_000;

function validSave(extras: Partial<SaveData> = {}): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels: {
      "1-01": {
        bestStars: 2,
        failCount: 1,
        cleared: true,
        firstFailureUsed: true,
        hintsPurchased: ["carry"],
        ratingAttempt: "tainted",
      },
    },
    lives: 5,
    lastLifeGrantedAt: T0,
    clockHighWater: T0,
    totalStars: 4,
    starsSpent: 1,
    restored: { "1": 2 },
    selectedMode: "normal",
    muted: false,
    ...extras,
  };
}

describe("Track A — review harness gating", () => {
  it("is off by default in prod-like env", () => {
    expect(reviewHarnessEnabled({ DEV: false })).toBe(false);
    expect(reviewHarnessEnabled({ DEV: false, VITE_LANE_MATH_HARNESS: "0" })).toBe(false);
    expect(reviewHarnessEnabled({})).toBe(false);
  });

  it("enables for DEV or explicit VITE_LANE_MATH_HARNESS=1", () => {
    expect(reviewHarnessEnabled({ DEV: true })).toBe(true);
    expect(reviewHarnessEnabled({ DEV: false, VITE_LANE_MATH_HARNESS: "1" })).toBe(true);
  });
});

describe("Track A — strict save-shape validation", () => {
  it("preserves valid v2 and applies additive defaults for missing fields", () => {
    const climbed = migrate({ schemaVersion: SAVE_SCHEMA_VERSION });
    expect(climbed).toEqual({
      schemaVersion: 2,
      levels: {},
      lives: 0,
      lastLifeGrantedAt: 0,
      clockHighWater: 0,
      totalStars: 0,
      starsSpent: 0,
      restored: {},
      selectedMode: "normal",
      muted: false,
    });
  });

  it("climbs v1 → v2 with restored default and keeps progress", () => {
    const v1 = {
      schemaVersion: 1,
      levels: {
        "1-01": {
          bestStars: 3,
          failCount: 0,
          cleared: true,
          firstFailureUsed: false,
          hintsPurchased: [],
        },
      },
      lives: 4,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 3,
      starsSpent: 0,
      selectedMode: "casual",
      muted: true,
    };
    const climbed = migrate(v1);
    expect(climbed).not.toBeNull();
    expect(climbed!.schemaVersion).toBe(2);
    expect(climbed!.restored).toEqual({});
    expect(climbed!.levels["1-01"]?.bestStars).toBe(3);
    expect(climbed!.levels["1-01"]?.ratingAttempt).toBe("tainted");
    expect(climbed!.selectedMode).toBe("casual");
    expect(climbed!.muted).toBe(true);
  });

  it("rejects explicit invalid scalars / enums (fail-closed, no silent normalize)", () => {
    expect(migrate({ ...validSave(), lives: -1 })).toBeNull();
    expect(migrate({ ...validSave(), lives: 1.5 })).toBeNull();
    expect(migrate({ ...validSave(), lives: Number.NaN })).toBeNull();
    expect(migrate({ ...validSave(), totalStars: -3 })).toBeNull();
    expect(migrate({ ...validSave(), lastLifeGrantedAt: Number.POSITIVE_INFINITY })).toBeNull();
    expect(migrate({ ...validSave(), selectedMode: "hard" })).toBeNull();
    expect(migrate({ ...validSave(), muted: 1 })).toBeNull();
    expect(migrate({ ...validSave(), muted: "false" })).toBeNull();
  });

  it("rejects invalid level / restoration records", () => {
    expect(
      migrate({
        ...validSave(),
        levels: {
          "1-01": {
            bestStars: 4,
            failCount: 0,
            cleared: true,
            firstFailureUsed: false,
            hintsPurchased: [],
            ratingAttempt: "tainted",
          },
        },
      }),
    ).toBeNull();
    expect(
      migrate({
        ...validSave(),
        levels: {
          "1-01": {
            bestStars: 2,
            failCount: 0,
            cleared: true,
            firstFailureUsed: false,
            hintsPurchased: [1],
            ratingAttempt: "tainted",
          },
        },
      }),
    ).toBeNull();
    expect(
      migrate({
        ...validSave(),
        levels: {
          "1-01": {
            bestStars: 2,
            failCount: 0,
            cleared: true,
            firstFailureUsed: false,
            hintsPurchased: [],
            ratingAttempt: "blessed",
          },
        },
      }),
    ).toBeNull();
    expect(migrate({ ...validSave(), levels: [] })).toBeNull();
    expect(migrate({ ...validSave(), restored: { "1": 5 } })).toBeNull();
    expect(migrate({ ...validSave(), restored: { "1": -1 } })).toBeNull();
    expect(migrate({ ...validSave(), restored: [] })).toBeNull();
  });

  it("does not impose arbitrary lifetime caps (lives may exceed maxLives)", () => {
    const high = migrate({ ...validSave(), lives: DEFAULT_ECONOMY.maxLives + 50 });
    expect(high?.lives).toBe(DEFAULT_ECONOMY.maxLives + 50);
  });

  it("ignores unknown top-level keys when known fields are valid", () => {
    const raw = { ...validSave(), futureCloudEpoch: 99, nested: { x: 1 } };
    const climbed = migrate(raw);
    expect(climbed).not.toBeNull();
    expect(climbed!.totalStars).toBe(4);
    expect("futureCloudEpoch" in climbed!).toBe(false);
  });

  it("still rejects when an unknown key coexists with an invalid known field", () => {
    expect(migrate({ ...validSave(), futureCloudEpoch: 1, lives: -9 })).toBeNull();
  });
});

describe("Track A — recovery invariants under strict validation", () => {
  it("never promotes an invalid primary; keeps valid backup intact", () => {
    const store = new MemoryStore();
    const good = validSave({ totalStars: 12, levels: {
      "1-01": {
        bestStars: 3,
        failCount: 0,
        cleared: true,
        firstFailureUsed: false,
        hintsPurchased: [],
        ratingAttempt: "clean",
      },
    }});
    writeSave(store, good);
    const backupBefore = store.read(SAVE_BACKUP_KEY);

    // Explicit malformed known field — must fail migrate, not normalize.
    store.write(
      SAVE_KEY,
      JSON.stringify({
        ...good,
        lives: -1,
        totalStars: 99999,
      }),
    );

    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(true);
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.save.totalStars).toBe(12);
    expect(loaded.save.lives).not.toBe(-1);
    expect(store.read(SAVE_BACKUP_KEY)).toBe(backupBefore);
    expect(store.read(SAVE_RECOVERY_KEY)).toBeTruthy();
    // Invalid candidate must not become the working save.
    expect(loaded.save.totalStars).not.toBe(99999);
  });

  it("rejects invalid cloud/import-shaped payloads at the same structural boundary", () => {
    const hostile = {
      schemaVersion: 2,
      levels: { "1-01": { bestStars: 3, failCount: 0, cleared: true, firstFailureUsed: false, hintsPurchased: [], ratingAttempt: "clean" } },
      lives: 5,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: "∞",
      starsSpent: 0,
      restored: {},
      selectedMode: "normal",
      muted: false,
      cloudAuthority: true,
    };
    expect(migrate(hostile)).toBeNull();
  });

  it("corrupt JSON primary still recoverable via #30 backup path", () => {
    const store = new MemoryStore();
    const good = validSave({ totalStars: 8 });
    writeSave(store, good);
    store.write(SAVE_KEY, "{not-json");
    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(true);
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.save.totalStars).toBe(8);
    expect(loaded.hasRecoveryRaw).toBe(true);
  });

  it("valid v1 and v2 still migrate/load without silent progress reduction", () => {
    const store = new MemoryStore();
    const v1 = {
      schemaVersion: 1,
      levels: {
        "2-03": {
          bestStars: 2,
          failCount: 1,
          cleared: true,
          firstFailureUsed: true,
          hintsPurchased: ["hint-a"],
        },
      },
      lives: 3,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 20,
      starsSpent: 2,
      selectedMode: "expert",
      muted: false,
    };
    store.write(SAVE_KEY, JSON.stringify(v1));
    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(false);
    expect(loaded.save.totalStars).toBe(20);
    expect(loaded.save.levels["2-03"]?.bestStars).toBe(2);
    expect(loaded.save.levels["2-03"]?.hintsPurchased).toEqual(["hint-a"]);
    expect(loaded.save.schemaVersion).toBe(2);

    const v2 = validSave({ totalStars: 7 });
    store.write(SAVE_KEY, JSON.stringify(v2));
    const loaded2 = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded2.save.totalStars).toBe(7);
  });

  it("throwing/unavailable storage fails closed (not clean first launch writes)", () => {
    const store = {
      read(_key: string): string | null {
        throw new Error("denied");
      },
      write(): void {
        throw new Error("denied");
      },
    };
    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.storageReadable).toBe(false);
    expect(loaded.recoveredFromBackup).toBe(false);
    expect(loaded.primaryUnreadable).toBe(false);
    expect(loaded.save).toEqual(emptySave(T0, DEFAULT_ECONOMY.maxLives));
  });
});
