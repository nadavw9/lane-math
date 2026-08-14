import { LAUNCH_TIERS } from "../generator/tiers.js";
import { loadCorpus, poolFor } from "./curate.js";
import { isNearForced, isTrapShaped, isTwoKeystone } from "./slots.js";

/**
 * Pool composition per tier, before any selection happens.
 *
 * Exists because "there are enough two-keystone boards" is an assumption until
 * counted, and a shortfall has to be known before a world is ordered rather
 * than discovered afterwards.
 *
 *   npx vite-node src/curation/audit-cli.ts [corpusDir]
 */
const corpus = loadCorpus(process.argv[2] ?? "generated");

process.stdout.write(`corpus: ${corpus.length} boards\n\n`);

for (const tier of LAUNCH_TIERS) {
  const all = corpus.filter((l) => l.generator.targetTier === tier.name);
  const pool = poolFor(corpus, tier);

  // Every board in the corpus was accepted against its tier band, so pool
  // membership already implies in-band; the filter here is all-three-modes.
  const keystoneHistogram = new Map<number, number>();
  for (const c of pool) {
    keystoneHistogram.set(c.keystones, (keystoneHistogram.get(c.keystones) ?? 0) + 1);
  }

  const twoKeystone = pool.filter(isTwoKeystone).length;
  const nearForced = pool.filter(isNearForced).length;
  const trapShaped = pool.filter(isTrapShaped).length;

  process.stdout.write(
    `${tier.name.padEnd(9)} world ${tier.ladderWorld}  ops ${[...tier.ops, ...tier.unaryOps].join("")}\n` +
      `  generated              ${all.length}\n` +
      `  in-band + all 3 modes  ${pool.length}\n` +
      `  keystones              ${[...keystoneHistogram.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, n]) => `${k}x${n}`)
        .join("  ")}\n` +
      `  two-keystone           ${twoKeystone}${tier.name === "late" ? twoKeystone >= 3 ? "  (need 3 for 4-08/09/10 — OK)" : `  (need 3 for 4-08/09/10 — SHORT by ${3 - twoKeystone})` : ""}\n` +
      `  near-forced            ${nearForced}${tier.name === "tutorial" ? nearForced >= 1 ? "  (need 1 for 1-01 — OK)" : "  (need 1 for 1-01 — SHORT)" : ""}\n` +
      `  trap-shaped            ${trapShaped}${tier.name === "tutorial" ? trapShaped >= 2 ? "  (need 2 for 1-04/1-06 — OK)" : `  (need 2 for 1-04/1-06 — SHORT by ${2 - trapShaped})` : ""}\n` +
      `  score range            ${pool.length > 0 ? `${pool[0]!.score.toFixed(1)} .. ${pool[pool.length - 1]!.score.toFixed(1)}` : "—"}\n\n`,
  );
}
