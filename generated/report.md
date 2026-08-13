# Lane Math — generator distribution report

Generated 2026-08-13T15:47:21.053Z · seed `20260813` · 1000 attempts per tier per strategy

**424 accepted from 10000 attempts** (4.24%) in 10437.5s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Go / no-go: Late and Expert

The question this run exists to answer: can rejection sampling reliably produce Late and Expert boards — lookahead 3–4, two overlapping keystones, a valid Expert budget?

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|
| late | random | 3.00% | 30 | 415 | 33 |
| late | directed | 0.70% | 7 | 497 | 143 |
| expert | random | 0.20% | 2 | 140 | 500 |
| expert | directed | 0.10% | 1 | 192 | 1000 |

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| tutorial | random | 1000 | 62 | 6.20% | 0.1 | 1 |
| tutorial | directed | 1000 | 22 | 2.20% | 0.1 | 4 |
| early | random | 1000 | 109 | 10.90% | 0.3 | 2 |
| early | directed | 1000 | 12 | 1.20% | 0.4 | 33 |
| mid | random | 1000 | 138 | 13.80% | 1.9 | 14 |
| mid | directed | 1000 | 41 | 4.10% | 3.1 | 75 |
| late | random | 1000 | 30 | 3.00% | 289.0 | 9634 |
| late | directed | 1000 | 7 | 0.70% | 725.9 | 103703 |
| expert | random | 1000 | 2 | 0.20% | 1235.7 | 617865 |
| expert | directed | 1000 | 1 | 0.10% | 8181.0 | 8181025 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tutorial | random |  | 354 | 296 | 174 |  |  | 113 | 1 |  |
| tutorial | directed |  | 227 | 225 | 261 |  |  | 265 |  |  |
| early | random |  | 304 | 89 | 199 |  |  | 299 |  |  |
| early | directed |  | 208 | 34 | 234 |  |  | 512 |  |  |
| mid | random |  | 512 | 18 | 68 |  |  | 264 |  |  |
| mid | directed |  | 453 | 3 | 41 |  |  | 462 |  |  |
| late | random |  | 538 | 8 | 39 |  |  | 385 |  |  |
| late | directed |  | 499 |  | 4 |  |  | 490 |  |  |
| expert | random |  | 582 | 7 | 30 | 1 | 240 | 138 |  |  |
| expert | directed |  | 489 | 1 | 7 |  | 311 | 191 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| tutorial | random | 0 |
| tutorial | directed | 0 |
| early | random | 0 |
| early | directed | 0 |
| mid | random | 346 |
| mid | directed | 486 |
| late | random | 686 |
| late | directed | 895 |
| expert | random | 1119 |
| expert | directed | 1250 |

## Achieved metrics vs target bands

### tutorial · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×62 | 1×130  2×45 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×62 | 1×64  2×111 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×62 | 1×155  2×20 |
| solutionPaths | any | 1 / 1 / 2 | 1×58  2×4 | 1×163  2×12 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×45  2×17 | 1×98  2×77 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×62 | 0×150  1×25 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 2 / 2 | 1.60 | 1×70  2×105 | 40.00% |
| dPath (correct) | 1 / 1 / 2 | 1.11 | 1×155  2×20 | 88.57% |

Peak temptation (min/med/max): 0.5 / 0.536 / 0.702

### tutorial · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×22 | 1×226  2×61 |
| lookaheadDistance | 1 | 1 / 1 / 1 | 1×22 | 1×25  2×262 |
| decisionPoints | 0–1 | 1 / 1 / 1 | 1×22 | 1×204  2×83 |
| solutionPaths | any | 1 / 1 / 1 | 1×22 | 1×265  2×22 |
| maxTrapDepth | — | 1 / 1 / 2 | 1×17  2×5 | 1×121  2×166 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×22 | 0×254  1×33 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 2 / 2 | 1.68 | 1×93  2×194 | 32.40% |
| dPath (correct) | 1 / 1 / 2 | 1.29 | 1×204  2×83 | 71.08% |

Peak temptation (min/med/max): 0.5 / 0.642 / 0.688

