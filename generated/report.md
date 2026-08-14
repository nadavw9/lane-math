# Lane Math — generator distribution report

Generated 2026-08-14T05:35:09.892Z · seed `20260813` · 4000 attempts per tier per strategy

**1197 accepted from 24000 attempts** (4.99%) in 20.9s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| tutorial | random | 4000 | 239 | 5.97% | 0.1 | 1 |
| tutorial | directed | 4000 | 72 | 1.80% | 0.1 | 4 |
| early | random | 4000 | 399 | 9.97% | 0.3 | 3 |
| early | directed | 4000 | 68 | 1.70% | 0.4 | 21 |
| mid | random | 4000 | 318 | 7.95% | 1.8 | 22 |
| mid | directed | 4000 | 101 | 2.52% | 2.7 | 107 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tutorial | random |  | 1418 | 1191 | 710 |  | 34 | 405 | 3 |  |
| tutorial | directed |  | 942 | 947 | 1008 |  | 70 | 958 | 3 |  |
| early | random |  | 1239 | 338 | 810 |  | 308 | 906 |  |  |
| early | directed |  | 857 | 161 | 895 |  | 421 | 1598 |  |  |
| mid | random |  | 1997 | 72 | 299 |  | 634 | 680 |  |  |
| mid | directed |  | 1781 | 8 | 154 |  | 820 | 1136 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| tutorial | random | 0 |
| tutorial | directed | 0 |
| early | random | 0 |
| early | directed | 0 |
| mid | random | 1601 |
| mid | directed | 1951 |

## Achieved metrics vs target bands

### tutorial · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×239 | 1×491  2×153 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×239 | 1×243  2×401 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×239 | 1×564  2×80 |
| solutionPaths | any | 1 / 1 / 2 | 1×234  2×5 | 1×635  2×9 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×172  2×67 | 1×368  2×276 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×239 | 0×563  1×81 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 2 / 2 | 1.63 | 1×238  2×406 | 36.96% |
| dPath (correct) | 1 / 1 / 2 | 1.12 | 1×564  2×80 | 87.58% |

