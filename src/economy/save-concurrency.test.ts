import { describe, expect, it } from "vitest";

import { DEFAULT_ECONOMY } from "./config.js";
import { Economy } from "./economy.js";
import {
  MemoryStore,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_RECOVERY_KEY,
  SAVE_SCHEMA_VERSION,
  loadSaveStatus,
  writeSave,
  type SaveData,
} from "./save.js";

const T0 = 1_700_000_000_000;

function clearedLevels(count: number): Record<string, SaveData["levels"][string]> {
  const levels: Record<string, SaveData["levels"][string]> = {};
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

function clearedCount(save: SaveData): number {
  return Object.values(save.levels).filter((p) => p.cleared).length;
}

/** Two Economy instances sharing one MemoryStore (simulates two tabs). */
function dualEconomies(seedLevels: number) {
  const store = new MemoryStore();
  writeSave(store, progressSave(seedLevels));
  const a = new Economy(store, () => T0);
  const b = new Economy(store, () => T0);
  return { store, a, b };
}

describe("save concurrency guard (dual Economy / shared MemoryStore)", () => {
  it("1. B advances; A mutes → B's progress survives on primary", () => {
    const { store, a, b } = dualEconomies(10);
    expect(clearedCount(b.state)).toBe(10);

    b.recordClear("2-01");
    expect(b.lastCommitResult).toBe("persisted");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(11);

    const primaryBeforeMute = store.read(SAVE_KEY)!;
    const backupBeforeMute = store.read(SAVE_BACKUP_KEY);

    a.setMuted(true);
    expect(a.lastPersistOk).toBe(false);
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(a.muted).toBe(false); // adopted B — B did not mute
    expect(clearedCount(a.state)).toBe(11);

    expect(store.read(SAVE_KEY)).toBe(primaryBeforeMute);
    expect(store.read(SAVE_BACKUP_KEY)).toBe(backupBeforeMute);
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(11);
  });

  it("2. B advances; A changes mode → B survives", () => {
    const { store, a, b } = dualEconomies(8);
    b.recordClear("1-09");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(9);

    a.selectMode("casual");
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(a.lastPersistOk).toBe(false);
    expect(a.selectedMode).toBe("normal"); // adopted B
    expect(clearedCount(a.state)).toBe(9);
    expect(JSON.parse(store.read(SAVE_KEY)!).selectedMode).toBe("normal");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(9);
  });

  it("3. B clears one level; A clears another from stale → no silent overwrite", () => {
    const { store, a, b } = dualEconomies(5);
    // Shared seed has 1-01..1-05. B clears 2-05 only from that base.
    b.recordClear("2-05");
    expect(b.state.levels["2-05"]?.cleared).toBe(true);
    expect(a.state.levels["2-05"]?.cleared).toBeFalsy();

    a.recordClear("2-06");
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(a.lastPersistOk).toBe(false);
    // Disk keeps B's branch only — A's 2-06 must not silently replace it.
    const disk = JSON.parse(store.read(SAVE_KEY)!) as SaveData;
    expect(disk.levels["2-05"]?.cleared).toBe(true);
    expect(disk.levels["2-06"]?.cleared).toBeFalsy();
    // A adopted B — has 2-05, not its rejected 2-06.
    expect(a.state.levels["2-05"]?.cleared).toBe(true);
    expect(a.state.levels["2-06"]?.cleared).toBeFalsy();
  });

  it("4. Regen from stale cannot overwrite newer progress", () => {
    const store = new MemoryStore();
    writeSave(store, progressSave(10, { lives: 3, lastLifeGrantedAt: T0, clockHighWater: T0 }));
    let tA = T0;
    let tB = T0;
    const a = new Economy(store, () => tA);
    const b = new Economy(store, () => tB);

    b.recordClear("3-01");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(11);

    const primaryBefore = store.read(SAVE_KEY)!;
    // Stale A advances wall clock so regenerate would commit clock/lives refresh.
    tA += 30 * 60_000;
    expect(a.lives).toBeGreaterThanOrEqual(3);
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(a.lastPersistOk).toBe(false);
    expect(store.read(SAVE_KEY)).toBe(primaryBefore);
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(11);
    expect(clearedCount(a.state)).toBe(11);
  });

  it("5. Rejected stale write does not replace primary or backup", () => {
    const { store, a, b } = dualEconomies(12);
    b.recordClear("2-03");
    const primary = store.read(SAVE_KEY)!;
    const backup = store.read(SAVE_BACKUP_KEY)!;
    expect(backup).toBeTruthy();

    a.setMuted(true);
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(store.read(SAVE_KEY)).toBe(primary);
    expect(store.read(SAVE_BACKUP_KEY)).toBe(backup);
  });

  it("6. After adopt/reload newest, later valid write succeeds", () => {
    const { store, a, b } = dualEconomies(6);
    b.recordClear("1-07");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(7);

    a.setMuted(true);
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(clearedCount(a.state)).toBe(7);

    // Now A is synced to B's primary — mute on top of newest must persist.
    a.setMuted(true);
    expect(a.lastCommitResult).toBe("persisted");
    expect(a.lastPersistOk).toBe(true);
    expect(a.muted).toBe(true);
    const disk = JSON.parse(store.read(SAVE_KEY)!) as SaveData;
    expect(disk.muted).toBe(true);
    expect(clearedCount(disk)).toBe(7);
  });

  it("7. Existing corrupt-primary / recovery-once / backup recovery unchanged", () => {
    const store = new MemoryStore();
    const good = progressSave(12);
    writeSave(store, good);
    store.write(SAVE_KEY, "{not-json");

    const loaded = loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(loaded.primaryUnreadable).toBe(true);
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.hasRecoveryRaw).toBe(true);
    expect(clearedCount(loaded.save)).toBe(12);

    const economy = new Economy(store, () => T0);
    expect(economy.recoveredFromBackup).toBe(true);
    expect(clearedCount(economy.state)).toBe(12);
    expect(JSON.parse(store.read(SAVE_KEY)!).totalStars).toBe(24);

    // Recovery-once: second failure does not replace first raw.
    const first = store.read(SAVE_RECOVERY_KEY)!;
    store.write(SAVE_KEY, "%%%%another-failure%%%%");
    loadSaveStatus(store, T0, DEFAULT_ECONOMY.maxLives);
    expect(store.read(SAVE_RECOVERY_KEY)).toBe(first);
  });

  it("adoptFromStore storage-event integration adopts foreign without wiping backup", () => {
    const { store, a, b } = dualEconomies(4);
    const backupBefore = store.read(SAVE_BACKUP_KEY);

    b.recordClear("1-05");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(5);

    // Simulate other-tab storage notification (MemoryStore has no events).
    expect(a.adoptFromStore(SAVE_KEY)).toBe(true);
    expect(a.lastCommitResult).toBe("rejected_stale");
    expect(clearedCount(a.state)).toBe(5);
    expect(store.read(SAVE_BACKUP_KEY)).toBe(backupBefore);
    // Idempotent when already synced.
    expect(a.adoptFromStore(SAVE_KEY)).toBe(false);
    expect(a.adoptFromStore("other-key")).toBe(false);
  });
});