### early · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×109 | 1×249  2×132  3×25  4×2 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×47  2×62 | 1×67  2×92  3×155  4×94 |
| decisionPoints | 1–2 | 1 / 2 / 2 | 1×42  2×67 | 1×115  2×188  3×95  4×10 |
| solutionPaths | any | 1 / 1 / 4 | 1×69  2×35  3×4  4×1 | 1×277  2×100  3×14  4×9  5×3  6×5 |
| maxTrapDepth | — | 1 / 2 / 4 | 1×21  2×35  3×39  4×14 | 1×48  2×82  3×159  4×119 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×109 | 0×322  1×73  2×10  3×2  4×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 3 / 4 | 2.92 | 1×19  2×100  3×183  4×106 | 29.17% |
| dPath (correct) | 1 / 2 / 4 | 2.00 | 1×115  2×188  3×95  4×10 | 74.26% |

Peak temptation (min/med/max): 0.5 / 0.518 / 0.702

### early · directed

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1 | 1 / 1 / 1 | 1×12 | 1×356  2×137  3×29  4×2 |
| lookaheadDistance | 1–2 | 1 / 2 / 2 | 1×2  2×10 | 1×4  2×19  3×231  4×270 |
| decisionPoints | 1–2 | 1 / 2 / 2 | 1×6  2×6 | 1×74  2×202  3×187  4×61 |
| solutionPaths | any | 1 / 1 / 2 | 1×9  2×3 | 1×333  2×138  3×15  4×25  5×3  6×9  9×1 |
| maxTrapDepth | — | 1 / 2 / 3 | 1×3  2×6  3×3 | 1×25  2×73  3×219  4×207 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×12 | 0×434  1×74  2×8  3×7  4×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 3 / 4 | 3.07 | 1×23  2×97  3×223  4×181 | 22.90% |
| dPath (correct) | 1 / 2 / 4 | 2.45 | 1×74  2×202  3×187  4×61 | 52.67% |

Peak temptation (min/med/max): 0.5 / 0.529 / 0.659

### mid · random

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×109  2×29 | 0×2  1×284  2×109  3×7 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×62  3×76 | 0×2  1×61  2×76  3×99  4×110  5×54 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×57  3×81 | 1×25  2×109  3×170  4×86  5×12 |
| solutionPaths | any | 1 / 3 / 68 | 1×34  2×30  3×9  4×19  5×7  6×9  7×4  8×6  9×3  10×1  11×1  12×3  14×3  16×1  17×1  18×1  24×2  28×1  32×1  36×1  68×1 | 1×92  2×72  3×36  4×45  5×20  6×32  7×8  8×24  9×6  10×10  11×3  12×7  13×3  14×6  15×2  16×2  17×3  18×2  20×1  22×3  24×4  25×1  28×2  30×1  32×1  33×2  36×5  39×1  40×2  42×2  48×1  54×1  68×1  147×1 |
| maxTrapDepth | — | 0 / 4 / 5 | 0×3  1×2  2×11  3×36  4×61  5×25 | 0×4  1×6  2×28  3×65  4×178  5×121 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×130  1×8 | 0×359  1×41  2×2 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 2 / 4 / 5 | 4.07 | 2×13  3×73  4×190  5×126 | 21.39% |
| dPath (correct) | 1 / 3 / 5 | 2.88 | 1×25  2×109  3×170  4×86  5×12 | 69.40% |

Peak temptation (min/med/max): 0.5 / 0.623 / 0.781

### mid · directed

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×32  2×9 | 0×1  1×368  2×114  3×19  4×1 |
| lookaheadDistance | 2–3 | 2 / 3 / 3 | 2×13  3×28 | 0×1  1×9  2×16  3×43  4×221  5×213 |
| decisionPoints | 2–3 | 2 / 3 / 3 | 2×17  3×24 | 0×1  1×25  2×84  3×188  4×158  5×47 |
| solutionPaths | any | 1 / 2 / 12 | 1×10  2×14  3×6  4×2  5×2  6×1  8×2  10×2  11×1  12×1 | 1×103  2×105  3×38  4×59  5×15  6×33  7×13  8×22  9×8  10×18  11×7  12×10  13×3  14×8  15×1  16×4  17×1  18×12  19×1  20×5  21×1  22×3  23×2  24×4  26×1  27×1  28×1  30×4  32×1  33×1  34×4  36×5  38×1  39×1  45×1  48×1  82×1  88×1  120×1  192×1  219×1 |
| maxTrapDepth | — | 1 / 4 / 5 | 1×2  3×17  4×19  5×3 | 0×4  1×11  2×10  3×68  4×237  5×173 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×38  1×3 | 0×432  1×62  2×2  3×7 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 4 / 5 | 4.08 | 1×4  2×17  3×70  4×254  5×158 | 17.30% |
| dPath (correct) | 0 / 3 / 5 | 3.23 | 0×1  1×25  2×84  3×188  4×158  5×47 | 54.08% |

