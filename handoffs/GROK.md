# GROK — Eng Lead notes

## Current — Wrong-answer recovery engine (`clearEquation`) · PR #32

**Status:** DRAFT until Codex/CoS clearance; engine contract only  
**Branch:** `feat/clear-equation-wrong-answer`  
**Base:** `master` after #31 merge (`f8b9089`)  
**Scope:** Director / `InputEvent` only. Base44 owns incorrect-answer banner, equation resistance animation, haptic/audio, and “Change answer”. No Base44 / ChronosGlobe. Do not modify superseded GitHub presentation/UI.

**Contract:** `{ type: "clearEquation" }` clears left/op/right, swap-armed, and transient equation message; renders the unchanged attempt (run, failures, targets, consumed tiles, lives, stars, operator budget preserved); restores empty slots + `affordance: "numbers"`.

**Regression:** level **1-03** — make 4 with 9−5 → submit 9+3 for target 11 → reject exactly `9 + 3 = 12, not 11` → playing / targetIndex 1 / no extra tiles / `+` unspent / stars·lives·failures unchanged → `clearEquation` restores empty slots + numbers affordance.

**Verify:** `npm test` → **495**; typecheck; build. No lint script.

---

## Docs / audits lane (`docs/readme-and-audits`) · PR #31

**Tip audited:** `8cf2f07` (`8cf2f0794fbb5f477f54727fcc51de8dbc37c6bd`)  
**Deliverables:** public `README.md` + governing-doc / CI audit in [`handoffs/DOC_AUDIT_8cf2f07.md`](./DOC_AUDIT_8cf2f07.md).  
**Rules:** draft PR only; governing docs (`LANE_MATH_GDD.md`, `ART_DIRECTION.md`, `CLAUDE.md`, `handoffs/CODEX.md`) untouched; no Base44 / ChronosGlobe; report-only CI recommendations (no new jobs/filler tests).

**Codex README pass:** audit triage **accepted**. Stale comments + CI hardening deferred. Later CI priorities (not this PR): named save-recovery gate, suite-shrink protection, ladder/curate verify.

**Merged:** PR #31 → master `f8b9089` (README Node 22 / `npm install` primary / Live wording split).

---

## Archive below — P0 SAVE-LOSS / PR #30 (merged into tip)

> Historical handoff. PR #30 is **merged** at tip `8cf2f07`. Treat MERGE HOLD / draft language below as archive, not current status.

# GROK — Eng P0 SAVE-LOSS (backup + recovery)

**Status:** CANDIDATE on GitHub only — draft PR open; **MERGE HOLD** until CoS + Codex say otherwise (Base44 sync)  
**Role of this branch:** Protect unreadable / unsupported primary from being overwritten by `emptySave` + `Economy.regenerate` → `writeSave`.  
**Branch:** `feat/save-backup-recovery`  
**Base:** `origin/master` @ `cce5602` (`cce560219117dbd321b46783aa2d7f8656298219`)  
**Impl commit (reviewed):** `82a729c` (`82a729ce2cde9b11b79bb56c7017f221edd346e0`)  
**Impl tip (this pass):** `1cc1ee5` (`1cc1ee5d32085f60129fb581c08b5affd9a907dd`) — P0-A tri-state reads + P0-B recovery-secured write gate  
**Prior finalization tip:** `bf3f62e` / docs stamp `30eb731` — throw-safety + corrupt-backup edges  
**Writer:** Grok (Eng Lead sole writer on this lane)  
**Out of scope / hard rules:** No Base44 edits; no ChronosGlobe; no healthy-save schema rewrite (`SAVE_SCHEMA_VERSION` stays **2**); never write `handoffs/CODEX.md`. Codex = exclusive Base44 writer + final product/architecture integrator. CloudAgent was unavailable — implemented on existing checkout worktree. **ready-for-non-draft = no** (MERGE HOLD).

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

**#30 finalization tip (`bf3f62e`):** lineage from protection `82a729c` + minimal throw-safety/observability. `save-recovery.test.ts` **11** tests (original 7 + 4 focused). Base44 **cloud append-only / conflict choice** = **missing**. PR #30 stays **DRAFT**. No Base44/ChronosGlobe; no Capacitor Preferences.

## Exact test / build / lint

```
npm test       →  vitest run
Test Files  59 passed (59)
Tests       494 passed (494)   # +2 P0-A/P0-B in save-recovery.test.ts (was 492 @ bf3f62e)

npm run typecheck  →  tsc --noEmit   OK
npm run build      →  vite build     OK (prebuild levels:build OK)
```

No separate lint script in `package.json`. Suite green. Protection lineage `82a729c`; harden tip `1cc1ee5`. PR #30 stays **DRAFT**.

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

