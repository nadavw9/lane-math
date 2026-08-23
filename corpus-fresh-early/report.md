# Lane Math — generator distribution report

Generated 2026-08-23T11:25:17.781Z · seed `20260823` · 3000 attempts per tier per strategy

**257 accepted from 4584 attempts** (5.61%) in 2.0s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| early | random | 1584 | 200 | 12.63% | 0.3 | 3 |
| early | directed | 3000 | 57 | 1.90% | 0.5 | 26 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | root-optional | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| early | random |  | 489 |  | 162 | 309 |  |  | 424 |  |  |
| early | directed |  | 625 |  | 167 | 602 |  |  | 1549 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| early | random | 0 |
| early | directed | 0 |

## Achieved metrics vs target bands

### early · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×200 | 1×394  2×205  3×24  4×1 |
| lookaheadDistance | 1–2 | 1 / 1 / 2 | 1×101  2×99 | 1×112  2×165  3×207  4×140 |
| decisionPoints | 1–2 | 1 / 2 / 2 | 1×58  2×142 | 1×161  2×322  3×129  4×12 |
| solutionPaths | any | 1 / 1 / 5 | 1×130  2×57  3×7  4×5  5×1 | 1×416  2×157  3×21  4×22  5×4  6×3  7×1 |
| maxTrapDepth | — | 1 / 2 / 4 | 1×42  2×68  3×53  4×37 | 1×78  2×136  3×207  4×203 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×200 | 0×509  1×103  2×8  3×4 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 3 / 4 | 3.04 | 1×16  2×135  3×284  4×189 | 24.20% |
| dPath (correct) | 1 / 2 / 4 | 1.99 | 1×161  2×322  3×129  4×12 | 77.40% |

The last column isolates ONE criterion. Overall band pass is **32.05%** (200 of 624 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 347 |
| keystones | 230 |
| decisionPoints | 141 |

Peak temptation (min/med/max): 0.5 / 0.517 / 0.69

### early · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×57 | 1×1031  2×486  3×84  4×5 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×6  2×51 | 1×8  2×77  3×712  4×809 |
| decisionPoints | 1–2 | 1 / 1 / 2 | 1×33  2×24 | 1×256  2×675  3×544  4×131 |
| solutionPaths | any | 1 / 1 / 3 | 1×49  2×6  3×2 | 1×1064  2×406  3×58  4×51  5×5  6×14  7×5  8×1  12×2 |
| maxTrapDepth | — | 1 / 2 / 3 | 1×18  2×30  3×9 | 1×84  2×255  3×647  4×620 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×57 | 0×1287  1×274  2×22  3×22  6×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 3 / 4 | 3.01 | 1×64  2×335  3×729  4×478 | 24.84% |
| dPath (correct) | 1 / 2 / 4 | 2.34 | 1×256  2×675  3×544  4×131 | 57.97% |

The last column isolates ONE criterion. Overall band pass is **3.55%** (57 of 1606 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 1521 |
| decisionPoints | 675 |
| keystones | 575 |

Peak temptation (min/med/max): 0.5 / 0.509 / 0.674

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| early | random | early (k1/l2/d2)×81<br>early (k1/l1/d2)×61<br>early (k1/l1/d1)×40 | early (k1/l2/d2)×61<br>early (k1/l1/d1)×53<br>early (k1/l1/d2)×40 | early (k1/l1/d1)×50<br>early (k1/l2/d2)×43<br>absent×38 |
| early | directed | early (k1/l2/d1)×30<br>early (k1/l2/d2)×21<br>early (k1/l1/d1)×3 | early (k1/l2/d1)×28<br>early (k1/l2/d2)×14<br>early (k1/l1/d1)×4 | early (k1/l2/d1)×25<br>early (k1/l2/d2)×11<br>absent×5 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