Peak temptation (min/med/max): 0.5 / 0.64 / 0.809

### late · random

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2 | 2 / 2 / 2 | 2×30 | 0×3  1×318  2×81  3×11  4×2 |
| lookaheadDistance | 3–4 | 3 / 4 / 4 | 3×12  4×18 | 0×3  1×61  2×67  3×72  4×90  5×74  6×48 |
| decisionPoints | 3–4 | 3 / 3 / 4 | 3×18  4×12 | 1×9  2×40  3×109  4×152  5×83  6×22 |
| solutionPaths | any | 1 / 33 / 4000 | 1×2  2×2  4×2  5×1  7×1  9×2  12×1  14×1  17×1  18×2  33×1  78×1  82×1  83×1  86×1  124×1  180×1  210×1  251×1  353×1  365×1  544×1  1888×1  3922×1  4000×1 | 1×18  2×15  3×5  4×16  5×9  6×8  7×6  8×16  9×5  10×5  11×2  12×4  13×1  14×6  15×1  16×7  17×2  18×5  20×2  21×3  22×4  23×1  24×8  25×4  26×1  27×2  28×2  29×3  30×3  31×1  32×2  33×4  34×2  36×4  37×1  38×1  40×2  42×1  44×3  47×1  48×1  52×1  54×2  55×1  58×1  59×1  60×1  61×2  62×2  68×1  70×2  71×1  72×3  73×2  74×1  76×1  77×2  78×4  80×2  81×1  82×1  83×1  86×4  87×1  88×1  92×1  93×1  94×1  98×1  102×1  103×1  104×1  105×1  106×3  111×1  113×1  116×1  124×1  126×1  127×1  132×1  133×1  134×1  135×1  140×1  146×1  149×2  152×1  158×1  166×1  167×1  169×1  172×1  178×1  180×2  182×1  196×1  200×1  203×1  206×2  209×1  210×3  211×1  222×1  228×1  230×1  236×1  237×2  248×1  251×1  252×1  257×1  267×1  268×1  269×1  280×1  282×1  287×1  288×1  290×1  298×2  304×1  307×1  324×1  326×1  330×1  333×1  337×1  353×1  365×1  376×1  387×1  388×1  393×1  402×2  411×1  425×1  432×1  443×1  444×1  524×1  530×1  544×1  567×1  591×1  608×1  610×1  624×1  640×1  702×1  706×1  709×1  711×1  715×1  722×1  763×1  791×1  823×1  882×1  926×1  940×1  959×1  981×1  991×1  1056×1  1060×1  1106×1  1116×1  1141×1  1200×1  1238×1  1243×1  1261×1  1308×1  1382×1  1411×1  1461×1  1516×1  1598×1  1605×1  1645×1  1672×1  1711×1  1829×1  1888×1  1956×1  2128×1  2154×1  2156×1  2383×1  2397×1  2499×1  2504×1  2518×1  2825×1  3112×1  3308×1  3410×1  3492×1  3812×1  3922×1  4000×43 |
| maxTrapDepth | — | 3 / 6 / 9 | 3×2  4×4  5×8  6×9  7×6  9×1 | 1×2  2×3  3×15  4×50  5×104  6×140  7×72  8×23  9×5  10×1 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×16  1×14 | 0×362  1×49  2×2  3×2 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 5 / 6 | 5.16 | 1×1  2×3  3×10  4×62  5×176  6×163 | 17.35% |
| dPath (correct) | 1 / 4 / 6 | 3.79 | 1×9  2×40  3×109  4×152  5×83  6×22 | 62.89% |

Peak temptation (min/med/max): 0.5 / 0.667 / 0.783

