# Lane Math — generator distribution report

Generated 2026-08-23T11:25:12.951Z · seed `20260823` · 3000 attempts per tier per strategy

**204 accepted from 6000 attempts** (3.40%) in 0.5s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| tutorial | random | 3000 | 162 | 5.40% | 0.1 | 1 |
| tutorial | directed | 3000 | 42 | 1.40% | 0.1 | 7 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | root-optional | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tutorial | random |  | 1131 |  | 873 | 493 |  |  | 341 |  |  |
| tutorial | directed |  | 661 |  | 750 | 775 |  |  | 772 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| tutorial | random | 0 |
| tutorial | directed | 0 |

## Achieved metrics vs target bands

### tutorial · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×162 | 1×378  2×125 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×162 | 1×167  2×336 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×162 | 1×425  2×78 |
| solutionPaths | any | 1 / 1 / 2 | 1×156  2×6 | 1×474  2×29 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×114  2×48 | 1×277  2×226 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×162 | 0×438  1×65 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 2 / 2 | 1.64 | 1×181  2×322 | 35.98% |
| dPath (correct) | 1 / 1 / 2 | 1.16 | 1×425  2×78 | 84.49% |

The last column isolates ONE criterion. Overall band pass is **32.21%** (162 of 503 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 336 |
| keystones | 125 |
| decisionPoints | 78 |

Peak temptation (min/med/max): 0.5 / 0.518 / 0.732

### tutorial · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×42 | 1×624  2×190 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×42 | 1×46  2×768 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×42 | 1×563  2×251 |
| solutionPaths | any | 1 / 1 / 1 | 1×42 | 1×761  2×53 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×33  2×9 | 1×359  2×455 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×42 | 0×716  1×98 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 2 / 2 | 1.66 | 1×273  2×541 | 33.54% |
| dPath (correct) | 1 / 1 / 2 | 1.31 | 1×563  2×251 | 69.16% |

The last column isolates ONE criterion. Overall band pass is **5.16%** (42 of 814 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 768 |
| decisionPoints | 251 |
| keystones | 190 |

Peak temptation (min/med/max): 0.5 / 0.642 / 0.676

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| tutorial | random | tutorial (k1/l1/d1)×162 | tutorial (k1/l1/d1)×140<br>none (k2/l2/d1)×15<br>tutorial (k1/l1/d0)×4 | tutorial (k1/l1/d1)×134<br>none (k2/l2/d1)×15<br>absent×6 |
| tutorial | directed | tutorial (k1/l1/d1)×42 | tutorial (k1/l1/d1)×37<br>tutorial (k1/l1/d0)×4<br>none (k2/l1/d0)×1 | tutorial (k1/l1/d1)×37<br>tutorial (k1/l1/d0)×4<br>none (k2/l1/d0)×1 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
