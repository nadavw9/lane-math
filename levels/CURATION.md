# Lane Math — curated launch ladder

40 of 40 slots · 4 worlds × 10 levels · GDD §7.2

Every ladder level carries a valid Casual, Normal **and** Expert budget (§10: the corpus may be permissive, the ladder may not). Master tier is post-launch and unused (§8.7).

## Composite difficulty score (GDD §8.4)

| Input | Weight |
|---|---:|
| lookaheadDistance | 3.0 |
| decisionPoints (dPath) | 2.0 |
| 1 − survivalRate | 2.0 |
| maxTrapDepth | 1.5 |
| T | 1.0 |
| 1 / log2(solutionPaths + 1) | 1.0 |

## The 40 levels

| id | role | tier | T | S | dPoints | lookahead | keystones | trapDepth | paths | lines | survival | score |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **1-01** | near-forced | tutorial-forced | 3 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 100.0% | 4.00 |
| **1-02** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 2 | 3 | 66.7% | 10.80 |
| **1-03** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 2 | 50.0% | 11.50 |
| **1-04** | scripted-trap | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 3 | 33.3% | 13.33 |
| **1-05** | valley | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 2 | 50.0% | 11.50 |
| **1-06** | trap-retest | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 3 | 33.3% | 13.33 |
| **1-07** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 2 | 50.0% | 11.50 |
| **1-08** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 1 | 1 | 2 | 50.0% | 11.50 |
| **1-09** | standard | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 2 | 50.0% | 13.00 |
| **1-10** | world-peak | tutorial | 3 | 0 | 1 | 1 | 1 | 2 | 1 | 3 | 33.3% | 13.33 |
| **2-01** | valley | early | 4 | 0 | 1 | 1 | 1 | 1 | 2 | 3 | 66.7% | 11.80 |
| **2-02** | valley | early | 4 | 0 | 1 | 1 | 1 | 1 | 2 | 3 | 66.7% | 11.80 |
| **2-03** | standard | early | 4 | 0 | 1 | 1 | 1 | 2 | 1 | 2 | 50.0% | 14.00 |
| **2-04** | standard | early | 5 | 0 | 2 | 1 | 1 | 1 | 1 | 3 | 33.3% | 15.83 |
| **2-05** | standard | early | 4 | 0 | 1 | 2 | 1 | 2 | 1 | 2 | 50.0% | 17.00 |
| **2-06** | standard | early | 5 | 0 | 1 | 2 | 1 | 2 | 1 | 2 | 50.0% | 18.00 |
| **2-07** | standard | early | 4 | 0 | 2 | 2 | 1 | 2 | 1 | 3 | 33.3% | 19.33 |
| **2-08** | standard | early | 5 | 0 | 1 | 2 | 1 | 3 | 1 | 2 | 50.0% | 19.50 |
| **2-09** | standard | early | 4 | 0 | 2 | 2 | 1 | 3 | 1 | 5 | 20.0% | 21.10 |
| **2-10** | world-peak | early | 5 | 0 | 2 | 2 | 1 | 4 | 1 | 8 | 12.5% | 23.75 |
| **3-01** | valley | mid | 5 | 1 | 2 | 2 | 1 | 1 | 2 | 6 | 33.3% | 18.46 |
| **3-02** | valley | mid | 5 | 1 | 2 | 2 | 2 | 1 | 1 | 3 | 33.3% | 18.83 |
| **3-03** | standard | mid | 5 | 1 | 2 | 2 | 1 | 4 | 3 | 17 | 17.6% | 23.15 |
| **3-04** | standard | mid | 6 | 1 | 2 | 2 | 1 | 4 | 2 | 27 | 7.4% | 24.48 |
| **3-05** | standard | mid | 5 | 1 | 2 | 3 | 1 | 3 | 1 | 9 | 11.1% | 25.28 |
| **3-06** | standard | mid | 5 | 1 | 2 | 3 | 2 | 4 | 2 | 16 | 12.5% | 26.38 |
| **3-07** | standard | mid | 5 | 1 | 3 | 3 | 1 | 3 | 2 | 22 | 9.1% | 26.95 |
| **3-08** | standard | mid | 5 | 1 | 3 | 3 | 2 | 4 | 3 | 10 | 30.0% | 27.90 |
| **3-09** | standard | mid | 6 | 1 | 3 | 3 | 2 | 4 | 8 | 18 | 44.4% | 28.43 |
| **3-10** | world-peak | mid | 6 | 1 | 3 | 3 | 2 | 5 | 1 | 25 | 4.0% | 31.42 |
| **4-01** | valley | late | 6 | 2 | 3 | 3 | 1 | 3 | 26 | 71 | 36.6% | 26.98 |
| **4-02** | valley | late | 6 | 2 | 3 | 3 | 1 | 3 | 15 | 40 | 37.5% | 27.00 |
| **4-03** | standard | late | 6 | 1 | 4 | 3 | 1 | 5 | 240 | 2020 | 11.9% | 32.39 |
| **4-04** | standard | late | 6 | 2 | 3 | 4 | 2 | 5 | 3 | 34 | 8.8% | 33.82 |
| **4-05** | standard | late | 6 | 1 | 3 | 4 | 2 | 6 | 18 | 290 | 6.2% | 35.11 |
| **4-06** | standard | late | 7 | 1 | 4 | 3 | 1 | 7 | 114 | 1329 | 8.6% | 36.47 |
| **4-07** | standard | late | 7 | 1 | 4 | 4 | 1 | 6 | 10 | 252 | 4.0% | 38.21 |
| **4-08** | two-keystone | late | 6 | 2 | 4 | 4 | 2 | 7 | 357 | 2123 | 16.8% | 38.28 |
| **4-09** | two-keystone | late | 7 | 2 | 4 | 4 | 2 | 7 | 309 | 1270 | 24.3% | 39.13 |
| **4-10** | world-peak | late | 7 | 1 | 4 | 4 | 2 | 6 | 3 | 273 | 1.1% | 38.48 |

