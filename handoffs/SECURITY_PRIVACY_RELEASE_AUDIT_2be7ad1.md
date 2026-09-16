# Security, Privacy & Release Reliability audit — tip `2be7ad1`

**Status:** REPORT ONLY (S0) — no behavior / schema / Economy / CI / workflow / dependency / test changes in this PR.  
**Tip audited:** `2be7ad114cfbe73af2c8aef5adb64ee732024e06` (`2be7ad1` — Merge PR #36 `feat/save-concurrency-guard`)  
**Branch:** `docs/security-privacy-release-audit-2be7ad1`  
**Lane:** NEW OWNERSHIP — Product Security, Privacy & Release Reliability  
**Scope:** GitHub product surface only (`src/`, `.github/workflows/ci.yml`, `package.json`, Android Capacitor shell). **No** Base44 / ChronosGlobe. **No** GDD / ART_DIRECTION / CLAUDE edits (decision requests only). **No** presentation / visual / gameplay / save-behavior changes. **`handoffs/CODEX.md` untouched.**  
**S0 rule:** Do **not** start dependency-scanning CI, secret checks, workflow hardening, or defect tests here — **propose only**. Deliverable = this audit doc (+ short `GROK.md` pointer).  
**Suite floor:** lane brief ≥524; tip CI `tools/assert-suite-size.mjs` default floor remains **495** (`MIN_TESTS` override). Docs-only preferred; suite size not changed by this PR.

**Prior context (do not re-litigate as new impl):**  
- PR #30 save backup/recovery (merged).  
- PR #36 expected-primary compare-before-write + `storage` adopt (merged at this tip). Residual TOCTOU documented in `handoffs/SAVE_CONCURRENCY_AUDIT_5d32dad.md` and code comments — **not atomic CAS**.

---

## Executive summary

Lane Math at `2be7ad1` is a **local-first**, same-origin web / Capacitor client with **no cloud sync and no remote telemetry sink**. Durable state lives in `localStorage` under three save keys plus telemetry/session keys. Integrity of lives/stars/ratings/ads rewards is therefore **client-trust**: `migrate` accepts attacker-controlled JSON numbers/flags; production builds expose `window.laneMath` review hooks (`setLives`, `watchAdForLife`, …); AdMob uses **Google public test IDs** with `testing: true` defaults. Privacy surface is **local play funnel + device context on export** (UA, viewport, equations, ad events) — not a backend PII store today. Release reliability is strong on **gates** (typecheck, named vitest gates, curate, suite floor, atlas, Pages-base build, Playwright smoke/viewport/font) but weak on **supply-chain / least-privilege / secret scanning / npm audit** (absent by design at S0). Highest-value first track: **harden save load validation + production review-harness gating** (reversible, testable) before CI scanners or CSP polish.

---

## 1. Threat model (concrete surfaces)

### 1.1 Local saves / backup / recovery / multi-tab

| Asset | Location | Trust assumption |
|---|---|---|
| Primary | `lane-math.save.v1` (`SAVE_KEY`) | Trusted once parsed+migrated |
| Backup | `lane-math.save.backup.v1` | Last validated primary generation |
| Recovery | `lane-math.save.recovery.v1` | First unreadable raw; never replaced |
| Session Economy | in-memory `Economy.save` | Single writer per tab; expected-primary token |

**Actors / paths:**

- **Same-device player (DevTools / bookmarklet):** edit `localStorage` JSON → next load `migrate` → inflated `totalStars` / `lives` / `ratingAttempt: "clean"` / unlocked worlds. **Confirmed** — `migrate` coalesces fields without range/signature checks (`src/economy/save.ts`).
- **Multi-tab stale writer:** residual TOCTOU between re-read and `setItem` after #36 expected-primary guard; `storage` adopt is best-effort UI sync. **Confirmed residual** (code comments in `attemptWriteSave`; prior audit).
- **Storage unavailable / quota / private mode:** `LocalStorageStore` swallows write failures (`lastWriteOk`); load path distinguishes unavailable vs miss. **Confirmed** handling exists; player-visible “saved” honesty depends on callers checking `lastPersistOk` / commit results.
- **Recovery export:** `downloadRecoverySave` shares/clips/downloads **raw recovery bytes** (may be corrupt JSON). **Confirmed** (`src/main.ts`). No import/restore-from-file path in product code — restore is manual localStorage edit / future work (**unknown** product intent).

### 1.2 Cloud sync boundaries + untrusted payloads

| Claim | Evidence |
|---|---|
| No cloud save sync | No firebase/supabase/fetch sync of `SaveData` in `src/` |
| Telemetry remote sink not wired | `TelemetrySink` docs: “Phase 6”; `main.ts` uses `ConsoleSink` + `LocalStorageSink` only |
| Untrusted network payload into Economy | **Absent today** — N/A for S0 exploit; **future Phase 6** must treat remote events/saves as hostile |

**Hypothesis (future):** a remote sink or sync API without schema allowlists / auth would become P0. Not present at tip.

### 1.3 Telemetry / IDs / privacy

| Key / field | Purpose | Notes |
|---|---|---|
| `lane-math.telemetry.v1` | Ring buffer ≤2000 `RecordedEvent` | Local only; quota-safe catch |
| `lane-math.session.v1` | Monotonic session index | Pseudonymous install-local counter — **not** a stable device UUID library |
| Export envelope | `build`, `sessionIndex`, `userAgent`, `viewport`, full `events` | `src/telemetry/export.ts` |
| Event payloads | level ids, modes, **equation expressions**, latencies, ad placement, star bank deltas | `src/telemetry/events.ts` |

**Export triggers (confirmed):** long-press build label → `exportTelemetry`; `?telemetry=1` auto-export after 400ms; `window.laneMath.exportTelemetry`. No consent prompt, no redaction, no age gate.

**Child / student implications:** educational arithmetic game; AdMob dependency present for Android; **no in-repo COPPA/age/consent policy code**. Treat as **decision request** to product/legal before production AdMob IDs or any remote sink.

### 1.4 Reward / ad + economy tampering

| Path | Mechanism | Confirmed? |
|---|---|---|
| Rewarded life | `Ads.offerLifeForAd` → plugin reward → `economy.grantAdLife()` | Yes — grant only on `"rewarded"` |
| Clean retry | `offerCleanRetryAd` → Director `cleanRetryFromAd` → `beginCleanRetry` sets `ratingAttempt: "clean"` | Yes |
| Hint ad | `offerHintAd` — UI hint only (no star mint in Ads) | Yes |
| Bypass ads | Call `economy.grantAdLife` / `beginCleanRetry` / edit save / `laneMath.setLives` / `laneMath.watchAdForLife` | Yes — client trust |
| Clock rollback | `clockHighWater` + `max(now, highWater)` in `regenerate` | Mitigates simple clock skew; **does not** stop forward clock or save edits |
| Review harness | `window.laneMath.setLives` persists via `Economy.setLives` | Yes — shipped in web bundle |

AdMob IDs are **Google public test units** (`TEST_REWARDED_ID`, manifest `APPLICATION_ID` `ca-app-pub-3940256099942544~…`); `capacitor.config.json` `initializeForTesting: true`; `Ads` defaults `testing ?? true`. Production cutover is a **config change**, not a security control by itself.

### 1.5 Import / export / download

| Flow | Code | Risk |
|---|---|---|
| Telemetry export | `deliver` share → clipboard → `<a download>` | Device handoff of play history + UA |
| Recovery export | `downloadRecoverySave` same ladder | May contain prior primary bytes (progress / economy fields if once-valid JSON) |
| Save import | **None** in `src/` | Attackers still “import” via DevTools `setItem` |
| Levels | Built JSON from repo; Playwright smoke loads dist | Supply chain = CI artifact integrity |

### 1.6 Deps / CI / Pages / secrets / supply chain

| Item | At tip | Risk |
|---|---|---|
| Runtime deps | `pixi.js`, `@capacitor/*`, `@capacitor-community/admob` | Third-party JS in client; AdMob native bridge on Android |
| Dev deps | `vite`, `vitest`, `playwright`, `typescript`, `sharp`, `@capacitor/cli` | Build/CI only |
| Lockfile | `package-lock.json` present; CI `npm ci` | Good baseline |
| Workflow perms | Top-level `contents: read`, `pages: write`, `id-token: write` on **all** pushes | Deploy job gated to `master`; write perms still granted to `gates` job token |
| Secret scanning / npm audit / Dependabot / CodeQL | **Absent** | Propose only (S0) |
| `.gitignore` | `android/keystore.properties`, `*.keystore`, `*.jks`, `keystore-new.txt` | Correct intent; **no** automated enforcement in CI |
| Pages deploy | `upload-pages-artifact` + `deploy-pages` on master only | Branch cannot publish; concurrency `cancel-in-progress: true` on group `pages` |

### 1.7 Browser / mobile storage failures

| Failure | Observed handling |
|---|---|
| Missing `localStorage` | `read` throws → `unavailable` → no clean-first-launch durable writes when flagged |
| Quota / SecurityError on write | Swallowed; `lastWriteOk = false` |
| Android `allowBackup="true"` | Manifest confirmed — cloud/ADB backup may include WebView data (**device/OS dependent**; treat as **confirmed config**, severity product-dependent) |
| Capacitor Preferences | Commented future swap in `SaveStore`; **not wired** — still `localStorage` in WebView |

### 1.8 XSS / injection / DoS / malformed data

| Class | Finding |
|---|---|
| DOM XSS sinks | No `innerHTML` / `eval` / `document.write` hits in `src/` (spot-check). Recovery/telemetry UI uses `textContent`. |
| CSP | **None** in `index.html` — defense-in-depth gap if a sink appears later |
| JSON DoS | Telemetry ring capped at 2000; save parse is one document — **hypothesis:** pathological huge string could stall main thread (no size cap on save read) |
| Malformed save | `tryParseMigrate` → null → recovery/backup/empty paths (#30) — **confirmed** resilience for corrupt JSON |
| Worker | Winnability worker receives structured solver requests only; not a network boundary |

---

## 2. Data inventory

Honest inventory from code. Mark **unknown** where product/legal policy is not in-repo.

| Category | Data | Purpose | Storage | Retention | Export / deletion | Child / student notes |
|---|---|---|---|---|---|---|
| Progress | `levels{}` (`bestStars`, `failCount`, `cleared`, `firstFailureUsed`, `hintsPurchased`, `ratingAttempt`) | Gameplay continuity (GDD §5) | `localStorage` primary (+ backup/recovery) | Until user clears site data / uninstall | Recovery export (raw); **no** in-app delete-all UI found | Skill/progress profile local to device |
| Economy | `lives`, `lastLifeGrantedAt`, `clockHighWater`, `totalStars`, `starsSpent`, `restored` | Lives / stars / room restore | Same | Same | Same | Economy state is cheat-editable client-side |
| Preferences | `selectedMode`, `muted` | Mode + audio | Same | Same | Same | Low sensitivity |
| Session counter | integer string | Telemetry session index | `lane-math.session.v1` | Until clear | Included in funnel export as `sessionIndex` | Pseudonymous; resets on storage clear |
| Telemetry events | Funnel per `events.ts` (incl. expressions, timings, ads) | Playtest / design metrics (§7.8) | `lane-math.telemetry.v1` (≤2000) | Ring trim; clear via `laneMath.clearTelemetry` / removeItem | Share/clipboard/download; `?telemetry=1` | May reveal how a learner plays; **no** remote send today |
| Export metadata | `userAgent`, viewport, build hash, ISO timestamp | Attribute playtests | Transient in export JSON | N/A (leaves device when shared) | Same channels | Device fingerprinting **lite** if shared off-device |
| Ads | AdMob SDK; placement events in telemetry | Rewarded refill / clean retry / hint | Native SDK + local events | SDK **unknown** (Google policy) | N/A / telemetry export | **COPPA / family policy UNKNOWN** — decision required before prod IDs |
| Console | `ConsoleSink` `console.info` | Dev playtest | Process console | Session | None | Avoid in shared-screen classrooms if sensitive |
| Analytics third parties | None in `src/` | — | — | — | — | — |
| Accounts / email / name | **None** | — | — | — | — | — |
| Cloud sync payloads | **None** | — | — | — | — | — |
| Crash / APM | **None** found | — | — | — | — | — |
| Android backups | App data if `allowBackup` honored | OS backup | Device/cloud backup | OS-defined | Via backup tools | May duplicate local save/telemetry off-device |

**Deletion:** site settings “clear data”, `localStorage.clear`, or `LocalStorageSink.clear` / harness — **no** privacy settings screen / parental reset flow in code (**unknown** product requirement).

---

## 3. Release-readiness matrix

| Requirement | Automated evidence | Manual / device evidence | Owner (proposed) | Severity if missing | Rollback path |
|---|---|---|---|---|---|
| Typecheck clean | CI `npm run typecheck` | — | Eng | P0 | Revert commit |
| Unit suite + shrink floor | `assert-suite-size.mjs` (default ≥495) | Align floor to lane ≥524 when CoS bumps `MIN_TESTS` / default | Eng | P0 | Revert; env override |
| Save-recovery gate | `vitest` `save-recovery.test.ts` | Corrupt primary on device → export chip | Economy / Security | P0 | Revert save commits |
| Save concurrency guard | `save-concurrency.test.ts` + suite | Two desktop tabs: stale mute must not clobber | Economy | P0 residual TOCTOU | Revert #36-era commits |
| Ladder still solvable | `npm run curate:verify` | Spot-play worlds | Content | P0 | Revert levels |
| Boot at Pages base | Playwright `smoke.mjs` | Open GitHub Pages URL | Release | P0 | Revert deploy / bad asset |
| Viewport fit | `verify-viewports.mjs` | Real phones | UI (out of this lane’s edit scope) | P1 | Revert layout |
| Font coverage | `font-coverage.mjs` | Visual glyph check | Art pipeline | P1 | Restore font file |
| Atlas reproducibility | `atlas:verify` | — | Art pipeline | P1 | Restore atlas bytes |
| Telemetry export works on phone | `tools/verify-telemetry.mjs` (manual/tool) | Long-press on device | Playtest | P1 | — |
| No production secrets in repo | `.gitignore` only | `git log` / secret scan (**propose**) | Security | P0 if leaked | Rotate keys; purge history |
| Dependency advisories | **None** | Periodic `npm audit` (**propose**) | Security | P1 | Pin/upgrade |
| Workflow least privilege | Partial (deploy if master) | Review Actions permissions | Security / Release | P1 | Tighten YAML |
| Privacy / child policy | **None in repo** | Store listing / consent UX | Product / Legal | P0 before kids-directed ads | Disable AdMob / keep testing |
| Save integrity vs tamper | Unit tests for happy path only | DevTools edit stars | Security | P1 single-player; P0 if ranked/cloud | Validation + feature flag |
| Production AdMob IDs | Test IDs only | Store build checklist | Release | P0 for monetization go-live | Revert ID constants |
| CSP / XSS hardening | **None** | Manual XSS review | Security | P2 today | Meta CSP report-only → enforce |

---

## 4. Ranked findings (P0 / P1 / P2)

Legend: **C** = confirmed from tip code/config · **H** = hypothesis (plausible, not fully proven in-product).

### P0

1. **C — Client save is authoritative with no integrity bound.**  
   `migrate` accepts `totalStars`, `starsSpent`, `lives`, `restored`, per-level `bestStars` / `ratingAttempt: "clean"`, etc. from any JSON with `schemaVersion`. Any same-origin script or DevTools user can mint economy/progress. Acceptable for pure offline toys; **not** acceptable if ads/rewards or future sync imply fair state.  
   **Files:** `src/economy/save.ts` (`migrate`), `src/economy/economy.ts`.

2. **C — Production web exposes durable cheat / ad hooks on `window.laneMath`.**  
   `setLives`, `watchAdForLife`, `setRestored`, `exportTelemetry`, `clearTelemetry`, `downloadRecoverySave` ship in the Pages bundle. Intended for review harness; equally callable by players.  
   **Files:** `src/main.ts` (~674–759).

3. **C — Privacy / child-directed go-live blockers are policy-not-code.**  
   AdMob + educational framing + exportable learner funnel without consent/age gate. Shipping production AdMob IDs or a remote sink without a written decision is a release blocker even though code “works”.  
   **Files:** `src/ads/ads.ts`, `android/.../AndroidManifest.xml`, `src/telemetry/*`, `capacitor.config.json`.

### P1

4. **C — Telemetry / recovery export is frictionless and unredacted.**  
   `?telemetry=1`, long-press, share sheet; includes UA + full event stream (equations). Shared-device / classroom shoulder-surf and accidental share are real.  
   **Files:** `src/main.ts`, `src/telemetry/export.ts`.

5. **C — CI token permissions are wider than deploy needs on every branch.**  
   Workflow-level `pages: write` + `id-token: write` on all pushes; only `deploy` publishes, but the pattern is over-broad. No Dependabot / audit / secret scan.  
   **Files:** `.github/workflows/ci.yml`, `package.json`.

6. **C — Android `allowBackup="true"`.**  
   Increases chance saves/telemetry leave the device via backup.  
   **Files:** `android/app/src/main/AndroidManifest.xml`.

7. **C — Residual multi-tab TOCTOU / non-CAS.**  
   Documented; progress-loss class under race. Partially mitigated by #36.  
   **Files:** `src/economy/save.ts` `attemptWriteSave`, `src/main.ts` `storage` listener.

8. **H — Unbounded save string parse on main thread.**  
   Malicious huge `localStorage` value could hitch/DoS tab. No max-length guard before `JSON.parse`.

### P2

9. **C — No CSP / Trusted Types.** Low current XSS sink density; still missing defense-in-depth for Pages.  
10. **C — Capacitor Preferences not used** — WebView `localStorage` semantics (clear-on-storage-pressure varies by OS) remain the durability story.  
11. **H — Supply-chain compromise of `pixi.js` / AdMob** — standard npm risk; lockfile helps, no verify beyond that.

**Explicit non-findings (avoid inflation):** no evidence of server RCE, auth bypass, or active remote exfiltration at this tip; no cloud sync attack surface yet; XSS not demonstrated.

---

## 5. Proposed implementation tracks (2–4)

All tracks: **reversible**, **independently testable**, **no broad refactor**. S0 does **not** implement them.

### Track A — Save load validation + production harness gate *(recommended first)*

**Goal:** Reduce cheap economy/ad integrity bypass without claiming cryptographic anti-cheat.  
**Scope:**  
- Clamp / validate `migrate` numerics (lives ∈ [0, maxLives], stars ≥ 0 finite, known level id shape, `ratingAttempt` enum only, restored counts 0–4). Reject or sanitize out-of-range → treat as unreadable (reuse recovery path) **or** clamp with telemetry flag — pick one in impl brief.  
- Gate `window.laneMath` mutating hooks behind explicit build flag / `?harness=1` / non-Pages mode so default Pages/APK builds cannot `setLives`. Keep read-only diagnostics if needed.  
**Acceptance:** New unit tests for hostile JSON; existing save-recovery + concurrency suites green; suite ≥ lane floor; Pages build lacks mutating harness (grep/smoke).  
**Rollback:** Revert single PR; schema version **unchanged** unless validation requires a bump (prefer no bump).  
**Why first:** Highest confirmed exploit surface per line-of-code; local; no CI politics; aligns with GDD anti-exploit posture already in Economy comments.

### Track B — Privacy export hygiene (local-only)

**Goal:** Make playtest export intentional; reduce accidental learner-data share.  
**Scope:** Confirm dialog / one-shot consent before `deliver` / recovery share; strip or hash expressions in default export; keep full payload behind `?telemetry=full`. Document child/AdMob decision request (no GDD edit — handoff note only).  
**Acceptance:** Export tests; default export redaction fixtures; `?telemetry=1` behavior documented.  
**Rollback:** Revert PR.

### Track C — Release / supply-chain proposals *(docs→tiny CI follow-up, not in S0)*

**Goal:** Least-privilege Actions + visibility into deps/secrets.  
**Scope (future PR):** move `pages`/`id-token` write to `deploy` job only; optional `npm audit --production` non-blocking job; Dependabot; secret scanning. **Do not** land in S0.  
**Acceptance:** Workflow still green on fork PR; deploy on master unchanged.  
**Rollback:** Revert workflow commit.

### Track D — Platform hardening (Android backup + CSP report-only)

**Goal:** Reduce off-device copy of saves; prepare XSS defense.  
**Scope:** `android:allowBackup="false"` (or exclude WebView data) with device test note; optional CSP report-only meta in `index.html` after inventory of Pixi/blob/worker needs.  
**Acceptance:** APK install smoke; Pages boot smoke still green.  
**Rollback:** Revert manifest / meta.

---

## 6. Recommendation for first track

**Start with Track A (save validation + harness gate).**  

It addresses confirmed P0 integrity paths with small, testable diffs in `save.ts` / `main.ts`, preserves #30/#36 behavior, needs no new CI product, and does not require legal copy. Parallel decision request: Product/Legal on child-directed + AdMob before any production ad ID or remote telemetry (feeds Track B/C scheduling).

---

## 7. S0 confirmation

| Check | Status |
|---|---|
| Behavior / gameplay / save writes changed? | **No** — docs only |
| CI / workflows / deps / new tests added? | **No** |
| Governing docs / CODEX edited? | **No** |
| Base44 / ChronosGlobe? | **No** |
| Tip audited | `2be7ad1` |
| Draft PR | Opened for CoS / Codex prioritization |

**Stop here for Codex prioritization.**