### late · directed

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2 | 2 / 2 / 2 | 2×7 | 1×374  2×100  3×22  4×1 |
| lookaheadDistance | 3–4 | 3 / 4 / 4 | 3×1  4×6 | 1×6  2×6  3×18  4×37  5×250  6×180 |
| decisionPoints | 3–4 | 3 / 3 / 3 | 3×7 | 1×4  2×33  3×97  4×185  5×129  6×49 |
| solutionPaths | any | 3 / 20 / 77 | 3×1  6×1  18×1  20×1  36×1  39×1  77×1 | 1×22  2×16  3×11  4×24  5×7  6×13  7×10  8×10  9×3  10×11  11×3  12×11  13×2  14×6  15×2  16×12  17×3  18×5  19×3  20×5  21×3  22×4  23×1  24×6  25×2  26×2  28×7  29×2  30×5  31×1  32×1  33×1  35×1  36×7  38×1  39×1  40×3  42×1  43×1  44×4  45×2  46×5  48×3  49×1  51×1  52×2  53×1  54×5  55×1  56×5  57×1  58×1  59×1  60×2  62×1  63×1  66×1  67×1  68×2  72×2  73×1  74×3  76×1  77×2  78×1  80×1  81×1  82×2  84×2  85×1  87×1  90×2  92×2  94×1  98×1  101×2  102×2  112×1  115×1  117×2  118×1  119×2  120×2  123×1  124×2  126×2  127×1  130×1  134×1  143×3  144×2  145×1  154×1  156×1  157×1  160×1  167×1  170×2  171×1  176×3  180×1  185×2  196×2  200×1  203×2  206×1  208×1  212×1  218×1  223×1  228×1  235×1  244×1  265×1  273×1  282×1  294×1  295×1  298×1  302×1  307×1  309×1  318×1  324×2  330×1  335×1  337×1  342×1  388×1  423×1  426×1  443×1  444×1  448×1  453×1  456×1  462×2  464×1  486×1  514×1  515×1  550×1  555×1  580×1  583×1  608×1  612×1  617×1  625×1  628×2  651×1  652×1  668×1  676×1  683×1  725×2  732×1  748×1  792×1  804×2  806×1  848×1  851×1  865×1  867×1  897×1  920×1  929×1  974×2  994×1  1027×1  1032×1  1034×1  1114×1  1169×1  1187×1  1188×1  1239×1  1243×1  1263×1  1266×1  1328×1  1358×1  1382×1  1404×1  1510×1  1524×1  1552×1  1559×1  1571×1  1591×1  1735×1  1787×1  1812×1  1843×1  1869×1  1892×1  1909×1  1981×1  1991×1  1997×1  1998×1  2093×1  2100×1  2115×1  2255×1  2325×1  2370×1  2414×1  2432×2  2557×1  2670×1  2841×1  2876×1  2962×1  3101×1  3165×1  3256×1  3328×1  3456×1  3509×1  4000×34 |
| maxTrapDepth | — | 4 / 6 / 6 | 4×1  5×1  6×5 | 2×2  3×2  4×39  5×122  6×180  7×99  8×48  9×5 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×6  1×1 | 0×421  1×68  2×6  3×2 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 3 / 5 / 6 | 5.04 | 3×19  4×93  5×232  6×153 | 22.54% |
| dPath (correct) | 1 / 4 / 6 | 4.10 | 1×4  2×33  3×97  4×185  5×129  6×49 | 56.74% |

Peak temptation (min/med/max): 0.509 / 0.657 / 0.69

### expert · random

Mode of record: **expert** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2+ | 2 / 2 / 2 | 2×2 | 0×1  1×91  2×43  3×3  4×2 |
| lookaheadDistance | 5+ | 5 / 6 / 6 | 5×1  6×1 | 0×1  1×20  2×25  3×25  4×34  5×23  6×12 |
| decisionPoints | 5+ | 5 / 5 / 5 | 5×2 | 1×3  2×40  3×48  4×35  5×13  6×1 |
| solutionPaths | 1 | 1 / 1 / 1 | 1×2 | 1×140 |
| maxTrapDepth | — | 6 / 6 / 6 | 6×2 | 2×2  3×7  4×23  5×72  6×35  7×1 |
| overlappingKeystonePairs | 1+ | 1 / 1 / 1 | 1×2 | 0×118  1×18  2×2  3×1  6×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 2 / 5 / 6 | 4.83 | 2×2  3×5  4×39  5×63  6×31 | 67.14% |
| dPath (correct) | 1 / 3 / 6 | 3.13 | 1×3  2×40  3×48  4×35  5×13  6×1 | 10.00% |

