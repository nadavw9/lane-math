#!/usr/bin/env node
/**
 * Phase 2 Android release / privacy regression gate (not legal compliance).
 *
 * Default mode (CI / soft-launch tip):
 *   - Require Google public TEST AdMob app + rewarded IDs still present
 *   - Fail if any other ca-app-pub- APPLICATION_ID / unit id appears (no silent prod cutover)
 *   - Require initializeForTesting:true / Ads testing default until Nadav (C7)
 *   - Require allowBackup=false, dataExtractionRules, usesCleartextTraffic=false,
 *     networkSecurityConfig, release debuggable false
 *
 * --store-path mode:
 *   - FAIL while test IDs / initializeForTesting:true remain
 *   - Does NOT set or invent production IDs — blocks claiming store-ready
 *
 * Green tooling ≠ COPPA / GDPR / Families compliance.
 *
 *   node tools/assert-android-release-privacy.mjs
 *   node tools/assert-android-release-privacy.mjs --store-path
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const storePath = process.argv.includes("--store-path");
const root = process.cwd();

const GOOGLE_TEST_APP = "ca-app-pub-3940256099942544~3347511713";
const GOOGLE_TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";
const TEST_PUBLISHER = "3940256099942544";

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function fail(msg) {
  console.error(`assert-android-release-privacy: FAIL — ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`assert-android-release-privacy: ok — ${msg}`);
}

const manifest = read("android/app/src/main/AndroidManifest.xml");
const gradle = read("android/app/build.gradle");
const cap = read("capacitor.config.json");
const ads = read("src/ads/ads.ts");
const nsc = read("android/app/src/main/res/xml/network_security_config.xml");
const der = read("android/app/src/main/res/xml/data_extraction_rules.xml");
const backup = read("android/app/src/main/res/xml/backup_rules.xml");

if (!manifest) fail("missing AndroidManifest.xml");
if (!gradle) fail("missing android/app/build.gradle");
if (!cap) fail("missing capacitor.config.json");
if (!ads) fail("missing src/ads/ads.ts");

const appIds = [...manifest.matchAll(/ca-app-pub-[0-9~]+/g)].map((m) => m[0]);
const unitIds = [
  ...ads.matchAll(/ca-app-pub-[0-9]+\/[0-9]+/g),
].map((m) => m[0]);
const allIds = [...appIds, ...unitIds];
const nonTest = allIds.filter((id) => !id.includes(TEST_PUBLISHER));

const initForTesting = /"initializeForTesting"\s*:\s*true/.test(cap);
const testingDefaultTrue = /testing\s*\?\?\s*true/.test(ads);
const testRewardedConst = ads.includes(GOOGLE_TEST_REWARDED);
const testAppInManifest = manifest.includes(GOOGLE_TEST_APP);

const allowBackupFalse = /android:allowBackup\s*=\s*"false"/.test(manifest);
const hasDer = /android:dataExtractionRules\s*=\s*"@xml\/data_extraction_rules"/.test(manifest);
const hasFullBackup = /android:fullBackupContent\s*=\s*"@xml\/backup_rules"/.test(manifest);
const cleartextOff = /android:usesCleartextTraffic\s*=\s*"false"/.test(manifest);
const hasNsc = /android:networkSecurityConfig\s*=\s*"@xml\/network_security_config"/.test(manifest);
const nscBlocksCleartext =
  nsc !== null && /cleartextTrafficPermitted\s*=\s*"false"/.test(nsc);
const derHasDeviceTransfer =
  der !== null && /<device-transfer>/.test(der) && /<exclude/.test(der);
const backupRulesExist = backup !== null;

const releaseBlock = gradle.match(/buildTypes\s*\{[\s\S]*?release\s*\{([\s\S]*?)\n\s*\}/);
const releaseBody = releaseBlock ? releaseBlock[1] : "";
const debuggableFalse =
  /debuggable\s+false/.test(releaseBody) && !/debuggable\s+true/.test(releaseBody);
const fileProviderExportedFalse =
  /FileProvider[\s\S]*?android:exported\s*=\s*"false"/.test(manifest);

if (storePath) {
  const blockers = [];
  if (testAppInManifest || testRewardedConst) {
    blockers.push("Google TEST AdMob IDs still present (production IDs require Nadav C7 — not set by this tool)");
  }
  if (initForTesting) {
    blockers.push('capacitor.config.json initializeForTesting:true (must not ship on store path; S20–S22)');
  }
  if (testingDefaultTrue && !nonTest.length) {
    blockers.push("Ads testing default still true with test IDs — store path not ready");
  }
  if (blockers.length) {
    console.error("assert-android-release-privacy: --store-path BLOCKED:");
    for (const b of blockers) console.error(`  - ${b}`);
    console.error("Explicit: this gate does not set production ad IDs. Green tooling ≠ COPPA/GDPR compliant.");
    process.exit(1);
  }
  ok("store-path checks passed (unexpected: tip should still be test-ID soft launch)");
  process.exit(0);
}

// Default soft-launch / tip mode
if (nonTest.length) {
  fail(
    `non-test AdMob id(s) present without Nadav C7 approval: ${nonTest.join(", ")}. ` +
      "Do NOT set production ad IDs in Phase 2.",
  );
}
if (!testAppInManifest) fail(`manifest must keep Google TEST APPLICATION_ID ${GOOGLE_TEST_APP}`);
if (!testRewardedConst) fail(`ads.ts must keep TEST_REWARDED_ID ${GOOGLE_TEST_REWARDED}`);
if (!initForTesting) {
  fail('capacitor.config.json must keep "initializeForTesting": true until Nadav C7 / store cutover');
}
if (!testingDefaultTrue) fail("Ads testing ?? true default required until Nadav C7");
if (!allowBackupFalse) fail('android:allowBackup must be "false" (S14–S16; D2D caveat remains)');
if (!hasDer || !derHasDeviceTransfer) {
  fail("dataExtractionRules with device-transfer excludes required (S14–S16)");
}
if (!hasFullBackup || !backupRulesExist) {
  fail("fullBackupContent=@xml/backup_rules required for legacy API documentation");
}
if (!cleartextOff || !hasNsc || !nscBlocksCleartext) {
  fail("usesCleartextTraffic=false + network_security_config cleartext blocked required");
}
if (!debuggableFalse) fail("release buildType must set debuggable false");
if (!fileProviderExportedFalse) fail('FileProvider must remain exported="false"');

ok(
  `tip soft-launch privacy gate (test AdMob IDs; backup/NSC/debuggable; FileProvider exported=false)` +
    ` [NOT COPPA/GDPR proof; allowBackup=false ≠ no D2D]`,
);
