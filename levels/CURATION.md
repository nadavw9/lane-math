# Lane Math — curated launch ladder

40 of 40 slots filled · 4 worlds × 10 levels · GDD §7.2

Every ladder level carries a valid Casual, Normal **and** Expert budget (§10: the corpus may be permissive, the ladder may not). Master tier is post-launch and unused (§8.7).

## Composite difficulty score

| Input | Weight | Why |
|---|---:|---|
| lookaheadDistance | 3.0 | §8.2 calls it "the primary difficulty metric" — targets held in mind at once |
| decisionPoints (dPath) | 2.0 | Search burden: targets that actually branch when reached |
| maxTrapDepth | 1.5 | Frustration rather than difficulty — distance from mistake to failure |
| T (targets) | 1.0 | Length. Lowest: §4.5 says difficulty comes from keystone structure, not length |

`solutionPaths` is deliberately excluded — it measures forgiveness, not difficulty, and ranges 1–4000 in the corpus, so it would dominate the ordering.

## The 40 levels

| id | role | tier | T | S | dPoints | lookahead | keystones | trapDepth | paths | score | score −uniq |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **1-01** | near-forced | tutorial-forced | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 4.0 | 3.0 |
| **1-02** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 2 | 10.1 | 9.5 |
| **1-03** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 10.5 | 9.5 |
| **1-04** | scripted-trap | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 12.0 | 11.0 |
| **1-05** | valley | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 10.5 | 9.5 |
| **1-06** | trap-retest | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 12.0 | 11.0 |
| **1-07** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 10.5 | 9.5 |
| **1-08** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 10.5 | 9.5 |
| **1-09** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 12.0 | 11.0 |
| **1-10** | world-peak | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 12.0 | 11.0 |
| **2-01** | valley | early | 4 | 0 | 1 | 1 | 1 | 1 | 2 | 11.1 | 10.5 |
| **2-02** | valley | early | 4 | 0 | 1 | 1 | 1 | 1 | 2 | 11.1 | 10.5 |
| **2-03** | standard | early | 4 | 0 | 1 | 1 | 1 | 2 | 1 | 13.0 | 12.0 |
| **2-04** | standard | early | 5 | 0 | 2 | 1 | 1 | 1 | 1 | 14.5 | 13.5 |
| **2-05** | standard | early | 4 | 0 | 1 | 2 | 1 | 2 | 1 | 16.0 | 15.0 |
| **2-06** | standard | early | 5 | 0 | 1 | 2 | 1 | 2 | 1 | 17.0 | 16.0 |
| **2-07** | standard | early | 4 | 0 | 2 | 2 | 1 | 2 | 1 | 18.0 | 17.0 |
| **2-08** | standard | early | 5 | 0 | 1 | 2 | 1 | 3 | 1 | 18.5 | 17.5 |
| **2-09** | standard | early | 4 | 0 | 2 | 2 | 1 | 3 | 1 | 19.5 | 18.5 |
| **2-10** | world-peak | early | 5 | 0 | 2 | 2 | 1 | 4 | 1 | 22.0 | 21.0 |
| **3-01** | valley | mid | 5 | 1 | 2 | 2 | 1 | 1 | 2 | 17.1 | 16.5 |
| **3-02** | valley | mid | 5 | 1 | 2 | 2 | 2 | 1 | 1 | 17.5 | 16.5 |
| **3-03** | standard | mid | 5 | 1 | 2 | 2 | 1 | 4 | 3 | 21.5 | 21.0 |
| **3-04** | standard | mid | 6 | 1 | 2 | 2 | 1 | 4 | 2 | 22.6 | 22.0 |
| **3-05** | standard | mid | 5 | 1 | 2 | 3 | 1 | 3 | 1 | 23.5 | 22.5 |
| **3-06** | standard | mid | 5 | 1 | 2 | 3 | 2 | 4 | 2 | 24.6 | 24.0 |
| **3-07** | standard | mid | 5 | 1 | 3 | 3 | 1 | 3 | 2 | 25.1 | 24.5 |
| **3-08** | standard | mid | 5 | 1 | 3 | 3 | 2 | 4 | 3 | 26.5 | 26.0 |
| **3-09** | standard | mid | 6 | 1 | 3 | 3 | 2 | 4 | 8 | 27.3 | 27.0 |
| **3-10** | world-peak | mid | 6 | 1 | 3 | 3 | 2 | 5 | 1 | 29.5 | 28.5 |
| **4-01** | valley | late | 6 | 2 | 3 | 3 | 1 | 3 | 26 | 25.7 | 25.5 |
| **4-02** | valley | late | 6 | 2 | 3 | 3 | 1 | 3 | 15 | 25.8 | 25.5 |
| **4-03** | standard | late | 6 | 1 | 4 | 3 | 1 | 5 | 240 | 30.6 | 30.5 |
| **4-04** | standard | late | 6 | 2 | 3 | 4 | 2 | 5 | 3 | 32.0 | 31.5 |
| **4-05** | standard | late | 6 | 1 | 3 | 4 | 2 | 6 | 18 | 33.2 | 33.0 |
| **4-06** | standard | late | 7 | 1 | 4 | 3 | 1 | 7 | 114 | 34.6 | 34.5 |
| **4-07** | standard | late | 7 | 1 | 4 | 4 | 1 | 6 | 10 | 36.3 | 36.0 |
| **4-08** | two-keystone | late | 7 | 1 | 4 | 4 | 2 | 6 | 3 | 36.5 | 36.0 |
| **4-09** | two-keystone | late | 6 | 2 | 4 | 4 | 2 | 7 | 357 | 36.6 | 36.5 |
| **4-10** | world-peak | late | 7 | 2 | 4 | 4 | 2 | 7 | 337 | 37.6 | 37.5 |

