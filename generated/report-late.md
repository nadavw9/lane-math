# Lane Math — generator distribution report

Generated 2026-08-14T05:54:24.687Z · seed `20260813` · 4000 attempts per tier per strategy

**197 accepted from 4000 attempts** (4.92%) in 1134.9s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|
| late | random | 4.92% | 197 | 733 | 20 |

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| late | random | 4000 | 197 | 4.92% | 283.7 | 5761 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| late | random |  | 2180 | 37 | 135 |  | 915 | 536 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| late | random | 2811 |

## Achieved metrics vs target bands

### late · random

Mode of record: **normal** (counted)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×136  2×61 | 0×6  1×486  2×201  3×37  4×3 |
| lookaheadDistance | 3–4 | 3 / 4 / 4 | 3×83  4×114 | 0×6  1×90  2×117  3×130  4×159  5×164  6×67 |
| decisionPoints | 3–4 | 3 / 4 / 4 | 3×91  4×106 | 1×16  2×108  3×235  4×260  5×100  6×14 |
| solutionPaths | any | 1 / 28 / 4000 | 1×12  2×15  3×6  4×6  5×6  6×5  7×6  8×1  9×6  10×5  11×1  12×5  14×4  15×4  17×1  18×5  20×2  21×1  22×2  24×1  25×2  26×1  27×1  28×1  29×2  30×1  32×2  34×1  35×1  37×2  38×1  43×1  47×1  53×1  54×1  55×1  61×1  62×1  63×1  65×1  66×1  67×1  74×2  76×1  78×1  79×1  81×1  83×1  88×2  95×1  114×1  117×2  120×1  129×1  133×1  135×1  145×2  146×1  159×2  169×1  171×1  182×1  195×1  199×1  220×1  227×1  228×1  240×2  252×1  264×1  270×1  284×1  290×1  294×1  326×1  327×1  333×1  337×1  346×1  348×1  353×1  357×1  390×1  402×1  406×1  444×1  511×1  567×1  576×1  600×1  604×1  652×1  693×1  711×1  768×1  938×1  952×1  1052×1  1141×1  1309×1  1757×1  2397×1  2518×1  3435×1  3643×1  3778×1  3922×1  4000×6 | 1×67  2×50  3×25  4×23  5×25  6×16  7×23  8×21  9×14  10×12  11×4  12×8  13×4  14×10  15×9  16×6  17×1  18×9  19×3  20×9  21×4  22×10  23×2  24×8  25×5  26×4  27×3  28×6  29×4  30×1  31×3  32×3  33×3  34×5  35×3  36×5  37×3  38×3  39×1  40×1  41×1  42×1  43×3  44×3  45×2  46×4  47×1  48×2  52×1  53×2  54×4  55×4  57×3  58×1  61×3  62×2  63×4  65×2  66×2  67×2  68×1  70×3  73×1  74×2  75×1  76×2  77×2  78×1  79×1  80×1  81×2  82×1  83×1  86×4  88×2  89×1  92×1  93×2  94×2  95×1  96×2  97×2  98×1  99×1  101×1  102×1  103×1  105×2  106×1  108×1  109×1  111×1  113×2  114×4  116×1  117×3  118×1  120×2  121×1  122×2  129×1  133×2  134×2  135×3  136×1  140×2  145×2  146×1  147×1  149×2  150×1  157×1  159×2  163×2  166×1  167×3  169×2  170×1  171×1  172×1  175×1  176×1  177×1  178×1  182×2  185×1  190×1  195×1  196×1  199×1  201×1  205×1  209×1  210×1  211×1  214×1  220×1  222×1  227×1  228×1  230×2  232×1  237×1  239×1  240×2  243×1  248×1  252×2  256×1  257×2  259×1  263×1  264×1  268×1  269×2  270×1  274×1  282×2  284×1  286×1  290×1  294×1  297×1  324×2  326×1  327×1  333×1  335×1  337×1  340×1  346×1  348×1  353×1  357×1  376×1  384×1  390×2  392×1  393×1  402×1  403×1  404×1  406×1  410×1  411×1  424×1  431×1  432×1  436×1  444×1  449×1  503×1  504×1  511×1  513×1  524×1  533×1  554×1  567×2  576×1  588×1  600×1  604×1  611×1  652×1  693×1  711×2  723×1  741×1  763×1  768×1  797×1  802×1  831×2  900×1  929×1  938×1  940×1  952×1  963×1  985×1  1046×1  1052×1  1056×1  1058×1  1098×1  1099×1  1141×1  1212×1  1243×1  1309×2  1316×1  1411×1  1461×1  1462×1  1645×1  1744×1  1757×1  1956×1  2048×1  2082×1  2157×1  2248×1  2397×1  2428×1  2518×1  2578×1  2641×1  2684×1  2825×1  3020×1  3145×1  3202×1  3246×1  3409×1  3435×1  3524×1  3643×1  3778×1  3922×1  4000×22 |
| maxTrapDepth | — | 3 / 6 / 8 | 3×5  4×27  5×59  6×74  7×25  8×7 | 1×3  2×6  3×32  4×86  5×212  6×241  7×109  8×35  9×9 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×172  1×25 | 0×603  1×111  2×9  3×9  5×1 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 5 / 6 | 4.91 | 1×3  2×5  3×37  4×156  5×339  6×193 | 26.33% |
| dPath (correct) | 1 / 4 / 6 | 3.49 | 1×16  2×108  3×235  4×260  5×100  6×14 | 67.53% |

The last column isolates ONE criterion. Overall band pass is **26.88%** (197 of 733 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 444 |
| decisionPoints | 238 |
| keystones | 46 |

Peak temptation (min/med/max): 0.5 / 0.654 / 0.789

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| late | random | late (k1/l4/d4)×36<br>late (k1/l3/d4)×26<br>late (k1/l3/d3)×23 | late (k1/l4/d4)×49<br>late (k1/l3/d4)×34<br>late (k1/l3/d3)×30 | late (k1/l3/d3)×31<br>late (k1/l4/d4)×30<br>late (k2/l4/d3)×29 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
