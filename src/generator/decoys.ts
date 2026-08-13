import { enumerate, makePool, type OperatorBudget, type Rules } from "../solver/index.js";
import type { Rng } from "./rng.js";
import type { TierSpec } from "./tiers.js";

/**
 * GDD §3.1: "Surplus numbers are trap material, not filler. Every decoy must be
 * chosen because it creates a false decomposition... A decoy that creates no
 * false path is dead weight and must be rejected by the generator."
 */
export interface DecoyInfo {
  readonly value: number;
  /** How many new decompositions this decoy opened up, across all targets. */
  readonly newDecompositions: number;
  /** Targets that gained a reading because of it. */
  readonly affectedTargets: readonly number[];
}

export interface DecoyOutcome {
  readonly pool: readonly number[];
  readonly decoys: readonly DecoyInfo[];
  /** Candidate values tried and thrown out for creating nothing. */
  readonly inertRejections: number;
}

function decompositionCounts(
  pool: readonly number[],
  targets: readonly number[],
  budget: OperatorBudget,
  rules: Rules,
): number[] {
  const tiles = makePool(pool);
  return targets.map((t) => enumerate(tiles, t, budget, rules).length);
}

/**
 * Add `surplus` decoys, each of which must open at least one new reading of
 * some target. Inert candidates are rejected and counted — the count is the
 * interesting number, because it says how much of the value range is dead
 * weight for a given board.
 *
 * Returns null when no value in range creates anything, which rejects the board.
 */
export function addDecoys(
  pool: readonly number[],
  targets: readonly number[],
  surplus: number,
  tier: TierSpec,
  budget: OperatorBudget,
  rules: Rules,
  rng: Rng,
): DecoyOutcome | null {
  let current = [...pool];
  const decoys: DecoyInfo[] = [];
  let inertRejections = 0;

  for (let placed = 0; placed < surplus; placed++) {
    const before = decompositionCounts(current, targets, budget, rules);
    const candidates = rng.shuffle(
      Array.from({ length: tier.operandMax }, (_, i) => i + 1),
    );

    let chosen: DecoyInfo | null = null;
    for (const value of candidates) {
      const after = decompositionCounts([...current, value], targets, budget, rules);
      const affected: number[] = [];
      let gained = 0;
      for (let i = 0; i < after.length; i++) {
        const delta = after[i]! - before[i]!;
        if (delta > 0) {
          gained += delta;
          affected.push(i);
        }
      }
      if (gained === 0) {
        inertRejections++;
        continue;
      }
      chosen = { value, newDecompositions: gained, affectedTargets: affected };
      break;
    }

    if (!chosen) return null;
    current.push(chosen.value);
    decoys.push(chosen);
  }

  return { pool: current, decoys, inertRejections };
}