## Difficulty curve

```
 37.6 |                                        ***
 35.4 |                                      **|||
 33.1 |                                     *|||||
 30.9 |                                   **||||||
 28.7 |                               *   ||||||||
 26.4 |                             **| **||||||||
 24.2 |                          ***||| ||||||||||
 21.9 |                    *   **|||||| ||||||||||
 19.7 |                   *|   |||||||| ||||||||||
 17.4 |                ***|| **|||||||| ||||||||||
 15.2 |              **||||| |||||||||| ||||||||||
 13.0 |   * *  **   *||||||| |||||||||| ||||||||||
 10.7 | **|*|**|| **|||||||| |||||||||| ||||||||||
  8.5 | ||||||||| |||||||||| |||||||||| ||||||||||
  6.2 | ||||||||| |||||||||| |||||||||| ||||||||||
  4.0 |*||||||||| |||||||||| |||||||||| ||||||||||
      +----------+----------+----------+----------
       1        · 2        · 3        · 4        ·   (world number at slot 1, · at slot 10)
```

### Valley check (GDD §7.3, amended)

Slot 1 of each world must be the minimum composite **within its own world** and sit at the floor of its tier band on lookahead and decisionPoints. There is no cross-world absolute comparison: T is fixed per world by §7.2 and both lookahead and decisionPoints scale with it, so absolute score rises at every boundary by construction — and correctly, since player skill rises too.

| World | slot 1 | world min | is min? | lookahead (floor) | dPoints (floor) | at floor? |
|---|---:|---:|---|---|---|---|
| 1 | 4.0 | 4.0 | yes | 0 (0) | 0 (0) | yes |
| 2 | 11.1 | 11.1 | yes | 1 (1) | 1 (1) | yes |
| 3 | 17.1 | 17.1 | yes | 2 (2) | 2 (2) | yes |
| 4 | 25.7 | 25.7 | yes | 3 (3) | 3 (3) | yes |

### Step sizes and boundary cliffs

| World | median within-world step |
|---|---:|
| 1 | 1.50 |
| 2 | 1.00 |
| 3 | 1.13 |
| 4 | 1.24 |
| **pooled** | **1.19** |

A boundary step is flagged when it exceeds **2× the pooled within-world median** (2.37). Direction is irrelevant — a jump of 3.0 where levels normally step 0.5 is a wall whichever way it points.

| Boundary | from | to | step | vs pooled median | flag |
|---|---:|---:|---:|---:|---|
| 1-10 → 2-01 | 12.0 | 11.1 | -0.9 | 0.7× | ok |
| 2-10 → 3-01 | 22.0 | 17.1 | -4.9 | 4.1× | **CLIFF** |
| 3-10 → 4-01 | 29.5 | 25.7 | -3.8 | 3.2× | **CLIFF** |

