import { verifyGenerated } from "./verify.js";

/**
 * Re-verify an already-written batch without regenerating it.
 *
 *   npx vite-node src/generator/verify-cli.ts [dir]
 */
const dir = process.argv[2] ?? "generated";
const result = verifyGenerated(dir);

if (result.checked === 0) {
  process.stdout.write(`No levels found in ${dir}\n`);
  process.exitCode = 1;
} else if (result.failures.length === 0) {
  process.stdout.write(
    `Verified ${result.checked} levels from ${dir}: all solvable in all three modes, ` +
      `all Expert budgets consumed, all published metrics reproduce.\n`,
  );
} else {
  process.stdout.write(
    `VERIFICATION FAILED — ${result.failures.length} problems across ${result.checked} levels:\n`,
  );
  for (const failure of result.failures.slice(0, 30)) {
    process.stdout.write(`  ${failure.id}: ${failure.problem}\n`);
  }
  process.exitCode = 1;
}
