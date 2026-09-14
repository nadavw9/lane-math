# GROK — Eng P0 SAVE-LOSS (backup + recovery)

**Status:** CANDIDATE on GitHub only — draft PR open; **MERGE HOLD** until CoS + Codex say otherwise (Base44 sync)  
**Role of this branch:** Protect unreadable / unsupported primary from being overwritten by `emptySave` + `Economy.regenerate` → `writeSave`.  
**Branch:** `feat/save-backup-recovery`  
**Base:** `origin/master` @ `cce5602` (`cce560219117dbd321b46783aa2d7f8656298219`)  
**Impl commit (reviewed):** `82a729c` (`82a729ce2cde9b11b79bb56c7017f221edd346e0`)  
**Docs/handoff tip:** `b0e066b` (`b0e066bfbe49f0aaacef1621d338e133164a913a`)  
**Writer:** Grok (Eng Lead sole writer on this lane)  
**Out of scope / hard rules:** No Base44 edits; no ChronosGlobe; no healthy-save schema rewrite (`SAVE_SCHEMA_VERSION` stays **2**); never write `handoffs/CODEX.md`. Codex = exclusive Base44 writer + final product/architecture integrator. CloudAgent was unavailable — implemented on existing checkout worktree.

## Candidate framing (CoS / Nadav / Codex)

- GitHub-only candidate. **MERGE HOLD** for CoS/Codex Base44 sync — Grok will not merge.
- **Base44 sync needed = Yes (Codex-owned)** — this ports Base44-validated protection concepts into the GitHub save path; Codex decides live Base44 wiring.
- Do **not** claim Nadav’s ~30-level historical save is recoverable without device evidence.

## Explicit Codex ask

Please review **impl `82a729c`** against the current Base44 app, then **select / adapt / reject**.  
Wire nothing to live Base44 from this PR until you decide. Grok will not touch Base44 or ChronosGlobe.

## Bug (reproduced in tests)

Previous GitHub path in `src/economy/save.ts` + `Economy` ctor:

1. `loadSave` on malformed / unsupported primary → `emptySave(now)`
2. ctor calls `regenerate()` which can advance clock and `commit` / `writeSave`
3. That **overwrote** the unreadable primary — destroying the only raw copy

## Protection (constants unchanged for primary)

| Key | Role |
|-----|------|
| `SAVE_KEY = "lane-math.save.v1"` | Primary (unchanged) |
| `SAVE_SCHEMA_VERSION = 2` | Unchanged — no healthy-save schema rewrite |
| `SAVE_BACKUP_KEY = "lane-math.save.backup.v1"` | Last **validated** primary (parse+migrate success / healthy write) |
| `SAVE_RECOVERY_KEY = "lane-math.save.recovery.v1"` | **First** unreadable raw payload (exact string); **never** replaced by later failures |

Behavior:

1. Successful primary parse+migrate → refresh backup from validated migrated JSON.
2. Unreadable primary → if recovery empty, store exact raw once; then try backup.
3. Valid backup → working save + rewrite healthy primary; expose `recoveredFromBackup`.
4. No valid backup → `emptySave` for runtime; commits use `mirrorBackup: false` so recovery raw / any leftover backup is not replaced by an empty shell; ctor clock refresh cannot destroy the only raw.
5. UI: map chip **Export save** + opening DOM button when recovery raw exists; `laneMath.downloadRecoverySave`.

## Commits + changed files

**Impl `82a729c`:**

- `src/economy/save.ts` — backup/recovery keys, `loadSaveStatus`, `writeSave({ mirrorBackup })`
- `src/economy/economy.ts` — load status, mirrorBackup gate on commit, recovery getters
- `src/economy/save-recovery.test.ts` — required regression suite (7 tests)
- `src/map/model.ts` / `src/map/map-screen.ts` — `hasRecoveryRaw` + Export save chip
- `src/main.ts` — download recovery + opening affordance + `laneMath` hooks

## Exact test / build / lint

```
npm test       →  vitest run
Test Files  59 passed (59)
Tests       488 passed (488)

npm run typecheck  →  tsc --noEmit   OK
npm run build      →  vite build     OK (prebuild levels:build OK)
```

No separate lint script in `package.json`. Suite green.

## History inspect (report only — no wild claims)

Inspected `git log` / blame on `src/economy/save.ts`:

- Save module introduced in `3d4eb60` (2026-08-31) already at **schema 2** with key `lane-math.save.v1`; v1→v2 migration arm present (additive `restored: {}`).
- `LocalStorageStore` catches quota / private-mode write failures silently (same commit) — writes can fail without crashing.
- Comment still says Capacitor Preferences is a future swap; runtime uses browser `localStorage` (`main.ts` → `LocalStorageStore`). Capacitor appears elsewhere (ads/haptics), not as save backend yet.
- `loadSave` → `emptySave` on corrupt/unsupported has existed since introduction — no historical backup key.

**Plausible causes of Nadav’s ~30-level loss** (not proven for his device):

1. **Primary became unreadable** (truncated write, partial JSON, storage eviction) → emptySave → regenerate overwrote the only copy (**this bug**).
2. **Unsupported newer schema** refused by `migrate` → same wipe path.
3. **Silent localStorage write failure** (quota / private mode) — in-memory progress never durable; looks like a wipe on relaunch (different mechanism; backup helps after a successful prior write).
4. **Site-data clear / WebView storage reset** — both primary and (once shipped) backup/recovery would be gone; not recoverable from app storage alone.
5. Unlikely: healthy v1→v2 migrate alone wiping ~30 clears — migration is additive and covered by regression.

**Do not claim** the historical save is recoverable without evidence from the device (e.g. recovery key contents, backup key, or an exported raw).

## Unresolved risks / escalate-to-Codex

- Backup/recovery live in the same `localStorage` origin — full storage clear still loses everything; cloud/account sync not in scope.
- Opening DOM chip is intentionally minimal (not Wolf Academy chrome); Codex may restyle or relocate.
- `mirrorBackup: false` empty fallback: once the player earns new progress, mirroring resumes — old recovery raw remains for export but is not auto-restored into primary.
- Capacitor Preferences not wired — native builds still on whatever bridge uses `localStorage` today.

**Escalate if:** Base44 duplication conflict, schema direction change, or evidence that loss was outside this overwrite path.

## Base44 sync needed

**Yes (Codex decides).** Grok did not touch Base44 or ChronosGlobe.

### Deepen (2026-09-14 CoS follow-up)

Confirmed from git history (still **no device-evidence recovery claim**):
- **`SAVE_KEY` never renamed** — always `lane-math.save.v1` from introduction (`3d4eb60`); key name does not track schema number.
- **Schema was already 2 at introduction** — no GitHub commit ever shipped `SAVE_SCHEMA_VERSION = 1` as the written constant; the v1→v2 migrate arm is for any older payloads that might exist with `schemaVersion: 1`.
- **Deploy/origin:** browser path is `LocalStorageStore` via `main.ts`; Capacitor Preferences **not** wired for saves. Domain/origin or WebView partition changes would look like a wipe (all keys gone) and are outside backup/recovery.
- **Rollback rejecting newer schema:** older builds that refuse current schema still hit emptySave; post-#30 recovery/backup keys mitigate wipe of the raw/last-good **on builds that include #30**. Pre-#30 devices that already overwrote primary with empty remain unrecovered without an external export.
- **#28 economy** is already on `master` @ `cce5602` (restore `[1,1,2,2]`, gates `10/20/30`, hints `1/2/3`, schema v2) — orthogonal to save-loss; listed for CoS/Codex contract clarity only.

