import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { tierByName, type TierName } from "../generator/tiers.js";
import { WEIGHTS, uniquenessScore } from "./score.js";

/**
 * Re-order the curated ladder in place under the amended composite (GDD §8.4).
 *
 * SELECTION IS FROZEN. The same 40 boards, no regeneration, no re-picking —
 * only which slot each board occupies, and only within its own world.
 *
 * Role slots are preserved because they carry the §7.4 beat sheet: 1-01
 * near-forced, 1-04 the scripted trap, 1-05 its recovery valley, 1-06 the
 * retest, and every world's slot-1 valley. Each world's PEAK is recomputed —
 * that assignment is what the missing forgiveness term got wrong.
 *
 *   npx vite-node src/curation/reorder-cli.ts [levelsDir]
 */
const dir = process.argv[2] ?? "levels";

interface Ladder {
  id: string;
  world: number;
  generator: { targetTier: TierName };
  modes: Record<string, { metrics: Record<string, number> }>;
  curation: { role: string; slot: number; compositeScore: number; scoreInputs?: unknown };
  [k: string]: unknown;
}

const files = readdirSync(dir).filter((f) => /^\d-\d\d\.json$/.test(f)).sort();
const levels: Ladder[] = files.map(
  (f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Ladder,
);

function composite(level: Ladder): { total: number; survival: number; parts: Record<string, number> } {
  const tier = tierByName(level.generator.targetTier);
  const m = level.modes[tier.modeOfRecord]!.metrics;
  const targetCount = (level.targets as number[]).length;
  const survival = m.survivalRate ?? 0;
  const forgiveness = 1 - survival;
  const uniqueness = uniquenessScore(m.solutionPaths!);

  const total =
    WEIGHTS.lookaheadDistance * m.lookaheadDistance! +
    WEIGHTS.decisionPoints * m.decisionPoints! +
    WEIGHTS.forgivenessPenalty * forgiveness +
    WEIGHTS.maxTrapDepth * m.maxTrapDepth! +
    WEIGHTS.targetCount * targetCount +
    WEIGHTS.uniqueness * uniqueness;

  return {
    total: Math.round(total * 100) / 100,
    survival,
    parts: {
      lookaheadDistance: m.lookaheadDistance!,
      decisionPoints: m.decisionPoints!,
      forgivenessPenalty: Math.round(forgiveness * 1000) / 1000,
      maxTrapDepth: m.maxTrapDepth!,
      targetCount,
      uniqueness: Math.round(uniqueness * 1000) / 1000,
    },
  };
}

/** Slots whose board must not move, per world. */
const PINNED: Record<number, number[]> = {
  1: [1, 4, 5, 6], // §7.4 beat sheet: near-forced, trap, valley, retest
  2: [1], // world valley
  3: [1],
  4: [1], // plus the 8-10 two-keystone block, handled separately
};

const roleFor = (world: number, slot: number, original: string): string => {
  // World 1 follows §7.4's beat sheet, which names its own slots; 1-02 and 1-03
  // are "free decisions appear", not valleys.
  if (world === 1) {
    if (slot === 1 || slot === 4 || slot === 5 || slot === 6) return original;
    return slot === 10 ? "world-peak" : "standard";
  }
  if (world === 4 && (slot === 8 || slot === 9)) return "two-keystone";
  if (slot === 10) return "world-peak";
  if (slot <= 2) return "valley";
  return "standard";
};

const results: { id: string; from: number; to: number; score: number; survival: number }[] = [];
const assignments: { level: Ladder; world: number; slot: number }[] = [];
const notes: string[] = [];

/**
 * GDD §7.3: slot 10 is the minimum-survivalRate board in its world, composite
 * breaking ties. A constraint on the slot, not a term in the score — the
 * composite measures reasoning demanded, survivalRate punishment for skipping
 * it, and a structural lead on the former can outrank a 20x gap in the latter.
 */
const pickFinale = (candidates: readonly Ladder[]): Ladder | undefined =>
  [...candidates].sort((a, b) => {
    const sa = composite(a).survival;
    const sb = composite(b).survival;
    if (sa !== sb) return sa - sb;
    return composite(b).total - composite(a).total;
  })[0];

for (let world = 1; world <= 4; world++) {
  const inWorld = levels.filter((l) => l.world === world);
  const pinnedSlots = PINNED[world] ?? [];
  const blockSlots = world === 4 ? [8, 9, 10] : [];

  const byOldSlot = new Map(inWorld.map((l) => [l.curation.slot, l]));
  const slotOf = new Map<number, Ladder>();

  for (const slot of pinnedSlots) {
    const level = byOldSlot.get(slot);
    if (level) slotOf.set(slot, level);
  }

  const pinnedBoards = new Set(slotOf.values());
  const block = blockSlots
    .map((s) => byOldSlot.get(s))
    .filter((l): l is Ladder => l !== undefined);

  // Slot 10 must come from the two-keystone block in World 4, and from any
  // unpinned board elsewhere. Report a conflict rather than resolving it.
  const finaleCandidates = world === 4 ? block : inWorld.filter((l) => !pinnedBoards.has(l));
  const finale = pickFinale(finaleCandidates);

  if (world === 4) {
    const globalMin = pickFinale(inWorld.filter((l) => !pinnedBoards.has(l)));
    if (globalMin && finale && globalMin !== finale) {
      notes.push(
        `CONFLICT world 4: minimum-survival board is ${globalMin.id} ` +
          `(${(composite(globalMin).survival * 100).toFixed(1)}%) but it is not two-keystone; ` +
          `finale falls to ${finale.id} (${(composite(finale).survival * 100).toFixed(1)}%). NOT RESOLVED.`,
      );
    } else {
      notes.push(
        `world 4: minimum-survival board is also two-keystone — finale constraint and ` +
          `the 4-08..4-10 block agree.`,
      );
    }
  }

  if (finale) slotOf.set(10, finale);

  // Remaining block members fill 8 and 9, ordered by composite.
  if (blockSlots.length > 0) {
    const rest = block
      .filter((l) => l !== finale)
      .sort((a, b) => composite(a).total - composite(b).total);
    [8, 9].forEach((slot, i) => {
      if (rest[i]) slotOf.set(slot, rest[i]!);
    });
  }

  const placed = new Set([...slotOf.values()]);
  const free = inWorld.filter((l) => !placed.has(l)).sort((a, b) => composite(a).total - composite(b).total);
  const freeSlots: number[] = [];
  for (let slot = 1; slot <= 10; slot++) if (!slotOf.has(slot)) freeSlots.push(slot);

  freeSlots.forEach((slot, i) => {
    if (free[i]) slotOf.set(slot, free[i]!);
  });

  for (const [slot, level] of [...slotOf.entries()].sort((a, b) => a[0] - b[0])) {
    assignments.push({ level, world, slot });
    const c = composite(level);
    results.push({ id: level.id, from: level.curation.slot, to: slot, score: c.total, survival: c.survival });
  }
}

// Rewrite. Old files are removed first because ids move between slots.
for (const file of files) unlinkSync(join(dir, file));

for (const { level, world, slot } of assignments) {
  const id = `${world}-${String(slot).padStart(2, "0")}`;
  const c = composite(level);
  const next = {
    ...level,
    id,
    world,
    curation: {
      role: roleFor(world, slot, level.curation.role),
      slot,
      compositeScore: c.total,
      scoreInputs: c.parts,
    },
  };
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(next, null, 2) + "\n");
}

const moved = results.filter((r) => r.from !== r.to);
process.stdout.write(
  `Re-ordered ${assignments.length} levels under the amended composite.\n` +
    `${moved.length} changed slot.\n\n`,
);
for (let world = 1; world <= 4; world++) {
  const rows = results.filter((r) => r.id.startsWith(`${world}-`));
  const changed = rows.filter((r) => r.from !== r.to).length;
  const inWorld = assignments.filter((a) => a.world === world);
  const finale = inWorld.find((a) => a.slot === 10)!;
  const minSurvival = Math.min(...inWorld.map((a) => composite(a.level).survival));
  const ok = composite(finale.level).survival === minSurvival;
  process.stdout.write(
    `world ${world}: ${changed === 0 ? "UNCHANGED" : `${changed} of 10 moved`}  ` +
      `finale survival ${(composite(finale.level).survival * 100).toFixed(1)}% ` +
      `(world min ${(minSurvival * 100).toFixed(1)}%) ${ok ? "OK" : "VIOLATED"}\n`,
  );
}
for (const note of notes) process.stdout.write(`\n${note}\n`);
