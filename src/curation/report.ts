import { WEIGHTS } from "./score.js";
import type { CurationResult, LadderSlot } from "./curate.js";

/** Vertical ASCII chart of the whole ladder in play order. */
export function renderCurve(ladder: readonly LadderSlot[]): string {
  if (ladder.length === 0) return "(no levels)";

  const scores = ladder.map((s) => s.breakdown.total);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const height = 16;
  const lines: string[] = [];

  const rowFor = (score: number): number =>
    max === min ? 0 : Math.round(((max - score) / (max - min)) * (height - 1));

  const rows = ladder.map((s) => rowFor(s.breakdown.total));

  for (let row = 0; row < height; row++) {
    const value = max - ((max - min) * row) / (height - 1);
    let line = value.toFixed(1).padStart(5) + " |";
    for (let i = 0; i < ladder.length; i++) {
      const cell = rows[i] === row ? "*" : rows[i]! < row ? "|" : " ";
      // One space between worlds so the boundaries read.
      const gap = i > 0 && ladder[i]!.world !== ladder[i - 1]!.world ? " " : "";
      line += gap + cell;
    }
    lines.push(line);
  }

  let axis = "      +";
  let labels = "       ";
  for (let i = 0; i < ladder.length; i++) {
    const gap = i > 0 && ladder[i]!.world !== ladder[i - 1]!.world ? "+" : "";
    axis += gap + "-";
    labels += (i > 0 && ladder[i]!.world !== ladder[i - 1]!.world ? " " : "") +
      (ladder[i]!.slot === 1 ? String(ladder[i]!.world) : ladder[i]!.slot === 10 ? "·" : " ");
  }
  lines.push(axis);
  lines.push(labels + "   (world number at slot 1, · at slot 10)");

  return lines.join("\n");
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function renderCurationReport(
  result: CurationResult,
  withoutUniqueness?: CurationResult,
): string {
  const out: string[] = [];
  const w = (s = "") => out.push(s);
  const { ladder, unfilled, poolSizes } = result;

  w("# Lane Math — curated launch ladder");
  w();
  w(`${ladder.length} of 40 slots filled · 4 worlds × 10 levels · GDD §7.2`);
  w();
  w(
    "Every ladder level carries a valid Casual, Normal **and** Expert budget (§10: the corpus may be permissive, the ladder may not). Master tier is post-launch and unused (§8.7).",
  );
  w();

  w("## Composite difficulty score");
  w();
  w("| Input | Weight | Why |");
  w("|---|---:|---|");
  w(
    `| lookaheadDistance | ${WEIGHTS.lookaheadDistance.toFixed(1)} | §8.2 calls it "the primary difficulty metric" — targets held in mind at once |`,
  );
  w(
    `| decisionPoints (dPath) | ${WEIGHTS.decisionPoints.toFixed(1)} | Search burden: targets that actually branch when reached |`,
  );
  w(
    `| maxTrapDepth | ${WEIGHTS.maxTrapDepth.toFixed(1)} | Frustration rather than difficulty — distance from mistake to failure |`,
  );
  w(
    `| T (targets) | ${WEIGHTS.targetCount.toFixed(1)} | Length. Lowest: §4.5 says difficulty comes from keystone structure, not length |`,
  );
  w();
  w(
    "`solutionPaths` is deliberately excluded — it measures forgiveness, not difficulty, and ranges 1–4000 in the corpus, so it would dominate the ordering.",
  );
  w();

  w("## The 40 levels");
  w();
  w("| id | role | tier | T | S | dPoints | lookahead | keystones | trapDepth | paths | score | score −uniq |");
  w("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const slot of ladder) {
    const c = slot.candidate;
    w(
      `| **${slot.id}** | ${slot.role} | ${c.tier.name} | ${c.level.targets.length} | ${c.level.surplus} | ` +
        `${c.decisionPoints} | ${c.lookahead} | ${c.keystones} | ${c.maxTrapDepth} | ${slot.breakdown.solutionPaths} | ` +
        `${slot.breakdown.total.toFixed(1)} | ${slot.breakdown.totalWithoutUniqueness.toFixed(1)} |`,
    );
  }
  w();

  w("## Difficulty curve");
  w();
  w("```");
  w(renderCurve(ladder));
  w("```");
  w();

  w("### Valley check (GDD §7.3, amended)");
  w();
  w(
    "Slot 1 of each world must be the minimum composite **within its own world** and sit at the floor of its tier band on lookahead and decisionPoints. There is no cross-world absolute comparison: T is fixed per world by §7.2 and both lookahead and decisionPoints scale with it, so absolute score rises at every boundary by construction — and correctly, since player skill rises too.",
  );
  w();
  w("| World | slot 1 | world min | is min? | lookahead (floor) | dPoints (floor) | at floor? |");
  w("|---|---:|---:|---|---|---|---|");
  for (let world = 1; world <= 4; world++) {
    const inWorld = ladder.filter((s) => s.world === world);
    if (inWorld.length === 0) continue;
    const opener = inWorld.find((s) => s.slot === 1);
    if (!opener) continue;
    const worldMin = Math.min(...inWorld.map((s) => s.breakdown.total));
    const tier = opener.candidate.tier;
    const atFloor =
      opener.candidate.lookahead === tier.lookahead.min &&
      opener.candidate.decisionPoints === tier.decisionPoints.min;
    w(
      `| ${world} | ${opener.breakdown.total.toFixed(1)} | ${worldMin.toFixed(1)} | ` +
        `${opener.breakdown.total === worldMin ? "yes" : "NO"} | ` +
        `${opener.candidate.lookahead} (${tier.lookahead.min}) | ` +
        `${opener.candidate.decisionPoints} (${tier.decisionPoints.min}) | ${atFloor ? "yes" : "NO"} |`,
    );
  }
  w();

  w("### Step sizes and boundary cliffs");
  w();
  const withinSteps: number[] = [];
  const perWorldMedian = new Map<number, number>();
  for (let world = 1; world <= 4; world++) {
    const inWorld = ladder.filter((s) => s.world === world).sort((a, b) => a.slot - b.slot);
    const steps: number[] = [];
    for (let i = 1; i < inWorld.length; i++) {
      steps.push(Math.abs(inWorld[i]!.breakdown.total - inWorld[i - 1]!.breakdown.total));
    }
    withinSteps.push(...steps);
    perWorldMedian.set(world, median(steps));
  }
  const pooledMedian = median(withinSteps);

  w("| World | median within-world step |");
  w("|---|---:|");
  for (const [world, med] of perWorldMedian) w(`| ${world} | ${med.toFixed(2)} |`);
  w(`| **pooled** | **${pooledMedian.toFixed(2)}** |`);
  w();
  w(
    `A boundary step is flagged when it exceeds **2× the pooled within-world median** (${(2 * pooledMedian).toFixed(2)}). Direction is irrelevant — a jump of 3.0 where levels normally step 0.5 is a wall whichever way it points.`,
  );
  w();
  w("| Boundary | from | to | step | vs pooled median | flag |");
  w("|---|---:|---:|---:|---:|---|");
  for (let world = 1; world <= 3; world++) {
    const last = ladder.find((s) => s.world === world && s.slot === 10);
    const next = ladder.find((s) => s.world === world + 1 && s.slot === 1);
    if (!last || !next) continue;
    const step = next.breakdown.total - last.breakdown.total;
    const ratio = pooledMedian === 0 ? Infinity : Math.abs(step) / pooledMedian;
    const flagged = ratio > 2;
    w(
      `| ${world}-10 → ${world + 1}-01 | ${last.breakdown.total.toFixed(1)} | ${next.breakdown.total.toFixed(1)} | ` +
        `${step >= 0 ? "+" : ""}${step.toFixed(1)} | ${ratio.toFixed(1)}× | ${flagged ? "**CLIFF**" : "ok"} |`,
    );
  }
  w();

  if (withoutUniqueness) {
    w("## Effect of the uniqueness term");
    w();
    w(
      "`uniqueness = 1 / log2(solutionPaths + 1)`, weight 1.0. The whole curation is run twice — the term affects selection, not just display, so comparing rendered scores alone would understate it.",
    );
    w();
    const other = new Map(withoutUniqueness.ladder.map((s) => [s.id, s]));
    const changed = ladder.filter(
      (s) => other.get(s.id)?.candidate.level.generator.hash !== s.candidate.level.generator.hash,
    );
    w(
      `**${changed.length} of ${ladder.length} slots receive a different board** when the term is removed.`,
    );
    w();
    if (changed.length > 0) {
      w("| id | with uniqueness | paths | without uniqueness | paths |");
      w("|---|---|---:|---|---:|");
      for (const slot of changed) {
        const alt = other.get(slot.id);
        w(
          `| ${slot.id} | ${slot.candidate.level.id} (${slot.breakdown.total.toFixed(1)}) | ${slot.breakdown.solutionPaths} | ` +
            `${alt ? alt.candidate.level.id : "—"} (${alt ? alt.breakdown.totalWithoutUniqueness.toFixed(1) : "—"}) | ${alt?.breakdown.solutionPaths ?? "—"} |`,
        );
      }
      w();
    } else {
      w(
        "The term changes nothing on this corpus — every slot selects the same board either way. It can be dropped.",
      );
      w();
    }
  }

  w("## Candidate pools");
  w();
  w("| Tier | Boards with all three modes |");
  w("|---|---:|");
  for (const [tier, size] of poolSizes) w(`| ${tier} | ${size} |`);
  w();

  w("## Unfilled slots");
  w();
  if (unfilled.length === 0) {
    w("None — all 40 slots filled.");
  } else {
    w("| id | role | reason |");
    w("|---|---|---|");
    for (const slot of unfilled) w(`| ${slot.id} | ${slot.role} | ${slot.reason} |`);
  }
  w();

  return out.join("\n");
}