The last column isolates ONE criterion. Overall band pass is **37.11%** (239 of 644 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 401 |
| keystones | 153 |
| decisionPoints | 80 |

Peak temptation (min/med/max): 0.5 / 0.533 / 0.72

### tutorial · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×72 | 1×795  2×235 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×72 | 1×82  2×948 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×72 | 1×709  2×321 |
| solutionPaths | any | 1 / 1 / 1 | 1×72 | 1×999  2×31 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×55  2×17 | 1×452  2×578 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×72 | 0×910  1×120 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 2 / 2 | 1.67 | 1×341  2×689 | 33.11% |
| dPath (correct) | 1 / 1 / 2 | 1.31 | 1×709  2×321 | 68.83% |

The last column isolates ONE criterion. Overall band pass is **6.99%** (72 of 1030 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 948 |
| decisionPoints | 321 |
| keystones | 235 |

Peak temptation (min/med/max): 0.5 / 0.578 / 0.688

### early · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×399 | 1×797  2×423  3×81  4×4 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×185  2×214 | 1×233  2×333  3×488  4×251 |
| decisionPoints | 1–2 | 1 / 2 / 2 | 1×177  2×222 | 1×455  2×562  3×270  4×18 |
| solutionPaths | any | 1 / 1 / 8 | 1×337  2×46  3×14  4×1  8×1 | 1×1091  2×152  3×40  4×10  5×6  6×4  7×1  8×1 |
| maxTrapDepth | — | 1 / 2 / 4 | 1×83  2×126  3×139  4×51 | 1×169  2×311  3×498  4×327 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×399 | 0×1036  1×227  2×25  3×14  4×3 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 3 / 4 | 2.86 | 1×74  2×340  3×588  4×303 | 31.72% |
| dPath (correct) | 1 / 2 / 4 | 1.89 | 1×455  2×562  3×270  4×18 | 77.93% |

The last column isolates ONE criterion. Overall band pass is **30.57%** (399 of 1305 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 739 |
| keystones | 508 |
| decisionPoints | 288 |

Peak temptation (min/med/max): 0.5 / 0.517 / 0.688

### early · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×68 | 1×1046  2×514  3×100  4×6 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×6  2×62 | 1×10  2×98  3×844  4×714 |
| decisionPoints | 1–2 | 1 / 1 / 2 | 1×38  2×30 | 1×313  2×735  3×505  4×113 |
| solutionPaths | any | 1 / 1 / 2 | 1×63  2×5 | 1×1362  2×209  3×58  4×19  5×14  6×2  7×2 |
| maxTrapDepth | — | 1 / 2 / 4 | 1×23  2×36  3×8  4×1 | 1×126  2×292  3×709  4×539 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×68 | 0×1326  1×277  2×31  3×30  4×2 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 3 / 4 | 2.89 | 1×90  2×409  3×766  4×401 | 29.95% |
| dPath (correct) | 1 / 2 / 4 | 2.25 | 1×313  2×735  3×505  4×113 | 62.91% |

The last column isolates ONE criterion. Overall band pass is **4.08%** (68 of 1666 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 1558 |
| keystones | 620 |
| decisionPoints | 618 |

Peak temptation (min/med/max): 0.5 / 0.517 / 0.688

### mid · random

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×234  2×84 | 0×5  1×668  2×277  3×44  4×4 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×118  3×200 | 0×5  1×137  2×166  3×264  4×280  5×146 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×145  3×173 | 0×5  1×99  2×277  3×402  4×186  5×29 |
| solutionPaths | any | 1 / 2 / 40 | 1×115  2×75  3×36  4×27  5×14  6×9  7×9  8×9  9×6  10×1  11×2  12×6  14×2  15×1  16×1  17×2  22×1  28×1  40×1 | 1×342  2×198  3×118  4×82  5×48  6×41  7×23  8×24  9×21  10×13  11×11  12×12  13×9  14×9  15×4  16×5  17×6  18×1  19×2  20×1  21×4  22×3  24×1  25×2  28×2  29×1  30×1  33×3  35×1  36×2  37×1  39×1  40×1  53×1  59×1  60×1  88×1  147×1 |
| maxTrapDepth | — | 0 / 4 / 5 | 0×1  1×8  2×24  3×91  4×134  5×60 | 0×9  1×26  2×89  3×194  4×381  5×299 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×294  1×24 | 0×854  1×127  2×9  3×7  6×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 4 / 5 | 3.97 | 1×14  2×44  3×199  4×440  5×301 | 24.35% |
| dPath (correct) | 0 / 3 / 5 | 2.75 | 0×5  1×99  2×277  3×402  4×186  5×29 | 68.04% |

The last column isolates ONE criterion. Overall band pass is **31.86%** (318 of 998 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 568 |
| decisionPoints | 319 |
| keystones | 53 |

Peak temptation (min/med/max): 0.5 / 0.606 / 0.789

### mid · directed

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×70  2×31 | 0×3  1×850  2×308  3×69  4×7 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×26  3×75 | 0×3  1×24  2×37  3×113  4×571  5×489 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×45  3×56 | 0×4  1×68  2×248  3×453  4×367  5×97 |
| solutionPaths | any | 1 / 2 / 11 | 1×37  2×31  3×16  4×8  5×4  6×1  8×2  10×1  11×1 | 1×447  2×245  3×126  4×105  5×67  6×53  7×37  8×25  9×13  10×25  11×16  12×8  13×10  14×9  15×8  16×4  17×1  18×5  20×4  21×1  22×5  23×2  24×4  25×2  26×2  29×2  30×1  31×1  32×1  33×1  34×1  36×1  37×1  38×2  39×1  70×1 |
| maxTrapDepth | — | 0 / 3 / 5 | 0×1  1×2  2×9  3×52  4×30  5×7 | 0×6  1×20  2×47  3×168  4×578  5×418 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×92  1×9 | 0×1043  1×165  2×12  3×16  4×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 4 / 5 | 3.97 | 1×14  2×55  3×233  4×581  5×354 | 23.28% |
| dPath (correct) | 0 / 3 / 5 | 3.13 | 0×4  1×68  2×248  3×453  4×367  5×97 | 56.67% |

The last column isolates ONE criterion. Overall band pass is **8.16%** (101 of 1237 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 1087 |
| decisionPoints | 536 |
| keystones | 79 |

Peak temptation (min/med/max): 0.5 / 0.639 / 0.809

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| tutorial | random | tutorial (k1/l1/d1)×239 | tutorial (k1/l1/d1)×218<br>none (k2/l2/d1)×8<br>tutorial (k1/l1/d0)×7 | tutorial (k1/l1/d1)×197<br>none (k2/l2/d1)×20<br>tutorial (k1/l1/d0)×9 |
| tutorial | directed | tutorial (k1/l1/d1)×72 | tutorial (k1/l1/d1)×69<br>tutorial (k1/l1/d0)×3 | tutorial (k1/l1/d1)×60<br>tutorial (k1/l1/d0)×10<br>none (k2/l1/d0)×2 |
| early | random | early (k1/l2/d2)×144<br>early (k1/l1/d1)×107<br>early (k1/l1/d2)×78 | early (k1/l2/d2)×115<br>early (k1/l1/d1)×115<br>early (k1/l2/d1)×76 | early (k1/l1/d1)×112<br>early (k1/l2/d2)×107<br>early (k1/l2/d1)×71 |
| early | directed | early (k1/l2/d1)×32<br>early (k1/l2/d2)×30<br>early (k1/l1/d1)×6 | early (k1/l2/d1)×29<br>early (k1/l2/d2)×24<br>early (k1/l1/d1)×6 | early (k1/l2/d1)×25<br>early (k1/l2/d2)×19<br>none (k1/l2/d0)×7 |
| mid | random | mid (k1/l3/d3)×80<br>mid (k1/l2/d3)×56<br>mid (k2/l3/d2)×36 | mid (k1/l3/d3)×94<br>mid (k1/l2/d3)×58<br>mid (k2/l3/d2)×53 | mid (k1/l3/d3)×68<br>mid (k2/l3/d2)×49<br>mid (k1/l2/d2)×48 |
| mid | directed | mid (k1/l3/d3)×25<br>mid (k2/l3/d2)×10<br>mid (k1/l3/d2)×10 | mid (k1/l3/d3)×34<br>mid (k2/l3/d2)×18<br>mid (k1/l3/d2)×14 | mid (k1/l3/d3)×18<br>mid (k1/l3/d2)×15<br>mid (k2/l3/d2)×14 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
