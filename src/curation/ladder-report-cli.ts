import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tierByName, type TierName } from "../generator/tiers.js";
import { WEIGHTS } from "./score.js";

/**
 * Render the curation report from the ladder on disk.
 *
 * Reads levels/ rather than re-running selection, so it can be regenerated
 * after a re-order without any risk of re-picking boards.
 *
 *   npx vite-node src/curation/ladder-report-cli.ts [levelsDir]
 */
const dir = process.argv[2] ?? "levels";

interface Row {
  id: string;
  world: number;
  slot: number;
  role: string;
  tier: TierName;
  targets: number;
  surplus: number;
  decisionPoints: number;
  lookahead: number;
  keystones: number;
  maxTrapDepth: number;
  solutionPaths: number;
  totalLines: number;
  survivalRate: number;
  score: number;
}

const rows: Row[] = readdirSync(dir)
  .filter((f) => /^\d-\d\d\.json$/.test(f))
  .sort()
  .map((f) => {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const tier = tierByName(j.generator.targetTier as TierName);
    const m = j.modes[tier.modeOfRecord].metrics;
    return {
      id: j.id,
      world: j.world,
      slot: j.curation.slot,
      role: j.curation.role,
      tier: tier.name,
      targets: j.targets.length,
      surplus: j.surplus,
      decisionPoints: m.decisionPoints,
      lookahead: m.lookaheadDistance,
      keystones: m.keystones.length,
      maxTrapDepth: m.maxTrapDepth,
      solutionPaths: m.solutionPaths,
      totalLines: m.totalLinesExplored ?? 0,
      survivalRate: m.survivalRate ?? 0,
      score: j.curation.compositeScore,
    };
  });

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
};

function renderCurve(): string {
  const scores = rows.map((r) => r.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const height = 16;
  const lines: string[] = [];
  const rowOf = (s: number): number =>
    max === min ? 0 : Math.round(((max - s) / (max - min)) * (height - 1));
  const at = rows.map((r) => rowOf(r.score));

  for (let y = 0; y < height; y++) {
    const value = max - ((max - min) * y) / (height - 1);
    let line = value.toFixed(1).padStart(5) + " |";
    for (let i = 0; i < rows.length; i++) {
      const gap = i > 0 && rows[i]!.world !== rows[i - 1]!.world ? " " : "";
      line += gap + (at[i] === y ? "*" : at[i]! < y ? "|" : " ");
    }
    lines.push(line);
  }
  let axis = "      +";
  let labels = "       ";
  for (let i = 0; i < rows.length; i++) {
    const boundary = i > 0 && rows[i]!.world !== rows[i - 1]!.world;
    axis += (boundary ? "+" : "") + "-";
    labels +=
      (boundary ? " " : "") +
      (rows[i]!.slot === 1 ? String(rows[i]!.world) : rows[i]!.slot === 10 ? "·" : " ");
  }
  lines.push(axis, labels + "   (world at slot 1, · at slot 10)");
  return lines.join("\n");
}

const out: string[] = [];
const w = (s = "") => out.push(s);

w("# Lane Math — curated launch ladder");
w();
w(`${rows.length} of 40 slots · 4 worlds × 10 levels · GDD §7.2`);
w();
w(
  "Every ladder level carries a valid Casual, Normal **and** Expert budget (§10: the corpus may be permissive, the ladder may not). Master tier is post-launch and unused (§8.7).",
);
w();

w("## Composite difficulty score (GDD §8.4)");
w();
w("| Input | Weight |");
w("|---|---:|");
w(`| lookaheadDistance | ${WEIGHTS.lookaheadDistance.toFixed(1)} |`);
w(`| decisionPoints (dPath) | ${WEIGHTS.decisionPoints.toFixed(1)} |`);
w(`| 1 − survivalRate | ${WEIGHTS.forgivenessPenalty.toFixed(1)} |`);
w(`| maxTrapDepth | ${WEIGHTS.maxTrapDepth.toFixed(1)} |`);
w(`| T | ${WEIGHTS.targetCount.toFixed(1)} |`);
w(`| 1 / log2(solutionPaths + 1) | ${WEIGHTS.uniqueness.toFixed(1)} |`);
w();

w("## The 40 levels");
w();
w("| id | role | tier | T | S | dPoints | lookahead | keystones | trapDepth | paths | lines | survival | score |");
w("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  w(
    `| **${r.id}** | ${r.role} | ${r.tier} | ${r.targets} | ${r.surplus} | ${r.decisionPoints} | ${r.lookahead} | ` +
      `${r.keystones} | ${r.maxTrapDepth} | ${r.solutionPaths} | ${r.totalLines} | ${(r.survivalRate * 100).toFixed(1)}% | ${r.score.toFixed(2)} |`,
  );
}
w();

