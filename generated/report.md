# Lane Math — generator distribution report

Generated 2026-08-13T12:16:22.048Z · seed `20260813` · 1000 attempts per tier per strategy

**137 accepted from 10000 attempts** (1.37%) in 3130.7s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Go / no-go: Late and Expert

The question this run exists to answer: can rejection sampling reliably produce Late and Expert boards — lookahead 3–4, two overlapping keystones, a valid Expert budget?

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|
| late | random | 1.50% | 15 | 178 | 67 |
| late | directed | 0.50% | 5 | 227 | 200 |
| expert | random | 1.30% | 13 | 140 | 77 |
| expert | directed | 2.50% | 25 | 192 | 40 |

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| tutorial | random | 1000 | 7 | 0.70% | 0.1 | 8 |
| tutorial | directed | 1000 | 15 | 1.50% | 0.1 | 5 |
| early | random | 1000 | 13 | 1.30% | 0.2 | 18 |
| early | directed | 1000 | 7 | 0.70% | 0.3 | 50 |
| mid | random | 1000 | 20 | 2.00% | 1.6 | 82 |
| mid | directed | 1000 | 17 | 1.70% | 7.1 | 419 |
| late | random | 1000 | 15 | 1.50% | 536.8 | 35786 |
| late | directed | 1000 | 5 | 0.50% | 583.6 | 116720 |
| expert | random | 1000 | 13 | 1.30% | 1053.5 | 81039 |
| expert | directed | 1000 | 25 | 2.50% | 947.3 | 37892 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tutorial | random |  | 352 | 296 | 178 |  | 11 | 156 |  |  |
| tutorial | directed |  | 227 | 225 | 261 |  | 16 | 256 |  |  |
| early | random |  | 304 | 89 | 199 |  | 76 | 319 |  |  |
| early | directed |  | 208 | 34 | 234 |  | 116 | 401 |  |  |
| mid | random |  | 512 | 18 | 68 |  | 146 | 236 |  |  |
| mid | directed |  | 453 | 3 | 41 |  | 181 | 305 |  |  |
| late | random |  | 538 | 8 | 39 |  | 237 | 163 |  |  |
| late | directed |  | 499 |  | 4 |  | 270 | 222 |  |  |
| expert | random |  | 582 | 7 | 30 | 1 | 240 | 127 |  |  |
| expert | directed |  | 489 | 1 | 7 |  | 311 | 167 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| tutorial | random | 0 |
| tutorial | directed | 0 |
| early | random | 0 |
| early | directed | 0 |
| mid | random | 437 |
| mid | directed | 509 |
| late | random | 692 |
| late | directed | 898 |
| expert | random | 1088 |
| expert | directed | 1215 |

## Achieved metrics vs target bands

### tutorial · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×7 | 1×119  2×44 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×7 | 1×61  2×102 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×7 | 1×69  2×94 |
| solutionPaths | any | 1 / 1 / 1 | 1×7 | 1×162  2×1 |
| maxTrapDepth | — | 1 / 1 / 1 | 1×7 | 1×92  2×71 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×7 | 0×138  1×25 |

Peak temptation (min/med/max): 0.516 / 0.538 / 0.66

### tutorial · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×15 | 1×210  2×61 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×15 | 1×25  2×246 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×15 | 1×93  2×178 |
| solutionPaths | any | 1 / 1 / 1 | 1×15 | 1×265  2×6 |
| maxTrapDepth | — | 1 / 1 / 1 | 1×15 | 1×116  2×155 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×15 | 0×238  1×33 |

Peak temptation (min/med/max): 0.515 / 0.658 / 0.688

### early · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×13 | 1×181  2×124  3×25  4×2 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×3  2×10 | 1×46  2×76  3×133  4×77 |
| decisionPoints | 1–2 | 2 / 2 / 2 | 2×13 | 1×19  2×97  3×146  4×70 |
| solutionPaths | any | 1 / 1 / 1 | 1×13 | 1×277  2×40  3×8  4×2  5×3  6×2 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×8  2×5 | 1×39  2×65  3×135  4×93 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×13 | 0×249  1×70  2×10  3×2  4×1 |

Peak temptation (min/med/max): 0.5 / 0.518 / 0.658

### early · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×7 | 1×259  2×119  3×28  4×2 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×1  2×6 | 1×2  2×19  3×205  4×182 |
| decisionPoints | 1–2 | 1 / 2 / 2 | 1×1  2×6 | 1×23  2×89  3×187  4×109 |
| solutionPaths | any | 1 / 1 / 2 | 1×6  2×1 | 1×333  2×54  3×12  4×6  5×3 |
| maxTrapDepth | — | 1 / 2 / 2 | 1×3  2×4 | 1×18  2×60  3×192  4×138 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×7 | 0×331  1×61  2×8  3×7  4×1 |

Peak temptation (min/med/max): 0.5 / 0.531 / 0.659

