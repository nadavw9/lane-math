import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Full vitest suite + suite-shrink floor in one run.
 *
 * CI used to say "1 of 270 tests failed" long after the suite grew past 490.
 * A silent drop of dozens of tests (deleted file, broken include glob) still
 * looks green if whatever remains passes. This runs the suite once, keeps the
 * human default reporter for the log, and fails when numTotalTests falls below
 * the floor (default 548; override with MIN_TESTS).
 *
 *   node tools/assert-suite-size.mjs
 */
const MIN = Number(process.env.MIN_TESTS ?? 548);
if (!Number.isFinite(MIN) || MIN < 1) {
  console.error(`assert-suite-size: invalid MIN_TESTS=${process.env.MIN_TESTS}`);
  process.exit(2);
}

const reportPath = join(tmpdir(), `vitest-suite-${process.pid}.json`);
const result = spawnSync(
  "npx",
  ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile=${reportPath}`],
  { stdio: "inherit", env: process.env },
);

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch {
  console.error("assert-suite-size: could not read vitest JSON report at", reportPath);
  process.exit(result.status === 0 ? 1 : (result.status ?? 1));
} finally {
  try {
    unlinkSync(reportPath);
  } catch {
    /* ignore */
  }
}

const total = report.numTotalTests ?? 0;
if (total < MIN) {
  console.error(`assert-suite-size: numTotalTests=${total} is below floor ${MIN}`);
  process.exit(1);
}

console.log(`assert-suite-size: numTotalTests=${total} (≥${MIN})`);
if (result.status !== 0 && result.status != null) process.exit(result.status);
if (report.success === false) process.exit(1);
process.exit(0);
