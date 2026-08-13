import type { Metrics } from "../solver/index.js";
import type { Strategy } from "./construct.js";
import {
  REJECTION_REASONS,
  type GeneratedLevel,
  type RejectionReason,
} from "./pipeline.js";
import { inRange as inRangeValue, type Range, type TierName, type TierSpec } from "./tiers.js";

export interface TierRun {
  readonly tier: TierName;
  readonly strategy: Strategy;
  readonly attempts: number;
  readonly accepted: number;
  readonly rejections: Readonly<Record<RejectionReason, number>>;
  readonly inertDecoyRejections: number;
  readonly totalMs: number;
  readonly levels: readonly GeneratedLevel[];
  /** Mode-of-record metrics for every candidate that survived to banding. */
  readonly bandingSamples: readonly Metrics[];
  /** Mode-of-record metrics for accepted levels only. */
  readonly acceptedMetrics: readonly Metrics[];
  /** Which band criterion rejected each out-of-band candidate. */
  readonly bandFailureCounts: ReadonlyMap<string, number>;
}

export interface RunReport {
  readonly seed: number;
  readonly attemptsPerTier: number;
  readonly generatedAt: string;
  readonly runs: readonly TierRun[];
}

const pct = (n: number, d: number): string =>
  d === 0 ? "—" : `${((100 * n) / d).toFixed(2)}%`;

const fmtRange = (r: Range): string =>
  r.max === Number.POSITIVE_INFINITY ? `${r.min}+` : r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;

function summarise(values: readonly number[]): string {
  if (values.length === 0) return "—";
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return `${sorted[0]} / ${median} / ${sorted[sorted.length - 1]}`;
}

function histogram(values: readonly number[]): string {
  if (values.length === 0) return "—";
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([v, n]) => `${v}×${n}`)
    .join("  ");
}

