# Lane Math — generator distribution report

Generated 2026-08-23T11:52:26.369Z · seed `777` · 6000 attempts per tier per strategy

**200 accepted from 2992 attempts** (6.68%) in 433.6s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|
| late | random | 6.68% | 200 | 778 | 15 |

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| late | random | 2992 | 200 | 6.68% | 144.9 | 2168 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | root-optional | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| late | random |  | 1571 | 561 | 18 | 63 | 1 |  | 578 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| late | random | 2121 |

## Achieved metrics vs target bands

### late · random

Mode of record: **normal** (consumed)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 1–2 | 1 / 1 / 2 | 1×141  2×59 | 0×1  1×518  2×203  3×48  4×8 |
| lookaheadDistance | 3–4 | 3 / 3 / 4 | 3×104  4×96 | 0×1  1×85  2×130  3×150  4×139  5×183  6×90 |
| decisionPoints | 3–4 | 3 / 4 / 4 | 3×91  4×109 | 0×1  1×15  2×92  3×229  4×301  5×129  6×11 |
| solutionPaths | any | 1 / 6 / 324 | 1×25  2×24  3×13  4×22  5×7  6×18  7×4  8×8  9×7  10×7  11×2  12×9  13×1  14×6  16×2  17×2  18×3  20×1  21×1  22×3  23×2  24×3  25×1  26×2  27×1  28×3  29×1  30×1  33×1  34×1  36×2  40×1  44×1  45×1  46×1  48×2  50×1  62×1  66×1  82×1  106×1  144×1  168×1  200×1  290×1  312×1  324×1 | 1×110  2×104  3×48  4×63  5×23  6×60  7×14  8×37  9×12  10×30  11×8  12×36  13×7  14×15  15×4  16×14  17×5  18×16  19×2  20×13  21×5  22×8  23×4  24×17  25×2  26×4  27×2  28×7  29×1  30×10  32×2  33×1  34×2  35×1  36×6  38×2  40×1  41×2  42×2  43×1  44×4  45×1  46×1  48×3  50×2  52×1  54×3  58×1  60×3  62×1  64×1  66×1  68×1  69×1  72×2  76×1  78×1  80×1  81×3  82×2  85×1  86×1  90×2  96×1  100×2  102×1  106×1  108×2  116×1  120×3  128×1  132×1  140×1  144×2  150×1  153×1  162×1  168×2  189×1  198×1  200×1  206×1  255×1  258×1  264×1  276×1  288×1  290×1  312×1  321×1  324×1  492×1  564×1  627×1  1176×1  1836×1 |
| maxTrapDepth | — | 2 / 5 / 6 | 2×1  3×15  4×47  5×88  6×49 | 1×11  2×13  3×50  4×137  5×323  6×233  7×11 |
| overlappingKeystonePairs | — | 0 / 0 / 1 | 0×174  1×26 | 0×638  1×116  2×12  3×9  4×3 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 1 / 5 / 6 | 4.95 | 1×2  2×6  3×49  4×143  5×350  6×228 | 24.68% |
| dPath (correct) | 0 / 4 / 6 | 3.60 | 0×1  1×15  2×92  3×229  4×301  5×129  6×11 | 68.12% |

The last column isolates ONE criterion. Overall band pass is **25.71%** (200 of 778 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| lookahead | 489 |
| decisionPoints | 248 |
| keystones | 57 |

Peak temptation (min/med/max): 0.5 / 0.643 / 0.789

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| late | random | late (k1/l3/d4)×38<br>late (k1/l4/d4)×33<br>none (k1/l3/d5)×28 | late (k1/l3/d4)×49<br>late (k1/l4/d4)×37<br>late (k1/l3/d3)×32 | absent×109<br>late (k1/l4/d4)×19<br>late (k2/l4/d3)×15 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