## Difficulty curve

```
 39.1 |                                       ****
 36.8 |                                      *||||
 34.4 |                                    **|||||
 32.1 |                               *   *|||||||
 29.8 |                               |   ||||||||
 27.4 |                           ****| **||||||||
 25.1 |                         **||||| ||||||||||
 22.7 |                    *   *||||||| ||||||||||
 20.4 |                 ***|   |||||||| ||||||||||
 18.1 |               **|||| **|||||||| ||||||||||
 15.7 |              *|||||| |||||||||| ||||||||||
 13.4 |   * *  **   *||||||| |||||||||| ||||||||||
 11.0 | **|*|**|| **|||||||| |||||||||| ||||||||||
  8.7 | ||||||||| |||||||||| |||||||||| ||||||||||
  6.3 | ||||||||| |||||||||| |||||||||| ||||||||||
  4.0 |*||||||||| |||||||||| |||||||||| ||||||||||
      +----------+----------+----------+----------
       1        · 2        · 3        · 4        ·   (world at slot 1, · at slot 10)
```

### Valley check (GDD §7.3)

| World | slot 1 | world min | is min? | lookahead (floor) | dPoints (floor) | at floor? |
|---|---:|---:|---|---|---|---|
| 1 | 4.00 | 4.00 | yes | 0 (0) | 0 (0) | yes |
| 2 | 11.80 | 11.80 | yes | 1 (1) | 1 (1) | yes |
| 3 | 18.46 | 18.46 | yes | 2 (2) | 2 (2) | yes |
| 4 | 26.98 | 26.98 | yes | 3 (3) | 3 (3) | yes |

### Step sizes and boundary cliffs (GDD §7.3, asymmetric)

| World | median within-world step |
|---|---:|
| 1 | 1.83 |
| 2 | 1.33 |
| 3 | 0.95 |
| 4 | 1.29 |
| **pooled** | **1.31** |

**Upward** boundary steps above 2× the pooled median (2.62) are walls and must be fixed. **Downward** steps are the saw working — slot 1 sits at its tier floor while the previous slot 10 is a world peak — and are reported, not smoothed.

| Boundary | from | to | step | direction | nearest previous-world level | verdict |
|---|---:|---:|---:|---|---|---|
| 1-10 → 2-01 | 13.33 | 11.80 | -1.53 | down | 1-03 (11.50) | expected (downward into valley) |
| 2-10 → 3-01 | 23.75 | 18.46 | -5.29 | down | 2-06 (18.00) | expected (downward into valley) |
| 3-10 → 4-01 | 31.42 | 26.98 | -4.44 | down | 3-07 (26.95) | expected (downward into valley) |

The sanity check §7.3 asks for: each valley should land near a level the player cleared recently in the previous world, not below anything they have seen.