/** The distribution report. Markdown, because a human reads this to make a call. */
export function renderReport(report: RunReport, tiers: readonly TierSpec[]): string {
  const out: string[] = [];
  const w = (s = "") => out.push(s);

  const total = report.runs.reduce(
    (acc, r) => ({
      attempts: acc.attempts + r.attempts,
      accepted: acc.accepted + r.accepted,
      ms: acc.ms + r.totalMs,
    }),
    { attempts: 0, accepted: 0, ms: 0 },
  );

  w("# Lane Math — generator distribution report");
  w();
  w(`Generated ${report.generatedAt} · seed \`${report.seed}\` · ${report.attemptsPerTier} attempts per tier per strategy`);
  w();
  w(
    `**${total.accepted} accepted from ${total.attempts} attempts** (${pct(total.accepted, total.attempts)}) in ${(total.ms / 1000).toFixed(1)}s`,
  );
  w();
  w(
    "Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.",
  );
  w();

  w("## Go / no-go: Late and Expert");
  w();
  w(
    "The question this run exists to answer: can rejection sampling reliably produce Late and Expert boards — lookahead 3–4, two overlapping keystones, a valid Expert budget?",
  );
  w();
  w("| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |");
  w("|---|---|---:|---:|---:|---:|");
  for (const run of report.runs.filter((r) => r.tier === "late" || r.tier === "expert")) {
    const perLevel = run.accepted === 0 ? "∞" : (run.attempts / run.accepted).toFixed(0);
    w(
      `| ${run.tier} | ${run.strategy} | ${pct(run.accepted, run.attempts)} | ${run.accepted} | ${run.bandingSamples.length} | ${perLevel} |`,
    );
  }
  w();

  w("## Yield");
  w();
  w("| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |");
  w("|---|---|---:|---:|---:|---:|---:|");
  for (const run of report.runs) {
    const perAccepted =
      run.accepted === 0 ? "—" : `${(run.totalMs / run.accepted).toFixed(0)}`;
    w(
      `| ${run.tier} | ${run.strategy} | ${run.attempts} | ${run.accepted} | ${pct(run.accepted, run.attempts)} | ${(run.totalMs / run.attempts).toFixed(1)} | ${perAccepted} |`,
    );
  }
  w();

  w("## Rejection reasons");
  w();
  w(`| Tier | Strategy | ${REJECTION_REASONS.join(" | ")} |`);
  w(`|---|---|${REJECTION_REASONS.map(() => "---:").join("|")}|`);
  for (const run of report.runs) {
    const cells = REJECTION_REASONS.map((r) => run.rejections[r] || "");
    w(`| ${run.tier} | ${run.strategy} | ${cells.join(" | ")} |`);
  }
  w();
  w(
    "`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:",
  );
  w();
  w("| Tier | Strategy | Inert decoy values rejected |");
  w("|---|---|---:|");
  for (const run of report.runs) {
    w(`| ${run.tier} | ${run.strategy} | ${run.inertDecoyRejections} |`);
  }
  w();

  w("## Achieved metrics vs target bands");
  w();
  for (const run of report.runs) {
    const tier = tiers.find((t) => t.name === run.tier)!;
    w(`### ${run.tier} · ${run.strategy}`);
    w();
    w(`Mode of record: **${tier.modeOfRecord}** (${tier.scarcity})`);
    w();
    w("| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |");
    w("|---|---|---|---|---|");

    const rows: [string, string, (m: Metrics) => number][] = [
      ["keystones", fmtRange(tier.keystones), (m) => m.keystones.length],
      ["lookaheadDistance", fmtRange(tier.lookahead), (m) => m.lookaheadDistance],
      ["decisionPoints", fmtRange(tier.decisionPoints), (m) => m.decisionPoints],
      ["solutionPaths", tier.uniqueSolution ? "1" : "any", (m) => m.solutionPaths],
      ["maxTrapDepth", "—", (m) => m.maxTrapDepth],
      [
        "overlappingKeystonePairs",
        tier.requireOverlappingKeystones ? "1+" : "—",
        (m) => m.overlappingKeystonePairs,
      ],
    ];

    const acceptedMetrics = run.acceptedMetrics;
    for (const [label, band, get] of rows) {
      const acc = acceptedMetrics.map(get);
      const reached = run.bandingSamples.map(get);
      w(
        `| ${label} | ${band} | ${summarise(acc)} | ${histogram(acc)} | ${histogram(reached)} |`,
      );
    }
    w();

    // The measurement this re-run exists for: how much did banding on dStart
    // inflate decisionPoints? Both are counted over the same candidate set.
    const dStartPoints = run.bandingSamples.map((m) => m.dStart.filter((d) => d >= 2).length);
    const dPathPoints = run.bandingSamples.map((m) => m.decisionPoints);
    if (run.bandingSamples.length > 0) {
      const mean = (xs: readonly number[]): string =>
        (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
      const inBand = (xs: readonly number[]): string =>
        pct(xs.filter((x) => inRangeValue(x, tier.decisionPoints)).length, xs.length);

      w("**decisionPoints: dStart vs dPath** (all candidates reaching banding)");
      w();
      w("| Basis | min/med/max | mean | histogram | passes decisionPoints alone |");
      w("|---|---|---:|---|---:|");
      w(
        `| dStart (wrong) | ${summarise(dStartPoints)} | ${mean(dStartPoints)} | ${histogram(dStartPoints)} | ${inBand(dStartPoints)} |`,
      );
      w(
        `| dPath (correct) | ${summarise(dPathPoints)} | ${mean(dPathPoints)} | ${histogram(dPathPoints)} | ${inBand(dPathPoints)} |`,
      );
      w();
      w(
        `The last column isolates ONE criterion. Overall band pass is ` +
          `**${pct(run.accepted, run.bandingSamples.length)}** ` +
          `(${run.accepted} of ${run.bandingSamples.length} reaching banding) — a board must clear ` +
          `keystones, lookahead and decisionPoints together. Relief on a criterion that was not ` +
          `binding does not move yield.`,
      );
      w();
    }

    if (run.bandFailureCounts.size > 0) {
      w("**Which criterion actually binds** (out-of-band candidates; one can fail several)");
      w();
      w("| Criterion | Rejected |");
      w("|---|---:|");
      for (const [criterion, count] of [...run.bandFailureCounts.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        w(`| ${criterion} | ${count} |`);
      }
      w();
    }

    const temptations = run.levels.map((l) => l.generator.peakTemptation);
    if (temptations.length > 0) {
      w(`Peak temptation (min/med/max): ${summarise(temptations)}`);
      w();
    }

    if (run.bandingSamples.length > 0 && run.accepted === 0) {
      w(
        `> ${run.bandingSamples.length} candidates reached banding and none passed. The "reached-banding histogram" column above is the diagnostic: it shows what this construction can actually produce.`,
      );
      w();
    }
  }

  w("## Per-mode landing");
  w();
  w(
    "The same board can band into different tiers per mode — expected, per the brief. For accepted levels:",
  );
  w();
  w("| Tier | Strategy | casual lands | normal lands | expert lands |");
  w("|---|---|---|---|---|");
  for (const run of report.runs) {
    if (run.levels.length === 0) {
      w(`| ${run.tier} | ${run.strategy} | — | — | — |`);
      continue;
    }
    const land = (mode: "casual" | "normal" | "expert"): string => {
      const counts = new Map<string, number>();
      for (const level of run.levels) {
        const block = level.modes[mode];
        if (!block) {
          counts.set("absent", (counts.get("absent") ?? 0) + 1);
          continue;
        }
        const key = `${block.tier ?? "none"} (k${block.metrics.keystones.length}/l${block.metrics.lookaheadDistance}/d${block.metrics.decisionPoints})`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, n]) => `${k}×${n}`)
        .join("<br>");
    };
    w(`| ${run.tier} | ${run.strategy} | ${land("casual")} | ${land("normal")} | ${land("expert")} |`);
  }
  w();
  w("Key: `k` keystones, `l` lookahead distance, `d` decision points.");
  w();

  return out.join("\n");
}
