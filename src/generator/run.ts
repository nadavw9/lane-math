import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_RULES, type Metrics } from "../solver/index.js";
import type { Strategy } from "./construct.js";
import {
  attempt,
  REJECTION_REASONS,
  type AttemptContext,
  type GeneratedLevel,
  type RejectionReason,
} from "./pipeline.js";
import { renderReport, type RunReport, type TierRun } from "./report.js";
import { TEMPTATION_THRESHOLD } from "./temptation.js";
import { hashString, makeRng } from "./rng.js";
import { TIERS, type TierSpec } from "./tiers.js";
import { verifyGenerated } from "./verify.js";

export interface RunOptions {
  readonly attemptsPerTier: number;
  readonly seed: number;
  readonly strategies: readonly Strategy[];
  readonly tiers: readonly TierSpec[];
  readonly maxCollected: number;
  /** Stop a tier early once this many levels are accepted. */
  readonly targetAccepted: number;
  readonly bandingSampleCap: number;
  readonly temptationThreshold: number;
  readonly requireAllModes: boolean;
}

export const DEFAULT_OPTIONS: RunOptions = {
  attemptsPerTier: 3000,
  seed: 20260813,
  strategies: ["random", "directed"],
  tiers: TIERS,
  maxCollected: 4000,
  targetAccepted: 200,
  bandingSampleCap: 2000,
  temptationThreshold: TEMPTATION_THRESHOLD,
  requireAllModes: false,
};

function emptyRejections(): Record<RejectionReason, number> {
  return Object.fromEntries(REJECTION_REASONS.map((r) => [r, 0])) as Record<
    RejectionReason,
    number
  >;
}

export function runTier(
  tier: TierSpec,
  strategy: Strategy,
  options: RunOptions,
): TierRun {
  const rng = makeRng(options.seed ^ hashString(`${tier.name}:${strategy}`));
  const seen = new Set<string>();
  const rejections = emptyRejections();
  const levels: GeneratedLevel[] = [];
  const bandingSamples: Metrics[] = [];

  const acceptedMetrics: Metrics[] = [];
  const bandFailureCounts = new Map<string, number>();
  let inertDecoyRejections = 0;
  let totalMs = 0;
  let attempts = 0;

  const ctx: AttemptContext = {
    tier,
    allTiers: options.tiers,
    rng,
    strategy,
    seed: options.seed,
    seen,
    rules: DEFAULT_RULES,
    maxCollected: options.maxCollected,
    temptationThreshold: options.temptationThreshold,
    requireAllModes: options.requireAllModes,
  };

  for (let i = 0; i < options.attemptsPerTier; i++) {
    attempts++;
    const outcome = attempt(ctx, i);
    totalMs += outcome.ms;

    if (outcome.accepted) {
      levels.push(outcome.level);
      const record = outcome.byMode[tier.modeOfRecord];
      if (record) {
        bandingSamples.push(record);
        acceptedMetrics.push(record);
      }
      if (levels.length >= options.targetAccepted) break;
      continue;
    }

    rejections[outcome.reason]++;
    inertDecoyRejections += outcome.inertDecoyRejections;
    for (const failure of outcome.bandFailures) {
      // Bucket by criterion, dropping the measured value from the label.
      const criterion = failure.split(" ")[0]!;
      bandFailureCounts.set(criterion, (bandFailureCounts.get(criterion) ?? 0) + 1);
    }
    if (outcome.recordMetrics && bandingSamples.length < options.bandingSampleCap) {
      bandingSamples.push(outcome.recordMetrics);
    }
  }

  return {
    tier: tier.name,
    strategy,
    attempts,
    accepted: levels.length,
    rejections,
    inertDecoyRejections,
    totalMs,
    levels,
    bandingSamples,
    acceptedMetrics,
    bandFailureCounts,
  };
}

export function runAll(options: RunOptions = DEFAULT_OPTIONS): RunReport {
  const runs: TierRun[] = [];
  for (const tier of options.tiers) {
    for (const strategy of options.strategies) {
      process.stdout.write(`  ${tier.name} / ${strategy} ... `);
      const run = runTier(tier, strategy, options);
      process.stdout.write(
        `${run.accepted}/${run.attempts} accepted (${((100 * run.accepted) / run.attempts).toFixed(2)}%) in ${(run.totalMs / 1000).toFixed(1)}s\n`,
      );
      runs.push(run);
    }
  }
  return {
    seed: options.seed,
    attemptsPerTier: options.attemptsPerTier,
    generatedAt: new Date().toISOString(),
    runs,
  };
}

export function parseArgs(argv: readonly string[]): RunOptions {
  const options: {
    -readonly [K in keyof RunOptions]: RunOptions[K];
  } = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) break;
    switch (flag) {
      case "--attempts":
        options.attemptsPerTier = Number(value);
        break;
      case "--seed":
        options.seed = Number(value);
        break;
      case "--target":
        options.targetAccepted = Number(value);
        break;
      case "--temptation":
        options.temptationThreshold = Number(value);
        break;
      case "--require-all-modes":
        options.requireAllModes = value === "true" || value === "1";
        break;
      case "--strategies":
        options.strategies = value.split(",") as Strategy[];
        break;
      case "--tiers": {
        const names = new Set(value.split(","));
        options.tiers = TIERS.filter((t) => names.has(t.name));
        break;
      }
      default:
        break;
    }
  }
  return options;
}

export function writeOutput(report: RunReport, outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  for (const run of report.runs) {
    if (run.levels.length === 0) continue;
    const dir = join(outDir, run.tier, run.strategy);
    mkdirSync(dir, { recursive: true });
    for (const level of run.levels) {
      writeFileSync(join(dir, `${level.id}.json`), JSON.stringify(level, null, 2) + "\n");
      written++;
    }
  }

  writeFileSync(join(outDir, "report.md"), renderReport(report, TIERS));
  writeFileSync(
    join(outDir, "report.json"),
    JSON.stringify(
      {
        ...report,
        runs: report.runs.map((r) => ({ ...r, levels: r.levels.map((l) => l.id) })),
      },
      null,
      2,
    ) + "\n",
  );

  process.stdout.write(`\nWrote ${written} levels + report to ${outDir}\n`);
}

export function main(argv: readonly string[], outDir = "generated"): RunReport {
  const options = parseArgs(argv);
  process.stdout.write(
    `Generating: seed ${options.seed}, ${options.attemptsPerTier} attempts/tier, ` +
      `strategies ${options.strategies.join("+")}, tiers ${options.tiers.map((t) => t.name).join(",")}\n`,
  );
  const report = runAll(options);
  writeOutput(report, outDir);

  // Re-derive everything from the files just written. If the generator can
  // produce a level it cannot verify, the yield number means nothing.
  const verification = verifyGenerated(outDir);
  if (verification.failures.length === 0) {
    process.stdout.write(
      `Verified ${verification.checked} levels from disk: all solvable in all three modes, all metrics reproduce.\n`,
    );
  } else {
    process.stdout.write(
      `\nVERIFICATION FAILED — ${verification.failures.length} problems across ${verification.checked} levels:\n`,
    );
    for (const failure of verification.failures.slice(0, 20)) {
      process.stdout.write(`  ${failure.id}: ${failure.problem}\n`);
    }
    process.exitCode = 1;
  }

  return report;
}
