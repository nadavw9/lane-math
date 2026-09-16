#!/usr/bin/env node
/**
 * Default production Pages/APK builds must not ship the review harness.
 *
 * STRING SCAN = RELEASE REGRESSION GATE ONLY — NOT A SECURITY PROOF.
 * Minifiers, renames, or alternate attachment shapes can evade a substring
 * check. Real integrity still depends on the compile-time
 * `import.meta.env.DEV || VITE_LANE_MATH_HARNESS === "1"` gate + Vite DCE.
 * Client validation is likewise NOT cheat-proof.
 *
 * Fails if ANY of these appear under dist/:
 *   - object-key form `laneMath:` (window.laneMath attach; excludes laneMathDebug)
 *   - internal marker `__harness`
 *   - the complete harness-exclusive mutator / surface name set below
 *
 *   node tools/assert-no-prod-harness.mjs
 *   node tools/assert-no-prod-harness.mjs dist
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist";
if (!existsSync(root)) {
  console.error(`assert-no-prod-harness: missing ${root}`);
  process.exit(2);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|cjs|html|map)$/.test(name)) yield path;
  }
}

/**
 * Complete harness-exclusive surface that Vite DCE must drop when the gate is
 * off. Names that remain in prod for other reasons (Economy.setLives,
 * hasRecoveryRaw on SaveLoadStatus, laneMathDebug, …) are intentionally
 * omitted — those are not harness attach proofs.
 */
export const HARNESS_EXCLUSIVE_NEEDLES = Object.freeze([
  "__harness",
  "watchAdForLife",
  "playIntoFailure",
  "showMapAfterClear",
  "setStars",
  "tapRestore",
  "setRestored",
  "clearAudioLog",
  "clearTelemetry",
  "winLevel",
  "measureRetry",
  "measureTapLatency",
  "refreshEconomySurfaces",
]);

const hits = [];
for (const file of walk(root)) {
  const text = readFileSync(file, "utf8");
  // Object.assign(window,{laneMath:{...}}) — not window.laneMathDebug.
  if (/laneMath\s*:/.test(text)) hits.push({ file, needle: "laneMath:" });
  for (const needle of HARNESS_EXCLUSIVE_NEEDLES) {
    if (text.includes(needle)) hits.push({ file, needle });
  }
}

if (hits.length) {
  console.error(
    "assert-no-prod-harness: review harness leaked into default prod build (regression gate, not security proof):",
  );
  for (const h of hits) console.error(`  ${h.needle} in ${h.file}`);
  process.exit(1);
}

console.log(
  `assert-no-prod-harness: ok (${root}; no laneMath: / __harness / ${HARNESS_EXCLUSIVE_NEEDLES.length} exclusive mutators) [regression gate only]`,
);
