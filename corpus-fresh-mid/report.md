# Lane Math — generator distribution report

Generated 2026-08-23T11:25:43.427Z · seed `20260823` · 3000 attempts per tier per strategy

**302 accepted from 4607 attempts** (6.56%) in 22.5s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| mid | random | 1607 | 200 | 12.45% | 3.0 | 24 |
| mid | directed | 3000 | 102 | 3.40% | 5.9 | 174 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | root-optional | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mid | random |  | 851 |  | 31 | 122 |  |  | 403 |  |  |
| mid | directed |  | 1401 |  | 9 | 103 |  |  | 1385 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| mid | random | 932 |
| mid | directed | 2541 |

## Achieved metrics vs target bands

### mid · random

Mode of record: **normal** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×151  2×49 | 0×3  1×409  2×160  3×25  4×6 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×75  3×125 | 0×3  1×73  2×100  3×165  4×159  5×103 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×94  3×106 | 0×2  1×48  2×185  3×239  4×107  5×22 |
| solutionPaths | any | 1 / 2 / 78 | 1×53  2×49  3×16  4×28  5×9  6×15  7×3  8×8  9×1  10×1  11×1  12×2  14×1  16×2  18×4  24×1  38×3  42×1  70×1  78×1 | 1×151  2×141  3×55  4×62  5×22  6×39  7×9  8×20  9×6  10×9  11×2  12×17  13×1  14×9  15×1  16×7  17×2  18×5  20×3  22×5  24×2  26×1  27×1  30×1  33×2  36×2  37×2  38×3  39×1  40×2  42×2  44×1  47×1  48×3  60×2  64×1  70×1  71×1  72×2  78×1  80×1  84×1  104×1  144×1  180×1 |
| maxTrapDepth | — | 1 / 4 / 5 | 1×1  2×19  3×64  4×77  5×39 | 0×5  1×10  2×46  3×121  4×223  5×198 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×183  1×17 | 0×515  1×71  2×10  3×4  4×1  5×2 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 0 / 4 / 5 | 4.00 | 0×1  1×5  2×32  3×117  4×249  5×199 | 24.71% |
| dPath (correct) | 0 / 3 / 5 | 2.77 | 0×2  1×48  2×185  3×239  4×107  5×22 | 70.32% |

The last column isolates ONE criterion. Overall band pass is **33.17%** (200 of 603 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 338 |
| decisionPoints | 179 |
| keystones | 34 |

Peak temptation (min/med/max): 0.5 / 0.595 / 0.794

### mid · directed

Mode of record: **normal** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×80  2×22 | 0×2  1×1081  2×342  3×60  4×1  5×1 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×17  3×85 | 0×2  1×24  2×29  3×122  4×685  5×625 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×50  3×52 | 0×6  1×69  2×296  3×543  4×452  5×121 |
| solutionPaths | any | 1 / 2 / 24 | 1×37  2×28  3×13  4×9  5×3  6×7  12×1  14×1  16×1  18×1  24×1 | 1×323  2×345  3×145  4×143  5×55  6×107  7×24  8×43  9×23  10×36  11×6  12×34  13×9  14×23  15×7  16×19  17×5  18×15  19×3  20×8  21×3  22×7  24×17  25×1  26×2  27×5  28×6  29×1  30×3  31×1  32×3  34×2  36×5  38×7  42×5  44×3  46×2  47×1  48×4  49×1  54×4  55×1  56×1  57×2  58×1  60×2  62×1  64×1  66×1  67×1  69×1  70×1  73×1  75×2  78×1  87×1  90×1  94×1  96×1  106×1  111×1  125×1  144×1  152×1  186×1  246×1  316×1  336×1  780×1 |
| maxTrapDepth | — | 1 / 3 / 5 | 1×2  2×13  3×52  4×30  5×5 | 0×11  1×25  2×62  3×226  4×629  5×534 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×97  1×5 | 0×1296  1×169  2×18  3×4 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 0 / 4 / 5 | 4.05 | 0×1  1×6  2×58  3×267  4×670  5×485 | 21.86% |
| dPath (correct) | 0 / 3 / 5 | 3.16 | 0×6  1×69  2×296  3×543  4×452  5×121 | 56.42% |

The last column isolates ONE criterion. Overall band pass is **6.86%** (102 of 1487 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 1336 |
| decisionPoints | 648 |
| keystones | 64 |

Peak temptation (min/med/max): 0.5 / 0.624 / 0.76

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| mid | random | mid (k1/l3/d3)×48<br>mid (k1/l2/d3)×36<br>none (k1/l3/d4)×18 | mid (k1/l3/d3)×51<br>mid (k1/l2/d3)×44<br>mid (k2/l3/d2)×36 | absent×73<br>mid (k1/l3/d3)×28<br>mid (k1/l3/d2)×22 |
| mid | directed | mid (k1/l3/d3)×36<br>none (k1/l4/d4)×14<br>none (k1/l3/d4)×10 | mid (k1/l3/d3)×39<br>mid (k1/l3/d2)×27<br>mid (k2/l3/d2)×14 | absent×27<br>mid (k1/l3/d2)×18<br>mid (k1/l3/d3)×15 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