### mid · random

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 2 / 2 | 1×6  2×14 | 0×1  1×168  2×81  3×6 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×6  3×14 | 0×1  1×42  2×48  3×61  4×71  5×33 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×3  3×17 | 2×12  3×53  4×119  5×72 |
| solutionPaths | any | 1 / 1 / 8 | 1×13  2×4  3×1  4×1  8×1 | 1×92  2×44  3×32  4×17  5×17  6×12  7×7  8×6  9×5  10×3  11×3  12×1  13×2  14×3  15×1  16×1  17×3  22×2  25×1  33×2  36×1  147×1 |
| maxTrapDepth | — | 0 / 3 / 4 | 0×2  1×2  2×3  3×9  4×4 | 0×2  1×4  2×18  3×44  4×113  5×75 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×13  1×7 | 0×224  1×31  2×1 |

Peak temptation (min/med/max): 0.5 / 0.586 / 0.781

### mid · directed

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 2 / 2 | 1×7  2×10 | 0×1  1×223  2×81  3×16  4×1 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×4  3×13 | 0×1  1×7  2×15  3×34  4×135  5×130 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×4  3×13 | 1×4  2×15  3×51  4×159  5×93 |
| solutionPaths | any | 1 / 1 / 8 | 1×9  2×4  3×2  4×1  8×1 | 1×103  2×61  3×33  4×23  5×13  6×19  7×11  8×10  9×5  10×12  11×5  12×4  13×3  14×2  16×2  17×1  18×2  20×3  22×2  23×2  24×1  33×1  34×1  36×1  38×1  39×1 |
| maxTrapDepth | — | 1 / 3 / 4 | 1×3  2×2  3×7  4×5 | 0×1  1×9  2×7  3×43  4×155  5×107 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×12  1×5 | 0×268  1×47  2×2  3×5 |

Peak temptation (min/med/max): 0.5 / 0.602 / 0.696

### late · random

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2 | 2 / 2 / 2 | 2×15 | 1×122  2×48  3×7  4×1 |
| lookaheadDistance | 3–4 | 3 / 4 / 4 | 3×5  4×10 | 1×20  2×29  3×34  4×35  5×41  6×19 |
| decisionPoints | 3–4 | 3 / 4 / 4 | 3×3  4×12 | 1×1  2×3  3×7  4×37  5×77  6×53 |
| solutionPaths | any | 1 / 7 / 353 | 1×3  2×1  4×1  5×2  7×1  8×2  9×2  14×1  18×1  353×1 | 1×18  2×11  3×4  4×5  5×6  6×3  7×6  8×10  9×4  10×4  11×1  12×1  13×1  14×3  15×1  16×2  18×1  20×1  21×1  22×2  23×1  24×3  25×2  26×1  27×1  28×2  29×3  30×1  31×1  32×1  33×2  34×1  36×2  37×1  47×1  48×1  54×1  55×1  61×2  70×1  73×1  74×1  78×1  81×1  83×1  86×2  92×1  93×1  106×1  113×1  133×1  134×1  135×1  140×1  166×1  167×1  169×1  172×1  182×1  196×1  209×1  222×1  228×1  230×1  237×1  248×1  252×1  257×1  268×1  269×1  290×1  324×1  326×1  333×1  353×1  393×1  402×1  411×1  432×1  444×1  524×1  567×1  711×1  763×1  940×1  1056×1  1141×1  1243×1  1411×1  1461×1  1645×1  1956×1  2397×1  2518×1  2825×1  3922×1  4000×7 |
| maxTrapDepth | — | 3 / 5 / 6 | 3×2  4×2  5×8  6×3 | 1×2  2×1  3×8  4×19  5×58  6×57  7×23  8×9  9×1 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×9  1×6 | 0×151  1×25  3×2 |

Peak temptation (min/med/max): 0.5 / 0.642 / 0.783

### late · directed

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2 | 2 / 2 / 2 | 2×5 | 1×162  2×51  3×13  4×1 |
| lookaheadDistance | 3–4 | 3 / 4 / 4 | 3×1  4×4 | 1×4  2×1  3×5  4×24  5×121  6×72 |
| decisionPoints | 3–4 | 3 / 4 / 4 | 3×1  4×4 | 3×12  4×51  5×107  6×57 |
| solutionPaths | any | 8 / 20 / 77 | 8×1  18×1  20×1  36×1  77×1 | 1×22  2×8  3×7  4×7  5×6  6×6  7×9  8×4  9×3  10×8  11×2  12×5  13×2  14×3  16×3  17×1  18×3  19×3  20×3  21×3  22×3  23×1  24×4  25×1  26×1  28×3  29×2  31×1  32×1  35×1  36×3  38×1  40×1  43×1  44×2  46×1  48×1  49×1  51×1  53×1  54×1  55×1  56×3  57×1  59×1  63×1  66×1  73×1  74×2  77×1  78×1  81×1  82×1  84×2  85×1  90×1  92×1  112×1  115×1  117×1  119×1  120×2  130×1  143×2  145×1  156×1  157×1  167×1  170×1  176×2  180×1  185×1  203×2  223×1  273×1  298×1  318×1  324×1  342×1  423×1  443×1  456×1  462×1  555×1  580×1  583×1  612×1  617×1  628×1  725×1  804×1  806×1  867×1  920×1  929×1  974×1  1027×1  1032×1  1169×1  1187×1  1243×1  1358×1  1510×1  1524×1  1571×1  1735×1  1892×1  1981×1  1991×1  2325×1  2432×2  2557×1  3101×1  3328×1  4000×5 |
| maxTrapDepth | — | 5 / 6 / 6 | 5×1  6×4 | 2×1  3×1  4×22  5×68  6×75  7×39  8×21 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×4  1×1 | 0×192  1×31  2×3  3×1 |

