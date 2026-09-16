# Android release checklist — Phase 2 evidence

**Purpose:** Reversible engineering gates before any store soft-launch.  
**Not:** COPPA/GDPR/Families legal sign-off. Green checks ≠ compliant.  
**Hard rule:** Do **not** set production AdMob IDs without Nadav **C7**.

## Pre-merge / tip gates

```bash
git fetch origin && git rev-parse origin/master
rg -n 'allowBackup|dataExtractionRules|usesCleartextTraffic|networkSecurityConfig|debuggable|APPLICATION_ID|exported' android/
rg -n 'initializeForTesting|TEST_REWARDED|ca-app-pub-' capacitor.config.json src/ads/ android/app/src/main/AndroidManifest.xml
node tools/assert-android-release-privacy.mjs          # tip: test IDs + shell harden
node tools/assert-android-release-privacy.mjs --store-path   # expect FAIL until C7 + real IDs
node tools/assert-suite-size.mjs                       # ≥548
npm test && npm run typecheck && npm run curate:verify
# after Pages harness-off build:
node tools/assert-no-prod-harness.mjs dist-pages
```

## Shell expectations (Phase 2)

| Check | Expect |
|-------|--------|
| `allowBackup` | `false` (D2D caveat documented; S14–S16) |
| `dataExtractionRules` | present; device-transfer excludes |
| `fullBackupContent` | `@xml/backup_rules` |
| `usesCleartextTraffic` | `false` |
| `networkSecurityConfig` | cleartext blocked |
| release `debuggable` | `false` |
| FileProvider `exported` | `false` |
| MainActivity `exported` | `true` (LAUNCHER only) |
| AdMob APPLICATION_ID | Google **test** `ca-app-pub-3940256099942544~3347511713` |
| `initializeForTesting` | `true` until C7 |

## Deferred until Nadav (C) — do not check off as Eng-done

- [ ] C1 Audience / Play age groups  
- [ ] C2 Ads on vs ads-off soft launch  
- [ ] C3 COPPA / VPC (legal)  
- [ ] C4 GDPR UMP / `canRequestAds`  
- [ ] C5 Data safety + privacy policy URL sign-off ([ANDROID_DATA_SAFETY_DRAFT.md](./ANDROID_DATA_SAFETY_DRAFT.md))  
- [ ] C6 Backup policy override (tip default = backup off; reversible)  
- [ ] C7 Production AdMob app + rewarded unit IDs  
- [ ] C8 Designed for Families / Teacher Approved  
- [ ] TFAT CHILD / max G / age screen / Families self-certified SDK pin  

## Store publish

**Out of scope** for Phase 2 Eng lane. No Play upload from this checklist.
