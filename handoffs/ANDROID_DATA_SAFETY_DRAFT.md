# Play Data safety / privacy-policy DRAFT — from GitHub tip only

**Status:** DRAFT for Nadav (C5) review — **not** a Play Console submission and **not** legal advice.  
**Tip base:** Phase 2 work on `origin/master` after Phase 1 audit `e26dd8e`.  
**Labels:** **(A)** tip implementation fact · **(B)** platform form requirement (S5–S7) · **(C)** Nadav/product/legal.  
**Not claimed:** Completing this draft ≠ COPPA, GDPR, or Families compliance.

Primary sources: brief **S5** Data safety form, **S6** User Data policy, **S7** declare data use.

---

## Actual tip data flows (A)

| Flow | What tip does | Collected? | Shared off-device by app code? |
|------|---------------|------------|-------------------------------|
| Game save | `localStorage` via Economy / save keys (schema v2) | Device-local progress | **No** remote sink in GitHub tip |
| Telemetry | `ConsoleSink` + `LocalStorageSink` only; events include gameplay funnel; export via long-press / `?telemetry=1` (may include UA + events) | Device-local until user exports | Export is **user-initiated** share/clipboard/download — not automatic upload |
| Ads SDK | `@capacitor-community/admob` + Google **test** APPLICATION_ID / rewarded unit; `initializeForTesting: true` | SDK may process device/ad signals when plugin loads on device **(B)** AdMob docs | App code does not implement a custom ad analytics backend; **(C)** whether to declare AAID/AdMob in Play form |
| Network | `INTERNET` (+ merged `ACCESS_NETWORK_STATE` from AdMob plugin) | N/A | HTTPS expected; cleartext blocked in Phase 2 NSC |
| FileProvider | `exported="false"`; share paths via `file_paths.xml` | Local files if share used | Only with explicit URI grants |
| Cloud backup | Phase 2: `allowBackup="false"` + `dataExtractionRules` / legacy `fullBackupContent` excludes | — | Cloud Auto Backup off; **D2D caveat** remains (S14–S16) |
| Account / login | None in tip | No | No |
| Location / contacts / photos | None requested in tip manifest beyond INTERNET | No | No |

---

## Draft Play Data safety answers (A→form; C must sign)

| Form topic (B) | Draft from tip (A) | Needs (C) |
|----------------|--------------------|-----------|
| Does app collect/share user data? | **Depends on AdMob SDK behavior on device** even with test IDs; app-authored code has **no** remote telemetry sink | Confirm AdMob/AAID declaration with counsel + AdMob disclosure |
| Location | Not collected by tip app code | Confirm SDK does not change this for listing |
| Personal info (name/email/phone) | Not collected by tip | — |
| Financial | Not collected | — |
| Health | Not collected | — |
| Messages / photos / files | Not collected; optional user-initiated export/share of telemetry JSON | Whether export counts as “shared” in form sense |
| App activity / gameplay | Stored **locally**; not auto-uploaded by tip | If Play treats on-device only as “collected” |
| Device or other IDs | App code does not read AAID directly; **AdMob SDK may** (B/S8–S11) | Declare per S5/S7 + AdMob |
| Encryption in transit | Tip intends HTTPS-only (NSC cleartext false) | Confirm WebView/AdMob endpoints |
| Users can request deletion | Local: clear app data / uninstall; no cloud account | Policy URL language |
| Privacy policy URL | **Missing in tip** | Host + link (C5) |

---

## Privacy-policy outline (draft bullets only)

1. What Lane Math is (educational puzzle; GitHub Android package `com.nadavw.lanemath`).  
2. Data stored on device (save progress, local telemetry).  
3. Optional user-initiated telemetry export.  
4. Advertising: currently Google **test** AdMob configuration; production ads **not** enabled without Nadav C1–C7.  
5. No account system on GitHub tip.  
6. Children’s privacy / COPPA: **(C3)** — Eng does not assert coverage.  
7. Contact / deletion: uninstall + local clear; policy contact TBD (C).  
8. Changes: policy versioning TBD (C).

---

## Explicit non-claims

- Draft ≠ submitted Data safety form.  
- Test AdMob IDs ≠ “no ads data processing.”  
- `allowBackup=false` ≠ no device-to-device transfer (S16).  
- Green CI / this draft ≠ COPPA or GDPR compliant.
