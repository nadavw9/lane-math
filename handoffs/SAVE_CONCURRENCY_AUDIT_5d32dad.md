# Save concurrency audit — tip `5d32dad`

**Status:** REPORT ONLY — no behavior / schema / Economy changes in this PR.  
**Tip audited:** `5d32dad7b7789a1b546c501c913987d1efa21a86` (`5d32dad` — Merge PR #34 ci/acceptance-hardening)  
**Branch:** `docs/save-concurrency-audit-5d32dad`  
**Scope:** GitHub local persistence only (`LocalStorageStore` + `Economy`). No Base44 / ChronosGlobe / Capacitor Preferences implementation / governing docs / `handoffs/CODEX.md`.  
**Prior context:** PR #30 (merged) hardened unreadable-primary overwrite and generational backup; its residual table already named “Concurrent multi-tab writes | Last writer wins; backup may lag | Untested”.

---

## Executive summary

A single in-memory `Economy` owns one `SaveData` document for the whole session (`main.ts`). Every mutation `commit`s by **full-document** `writeSave` to `SAVE_KEY` with **no re-read of foreign writes**, **no revision/CAS field**, **no `storage` listener**, and **no `BroadcastChannel`**. Cross-tab (or cross-window same-origin) writers therefore **last-writer-wins on primary**. Because load prefers a healthy primary over backup, a stale tab can **permanently hide newer progress** even when generational backup briefly holds the advanced payload. Capacitor Preferences are **not wired**; mobile WebView risk is lower (typically one instance) but desktop multi-tab is a real progress-loss path today.

---

## 1. Exact race scenarios (ordered)

### Shared model (all scenarios)

| Piece | Behavior at `5d32dad` |
|---|---|
| Session | `const saveStore = new LocalStorageStore(); const economy = new Economy(saveStore);` once in `main.ts` |
| Read path | `Economy` ctor → `loadSaveStatus` once → in-memory `this.save`; no later reload from store |
| Write path | `Economy.commit` → `writeSave(store, next, { mirrorBackup })` — stringify entire `SaveData` |
| Generational park | If `mirrorBackup`: read current `SAVE_KEY`; if validated and ≠ payload, copy that string to `SAVE_BACKUP_KEY`; then overwrite `SAVE_KEY` |
| Load preference | Healthy primary always wins; backup only if primary unreadable |
| Cross-tab signals | **Absent** — no `window` `storage` listener; no `BroadcastChannel`; no Web Locks |
| Per-key atomicity | Each `localStorage.setItem` is sync/atomic; **read→park backup→write primary is not a multi-key transaction** |

---

### Scenario A — Stale tab overwrites advanced primary (classic progress loss)

1. Tab A loads `S0` (e.g. 10 cleared levels) into `Economy.save`.
2. Tab B loads the same `S0`.
3. Tab B clears levels / spends stars → many `commit`s → durable primary = `S_adv` (e.g. 30 cleared).
4. Tab A performs **any** commit while still holding `S0`-based memory: `recordClear`, `recordFailure`, `purchaseHint`, `restore`, `selectMode`, `setMuted`, `grantAdLife`, or even ctor/`lives`/`msUntilNextLife` **regenerate** clock refresh.
5. Tab A `writeSave`:
   - reads primary `S_adv` → parks it into `SAVE_BACKUP_KEY`;
   - writes Tab A’s stale (or barely advanced) document to `SAVE_KEY`.
6. Next cold start / new tab: `loadSaveStatus` parses healthy **stale primary** → player sees old progress. Backup still holds `S_adv` but is **not consulted**.

**Loss class:** durable progress **lost from the live path** (recoverable only if primary later becomes unreadable and backup still validates — not a product path).

---

### Scenario B — Mute / mode / regen-only stale write (low effort, high severity)

1. Same as A through step 3 (`S_adv` on disk).
2. Tab A only toggles mute, changes mode, or lets the 1s HUD `tick` path touch `lives` → `regenerate` → `commit` with updated `clockHighWater` / `lastLifeGrantedAt` on top of **stale levels map**.
3. Same park-then-overwrite as A.

**Loss class:** progress loss; trigger can be nearly idle UI.

---

### Scenario C — Divergent progress, last writer wins (no merge)

1. Both tabs load `S0`.
2. Tab A clears level `2-05` only → writes `S_A`.
3. Tab B clears level `2-06` only (from `S0`) → writes `S_B`.
4. Disk holds only `S_B`; backup may hold `S_A` (one generation). Neither document contains both clears.

**Loss class:** progress loss (one branch discarded). No field-level merge exists.

---

### Scenario D — Interleaved park/write tears backup vs primary (TOCTOU)

`writeSave` is not serialized across tabs:

1. Tab A reads primary `P`.
2. Tab B reads primary `P`.
3. Tab A parks `P` → writes `A'`.
4. Tab B parks `P` (or briefly `A'`) → writes `B'`.

Outcomes depend on interleaving; worst durable result is still last-writer primary + a single previous generation in backup. No torn JSON inside one key (setItem atomic), but **logical** torn history across the two keys.

**Loss class:** progress loss / confusion; backup may lag or hold an older peer rather than the “best” peer.

---

### Scenario E — Stale empty-fallback session vs healthy tab

1. Tab A hits unreadable primary, no valid backup; after recovery secured, `allowDurableWrites=true` but `mirrorBackup=false` until real progress — may write empty/shell primary.
2. Tab B had (or recovers) a healthy advanced save and writes `S_adv`.
3. Tab A later `commit`s empty or thin progress with `mirrorBackup` eventually true → can park `S_adv` into backup and put thin primary live again (same shape as A).

**Loss class:** progress loss on live path; recovery key raw is unrelated (export-only, never auto-restored into primary).

---

### Scenario F — Recovery-key race (benign)

1. Two tabs both see unreadable primary.
2. Both call `preserveRecoveryRawOnce`.
3. First write wins; second sees `SAVE_RECOVERY_KEY` found → returns true without replace.

**Loss class:** none for recovery raw (by design: first failure only). Does **not** protect primary concurrency.

---

### Scenario G — Same-tab sequential commits (not a race)

Single-threaded JS; `commit` is sync. No self-race inside one tab. `pagehide` only `director.abandon` — economy already persisted on each mutation.

**Loss class:** N/A for concurrency (covered by #30 kill/reopen tests).

---

## 2. Progress loss vs stale UI only

| Scenario | Durable progress loss? | Stale UI only? |
|---|---|---|
| A Stale overwrite after other tab advances | **Yes** (live primary) | Also stale UI in Tab A until reload |
| B Mute/mode/regen stale write | **Yes** | Yes |
| C Divergent clears | **Yes** (non-merged branch) | Yes |
| D Interleaved park/write | **Yes** possible | Yes |
| E Empty-fallback vs healthy | **Yes** possible | Yes |
| F Recovery key double preserve | No | No |
| G Same-tab | No | No |

**Important nuance:** Generational backup **mitigates wipe-to-empty** and keeps *one* previous validated primary, but it does **not** make the advanced save the load winner. Healthy stale primary ⇒ player-visible loss. That is stronger than “stale UI”.

There is **no** path today that refreshes in-memory `Economy` when another tab writes → UI stays stale until full reload even when disk is correct.

---

## 3. Existing protections and gaps

### Protections present (mostly #30 / single-writer)

| Protection | What it helps | What it does **not** help |
|---|---|---|
| Generational park before primary replace | Keeps previous validated primary in `SAVE_BACKUP_KEY` | Does not prefer newer progress on load; one generation only |
| `mirrorBackup: false` on empty fallback | Avoids empty shell clobbering backup | Does not stop stale healthy tab from later mirroring |
| Tri-state reads + `allowDurableWrites` | Avoids clean-launch wipe when storage unavailable / recovery not secured | Per-session flags; no cross-tab coordination |
| `preserveRecoveryRawOnce` | First unreadable raw retained for export | Unrelated to multi-tab healthy races |
| `lastPersistOk` / `lastWriteOk` | Observability for quota/private failures | Not concurrency |
| `pagehide` abandon | Telemetry/attempt hygiene | Does not re-read or lock saves |
| Single `Economy` per page | Clean in-page model | One page ≠ one origin |

### Gaps (this audit)

1. **No CAS / revision / expected-base check** before overwrite.
2. **No `storage` event** (other-tab write invisible to live session).
3. **No `BroadcastChannel`** (or equivalent) for same-origin sync.
4. **No Web Locks** (or lock key) around read-park-write.
5. **Full-document replace** — any stale field write rewrites all levels/stars/restored.
6. **No tests** simulating two `Economy` instances on one store with interleaved commits.
7. **Capacitor Preferences** still a comment-only future swap (`save.ts`); no bridge; multi-WebView / prefs vs `localStorage` partition drift remains a future risk if wired without migration + CAS.

---

## 4. Minimal recommended implementation and test scope

**Do not implement in this PR.** Suggested later slice (GitHub-only, suite floor ≥495):

### Implementation (minimal, ordered)

1. **Session base tracking + re-read before write (best-effort CAS)**  
   - Remember `lastWrittenPayload` / `lastLoadedPayload` string (or hash) on the session.  
   - Inside `writeSave` (or `Economy.commit` before write): `safeReadResult(SAVE_KEY)`; if found, validated, and ≠ session base and ≠ outgoing payload → **foreign write detected**.  
   - Policy (pick one; recommend R1 for P0):  
     - **R1 (safe):** adopt remote into memory, abort this write (or re-apply only if caller retries); surface “progress updated in another tab” later if UI wants it.  
     - **R2:** keep remote if “more progress” heuristic (cleared count / totalStars) wins; else write local — heuristic, needs careful tests.  
     - **R3:** always last-writer but never park remote into oblivion without logging — **insufficient** alone.

2. **`storage` event listener** (desktop multi-tab)  
   - On `SAVE_KEY` change from another document: reload via `loadSaveStatus` into `Economy` (or mark dirty and reload on next commit). Fixes stale UI when the *other* tab is the writer.

3. **Optional: `navigator.locks` around writeSave** when available  
   - Serializes park+write across tabs without schema change. Still pair with (1) so a lock holder doesn’t knowingly publish stale memory.

4. **Defer:** BroadcastChannel (nice-to-have if `storage` delayed); Capacitor Preferences migration; cloud/account merge (Base44-owned).

### Test scope (add focused tests only — no filler)

| Test | Mechanism |
|---|---|
| Two `Economy` (or raw `writeSave`) on shared `MemoryStore`: B advances, A commits stale → primary must not lose B’s clears under chosen policy R1 | Unit |
| After foreign write, A’s next `commit` re-reads / adopts | Unit |
| Generational backup still parks previous validated primary when write succeeds | Existing + one concurrency assert |
| Recovery-key first-wins unchanged under dual preserve | Extend existing |
| **No** Playwright multi-tab required for P0 if MemoryStore interleaving covers policy |

Do **not** lower suite floor; add only the above focused cases.

---

## 5. Is save revision / CAS-style guard required?

**Yes, for multi-tab progress safety** — some form of compare-before-write (payload equality / revision counter / Web Lock + re-read) is **required** if desktop multi-tab remains in scope. Generational backup alone is **not** sufficient because load prefers healthy primary.

**Revision field:** helpful but **not strictly required** if CAS compares full primary string (or hash) to session base. A monotonic `revision` (or `writeGeneration`) makes intent clearer and eases heuristics; see §6 for schema interaction.

**Web Locks alone:** reduce interleaving but **do not** stop a lock-holding stale tab from writing old memory — still need re-read/adopt.

---

## 6. Interaction with schema v2 / migration

| Topic | Finding |
|---|---|
| Current `SAVE_SCHEMA_VERSION` | **2** (`restored` map; v1→v2 additive) |
| Current `SaveData` | No `revision` / generation field |
| CAS via full-payload compare | **No schema bump** required |
| Additive `revision?: number` coalesced in `migrate` (default `0`) | Same pattern as `muted` — **can avoid schema bump** if treated as additive safe default; document explicitly |
| Hard `schemaVersion: 3` bump | Only if product wants an explicit migration arm; not required for minimal CAS |
| Migration races | Two tabs on v1 vs v2: `migrate` is pure; first healthy v2 write wins; backup may hold v1 or v2 JSON — both climb on load. Concurrency does not break migrate, but stale v2 overwrite still loses progress |
| #30 recovery / backup keys | Unchanged by CAS if CAS only guards `SAVE_KEY` publish; do not write recovery on healthy races |

**Recommendation:** implement best-effort CAS **without** schema bump first (string/hash base). Add optional additive revision only if UI/telemetry wants an explicit counter.

---

## 7. Proposed draft-PR file list (implementation — later)

Docs-only this PR. **Later** implementation PR (not opened here) should touch approximately:

| File | Change |
|---|---|
| `src/economy/save.ts` | Optional: `writeSave` accept expected-base / return conflict; or keep write dumb and gate in Economy |
| `src/economy/economy.ts` | Session base; re-read/adopt on conflict; expose conflict/reload hook |
| `src/main.ts` | `storage` listener → economy reload; optional `navigator.locks` wiring |
| `src/economy/save-recovery.test.ts` or new `save-concurrency.test.ts` | Focused dual-writer tests |
| `handoffs/GROK.md` | Status pointer only |

**Explicitly out of later impl unless CoS expands scope:** Base44, ChronosGlobe, Capacitor Preferences bridge, cloud merge, GDD/ART_DIRECTION/CLAUDE.md, `handoffs/CODEX.md`, save schema rewrite beyond optional additive revision.

---

## Mobile WebView / Capacitor risk

- Runtime store is still **`localStorage`** via `LocalStorageStore`. Comment: “Swapped for Capacitor Preferences later.”
- Capacitor app: typically **one** WebView ⇒ multi-tab races rare; risk is mainly **desktop browser** (GitHub Pages / PWA) and any future multi-entry WebView.
- If Preferences are wired later **without** migrating `lane-math.save.*` keys and without CAS, partition drift can look like a wipe — separate from concurrency but listed in #30 residuals.
- `pagehide` native teardown does not add extra save flush (commits already sync).

---

## Missing tests (inventory)

Already covered (#30): corrupt primary/backup, recovery once, mirror gates, throw/unavailable storage, resume-mirror, v1→v2 migrate with ~30 clears.  

**Missing for concurrency:**

1. Dual `Economy` interleaved commits on one store → stale overwrite.  
2. Assert load-after-stale-overwrite does / does not keep advanced clears under policy.  
3. Foreign write detected → adopt remote (once implemented).  
4. `storage` event handler (if added) — jsdom may need mock.  
5. No BroadcastChannel / Web Locks tests (none exist — features absent).

---

## Confirmations (this audit PR)

- No Economy / save behavior changes.  
- No save schema / `SAVE_SCHEMA_VERSION` change.  
- No Base44 / ChronosGlobe / presentation-UI / GDD / ART_DIRECTION / CLAUDE.md / `handoffs/CODEX.md` edits.  
- Suite untouched; floor ≥495 preserved by not adding filler or changing tests in this docs PR.
