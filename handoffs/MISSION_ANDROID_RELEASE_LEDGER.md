# Mission — Android Release / Privacy / Child-Safety Readiness — PHASE 1 AUDIT

**Status:** DOCS/LEDGER ONLY — no hardening impl in this PR.  
**Tip audited:** `011bae189816cbe71fdcef41cab8a93e5a541887` (`origin/master` confirmed match after `git fetch`, 2026-09-16).  
**Branch:** `docs/android-release-phase1-audit`  
**Primary sources brief:** `/workspace/reviews/lane-math-android-mission/PRIMARY_SOURCES_BRIEF_2026-09-16.md` (retrieved **2026-09-16 Asia/Jerusalem / IDT**). Cite **S1–S23** below.  
**Hard exclusions:** No Base44 / ChronosGlobe; no monetization behavior changes; **do NOT set production ad IDs**; no store publish; preserve ≥548, CI, save schema v2, gameplay/levels/economy/UI/assets.  
**Prior context (reference, do not re-litigate):** [`SECURITY_PRIVACY_RELEASE_AUDIT_2be7ad1.md`](./SECURITY_PRIVACY_RELEASE_AUDIT_2be7ad1.md) (S0); Track A harness gate (PR #38); Track C CI (C3–C5) [`MISSION_TRACK_C_LEDGER.md`](./MISSION_TRACK_C_LEDGER.md).

**Label legend:** **(A)** confirmed tip implementation · **(B)** platform/store requirement needing current primary-source verification · **(C)** Nadav/product/legal decision.  
**Not claimed:** Play/Data safety/AdMob/UMP/TFAT green ≠ COPPA or GDPR compliant; `allowBackup=false` ≠ no D2D; checklist green ≠ legally safe.

---

## Tip snapshot (A)

| Surface | Tip fact |
|---|---|
| Android package | `com.nadavw.lanemath`; minSdk 24; target/compileSdk **36** |
| Manifest | `allowBackup="true"`; **no** `networkSecurityConfig` / `usesCleartextTraffic` / `dataExtractionRules` / `fullBackupContent`; launcher `MainActivity` `exported="true"` (MAIN/LAUNCHER); `FileProvider` `exported="false"`; app permission: `INTERNET` only (AdMob plugin also merges `ACCESS_NETWORK_STATE`) |
| AdMob APPLICATION_ID | Google **public test** `ca-app-pub-3940256099942544~3347511713` (commented as swap-ready) |
| Release buildType | `minifyEnabled`/`shrinkResources` true; **no** `debuggable true` (release default false); signing from gitignored `keystore.properties` |
| Capacitor | `initializeForTesting: true` in `capacitor.config.json` |
| `src/ads/ads.ts` | Defaults `rewardedId = TEST_REWARDED_ID`, `testing ?? true`; `new Ads(await loadAdMob())` in `main.ts` uses those defaults |
| Consent / child tags | Plugin exposes UMP-style consent APIs; **not wired** in `src/`. No age gate / TFAT / TFCD / max-rating G in app code |
| Telemetry | Local `ConsoleSink` + `LocalStorageSink` only; export via long-press / `?telemetry=1` (unredacted UA + events); no remote sink |
| Track A harness | Compile-time gate: `DEV` \|\| `VITE_LANE_MATH_HARNESS=1`; CI `assert-no-prod-harness.mjs` on harness-off Pages artifact |
| Suite floor | ≥**548** (`tools/assert-suite-size.mjs`) |
| CSP | None in `index.html` |
| `file_paths.xml` | `<external-path path="." />` (broad) |

---

## Severity-ranked findings

### P0 — production-ads / Families go-live blockers (not “test IDs = incident”)

1. **(A)+(B)+(C) — Child / Families / AdMob production cutover blocked.** Tip ships **test** AdMob IDs + `testing: true` / `initializeForTesting: true` — **not** a current production-ad incident. Shipping **production** unit/app IDs without (C) audience classification + consent/disclosures + SDK child treatment remains a go-live blocker.  
   - **(B)** If any Play child age group: Families Policies (S1), target-audience rules (S2), self-certified ads SDKs for child/unknown-age users (S3). Mixed audience → neutral age screen (S2). AdMob Families tools / child tagging / max rating **G** (S8, S10, S11). Prefer **TFAT CHILD** over deprecated TFCD where SDK supports it (S10–S11). Demo/test IDs for test traffic (S9). Capacitor: do **not** ship `initializeForTesting: true` in production configs (S20–S22).  
   - **(C)** See open decisions. **Explicit: do NOT set production ad IDs in Phase 2 without Nadav written approval.**

2. **(A)+(B)+(C) — No privacy policy / Data safety draft tied to actual flows.** No in-repo Play Data safety answers or privacy-policy URL.  
   - **(B)** Data safety form + accurate declarations incl. SDKs (S5–S7); User Data policy (S6). Developer owns accuracy.  
   - **(C)** Inventory answers; policy hosting; whether AdMob/AAID declared.

3. **(B)+(C) — COPPA / GDPR posture unsettled.** Educational framing + AdMob dependency + no age/consent UX.  
   - **(B)** FTC COPPA materials; Rule amended **Apr 22 2025** — legal must verify current Rule text (S17–S19). UMP + `canRequestAds` for EEA (S12–S13, S23); TFUA-on-consent must also be reflected on ad requests (S10–S13).  
   - **Not claimed:** UMP/TFAT ≠ legal compliance. **(C)** COPPA coverage / VPC; GDPR CMP.

### P1 — Android shell / release integrity (low-risk Phase 2 candidates)

4. **(A)+(B) — `allowBackup="true"` and no `dataExtractionRules`.** WebView `localStorage` saves/telemetry may leave device via backup/transfer (OS-dependent).  
   - **(B)** Auto Backup / `allowBackup` (S14–S15); backup best practices; API 31+ `dataExtractionRules`; `allowBackup=false` may **not** stop D2D (S14–S16). **(C)** Soft-launch backup policy.

5. **(A)+(B) — Capacitor / ads fail-safe still test-oriented.** `initializeForTesting: true` + Ads `testing` default `true` + test unit IDs. Correct for now; Phase 2 should **warn** if someone flips only one of {manifest ID, unit ID, testing flag} — **without enabling prod IDs**. (S9, S20–S22)

6. **(A) — Telemetry/recovery export frictionless in prod web/APK.** `?telemetry=1`, long-press build label, recovery chip; no consent gate. (Prior S0 #4; still true at tip.)

7. **(A) — Broad FileProvider `external-path` `.`.** Low urgency while grantUriPermissions only with explicit grants; tighten when share/export expands.

### P2 — defense-in-depth / polish

8. **(A) — No Network Security Config XML.** targetSdk 36 → cleartext default false (S15); explicit NSC still recommended for documentation/fail-closed.  
9. **(A) — No CSP meta.** Prior S0; unchanged.  
10. **(A) — Release `debuggable` not set true.** Confirm stays false in Phase 2 checklist evidence commands.  
11. **(A) — Track A harness gate present.** String assert ≠ security proof (tool comment). Keep regression gate; do not claim cheat-proof.

---

## Proposed Phase 2 queue (ordered, low-risk; **no impl this PR**)

1. Manifest backup harden: `allowBackup="false"` (+ legacy `fullBackupContent` as needed) **and** `dataExtractionRules` XML excluding sensitive domains; document D2D caveat (S14–S16). **(C)** confirm policy first if soft-launch wants cloud backup.  
2. Explicit `usesCleartextTraffic="false"` + minimal `network_security_config` (cleartext blocked).  
3. Confirm release `debuggable` false; optional lint/CI grep.  
4. Ads **fail-safe warn only**: detect mismatch / accidental non-test ID without wiring production IDs; keep Google test APPLICATION_ID + `TEST_REWARDED_ID` until (C). Remove or gate `initializeForTesting: true` for release builds per S20–S22 — **still no prod IDs**.  
5. Draft Play **Data safety** + privacy-policy outline from actual flows (local save, local telemetry, AdMob SDK, INTERNET, export/share) — answers marked draft until Nadav signs (S5–S7).  
6. Release checklist with evidence commands (`rg` manifest flags; `assert-no-prod-harness`; test-ID grep; `npm test` / suite ≥548; curate:verify).  
7. **Defer until (C):** TFAT CHILD / max G / UMP wiring / neutral age screen / Families self-certified SDK version pin / production IDs.  
8. Optional later: tighten `file_paths.xml`; telemetry export consent/redaction (product).

---

## Nadav decisions needed (C)

| # | Decision | Blocks |
|---|---|---|
| C1 | Audience: child-only vs mixed vs not-for-children; Play age groups (S1–S2) | Families path, ads SDK constraints |
| C2 | Ads path: keep rewarded-only test → prod AdMob later vs ads-off soft launch | Prod IDs, TFAT/UMP |
| C3 | COPPA coverage / VPC (legal; S17–S19) | Store go-live, consent UX |
| C4 | GDPR / EEA CMP (UMP) yes/no (S12–S13, S23) | Consent wiring |
| C5 | Data safety answers + privacy policy URL accuracy incl. SDKs (S5–S7) | Listing |
| C6 | Backup policy: disable cloud backup vs keep for soft-launch continuity (S14–S16) | Manifest rules |
| C7 | Production AdMob app + rewarded unit IDs — **blocked** until C1–C5 | Monetization go-live |
| C8 | Designed for Families / Teacher Approved opt-in (S4) | Listing extras |

---

## Base44 deltas (GitHub-only → Codex mirror later)

Observations on **GitHub** tip only — do **not** edit Base44 from this lane:

- Track A harness DCE / CI dual-build (`dist-pages` harness-off) may not exist on Base44 shell.  
- Android Capacitor tree + test AdMob IDs + `initializeForTesting: true` are GitHub-owned; Base44 must not invent prod IDs.  
- Local-only telemetry + export gestures; “no cloud sync” is **GitHub master** claim only (Base44 Next cloud-save is Codex-owned, out of scope).  
- Save schema v2 + Track A migrate validation + #30/#36 recovery/concurrency — mirror awareness only.  
- Privacy/Families/Data safety decisions are product-wide; Codex should await same (C) table before Base44 ad/consent work.

---

## Evidence commands (for Phase 2 / reviewers)

```bash
git rev-parse origin/master   # expect 011bae189816cbe71fdcef41cab8a93e5a541887 at audit time
rg -n 'allowBackup|dataExtractionRules|usesCleartextTraffic|debuggable|APPLICATION_ID' android/
rg -n 'initializeForTesting|TEST_REWARDED|ca-app-pub-' capacitor.config.json src/ads/ android/app/src/main/AndroidManifest.xml
node tools/assert-no-prod-harness.mjs dist-pages   # after harness-off build
node tools/assert-suite-size.mjs                  # ≥548
```

## Blockers (this phase)

- None for **docs merge**.  
- Phase 2 impl blocked on **C1–C7** for anything beyond shell backup/cleartext/debuggable/checklist/warn-only ads guards.  
- Production ad IDs: **hard blocked**.

## Retrieval stamp

Primary-source brief + AdMob targeting page consulted **2026-09-16** (Asia/Jerusalem / IDT). Play Console Help HTML sometimes captcha-blocks automated fetch; brief S1–S7 URLs remain authoritative citations for (B) claims in this ledger.
