# Lane Math — generator distribution report

Generated 2026-08-23T12:09:03.032Z · seed `20260824` · 6000 attempts per tier per strategy

**322 accepted from 12000 attempts** (2.68%) in 2.0s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| tutorial-trapless | random | 6000 | 152 | 2.53% | 0.2 | 7 |
| tutorial-trapless | directed | 6000 | 170 | 2.83% | 0.2 | 6 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | root-optional | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tutorial-trapless | random |  |  |  | 3635 |  |  |  | 2210 | 3 |  |
| tutorial-trapless | directed |  |  |  | 4399 |  |  |  | 1420 | 11 |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| tutorial-trapless | random | 0 |
| tutorial-trapless | directed | 0 |

## Achieved metrics vs target bands

### tutorial-trapless · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 0–1 | 1 / 1 / 1 | 1×152 | 0×805  1×867  2×348 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×74  2×78 | 0×805  1×630  2×585 |
| decisionPoints | 1–2 | 1 / 1 / 1 | 1×152 | 0×1566  1×444  2×10 |
| solutionPaths | any | 2 / 2 / 2 | 2×152 | 1×1566  2×436  3×14  4×3  6×1 |
| maxTrapDepth | — | 0 / 0 / 0 | 0×152 | 0×2020 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×152 | 0×1738  1×282 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 0 / 1 / 3 | 1.12 | 0×664  1×612  2×580  3×164 | 59.01% |
| dPath (correct) | 0 / 0 / 2 | 0.23 | 0×1566  1×444  2×10 | 22.48% |

The last column isolates ONE criterion. Overall band pass is **7.52%** (152 of 2020 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| decisionPoints | 1842 |
| lookahead | 960 |
| keystones | 408 |

Peak temptation (min/med/max): 0 / 0 / 0

### tutorial-trapless · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 0–1 | 1 / 1 / 1 | 1×170 | 0×263  1×891  2×436 |
| lookaheadDistance | 1–2 | 2 / 2 / 2 | 2×170 | 0×263  1×479  2×848 |
| decisionPoints | 1–2 | 1 / 1 / 1 | 1×170 | 0×1182  1×378  2×30 |
| solutionPaths | any | 2 / 2 / 2 | 2×170 | 1×1182  2×367  3×16  4×8  6×17 |
| maxTrapDepth | — | 0 / 0 / 0 | 0×170 | 0×1590 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×170 | 0×1237  1×353 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 0 / 0 / 3 | 0.88 | 0×797  1×385  2×210  3×198 | 37.42% |
| dPath (correct) | 0 / 0 / 2 | 0.28 | 0×1182  1×378  2×30 | 25.66% |

The last column isolates ONE criterion. Overall band pass is **10.69%** (170 of 1590 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| decisionPoints | 1182 |
| keystones | 436 |
| lookahead | 263 |

Peak temptation (min/med/max): 0 / 0 / 0

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| tutorial-trapless | random | tutorial-trapless (k1/l2/d1)×78<br>tutorial-trapless (k1/l1/d1)×74 | tutorial-trapless (k1/l2/d1)×78<br>tutorial-trapless (k1/l1/d1)×71<br>none (k1/l1/d0)×2 | absent×149<br>none (k1/l1/d0)×2<br>none (k0/l0/d0)×1 |
| tutorial-trapless | directed | tutorial-trapless (k1/l2/d1)×170 | tutorial-trapless (k1/l2/d1)×169<br>none (k1/l2/d0)×1 | absent×169<br>none (k1/l2/d0)×1 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
