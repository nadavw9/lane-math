import type { Level } from "./types.js";

const isPositiveInteger = (n: number): boolean => Number.isInteger(n) && n > 0;

/**
 * Structural invariants the solver relies on. These are correctness guarantees,
 * not design bands — `T <= 7` (GDD §4.5) and the tier tables belong to the
 * generator's fitness function, not here.
 */
export function validateLevel(level: Level): void {
  const where = `level ${level.id}`;

  if (level.pool.length === 0) throw new Error(`${where}: pool is empty`);
  if (level.targets.length === 0) throw new Error(`${where}: target queue is empty`);

  // GDD §13: pool values are positive integers only. This is what makes a zero
  // divisor unrepresentable rather than a guarded special case.
  for (const [i, value] of level.pool.entries()) {
    if (!isPositiveInteger(value)) {
      throw new Error(`${where}: pool[${i}] = ${value} is not a positive integer`);
    }
  }

  for (const [i, target] of level.targets.entries()) {
    if (!Number.isInteger(target)) {
      throw new Error(`${where}: targets[${i}] = ${target} is not an integer`);
    }
  }

  // GDD §3.4 is a hard rule. Fractions are not implemented, by design — they
  // would break the premise that the arithmetic stays trivial.
  if (!level.rules.integerOnly) {
    throw new Error(`${where}: rules.integerOnly must be true (GDD §3.4)`);
  }
}
