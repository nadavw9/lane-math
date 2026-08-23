# Lane Math — generator distribution report

Generated 2026-08-23T11:37:42.724Z · seed `20260823` · 1500 attempts per tier per strategy

**126 accepted from 3000 attempts** (4.20%) in 722.3s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|
| late | random | 7.13% | 107 | 377 | 14 |
| late | directed | 1.27% | 19 | 446 | 79 |

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| late | random | 1500 | 107 | 7.13% | 173.8 | 2436 |
| late | directed | 1500 | 19 | 1.27% | 307.7 | 24294 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | root-optional | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| late | random |  | 824 | 256 | 7 | 36 |  |  | 270 |  |  |
| late | directed |  | 771 | 276 | 1 | 6 |  |  | 427 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| late | random | 1053 |
| late | directed | 1296 |

## Achieved metrics vs target bands

### late · random

Mode of record: **normal** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×81  2×26 | 0×1  1×250  2×99  3×25  4×2 |
| lookaheadDistance | 3–4 | 3 / 3 / 4 | 3×57  4×50 | 0×1  1×48  2×44  3×81  4×70  5×92  6×41 |
| decisionPoints | 3–4 | 3 / 3 / 4 | 3×54  4×53 | 0×3  1×16  2×42  3×131  4×119  5×58  6×8 |
| solutionPaths | any | 1 / 6 / 322 | 1×15  2×12  3×4  4×15  5×3  6×8  7×2  8×2  10×3  11×1  12×6  13×2  14×2  15×3  16×2  17×1  18×4  20×3  21×1  24×1  25×2  26×1  29×2  30×1  31×1  42×1  45×1  56×1  59×1  60×1  76×1  80×1  120×1  164×1  322×1 | 1×51  2×57  3×26  4×34  5×13  6×24  7×8  8×17  9×2  10×8  11×3  12×12  13×4  14×6  15×7  16×11  17×1  18×8  19×1  20×9  21×1  22×2  23×1  24×4  25×2  26×2  27×3  28×2  29×3  30×2  31×2  32×1  33×1  34×3  35×1  36×1  37×1  42×2  44×1  45×1  46×1  50×1  56×1  57×4  58×2  59×1  60×2  76×2  78×1  80×1  86×1  87×1  96×1  106×1  113×1  120×3  132×1  144×1  148×1  164×1  208×1  222×1  228×1  252×1  264×1  308×1  322×1  468×1  634×1  771×1  1528×1 |
| maxTrapDepth | — | 3 / 5 / 7 | 3×7  4×27  5×42  6×30  7×1 | 0×4  1×1  2×9  3×26  4×70  5×144  6×119  7×4 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×93  1×14 | 0×304  1×61  2×7  3×5 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 5 / 6 | 4.92 | 1×3  2×7  3×23  4×73  5×150  6×121 | 25.46% |
| dPath (correct) | 0 / 3 / 6 | 3.47 | 0×3  1×16  2×42  3×131  4×119  5×58  6×8 | 66.31% |

The last column isolates ONE criterion. Overall band pass is **28.38%** (107 of 377 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 226 |
| decisionPoints | 127 |
| keystones | 28 |

Peak temptation (min/med/max): 0.5 / 0.646 / 0.789

### late · directed

Mode of record: **normal** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×12  2×7 | 1×299  2×108  3×32  4×7 |
| lookaheadDistance | 3–4 | 3 / 4 / 4 | 3×2  4×17 | 2×8  3×7  4×28  5×220  6×183 |
| decisionPoints | 3–4 | 3 / 3 / 4 | 3×11  4×8 | 1×12  2×30  3×103  4×155  5×115  6×31 |
| solutionPaths | any | 1 / 3 / 33 | 1×3  2×4  3×3  4×2  5×1  6×2  8×2  10×1  33×1 | 1×51  2×66  3×34  4×40  5×18  6×32  7×10  8×22  9×7  10×18  11×2  12×14  13×2  14×7  15×2  16×10  17×3  18×10  20×5  21×5  22×1  24×7  25×3  26×3  27×2  28×7  30×8  32×5  33×1  36×1  40×1  42×2  43×3  44×1  45×2  46×1  47×2  50×1  51×1  52×1  54×1  56×2  59×1  68×1  72×3  76×1  78×1  80×1  82×2  90×1  91×1  109×1  123×1  130×1  136×1  146×1  148×1  156×1  160×1  161×1  184×1  222×1  237×1  240×1  310×1  402×1  480×1  528×1  647×1  756×1  1254×1 |
| maxTrapDepth | — | 4 / 5 / 6 | 4×9  5×8  6×2 | 0×1  1×2  2×4  3×9  4×61  5×197  6×162  7×7  8×3 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×17  1×2 | 0×357  1×68  2×5  3×13  4×3 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 5 / 6 | 4.94 | 1×1  2×7  3×25  4×82  5×201  6×130 | 23.99% |
| dPath (correct) | 1 / 4 / 6 | 3.95 | 1×12  2×30  3×103  4×155  5×115  6×31 | 57.85% |

The last column isolates ONE criterion. Overall band pass is **4.26%** (19 of 446 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 411 |
| decisionPoints | 188 |
| keystones | 39 |

Peak temptation (min/med/max): 0.5 / 0.671 / 0.76

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| late | random | late (k1/l4/d4)×18<br>none (k1/l3/d5)×17<br>late (k1/l3/d4)×16 | late (k1/l3/d4)×26<br>late (k1/l4/d4)×22<br>late (k1/l3/d3)×20 | absent×54<br>late (k1/l3/d3)×9<br>late (k2/l4/d3)×8 |
| late | directed | late (k1/l4/d4)×6<br>none (k1/l4/d5)×4<br>none (k1/l5/d5)×3 | late (k1/l4/d4)×8<br>late (k2/l4/d3)×5<br>late (k1/l4/d3)×4 | absent×8<br>late (k1/l4/d3)×4<br>late (k1/l4/d4)×2 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
