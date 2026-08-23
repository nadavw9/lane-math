# Fresh corpora — generated 2026-08-23

Replaces `corpus-stale/`, which is quarantined: its metrics were computed under a
solver bug, and — the part that cannot be repaired by recomputing — inflated line
counts fed the uniqueness term, so boards that should have been retained were
rejected during generation and are simply not in it.

Generated under the current solver with:

- **exact Normal budgets** (§8.5 as amended). `solveNormalBudget` previously added
  `tier.normalSlack` random operators, so every board in `corpus-stale` carries a
  Normal budget the game does not ship — and Mid and Late take Normal as their
  mode of record, so their metrics were banded against it too.
- **the root requirement** (§7.6, §8.7). A board built with a squared operand is
  rejected unless every winning line uses the root: `root-optional`.
- **`generator.transforms` persisted.** It was computed and dropped, which is why
  the `√` disappearance could not be audited from `corpus-stale` at all.

| tier | seed | attempts | random | directed | boards |
|---|---|---|---|---|---|
| tutorial | 20260823 | 3000 | 162 (5.40%) | 42 (1.40%) | 204 |
| early | 20260823 | 3000 | 200 (12.63%) | 57 (1.90%) | 257 |
| mid | 20260823 | 3000 | 200 (12.45%) | 102 (3.40%) | 302 |
| late | 20260823 | 1500 | 107 (7.13%) | 19 (1.27%) | 126 |

Ladder slots drawn from these: **1-02** (tutorial, 171 eligible of 204) and
**2-01** (early, 98 eligible of 257).

## Why no Late board here could be 4-01 — resolved elsewhere

§7.6 unlocks `√` at 4-1, so that slot must be a board where the root is required.
Seven of these 126 Late boards are, and **none has an Expert budget** — §10 makes
all three modes mandatory on the curated 40. A second 6000-attempt run added 200
more boards and 7 more root-requiring ones, again with none. Measured over 900
raw constructions:

```
ROOT-REQUIRING boards  164   admit ANY exact budget  164/164 (100.0%)
                             admit a UNIQUE one        6/164   (3.7%)
ROOT-FREE boards       736   admit a UNIQUE one      282/736  (38.3%)
```

Expert's uniqueness rule (§8.5) costs a 10x collapse on root-requiring boards,
and the pipeline's earlier gates — `no-keystone` took 55%, `out-of-band` 18% —
removed the survivors before uniqueness was ever the binding constraint.

**4-01 was therefore drawn by an inverted search**, not from these corpora: reject
on the rare property FIRST (one cheap solve with the unary operators withheld),
and pay for full enumeration only on the ~2% that survive. 6000 attempts gave 124
root-required boards, 10 with a unique exact budget, and 1 in band with a live
trap. That board is `levels/4-01.json`; `src/game/root-unlock.test.ts` pins it.

The general lesson stands for future curation: **a rare structural requirement has
to be tested before the expensive gates, not after them.**
