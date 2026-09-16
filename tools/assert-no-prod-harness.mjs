#!/usr/bin/env node
/**
 * Default production Pages/APK builds must not ship the review harness.
 *
 * Looks for the Track A marker `__harness` and distinctive mutator surface
 * `watchAdForLife` in bundled JS under dist/. Fail closed if either appears.
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

const needles = ["__harness", "watchAdForLife"];
const hits = [];
for (const file of walk(root)) {
  const text = readFileSync(file, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) hits.push({ file, needle });
  }
}

if (hits.length) {
  console.error("assert-no-prod-harness: review harness leaked into default prod build:");
  for (const h of hits) console.error(`  ${h.needle} in ${h.file}`);
  process.exit(1);
}

console.log(`assert-no-prod-harness: ok (${root} has no harness markers)`);
