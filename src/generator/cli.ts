import { main } from "./run.js";

/**
 * Entry point. Phase 1/2 has no UI — this is how the generator is driven.
 *
 *   npx vite-node src/generator/cli.ts
 *   npx vite-node src/generator/cli.ts --attempts 5000 --tiers late,expert
 *   npx vite-node src/generator/cli.ts --strategies random --seed 7
 */
const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const outDir = outIndex >= 0 ? (argv[outIndex + 1] ?? "generated") : "generated";
const append = argv.includes("--append");

main(argv, outDir, append);