## Base44 recovery contract comparison (Codex ask — GitHub #30)

Compared against Codex Base44 recovery contract clauses. Ratings: **equivalent** / **stronger** / **weaker** / **missing**. Protection SHA `82a729c`; finalization tip `bf3f62e` (throw-safety + edges).

| # | Base44 contract clause | GitHub file(s) | Test coverage | Verdict | Notes |
|---|---|---|---|---|---|
| 1 | Schema stays **v2** (no healthy-save rewrite) | `src/economy/save.ts` `SAVE_SCHEMA_VERSION = 2` | `save-recovery.test.ts` v1→v2 migrate keeps progress | **equivalent** | No schema bump in #30 |
| 2 | Preserve **first unreadable raw before parse** succeeds | `preserveRecoveryRawOnce` → `SAVE_RECOVERY_KEY` in `save.ts`; called in `loadSaveStatus` before backup try | "unsupported-newer…preserved"; "first recovery raw is not overwritten…" | **equivalent** | Exact string; never replaced by later failures |
| 3 | Keep **latest valid backup** | `SAVE_BACKUP_KEY`; `refreshBackup` on successful primary; `writeSave` mirrors by default | "healthy writeSave mirrors backup…"; malformed+backup load | **equivalent** | Backup = last validated SaveData JSON |
| 4 | **Never empty-overwrite** before recovery secured | `writeSave(..., { mirrorBackup: false })`; Economy ctor sets `mirrorBackup = !primaryUnreadable \|\| recoveredFromBackup` | "corrupt / empty write path cannot replace a valid backup"; ctor recovery survival | **equivalent** | Empty fallback commits skip backup mirror; recovery key untouched by writeSave |
| 5 | **Auto-recover from backup** when primary unreadable | `loadSaveStatus` tries backup after preserve; Economy ctor rewrites healthy primary if `recoveredFromBackup` | "malformed primary + valid backup → loads backup progress" | **equivalent** | Auto in load path; primary rewritten on recover |
| 6 | **Raw export** for player | `readRecoveryRaw` / `hasRecoveryRaw`; `main.ts` `downloadRecoverySave` + opening DOM; map chip via `hasRecoveryRaw` | Unit coverage on key presence; **UI click/download not automated** | **weaker** (UI) / **equivalent** (API) | Export API present; no e2e that the download button fires |
| 7 | **Economy regen not a destructive write** of only raw / last-good | ctor: load → optional recover write → `regenerate()` with mirrorBackup gate | "ctor clock refresh cannot destroy the only raw copy" | **equivalent** | Regen may write primary empty-shell but not clobber backup/recovery when gated |
| 8 | **No historical-recovery claim** without device evidence | `handoffs/GROK.md` history section | n/a (docs) | **equivalent** | Explicit non-claim retained |
| 9 | **Cloud / account sync append-only** + conflict choice | none — GitHub path is `LocalStorageStore` / in-memory only | n/a | **missing** | No cloud append path, no account-linked save, no conflict UI/choice. Base44 cloud append-only contract is **not** on GitHub #30; localStorage-only durability. CoS GO: rate explicitly **missing**. |

### #30 harden tip `1cc1ee5` (P0-A / P0-B — 2026-09-14)

Lineage: protection `82a729c` → throw-safety `bf3f62e` / docs `30eb731` → this tip `1cc1ee5`. Schema **v2** + economy contracts unchanged. **ready-for-non-draft = no**.

**P0-A — read failure ≠ missing key**
- `safeReadResult`: **found** / **missing** / **unavailable** (throw). `LocalStorageStore.read` propagates getItem throws / absent storage (not null-as-miss).
- `SaveLoadStatus.storageReadable`; Economy session with `storageReadable=false` sets `allowDurableWrites=false` — **never** fallback primary or backup writes (regen/commit in-memory only; `lastPersistOk=false`).
- Test: seeded primary+backup map; getItem throws, setItem succeeds; Economy+regen; backing bytes **exactly unchanged**; persistence unavailable.

**P0-B — failed recovery preserve blocks ALL durable fallback writes**
- `preserveRecoveryRawOnce` returns boolean after write+confirm; `hasRecoveryRaw` / `recoverySecured` only from confirmed existing or successful preserve (never hard-coded `true`).
- Unreadable primary + no valid backup + recovery not secured → block **SAVE_KEY** as well as backup mirror; retain `pendingRecoveryRaw` in memory for retry preserve.
- Valid backup recovery may still restore primary.
- Test: recovery key writes fail, SAVE_KEY would succeed; original primary raw unchanged; no empty backup; `hasRecoveryRaw`/`recoverySecured` false; `lastPersistOk` false; no throw.

