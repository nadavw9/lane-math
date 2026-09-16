# Mission — Android Release / Privacy / Child-Safety Readiness — PHASE 2

**Status:** PHASE 2 COMPLETE — shell + warn-only ads gate + drafts merged; TFAT/UMP/age/prod IDs/Families remain DEFER (C).  
**Mission start tip:** `e26dd8efd09b39c7e1032243904ed5bc664d0605` (Phase 1 audit PR #55 merged). Earlier audit tip: `011bae1`.  
**Primary sources brief:** `/workspace/reviews/lane-math-android-mission/PRIMARY_SOURCES_BRIEF_2026-09-16.md` (retrieved **2026-09-16 Asia/Jerusalem / IDT**). Cite **S1–S23**.  
**Hard exclusions:** No Base44 / ChronosGlobe; no monetization behavior / reward amounts / economy / gameplay / levels / UI / schema v2; **do NOT set production ad IDs**; no store publish; preserve ≥548, CI least-privilege/SHA pins.  
**Label legend:** **(A)** tip fact · **(B)** platform requirement · **(C)** Nadav/product/legal.  
**Not claimed:** Play/Data safety/AdMob/UMP/TFAT green ≠ COPPA or GDPR; `allowBackup=false` ≠ no D2D; checklist green ≠ legally safe.

---

## Phase 2 landed

| PR | Merge SHA | CI | One-line |
|----|-----------|----|----------|
| [#56](https://github.com/nadavw9/lane-math/pull/56) | `ca481b030e795067749287f76e735a513d54236c` | [master CI SUCCESS](https://github.com/nadavw9/lane-math/actions/runs/35149992128) | Backup/NSC/debuggable + ads tip gate + Data safety/checklist drafts |

**End master tip:** `ca481b030e795067749287f76e735a513d54236c` (start was `e26dd8e` / audit `011bae1`).

| # | Slice | Status | Notes |
|---|-------|--------|-------|
| 1 | Backup + `dataExtractionRules` | **DONE** | `allowBackup=false`; `@xml/data_extraction_rules` (cloud + device-transfer excludes); legacy `@xml/backup_rules`. **D2D caveat** documented (S14–S16). Reversible if C6 wants cloud backup. |
| 2 | Cleartext / NSC | **DONE** | `usesCleartextTraffic=false` + `@xml/network_security_config` cleartext blocked. |
| 3 | Release `debuggable` | **DONE** | Explicit `debuggable false` on release `buildType`. |
| 4 | Ads warn-only / fail-safe | **DONE** | `adsConfigWarnings` + `tools/assert-android-release-privacy.mjs` (tip mode requires test IDs; `--store-path` blocks while test IDs remain). **No production IDs set.** Fail-safe `unavailable` unchanged. Cite S8–S11, S20–S22. |
| 5 | Data safety draft | **DONE** | [`ANDROID_DATA_SAFETY_DRAFT.md`](./ANDROID_DATA_SAFETY_DRAFT.md) from tip flows only; A/B/C labeled (S5–S7). |
| 6 | Release checklist | **DONE** | [`ANDROID_RELEASE_CHECKLIST.md`](./ANDROID_RELEASE_CHECKLIST.md) + evidence commands. |
| 7 | Deferred (C) | **DEFER** | TFAT CHILD, UMP/`canRequestAds`, age screen, prod IDs, Families self-cert — await Nadav. |
| — | FileProvider `exported` | **CONFIRMED** | Already `false`; assert gated. MainActivity `exported=true` required for LAUNCHER. |

---

## Tip snapshot (A) — post Phase 2 shell

| Surface | Fact |
|---|---|
| Package | `com.nadavw.lanemath`; minSdk 24; target/compileSdk **36** |
| Manifest | `allowBackup="false"`; `dataExtractionRules` + `fullBackupContent`; `usesCleartextTraffic="false"`; `networkSecurityConfig`; launcher `exported="true"`; FileProvider `exported="false"`; `INTERNET` |
| AdMob APPLICATION_ID | Google **public test** `ca-app-pub-3940256099942544~3347511713` |
| Release | `debuggable false`; minify/shrink true; signing via gitignored `keystore.properties` |
| Capacitor | `initializeForTesting: true` (**kept** until C7) |
| Ads | Defaults test rewarded + `testing ?? true`; warn-only mismatch helper |
| Consent / child tags | **Not wired** — deferred (C) |
| Telemetry | Local sinks only; user-initiated export |
| Suite floor | ≥**548** |

---

## Severity-ranked findings (remaining)

### P0 — go-live blockers (need Nadav C)

1. Production AdMob / Families / child treatment cutover blocked (C1–C2, C7). Test IDs ≠ production incident.  
2. No signed privacy policy / Data safety submission (draft only; C5).  
3. COPPA / GDPR posture unsettled (C3–C4). UMP/TFAT ≠ legal compliance.

### P1

4. Telemetry/recovery export still frictionless in prod web/APK (product).  
5. Broad FileProvider `external-path` `.` (low urgency).  
6. Soft-launch backup policy (C6): tip default backup **off**; reverse if Nadav wants continuity.

### P2

7. No CSP meta (prior S0).  
8. Track A harness string assert ≠ security proof (keep gate).

---

## Nadav decisions still open (C)

| # | Decision | Blocks |
|---|---|---|
| C1 | Audience / Play age groups (S1–S2) | Families path |
| C2 | Ads on vs ads-off soft launch | Prod IDs / TFAT/UMP |
| C3 | COPPA / VPC (legal; S17–S19) | Store go-live |
| C4 | GDPR CMP / UMP (S12–S13, S23) | Consent wiring |
| C5 | Sign Data safety + privacy policy URL (S5–S7) | Listing |
| C6 | Backup: keep tip default off vs re-enable for soft-launch | Manifest revert |
| C7 | Production AdMob IDs — **hard blocked** | Monetization go-live |
| C8 | Designed for Families / Teacher Approved (S4) | Listing extras |

---

## Base44 deltas (GitHub → Codex mirror later)

- Android shell: `allowBackup=false`, NSC, cleartext off, `dataExtractionRules` — mirror when Base44 Android tree exists; do **not** invent prod AdMob IDs.  
- `tools/assert-android-release-privacy.mjs` + CI step — GitHub-owned.  
- Data safety / Families decisions are product-wide; Codex awaits same (C) table.  
- Track A harness DCE / dual-build may still differ on Base44.  
- No Base44 edits from this Eng lane.

---

## Evidence commands

```bash
git rev-parse origin/master
rg -n 'allowBackup|dataExtractionRules|usesCleartextTraffic|debuggable|APPLICATION_ID' android/
node tools/assert-android-release-privacy.mjs
node tools/assert-android-release-privacy.mjs --store-path   # expect FAIL on tip
node tools/assert-suite-size.mjs
node tools/assert-no-prod-harness.mjs dist-pages
```

## Blockers

- Store publish / prod ad IDs / TFAT / UMP / age screen: **blocked on C1–C7**.  
- Phase 2 Eng slices: **none remaining** (merged).

## Retrieval stamp

Primary-source brief consulted **2026-09-16** (Asia/Jerusalem / IDT). Eng is not counsel.