Peak temptation (min/med/max): 0.509 / 0.617 / 0.69

### expert · random

Mode of record: **expert** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2+ | 2 / 2 / 3 | 2×11  3×2 | 0×1  1×91  2×43  3×3  4×2 |
| lookaheadDistance | 4+ | 4 / 5 / 6 | 4×4  5×4  6×5 | 0×1  1×20  2×25  3×25  4×34  5×23  6×12 |
| decisionPoints | 4+ | 4 / 4 / 5 | 4×7  5×6 | 2×2  3×5  4×39  5×63  6×31 |
| solutionPaths | 1 | 1 / 1 / 1 | 1×13 | 1×140 |
| maxTrapDepth | — | 4 / 5 / 6 | 4×1  5×6  6×6 | 2×2  3×7  4×23  5×72  6×35  7×1 |
| overlappingKeystonePairs | 1+ | 1 / 1 / 2 | 1×12  2×1 | 0×118  1×18  2×2  3×1  6×1 |

Peak temptation (min/med/max): 0.519 / 0.682 / 0.789

### expert · directed

Mode of record: **expert** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2+ | 2 / 2 / 3 | 2×21  3×4 | 1×116  2×60  3×14  4×2 |
| lookaheadDistance | 4+ | 5 / 5 / 6 | 5×14  6×11 | 1×5  2×6  3×4  4×19  5×101  6×57 |
| decisionPoints | 4+ | 4 / 4 / 5 | 4×16  5×9 | 1×1  3×15  4×47  5×88  6×41 |
| solutionPaths | 1 | 1 / 1 / 1 | 1×25 | 1×192 |
| maxTrapDepth | — | 3 / 5 / 6 | 3×2  4×4  5×10  6×9 | 1×1  2×3  3×12  4×27  5×96  6×52  7×1 |
| overlappingKeystonePairs | 1+ | 1 / 1 / 3 | 1×23  2×1  3×1 | 0×154  1×33  2×2  3×1  4×2 |

Peak temptation (min/med/max): 0.5 / 0.669 / 0.789

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| tutorial | random | k1/l1/d1×7 | k1/l1/d1×7 | k1/l1/d1×7 |
| tutorial | directed | k1/l1/d1×15 | k1/l1/d1×15 | k1/l1/d1×15 |
| early | random | k1/l2/d2×10<br>k1/l1/d2×3 | k1/l2/d2×10<br>k1/l1/d2×2<br>k1/l3/d0×1 | k1/l2/d2×8<br>k1/l1/d2×2<br>k1/l3/d0×1 |
| early | directed | k1/l2/d2×5<br>k1/l1/d2×1<br>k1/l2/d1×1 | k1/l2/d2×4<br>k2/l2/d1×1<br>k1/l1/d2×1 | k1/l2/d2×4<br>k2/l2/d1×1<br>k1/l1/d2×1 |
| mid | random | k2/l3/d3×7<br>k1/l2/d3×4<br>k1/l3/d4×2 | k2/l3/d3×9<br>k1/l2/d3×4<br>k2/l3/d2×3 | k2/l3/d3×8<br>k1/l2/d3×4<br>k2/l3/d2×3 |
| mid | directed | k1/l3/d3×5<br>k2/l3/d2×3<br>k2/l4/d3×2 | k1/l3/d3×5<br>k2/l3/d3×5<br>k2/l3/d2×3 | k1/l3/d3×5<br>k2/l3/d3×2<br>k2/l3/d2×2 |
| late | random | k2/l4/d4×7<br>k2/l3/d4×4<br>k2/l4/d3×3 | k2/l4/d4×7<br>k2/l3/d4×5<br>k2/l4/d3×3 | k2/l4/d4×7<br>k2/l3/d4×4<br>k2/l4/d2×2 |
| late | directed | k1/l4/d5×2<br>k1/l4/d4×1<br>k1/l3/d5×1 | k2/l4/d4×3<br>k2/l4/d3×1<br>k2/l3/d4×1 | k2/l4/d4×2<br>k1/l4/d4×1<br>k1/l3/d5×1 |
| expert | random | k2/l6/d5×5<br>k2/l4/d4×2<br>k2/l4/d5×1 | k2/l6/d5×3<br>k2/l5/d5×2<br>k2/l4/d4×2 | k2/l6/d5×3<br>k2/l5/d4×2<br>k2/l5/d5×2 |
| expert | directed | k2/l5/d4×10<br>k2/l6/d5×7<br>k3/l6/d4×3 | k2/l5/d4×11<br>k2/l6/d5×7<br>k3/l6/d4×2 | k2/l5/d4×11<br>k2/l6/d5×7<br>k3/l6/d4×3 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