## Effect of the uniqueness term

`uniqueness = 1 / log2(solutionPaths + 1)`, weight 1.0. The whole curation is run twice — the term affects selection, not just display, so comparing rendered scores alone would understate it.

**30 of 40 slots receive a different board** when the term is removed.

| id | with uniqueness | paths | without uniqueness | paths |
|---|---|---:|---|---:|
| 1-02 | gen-tutorial-3437 (10.1) | 2 | gen-tutorial-1084 (9.5) | 1 |
| 1-03 | gen-tutorial-510 (10.5) | 1 | gen-tutorial-734 (9.5) | 1 |
| 1-05 | gen-tutorial-2003 (10.5) | 1 | gen-tutorial-2046 (9.5) | 1 |
| 1-07 | gen-tutorial-3148 (10.5) | 1 | gen-tutorial-3194 (9.5) | 1 |
| 1-09 | gen-tutorial-1576 (12.0) | 1 | gen-tutorial-1663 (11.0) | 1 |
| 2-01 | gen-early-3705 (11.1) | 2 | gen-early-1146 (10.5) | 1 |
| 2-02 | gen-early-630 (11.1) | 2 | gen-early-2314 (10.5) | 1 |
| 2-04 | gen-early-195 (14.5) | 1 | gen-early-2106 (13.5) | 1 |
| 2-05 | gen-early-3828 (16.0) | 1 | gen-early-1030 (15.0) | 1 |
| 2-06 | gen-early-3679 (17.0) | 1 | gen-early-1858 (16.0) | 1 |
| 2-07 | gen-early-3213 (18.0) | 1 | gen-early-1004 (17.0) | 1 |
| 2-08 | gen-early-3932 (18.5) | 1 | gen-early-759 (17.5) | 1 |
| 2-09 | gen-early-2540 (19.5) | 1 | gen-early-3147 (18.5) | 2 |
| 3-01 | gen-mid-3726 (17.1) | 2 | gen-mid-1211 (16.5) | 1 |
| 3-02 | gen-mid-1211 (17.5) | 1 | gen-mid-2340 (16.5) | 1 |
| 3-03 | gen-mid-94 (21.5) | 3 | gen-mid-338 (21.0) | 1 |
| 3-04 | gen-mid-854 (22.6) | 2 | gen-mid-3721 (22.0) | 2 |
| 3-05 | gen-mid-3485 (23.5) | 1 | gen-mid-3933 (23.0) | 1 |
| 3-06 | gen-mid-3557 (24.6) | 2 | gen-mid-2401 (24.0) | 2 |
| 3-07 | gen-mid-2519 (25.1) | 2 | gen-mid-2804 (24.5) | 4 |
| 3-08 | gen-mid-3124 (26.5) | 3 | gen-mid-3870 (26.0) | 1 |
| 3-09 | gen-mid-1424 (27.3) | 8 | gen-mid-2905 (27.0) | 2 |
| 3-10 | gen-mid-814 (29.5) | 1 | gen-mid-840 (28.5) | 7 |
| 4-03 | gen-late-1328 (30.6) | 240 | gen-late-3646 (30.0) | 6 |
| 4-04 | gen-late-2493 (32.0) | 3 | gen-late-3627 (31.5) | 18 |
| 4-05 | gen-late-612 (33.2) | 18 | gen-late-2127 (33.0) | 2 |
| 4-06 | gen-late-3750 (34.6) | 114 | gen-late-3319 (34.0) | 1 |
| 4-07 | gen-late-284 (36.3) | 10 | gen-late-3295 (35.5) | 7 |
| 4-08 | gen-late-1293 (36.5) | 3 | gen-late-1101 (36.0) | 55 |
| 4-09 | gen-late-3997 (36.6) | 357 | gen-late-2530 (36.0) | 17 |

## Candidate pools

| Tier | Boards with all three modes |
|---|---:|
| tutorial | 310 |
| tutorial-forced | 200 |
| early | 467 |
| mid | 419 |
| late | 197 |

## Unfilled slots

None — all 40 slots filled.
