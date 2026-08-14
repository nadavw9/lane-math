# Lane Math — generator distribution report

Generated 2026-08-14T05:38:20.689Z · seed `20260813` · 3000 attempts per tier per strategy

**200 accepted from 932 attempts** (21.46%) in 0.2s

Bands are transcribed from GDD §8.5. Every candidate is solved and analysed under all three modes before acceptance; a board unsolvable in any mode is a failed candidate, not a mode-specific level.

## Top of the ladder: Late

Late is the deepest tier in launch scope — §7.2 maps World 4 to Late, and Master is post-launch (§8.7).

| Tier | Strategy | Yield | Accepted | Reached banding | Attempts per accepted level |
|---|---|---:|---:|---:|---:|

## Yield

| Tier | Strategy | Attempts | Accepted | Yield | ms/attempt | ms/accepted |
|---|---|---:|---:|---:|---:|---:|
| tutorial-forced | random | 932 | 200 | 21.46% | 0.2 | 1 |

## Rejection reasons

| Tier | Strategy | construction-failed | no-keystone | trap-not-live | trap-not-tempting | inert-decoy | no-expert-budget | out-of-band | duplicate | unsolvable |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tutorial-forced | random |  |  |  |  |  | 182 | 550 |  |  |

`inert-decoy` counts boards abandoned because no value in range opened a new reading. Individual inert candidate values rejected along the way (GDD §3.1) are counted separately:

| Tier | Strategy | Inert decoy values rejected |
|---|---|---:|
| tutorial-forced | random | 0 |

## Achieved metrics vs target bands

### tutorial-forced · random

Mode of record: **casual** (free)

| Metric | Band | Accepted (min/med/max) | Accepted histogram | Reached-banding histogram |
|---|---|---|---|---|
| keystones | 0–1 | 0 / 0 / 1 | 0×111  1×89 | 0×261  1×370  2×119 |
| lookaheadDistance | 0–1 | 0 / 0 / 1 | 0×111  1×89 | 0×261  1×229  2×260 |
| decisionPoints | 0 | 0 / 0 / 0 | 0×200 | 0×311  1×354  2×85 |
| solutionPaths | any | 1 / 1 / 1 | 1×200 | 1×705  2×38  3×7 |
| maxTrapDepth | — | 0 / 0 / 0 | 0×200 | 0×323  1×226  2×201 |
| overlappingKeystonePairs | — | 0 / 0 / 0 | 0×200 | 0×676  1×74 |

**decisionPoints: dStart vs dPath** (all candidates reaching banding)

| Basis | min/med/max | mean | histogram | passes decisionPoints alone |
|---|---|---:|---|---:|
| dStart (wrong) | 0 / 2 / 3 | 1.51 | 0×123  1×224  2×299  3×104 | 16.40% |
| dPath (correct) | 0 / 1 / 2 | 0.70 | 0×311  1×354  2×85 | 41.47% |

The last column isolates ONE criterion. Overall band pass is **26.67%** (200 of 750 reaching banding) — a board must clear keystones, lookahead and decisionPoints together. Relief on a criterion that was not binding does not move yield.

**Which criterion actually binds** (out-of-band candidates; one can fail several)

| Criterion | Rejected |
|---|---:|
| decisionPoints | 439 |
| lookahead | 260 |
| keystones | 119 |

Peak temptation (min/med/max): 0 / 0 / 0

## Per-mode landing

The same board can band into different tiers per mode — expected, per the brief. For accepted levels:

| Tier | Strategy | casual lands | normal lands | expert lands |
|---|---|---|---|---|
| tutorial-forced | random | tutorial-forced (k0/l0/d0)×111<br>tutorial-forced (k1/l1/d0)×89 | tutorial-forced (k0/l0/d0)×110<br>tutorial-forced (k1/l1/d0)×89<br>none (k2/l1/d0)×1 | tutorial-forced (k0/l0/d0)×101<br>tutorial-forced (k1/l1/d0)×90<br>none (k1/l2/d0)×4 |

Key: `k` keystones, `l` lookahead distance, `d` decision points.
