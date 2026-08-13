import type { Level } from "../types.js";

/**
 * The canonical level from GDD §1. This is the regression anchor for the whole
 * solver: its metrics are asserted exactly, and a change that moves them is
 * either a bug or a deliberate redefinition that belongs in the GDD first.
 *
 *   Pool:    1, 2, 2, 3, 4, 5
 *   Queue:   8 -> 3 -> 15
 *
 * The only winning line is 8 = 2x4, 3 = 1+2, 15 = 3x5.
 */
export const CANONICAL: Level = {
  id: "fixture-canonical",
  pool: [1, 2, 2, 3, 4, 5],
  targets: [8, 3, 15],
  operators: {
    // Free: every operator unlimited.
    casual: { "+": null, "-": null, "*": null },
    // Counted, as written in GDD §10's sample level format.
    normal: { "+": 2, "-": 1, "*": 1 },
    // Consumed: sum of binary counts === T.
    expert: { "+": 1, "-": 1, "*": 1 },
  },
  rules: { allowNegative: false, integerOnly: true },
};

/**
 * Consumed budget that actually admits the winning line (* twice, + once).
 * GDD §10's `expert` block does not — see the cross-mode solvability test.
 */
export const CONSUMED_SOLVABLE = { "+": 1, "*": 2 } as const;