**Also**
- `LocalStorageStore`: `lastWriteOk=false` when `localStorage` absent (optional-chaining no-op no longer looks like success).
- Generational backup: park previous validated primary into `SAVE_BACKUP_KEY` before replacing primary; bootstrap duplicate only when backup missing — do not always mirror newest into both keys.
- Explicit load status: `storageReadable`, `recoverySecured` (+ `pendingRecoveryRaw` on load result).

**Out of scope (unchanged):** cloud, Capacitor Preferences, multi-tab, Base44, ChronosGlobe, old UI.

**Files:** `src/economy/save.ts`, `src/economy/economy.ts`, `src/economy/save-recovery.test.ts`, `handoffs/GROK.md`.

**Base44 mirror delta notes:** GitHub-only. These gates are **stricter** than the prior GitHub tip (`bf3f62e`) and may diverge from live Base44 until Codex ports: (1) tri-state read / no write on read-unavailable, (2) block empty SAVE_KEY until recovery secured, (3) generational backup vs newest-duplicate mirror. Cloud append-only / conflict choice remains **missing** on GitHub. Grok will not touch Base44/ChronosGlobe.

### #30 finalization tip (CoS GO checklist)

Protection lineage **`82a729c`**. This tip adds focused edges + minimal production hardening (still draft; no merge):

**Exact behavior**
1. **Corrupt backup:** primary unreadable AND `SAVE_BACKUP_KEY` malformed JSON → no crash; `preserveRecoveryRawOnce` attempted safely first; runtime `emptySave`; corrupt backup **never** promoted; recovery raw exportable when storage permits; empty-fallback does not mirror over corrupt backup.
2. **Throwing / unavailable Storage:** `getItem`/`setItem`/`removeItem` failures (private/quota) — `LocalStorageStore` never throws; does **not** clear existing keys on failure; `writeSave` returns `boolean`; `Economy.lastPersistOk` + `LocalStorageStore.lastWriteOk` make failed persistence observable (no misleading “saved”); `readRecoveryRaw` / `hasRecoveryRaw` / `loadSaveStatus` / Economy ctor never throw solely because storage throws; in-memory session save OK when durable write fails. Throw-on-write MemoryStore: prior valid backup still loads if primary later unreadable.
3. **Resume-mirror** (small): after empty fallback, first `recordClear` re-enables backup mirror; recovery raw retained for export.

**Out of scope / residual**
- Base44 **cloud append-only / conflict choice** = **missing** (localStorage only; no cloud append, no conflict UI).
- Capacitor Preferences **not** in #30.
- Multi-tab concurrency: follow-up (untested).
- No old Track B UI beyond existing recovery export chip.

**Files this tip:** `src/economy/save.ts`, `src/economy/economy.ts`, `src/economy/save-recovery.test.ts`, `handoffs/GROK.md`.

### Untested / residual overwrite paths (honest)

| Path | Risk | Coverage gap |
|---|---|---|
| `LocalStorageStore` get/set/remove throw (quota/private) | In-memory progress never durable; looks like wipe on relaunch | **Covered** — throw sim + `lastPersistOk` / `writeSave` boolean + ThrowOnWriteStore backup-still-loads |
| Same-origin / WebView storage clear | Primary + backup + recovery all gone | Unrecoverable by design; not a code bug |
| Capacitor Preferences vs `localStorage` | Native partition drift if Preferences later wired without migration | Preferences **not wired**; no bridge test |
| Backup itself corrupt + primary unreadable | Falls through to emptySave; recovery raw still exported | **Covered** — corrupt backup JSON + unreadable primary case |
| Concurrent multi-tab writes | Last writer wins; backup may lag | Untested |
| `mirrorBackup` re-enabled after empty fallback once player earns progress | Correct intent; old recovery raw retained for export only | **Covered** — resume-mirror after `recordClear` case |
| Opening-screen / map **Export save** UX | Player discoverability | Manual / DOM only — no Playwright |
| **Cloud / account sync append-only + conflict choice** | Cross-device / multi-client durability & merge | **missing** on GitHub (localStorage only) — Base44-owned; not in #30 |

### Codex select/adapt/reject ask

Review GitHub protection `82a729c` + harden tip `1cc1ee5` (after `bf3f62e`) vs live Base44 app. Closest remaining gaps: **Base44 port of P0-A/P0-B gates**, **export UX strength**, **Capacitor** future wiring, and explicit **missing cloud/account append-only + conflict choice** on GitHub. Tri-state reads + recovery-secured write gate + generational backup covered on GitHub; PR #30 stays DRAFT / MERGE HOLD.