Peak temptation (min/med/max): 0.69 / 0.785 / 0.785

### expert · directed

Mode of record: **expert** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 2+ | 2 / 2 / 2 | 2×1 | 1×116  2×60  3×14  4×2 |
| lookaheadDistance | 5+ | 6 / 6 / 6 | 6×1 | 1×5  2×6  3×4  4×19  5×101  6×57 |
| decisionPoints | 5+ | 5 / 5 / 5 | 5×1 | 1×3  2×26  3×73  4×60  5×23  6×7 |
| solutionPaths | 1 | 1 / 1 / 1 | 1×1 | 1×192 |
| maxTrapDepth | — | 6 / 6 / 6 | 6×1 | 1×1  2×3  3×12  4×27  5×96  6×52  7×1 |
| overlappingKeystonePairs | 1+ | 1 / 1 / 1 | 1×1 | 0×154  1×33  2×2  3×1  4×2 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | inside band |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 5 / 6 | 4.79 | 1×1  3×15  4×47  5×88  6×41 | 67.19% |
| dPath (correct) | 1 / 3 / 6 | 3.49 | 1×3  2×26  3×73  4×60  5×23  6×7 | 15.63% |

Peak temptation (min/med/max): 0.68 / 0.68 / 0.68

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| tutorial | random | tutorial (k1/l1/d1)×62 | tutorial (k1/l1/d1)×58<br>none (k2/l2/d1)×1<br>none (k0/l0/d0)×1 | tutorial (k1/l1/d1)×49<br>none (k2/l2/d1)×5<br>absent×3 |
| tutorial | directed | tutorial (k1/l1/d1)×22 | tutorial (k1/l1/d1)×22 | tutorial (k1/l1/d1)×18<br>tutorial (k1/l1/d0)×4 |
| early | random | early (k1/l2/d2)×41<br>early (k1/l1/d2)×26<br>early (k1/l1/d1)×21 | early (k1/l2/d2)×31<br>early (k1/l2/d1)×25<br>early (k1/l1/d2)×24 | absent×29<br>early (k1/l2/d1)×22<br>early (k1/l2/d2)×18 |
| early | directed | early (k1/l2/d1)×5<br>early (k1/l2/d2)×5<br>early (k1/l1/d1)×1 | early (k1/l2/d1)×6<br>early (k1/l2/d2)×3<br>none (k2/l2/d1)×1 | early (k1/l2/d1)×6<br>early (k1/l2/d2)×2<br>none (k2/l2/d1)×1 |
| mid | random | mid (k1/l3/d3)×31<br>mid (k1/l2/d3)×25<br>none (k1/l3/d4)×16 | mid (k1/l3/d3)×39<br>mid (k1/l2/d3)×31<br>mid (k1/l2/d2)×24 | absent×52<br>mid (k1/l3/d3)×18<br>mid (k1/l2/d2)×15 |
| mid | directed | mid (k1/l3/d3)×9<br>mid (k1/l2/d3)×5<br>mid (k1/l3/d2)×5 | mid (k1/l3/d3)×16<br>mid (k1/l2/d2)×6<br>mid (k1/l2/d3)×5 | mid (k1/l3/d3)×6<br>absent×6<br>mid (k1/l2/d2)×5 |
| late | random | late (k2/l4/d3)×10<br>late (k2/l3/d4)×7<br>late (k2/l4/d4)×4 | late (k2/l4/d3)×11<br>late (k2/l4/d4)×7<br>late (k2/l3/d3)×6 | absent×15<br>late (k2/l4/d3)×5<br>late (k2/l3/d3)×3 |
| late | directed | none (k1/l4/d4)×3<br>late (k2/l4/d4)×2<br>none (k1/l3/d3)×1 | late (k2/l4/d3)×6<br>late (k2/l3/d3)×1 | absent×3<br>none (k1/l4/d4)×1<br>late (k2/l4/d3)×1 |
| expert | random | none (k2/l6/d5)×2 | none (k2/l6/d4)×1<br>none (k2/l5/d5)×1 | expert (k2/l6/d5)×1<br>expert (k2/l5/d5)×1 |
| expert | directed | none (k1/l6/d6)×1 | none (k1/l6/d6)×1 | expert (k2/l6/d5)×1 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
