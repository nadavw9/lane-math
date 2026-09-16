#!/usr/bin/env node
/**
 * Positive smoke for harness-ON builds (VITE_LANE_MATH_HARNESS=1).
 *
 * Asserts the review surface exists in dist/ so a broken gate that always
 * strips the harness cannot silently pass boot jobs that need window.laneMath.
 *
 * STRING SCAN = REGRESSION GATE ONLY — NOT A SECURITY PROOF.
 *
 *   VITE_LANE_MATH_HARNESS=1 npm run build
 *   node tools/assert-harness-present.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? "dist";
if (!existsSync(root)) {
  console.error(`assert-harness-present: missing ${root}`);
  process.exit(2);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|cjs|html)$/.test(name)) yield path;
  }
}

const required = [
  "laneMath:",
  "__harness",
  "watchAdForLife",
  "playIntoFailure",
  "showMapAfterClear",
  "setStars",
  "setLives",
  "tapRestore",
  "setRestored",
  "clearAudioLog",
  "clearTelemetry",
  "winLevel",
  "measureRetry",
  "measureTapLatency",
  "refreshEconomySurfaces",
];

let text = "";
for (const file of walk(root)) text += readFileSync(file, "utf8");

const missing = required.filter((n) =>
  n.endsWith(":") ? !new RegExp(n.replace(":", "\\s*:")).test(text) : !text.includes(n),
);

if (missing.length) {
  console.error("assert-harness-present: harness-on build missing required surface:");
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}

console.log(
  `assert-harness-present: ok (${root}; ${required.length} markers including laneMath:/__harness + mutators)`,
);
