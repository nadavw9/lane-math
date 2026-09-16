import { describe, expect, it } from "vitest";

import { DEFAULT_ECONOMY } from "./config.js";
import { Economy } from "./economy.js";
import {
  MemoryStore,
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_RECOVERY_KEY,
  SAVE_SCHEMA_VERSION,
  attemptWriteSave,
  loadSaveStatus,
  writeSave,
  type SaveData,
  type SaveStore,
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

  it("3. B clears one level; A clears another → adopt+retry keeps foreign + new clear", () => {
    const { store, a, b } = dualEconomies(5);
    // Shared seed has 1-01..1-05. B clears 2-05 only from that base.
    b.recordClear("2-05");
    expect(b.state.levels["2-05"]?.cleared).toBe(true);
    expect(a.state.levels["2-05"]?.cleared).toBeFalsy();

    const award = a.recordClear("2-06");
    // Domain mutation retries once on adopted foreign save — both clears survive.
    expect(award.applied).toBe(true);
    expect(a.lastCommitResult).toBe("persisted");
    expect(a.lastPersistOk).toBe(true);
    const disk = JSON.parse(store.read(SAVE_KEY)!) as SaveData;
    expect(disk.levels["2-05"]?.cleared).toBe(true);
    expect(disk.levels["2-06"]?.cleared).toBe(true);
    expect(a.state.levels["2-05"]?.cleared).toBe(true);
    expect(a.state.levels["2-06"]?.cleared).toBe(true);
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


describe("blocker: rejected actions must not report success", () => {
  it("stale clear reports applied:false when adopt retry also conflicts", () => {
    const seed = progressSave(5);
    const inner = new MemoryStore();
    writeSave(inner, seed);
    let tick = 0;
    const racing: SaveStore = {
      read(key) {
        if (key !== SAVE_KEY) return inner.read(key);
        tick += 1;
        // Every primary read returns a distinct validated foreign payload.
        return JSON.stringify({
          ...seed,
          totalStars: seed.totalStars + tick,
          clockHighWater: T0 + tick,
        });
      },
      write(key, value) {
        inner.write(key, value);
      },
    };

    const economy = new Economy(racing, () => T0);
    const award = economy.recordClear("2-06");
    expect(award.applied).toBe(false);
    expect(award.improved).toBe(false);
    expect(economy.state.levels["2-06"]?.cleared).toBeFalsy();
    expect(economy.lastCommitResult).toBe("rejected_stale");
  });

  it("stale failure never applies wrong life debit / fail count", () => {
    const seed = progressSave(10, { lives: 3 });
    const inner = new MemoryStore();
    writeSave(inner, seed);
    let tick = 0;
    const racing: SaveStore = {
      read(key) {
        if (key !== SAVE_KEY) return inner.read(key);
        tick += 1;
        return JSON.stringify({
          ...seed,
          lives: 3,
          totalStars: seed.totalStars + tick,
          clockHighWater: T0 + tick,
        });
      },
      write(key, value) {
        inner.write(key, value);
      },
    };

    const economy = new Economy(racing, () => T0);
    const beforeFails = economy.progressFor("3-05").failCount;
    const beforeLives = economy.state.lives;
    const outcome = economy.recordFailure("3-05");
    expect(outcome.applied).toBe(false);
    expect(outcome.lifeSpent).toBe(false);
    expect(outcome.failCount).toBe(beforeFails);
    expect(economy.state.lives).toBe(beforeLives);
  });

  it("stale hint/restore never return success unless present after adopt retry", () => {
    const { a, b } = dualEconomies(12);
    // B spends the bank so A's stale affordability is wrong after adopt.
    expect(b.restore(1)).toBe(true);
    while (b.starsAvailable >= 1 && b.restoredIn(1) < 4) {
      if (!b.restore(1)) break;
    }
    // Drain remaining spendable stars via hints on a cleared level.
    let guard = 0;
    while (b.starsAvailable > 0 && guard++ < 50) {
      const ok = b.purchaseHint("1-01", `drain-${guard}`, b.starsAvailable > 0 ? 1 : 99);
      if (!ok) break;
    }
    expect(b.starsAvailable).toBe(0);

    // A still thinks it has stars from the seed.
    expect(a.starsAvailable).toBeGreaterThan(0);
    expect(a.purchaseHint("1-02", "trap-shape", 1)).toBe(false);
    expect(a.hintsPurchased("1-02")).not.toContain("trap-shape");
    expect(a.restore(2)).toBe(false);
  });

  it("valid hint retry after adoption preserves foreign progress + new hint", () => {
    const { store, a, b } = dualEconomies(12);
    b.recordClear("2-04");
    expect(clearedCount(JSON.parse(store.read(SAVE_KEY)!))).toBe(13);

    expect(a.starsAvailable).toBeGreaterThan(0);
    expect(a.purchaseHint("1-03", "branch", 1)).toBe(true);
    expect(a.hintsPurchased("1-03")).toContain("branch");
    const disk = JSON.parse(store.read(SAVE_KEY)!) as SaveData;
    expect(disk.levels["2-04"]?.cleared).toBe(true);
    expect(disk.levels["1-03"]?.hintsPurchased).toContain("branch");
  });
});

describe("blocker: primary-written / backup-failed token", () => {
  it("backup fail after primary ok → next healthy commit does not self-conflict", () => {
    const map = new Map<string, string>();
    let failBackup = false;
    const store: SaveStore = {
      read(key) {
        return map.has(key) ? map.get(key)! : null;
      },
      write(key, value) {
        if (failBackup && key === SAVE_BACKUP_KEY) throw new Error("backup boom");
        map.set(key, value);
      },
    };

    // First durable write: primary + backup bootstrap both ok.
    const seed = progressSave(4);
    expect(writeSave(store, seed)).toBe(true);
    expect(map.has(SAVE_BACKUP_KEY)).toBe(true);

    // Remove backup so the next write takes the bootstrap path.
    map.delete(SAVE_BACKUP_KEY);
    failBackup = true;

    const economy = new Economy(store, () => T0);
    expect(economy.expectedPrimaryToken).toBeTruthy();

    economy.setMuted(true);
    // Primary must have been written even though backup bootstrap failed.
    expect(JSON.parse(map.get(SAVE_KEY)!).muted).toBe(true);
    expect(economy.lastPersistOk).toBe(false);
    expect(economy.lastCommitResult).toBe("persist_failed");
    // Token advanced to the written primary — critical for no self-conflict.
    expect(economy.expectedPrimaryToken).toBe(map.get(SAVE_KEY)!);

    failBackup = false;
    economy.selectMode("casual");
    expect(economy.lastCommitResult).toBe("persisted");
    expect(economy.lastPersistOk).toBe(true);
    expect(JSON.parse(map.get(SAVE_KEY)!).selectedMode).toBe("casual");
    expect(JSON.parse(map.get(SAVE_KEY)!).muted).toBe(true);
  });
});

describe("blocker: expected-token preflight fail-closed", () => {
  it("unavailable primary read does not write when expected token supplied", () => {
    const writes: string[] = [];
    const store: SaveStore = {
      read() {
        throw new Error("unavailable");
      },
      write(key, value) {
        writes.push(key);
        void value;
      },
    };
    const outcome = attemptWriteSave(store, progressSave(2), {
      expectedPrimary: JSON.stringify(progressSave(2)),
    });
    expect(outcome.status).toBe("failed");
    expect(writes).toEqual([]);
  });

  it("expected non-null + primary missing does not resurrect stale", () => {
    const writes: string[] = [];
    const store: SaveStore = {
      read() {
        return null;
      },
      write(key) {
        writes.push(key);
      },
    };
    const outcome = attemptWriteSave(store, progressSave(3), {
      expectedPrimary: JSON.stringify(progressSave(1)),
    });
    expect(outcome.status).toBe("failed");
    expect(writes).toEqual([]);
  });

  it("different corrupt raw does not overwrite before recovery secured", () => {
    const map = new Map<string, string>();
    map.set(SAVE_KEY, "{not-json-foreign");
    const writes: Array<{ key: string; value: string }> = [];
    const store: SaveStore = {
      read(key) {
        return map.has(key) ? map.get(key)! : null;
      },
      write(key, value) {
        writes.push({ key, value });
        map.set(key, value);
      },
    };

    const outcome = attemptWriteSave(store, progressSave(4), {
      expectedPrimary: JSON.stringify(progressSave(4)),
    });
    expect(outcome.status).toBe("failed");
    // Recovery may be secured, but primary/backup must not be replaced.
    expect(writes.every((w) => w.key === SAVE_RECOVERY_KEY)).toBe(true);
    expect(map.get(SAVE_KEY)).toBe("{not-json-foreign");
    expect(map.has(SAVE_BACKUP_KEY)).toBe(false);
    expect(map.has(SAVE_RECOVERY_KEY)).toBe(true);
  });
});
