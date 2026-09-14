import { describe, expect, it } from "vitest";

import { DEFAULT_ECONOMY } from "./config.js";
import { Economy } from "./economy.js";
import {
  MemoryStore,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_RECOVERY_KEY,
  SAVE_SCHEMA_VERSION,
  emptySave,
  loadSaveStatus,
  migrate,
  readRecoveryRaw,
  writeSave,
  type SaveData,
} from "./save.js";

const T0 = 1_700_000_000_000;

function clearedLevels(count: number): Record<string, SaveData["levels"][string]> {
  const levels: Record<string, SaveData["levels"][string]> = {};
  // ~30 cleared: worlds 1–3 fully, then a few of world 4.
  const ids: string[] = [];
  for (let w = 1; w <= 4; w++) {
    for (let s = 1; s <= 10; s++) ids.push(`${w}-${String(s).padStart(2, "0")}`);
  }
  for (let i = 0; i < count; i++) {
    const id = ids[i]!;
    levels[id] = {
      bestStars: 2,
      failCount: 0,
      cleared: true,
      firstFailureUsed: false,
      hintsPurchased: [],
      ratingAttempt: "tainted",
    };
  }
  return levels;
}

function progressSave(levelCount: number, extras: Partial<SaveData> = {}): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    levels: clearedLevels(levelCount),
    lives: 5,
    lastLifeGrantedAt: T0,
    clockHighWater: T0,
    totalStars: levelCount * 2,
    starsSpent: 0,
    restored: {},
    selectedMode: "normal",
    muted: false,
    ...extras,
  };
}

describe("save backup / recovery (P0 SAVE-LOSS)", () => {
  it("migrates a v1 save with ~30 cleared levels and keeps progress", () => {
    const levels = clearedLevels(30);
    const v1 = {
      schemaVersion: 1,
      levels,
      lives: 4,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 60,
      starsSpent: 6,
      selectedMode: "normal" as const,
      muted: false,
    };
    const climbed = migrate(v1);
    expect(climbed).not.toBeNull();
    expect(climbed!.schemaVersion).toBe(2);
    expect(climbed!.restored).toEqual({});
    expect(Object.values(climbed!.levels).filter((p) => p.cleared).length).toBe(30);
    expect(climbed!.totalStars).toBe(60);

    const store = new MemoryStore();
    store.write(SAVE_KEY, JSON.stringify(v1));
    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(false);
    expect(loaded.recoveredFromBackup).toBe(false);
    expect(Object.values(loaded.save.levels).filter((p) => p.cleared).length).toBe(30);
    // Successful parse refreshes backup from validated migrated save.
    const backup = JSON.parse(store.read(SAVE_BACKUP_KEY)!);
    expect(backup.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Object.values(backup.levels as Record<string, { cleared: boolean }>).filter((p) => p.cleared).length).toBe(30);
  });

  it("malformed primary + valid backup → loads backup progress", () => {
    const store = new MemoryStore();
    const good = progressSave(12);
    writeSave(store, good); // primary + backup
    store.write(SAVE_KEY, "{not-json");

    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(true);
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.hasRecoveryRaw).toBe(true);
    expect(Object.values(loaded.save.levels).filter((p) => p.cleared).length).toBe(12);
    expect(readRecoveryRaw(store)).toBe("{not-json");

    const economy = new Economy(store, () => T0);
    expect(economy.recoveredFromBackup).toBe(true);
    expect(Object.values(economy.state.levels).filter((p) => p.cleared).length).toBe(12);
    // Primary rewritten healthy from backup recovery.
    expect(JSON.parse(store.read(SAVE_KEY)!).totalStars).toBe(24);
  });

  it("unsupported-newer primary is preserved in recovery and not clobbered", () => {
    const store = new MemoryStore();
    const newer = JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION + 5,
      levels: clearedLevels(8),
      lives: 3,
      lastLifeGrantedAt: T0,
      clockHighWater: T0,
      totalStars: 16,
      starsSpent: 0,
      restored: {},
      selectedMode: "normal",
      muted: false,
    });
    store.write(SAVE_KEY, newer);

    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(true);
    expect(loaded.recoveredFromBackup).toBe(false);
    expect(readRecoveryRaw(store)).toBe(newer);

    // Economy ctor + regenerate must not destroy recovery raw.
    new Economy(store, () => T0 + 60_000);
    expect(store.read(SAVE_RECOVERY_KEY)).toBe(newer);
  });

  it("ctor clock refresh cannot destroy the only raw copy (recovery survives)", () => {
    const store = new MemoryStore();
    const raw = "totally-corrupt<<<";
    store.write(SAVE_KEY, raw);
    // No backup. emptySave path + regenerate with advanced clock.
    let t = T0;
    const economy = new Economy(store, () => t);
    t += 10 * 60_000; // advance so regenerate would commit clock refresh
    expect(economy.lives).toBe(DEFAULT_ECONOMY.maxLives);
    expect(store.read(SAVE_RECOVERY_KEY)).toBe(raw);
    // Primary may now be an empty/healthy shell — recovery still holds the only raw.
    expect(readRecoveryRaw(store)).toBe(raw);
  });

  it("corrupt / empty write path cannot replace a valid backup", () => {
    const store = new MemoryStore();
    const good = progressSave(20);
    writeSave(store, good);
    expect(JSON.parse(store.read(SAVE_BACKUP_KEY)!).totalStars).toBe(40);

    store.write(SAVE_KEY, "garbage");
    // Simulate empty fallback commit that must not mirror into backup.
    writeSave(store, emptySave(T0, DEFAULT_ECONOMY.maxLives), { mirrorBackup: false });
    expect(JSON.parse(store.read(SAVE_BACKUP_KEY)!).totalStars).toBe(40);
    expect(Object.keys(JSON.parse(store.read(SAVE_BACKUP_KEY)!).levels)).toHaveLength(20);

    // Economy empty-fallback path likewise leaves backup alone when primary is junk and backup valid…
    // (backup still valid → recovers rather than empty; separate assertion:)
    const store2 = new MemoryStore();
    writeSave(store2, good);
    store2.write(SAVE_KEY, "garbage");
    const eco = new Economy(store2, () => T0);
    expect(eco.recoveredFromBackup).toBe(true);
    expect(JSON.parse(store2.read(SAVE_BACKUP_KEY)!).totalStars).toBe(40);
  });

  it("first recovery raw is not overwritten by a second different failure", () => {
    const store = new MemoryStore();
    const first = '{"schemaVersion":999,"broken":true}';
    const second = "%%%%another-failure%%%%";
    store.write(SAVE_KEY, first);
    loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(store.read(SAVE_RECOVERY_KEY)).toBe(first);

    store.write(SAVE_KEY, second);
    loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(store.read(SAVE_RECOVERY_KEY)).toBe(first);
  });

  it("healthy writeSave mirrors backup; load refreshes backup from validated primary", () => {
    const store = new MemoryStore();
    const first = progressSave(5);
    writeSave(store, first);
    expect(store.read(SAVE_BACKUP_KEY)).toBe(store.read(SAVE_KEY));

    const second = progressSave(9, { totalStars: 18 });
    store.write(SAVE_KEY, JSON.stringify(second));
    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.save.totalStars).toBe(18);
    expect(JSON.parse(store.read(SAVE_BACKUP_KEY)!).totalStars).toBe(18);
  });
});
