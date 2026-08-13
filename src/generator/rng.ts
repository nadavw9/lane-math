/**
 * Seeded PRNG. Generation must be reproducible: a yield number nobody can
 * re-run is not evidence, and a level batch that cannot be regenerated cannot
 * be re-curated after a band change.
 */
export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  chance(probability: number): boolean;
}

/** FNV-1a. Used to derive independent per-tier/per-strategy streams from one seed. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, good enough for rejection sampling. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (minInclusive: number, maxInclusive: number): number =>
    minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));

  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!,
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
    chance: (probability: number): boolean => next() < probability,
  };
}