w("## Difficulty curve");
w();
w("```");
w(renderCurve());
w("```");
w();

w("### Valley check (GDD §7.3)");
w();
w("| World | slot 1 | world min | is min? | lookahead (floor) | dPoints (floor) | at floor? |");
w("|---|---:|---:|---|---|---|---|");
for (let world = 1; world <= 4; world++) {
  const inWorld = rows.filter((r) => r.world === world);
  const first = inWorld.find((r) => r.slot === 1)!;
  const tier = tierByName(first.tier);
  const worldMin = Math.min(...inWorld.map((r) => r.score));
  const atFloor =
    first.lookahead === tier.lookahead.min && first.decisionPoints === tier.decisionPoints.min;
  w(
    `| ${world} | ${first.score.toFixed(2)} | ${worldMin.toFixed(2)} | ${first.score === worldMin ? "yes" : "NO"} | ` +
      `${first.lookahead} (${tier.lookahead.min}) | ${first.decisionPoints} (${tier.decisionPoints.min}) | ${atFloor ? "yes" : "NO"} |`,
  );
}
w();

w("### Step sizes and boundary cliffs (GDD §7.3, asymmetric)");
w();
const withinSteps: number[] = [];
w("| World | median within-world step |");
w("|---|---:|");
for (let world = 1; world <= 4; world++) {
  const inWorld = rows.filter((r) => r.world === world).sort((a, b) => a.slot - b.slot);
  const steps: number[] = [];
  for (let i = 1; i < inWorld.length; i++) {
    steps.push(Math.abs(inWorld[i]!.score - inWorld[i - 1]!.score));
  }
  withinSteps.push(...steps);
  w(`| ${world} | ${median(steps).toFixed(2)} |`);
}
const pooled = median(withinSteps);
w(`| **pooled** | **${pooled.toFixed(2)}** |`);
w();
w(
  `**Upward** boundary steps above 2× the pooled median (${(2 * pooled).toFixed(2)}) are walls and must be fixed. **Downward** steps are the saw working — slot 1 sits at its tier floor while the previous slot 10 is a world peak — and are reported, not smoothed.`,
);
w();
w("| Boundary | from | to | step | direction | nearest previous-world level | verdict |");
w("|---|---:|---:|---:|---|---|---|");
for (let world = 1; world <= 3; world++) {
  const last = rows.find((r) => r.world === world && r.slot === 10)!;
  const next = rows.find((r) => r.world === world + 1 && r.slot === 1)!;
  const step = next.score - last.score;
  const previous = rows.filter((r) => r.world === world);
  const nearest = previous.reduce((best, r) =>
    Math.abs(r.score - next.score) < Math.abs(best.score - next.score) ? r : best,
  );
  const verdict =
    step > 0
      ? Math.abs(step) > 2 * pooled
        ? "**WALL — fix**"
        : "ok (upward, within tolerance)"
      : "expected (downward into valley)";
  w(
    `| ${last.id} → ${next.id} | ${last.score.toFixed(2)} | ${next.score.toFixed(2)} | ${step >= 0 ? "+" : ""}${step.toFixed(2)} | ` +
      `${step >= 0 ? "up" : "down"} | ${nearest.id} (${nearest.score.toFixed(2)}) | ${verdict} |`,
  );
}
w();
w(
  "The sanity check §7.3 asks for: each valley should land near a level the player cleared recently in the previous world, not below anything they have seen.",
);
w();

writeFileSync(join(dir, "CURATION.md"), out.join("\n"));
process.stdout.write(`Wrote ${join(dir, "CURATION.md")}\n`);
