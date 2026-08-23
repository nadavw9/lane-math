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

## Known gap: no Late board here can be 4-01

§7.6 unlocks `√` at 4-1, so that slot must be a board where the root is required.
Seven of the 126 Late boards are, and **none of them has an Expert budget** —
§10 makes all three modes mandatory on the curated 40, so none can take a ladder
slot. Measured over 900 fresh Late constructions:

```
ROOT-REQUIRING boards  164   admit ANY exact budget  164/164 (100.0%)
                             admit a UNIQUE one        6/164   (3.7%)
ROOT-FREE boards       736   admit a UNIQUE one      282/736  (38.3%)
```

Expert's uniqueness rule (§8.5) costs a 10x collapse on root-requiring boards.
It is not zero, so a larger run can find one; it is not a sampling artefact
either. Unresolved — see the session notes.
