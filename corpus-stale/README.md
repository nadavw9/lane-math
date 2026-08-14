# Stale corpus — do not use

1594 generated boards, quarantined. **Metrics here were computed under the pre-fix solver.**

## What was wrong

`legalMoves` cached on `stateKey`, a value-class multiset. A `Move` carries the *ids* of the tiles
it consumes, so on a pool with repeated values two distinct states collapsed onto one cache key:
the second received moves naming tiles it did not hold, `applyMove`'s id filter removed nothing,
and the state advanced a target while keeping a full pool.

Silent — no crash, no exception. It inflated line counts on exactly the boards most likely to be
interesting: large pools with duplicate values, which is every Late and Master board.

Fixed in `fix(solver): key the legal-move cache by tile identity, not value class`.

## Why refreshing cannot rescue it

Inflated `solutionPaths` fed the uniqueness term, which **over-rejected on uniqueness** — boards
that should have been retained were discarded during generation and are simply not here.
Recomputing the metrics of the survivors cannot recover boards that were never kept. The sample is
biased, not merely mislabelled.

## What to do instead

Regenerate from scratch when Master or Endless needs a corpus:

```sh
npm run generate -- --attempts 4000 --require-all-modes true
```

The 40-level launch ladder in `levels/` does **not** depend on this directory. It was re-derived
from disk under the fixed solver: zero unsolvable, zero out of band, one stale number corrected
(4-10 `solutionPaths` 337 → 309). It is frozen and verified.
