# Lane Math — Game Design Document

**Status:** Design locked, pre-implementation
**Author:** Nadav
**Related project:** Traffic Bomb (`lane-defense`) — selective reuse, see §11

---

## 1. Concept

A single-lane arithmetic puzzle where the difficulty is **resource planning, not arithmetic**.

The player is given a pool of numbers and a queue of targets. Each move combines two numbers with one operator to produce the next target. The numbers used are destroyed permanently. Solving each equation is trivial; choosing *which* decomposition to use is the entire game, because every choice removes resources a later target may need.

**Design premise:** the arithmetic must stay easy so that all cognitive load lands on planning. Anything that makes the mental math harder (fractions, huge numbers) is working against the design.

### Canonical example

```
Pool:    1, 2, 2, 3, 4, 5
Queue:   8 → 3 → 15
```

**Reasoning backwards:** `15` can only be made as `3 × 5`. So the 3 and the 5 are reserved. Everything else must come from `{1, 2, 2, 4}`.

**The only winning line:**

| Target | Move | Pool after |
|---|---|---|
| 8 | `2 × 4` | `1, 2, 3, 5` |
| 3 | `1 + 2` | `3, 5` |
| 15 | `3 × 5` | — |

**Three fatal branches, all of which look correct at the time:**

| Fatal move | At target | Dies at | Trap depth |
|---|---|---|---|
| `3 + 5 = 8` | 0 | 2 | **2** |
| `5 − 2 = 3` | 1 (after `2×4`) | 2 | 1 |
| `1 × 3 = 3` | 1 (after `2×4`) | 2 | 1 |

Level metrics (free operators): `S = 0`, `dStart = [2, 4, 1]`, keystone at index 2, lookahead distance 2, decision points 2, solution paths 1, max trap depth 2.

**Under a consumed budget of `{+:1, ×:2}` the same board is a different puzzle:** `3 + 5 = 8` spends the only `+`, leaving no way to make 3 from `{1, 2, 2, 4}` with `×` alone. Trap depth drops from 2 to 1. See §8.6.

The failure surfaces at the **third** target, two moves after the mistake. That gap is the game.

---

## 2. Core loop

1. Level opens. **The entire target queue is visible from the start.** (Non-negotiable — see §4.)
2. Player drags two numbers and one operator into the equation slots: `[num] [op] [num] =`
3. Pieces can be tapped to return them to the pool. Nothing is committed yet.
4. Player presses **`=`** to commit.
   - **Correct** → target clears, lane advances, the two numbers and (mode-dependent) the operator are destroyed.
   - **Incorrect** → equation rejected, pieces return, no penalty. Wrong arithmetic is not a failure state.
5. Repeat until the queue is empty (**win**) or the front target is unreachable (**fail**).

### Screen layout (top → bottom)

```
┌─────────────────────────┐
│   LANE (vertical)       │  full target queue, front target at bottom
│   15                    │
│    3                    │
│    8  ← front           │
├─────────────────────────┤
│  [ _ ] [ _ ] [ _ ]  =   │  equation slots + commit button
├─────────────────────────┤
│  OPERATORS  + − × ÷ √   │
│  NUMBERS    1 2 2 3 4 5 │
└─────────────────────────┘
```

The lane occupies the same screen region as Traffic Bomb's road. One lane only.

---

## 3. Mechanics

### 3.1 Pool sizing

Each move consumes exactly 2 numbers and clears 1 target:

```
N = 2T + S
```
- `N` = pool size, `T` = target count, `S` = surplus

**Surplus is not difficulty — it is the removal of deduction.** At `S = 0` the player can reason from parity ("every number must be used, so this pairing is forced"). That is a genuine and satisfying inference. Surplus destroys it, replacing insight with search.

| Setting | Effect |
|---|---|
| `S = 0` | Parity deduction available. Feels fair, solvable by pure thought. Use early. |
| `S = 1–2` | Parity broken, search widens. Use mid/late. |
| `S ≥ 3` | Screen clutter, no added depth. **Do not ship.** |

**Surplus numbers are trap material, not filler.** Every decoy must be chosen because it creates a *false decomposition* — a tempting alternative reading of an earlier target that consumes a number reserved for a later one. A decoy that creates no false path is dead weight and must be rejected by the generator.

### 3.2 Operators

Binary: `+`, `−`, `×`, `÷`
Unary: `√`, `x²`

Scarcity is **mode-dependent** (§6).

### 3.3 Unary operators — pool transformers

`√` and `x²` take one number, which breaks the `[num][op][num]` slot shape. **Do not special-case the slots.**

Instead: unary operators act **on the pool**. Drag `√` onto the `16` in the pool → it becomes `4`, still in the pool, still needing a partner. The equation row shape never changes.

This gives unary ops a distinct puzzle identity: **they manufacture numbers you don't have.** A single `√` is a one-shot resource that converts a large useless number into a small critical one. Excellent trap material.

Constraints:
- Only offer `√` when the pool contains at least one perfect square. A permanently dead item on the board feels broken.
- `x²` is rarer and later — squaring inflates the target range fast. `√` shrinks and behaves well.
- Applying a unary op consumes it (in counted/consumed modes) and is **irreversible** — the transformed number cannot be reverted.

### 3.4 Integer-only results

**Hard rule.** All intermediate and final values are integers.

- `÷` legal only on exact division
- `√` legal only on perfect squares

Rationale: fractions break the design premise (§1) — they make the arithmetic non-trivial, explode the search space for both player and generator, and read badly on a phone.

The restriction is itself a soft hint (it prunes the player's search), which is acceptable and helpful early.

### 3.5 Input scheme — tap, not drag

**Tap-to-place, not drag-and-drop.** Drag has no good failure mode on a phone: a slip mid-drag is ambiguous (cancel or misdrop?), hit boxes compete, and it is hostile to one-handed play. Tap has no ambiguous states — every tap either fills a slot or empties one.

**Binary state machine:**

```
IDLE
 └─ tap number  → slot 1 filled.  Operators bold, numbers dim.
     └─ tap op  → slot 2 filled.  Numbers bold, operators dim.
         └─ tap number → slot 3 filled.  "=" bold.
             └─ tap "=" → COMMIT (irreversible)
```

Tapping any filled slot returns that piece to the pool and rewinds the machine to that step. (Wordle letter-selection model, plus explicit affordance highlighting.)

**Affordance rule:** bold alone is insufficient — weight change is easy to miss and poor for low-vision players. **Always pair bold-active with dim-inactive.**

**Unary operators are a mode, not a step.** `√` does not fit the binary machine because it never enters the equation. Instead:

```
tap √ → TRANSFORM MODE
        every perfect square in pool highlights, everything else dims
        └─ tap a highlighted number → transforms in place, √ consumed, → IDLE
        └─ tap √ again → cancel, → IDLE
```

This keeps binary and unary visibly distinct, which is correct — they are different actions.

Rules:
- **A unary transform counts as a move for failure detection.** Transforming `16 → 4` can strip the pool of what the front target needed; the game must fail immediately, not wait for a commit that never comes.
- **No cascading transforms.** One transform per tile, even where `√4 = 2` is legal.

**Additional input rules:**

| Rule | Reason |
|---|---|
| Tiles are consumed **by index, not by value** | Pool `[2, 2]` — the wrong tile animates otherwise |
| Emptying a slot does **not** reshuffle the others | Slot 3 must not slide into slot 1 |
| **Swap gesture** on the equation row | `5−3 ≠ 3−5` and tap order sets it; correcting order must not cost two taps |
| `=` disabled until all three slots filled | No half-formed commits |

### 3.6 Negative intermediates

Separate difficulty axis, independent of the integer rule.

- **Early worlds:** results must be ≥ 0. `3 − 8` is rejected.
- **Later worlds:** negatives allowed. Roughly doubles subtraction's branching factor without touching arithmetic difficulty.

---

## 4. Failure

### 4.1 Trigger

**Failure fires when the target at the front of the lane cannot be produced from the numbers remaining in the pool.**

Not when the solver detects an unwinnable state. The trigger is a concrete, visible board condition the player can verify themselves. The lane stops because the thing in front of it is unreachable.

The gap between the fatal move and the failure is **unbounded**. In the canonical example the mistake is at target 1 and the failure at target 3.

### 4.2 Full queue visibility is mandatory

Because failure can surface arbitrarily far from its cause, the player **must** be able to see the whole queue at level start. The intended reasoning is backwards:

> *15 can only be 3×5. So 3 and 5 are spoken for. Now make 8 and 3 from `{1, 2, 2, 4}`.*

If the queue were hidden, failing at 15 would punish the player for information they were never given. Same rule, entirely different — and much worse — game.

Targets arrive one at a time in the sense that only the front one is *solvable*. All of them are *visible*.

### 4.3 Consequence

```
Fail → lose 1 life → restart the level from the beginning
```

**Rewind is to the start, not to the fatal move.** Rewinding to the branch point would announce *your mistake was move 1*, handing over most of the solution — and you cannot then charge stars for a hint that failure gives away free.

Restarting leaks nothing. The player keeps everything they learned: same numbers, same queue, all still visible. They failed to read backwards; now they know to.

### 4.4 No undo

Every committed equation is final. Undo would let the player probe branches and take them back, dissolving the commitment the design rests on.

**This makes input quality a hard requirement.** Mitigations, all pre-commit:
- Dragging pieces into slots is free and reversible
- Tapping a piece in a slot returns it to the pool
- Nothing resolves until all three slots are filled **and** `=` is pressed
- Generous hit boxes; `=` disabled until the row is complete

A misclick must never cost a star or a life.

### 4.5 Target count ceiling

Rewind-to-start plus no-undo caps level length. **`T` ≤ 7.** Difficulty comes from keystone structure, not length.

---

## 5. Economy

### 5.1 Stars

Awarded on clear, based on **failures accumulated on that level**:

| Failures | Stars |
|---|---|
| 0 | ★★★ |
| 1 | ★★ |
| 2+ | ★ |

**The failure counter persists across restarts within a level.** If it reset, every failure would be free — restart, exploit the now-known trap, collect 3 stars. The counter must survive the restart or the economy is fake.

Player-facing framing: **3 stars requires clearing the level without ever failing it.**

**Replays:** a fully replayed level can re-earn a better rating (best result persists, Candy Crush model). Replays still cost lives, so this is not exploitable.

### 5.2 Lives

Candy Crush model:
- Max **5**
- Regenerate **1 per 20 minutes** (full refill ≈ 100 min)
- At 0: rewarded ad for +1, or spend gold

**The first failure on a never-cleared level costs stars but not a life.** Rationale: a player meeting an unfamiliar mechanic should not hit a wall on first contact. Monetisation loss is negligible — players rarely stall on a level's first attempt — and the alternative is the worst possible new-player experience. The exemption is per level and consumed on first use; a second failure on the same level costs a life normally, and so does the first failure on any level already cleared.

**The refill rate must be remote-configurable or at minimum a single JSON value** deployable without a store release. This number will be wrong on first guess and only retention data will show it.

**Lives are not active during the tutorial worlds** (§7). A player must never lose a life to a mechanic they haven't been taught.

### 5.3 Gold — deferred

Purchasable with money; earnable from tournaments later. Not designed now — it is a live-ops system and needs an audience before it needs a design.

### 5.4 Hints

Bought with stars.

**A hint must never reveal a keystone outright.** In a single-keystone level, "the 15 has only one solution" *is* the answer — the player has purchased the solution, not help. Acceptable hint forms:

| Hint | Effect |
|---|---|
| **Narrow** | "One of the last three targets has only one solution." Shrinks the search, doesn't end it. |
| **Contested resource** | "The 5 is contested." Points at the scarce number, not what needs it. |
| **Branch elimination** | Highlights an earlier target: *your instinct here is wrong.* Kills the tempting fatal option without revealing the correct one. |

**Free assistance must never exceed paid.** The Normal warning says only that a move loses the level. It does not name the starved target and does not pulse the tiles that would reach it — both are what §5.4's hints sell. §7.5's scripted trap at 1-04 does name and pulse, because it is a teaching beat rather than an assist, and it fires once.

Branch elimination is the most honest — it is a warning, not an answer.

**Structural safeguard:** past the tutorial, levels should have **two or more keystones** (§8.2). A single-keystone level is one insight — find it and you're done — which makes it fragile to hints and fragile in general. Two keystones contesting the same number cannot be collapsed by revealing either one, because the insight is the *interaction*.

---

## 6. Difficulty modes

Player-selectable. Same 40 levels, three modes — content multiplied at no authoring cost.

| Mode | Operators | Fatal-move warning |
|---|---|---|
| **Casual** | Unlimited | **Blocks** the move. Free rewind. |
| **Normal** | Exact | **Warns and allows override.** Committing anyway fails normally. |
| **Expert** | Exact | None. |

**Casual blocks, Normal warns, Expert is silent.** A warning that cannot be overridden removes the failure state entirely, and with it lives, stars and the §9.4 continue path. Normal must be able to lose. §7.5's scripted trap at 1-04 remains a block in every mode — it is a teaching beat, not an assist.

**Modes differ by assistance, not by budget.** Counted-with-slack was removed: §3.1's argument against surplus numbers applies equally to operators — surplus is not difficulty, it is the removal of deduction. "Every operator must be used" lets the player reason backwards exactly as `S = 0` does for numbers.

Measured on adoption: solution paths across the ladder fell from 1142 to 40, one per level. That is the intended shape — §1's canonical example has one path, and §8.7 names uniqueness as a difficulty axis. Casual retains many paths through unlimited operators, so the forgiving mode stays forgiving.

The solver runs the same check in all three modes. **Only disclosure changes.**

---

## 7. Progression and first-time experience

### 7.1 The core tension

Standard mobile FTUE practice optimises for *immediate action* — get the player tapping within seconds. Lane Math's core skill is the **opposite**: stop and plan before acting.

Followed naively, the standard playbook trains the exact habit that causes failure at level 8.

**Resolution: do not slow onboarding down — make early levels small enough that planning takes three seconds.** `T = 3`, six numbers, one keystone, lookahead distance 1. The player plans without noticing they are planning. Then grow **the size of the plan**, not the number of mechanics.

Industry context for the stakes: ~77% of users churn on day one; average mobile D1 retention sits around 24% (freemium range 20–40%). Session one is the entire budget.

### 7.2 Structure

**4 worlds × 10 levels = 40 levels** at launch. One new concept per world.

Each mechanic follows the standard puzzle-teaching loop, which fits a 10-level world exactly:

```
TEACH    — mechanic in isolation, forced/near-forced moves, unloseable
TEST     — same mechanic, player must apply it unaided
TWIST    — mechanic interacts with something previously learned
MASTER   — open application at full difficulty
```

| World | Introduces | Lives | Params |
|---|---|---|---|
| **1 — Basics** | `+`, `−` | **Off** | `T=3`, `S=0`, 1 keystone, lookahead 1 |
| **2 — Multiply** | `×` | **On from 2-8** | `T=4–5`, `S=0`, lookahead 1–2 |
| **3 — Divide** | `÷` (exact), counted operators | On | `T=5–6`, `S=1`, lookahead 2–3 |
| **4 — Roots** | `√`, negatives, two keystones | On | `T=6–7`, `S=1–2`, lookahead 3–4 |

### 7.3 Difficulty curve — saw, not ramp

Difficulty must rise in **peaks and valleys**, not a straight line. **Every new mechanic gets a valley**: one or two deliberately easy levels immediately after introduction, so the player learns the mechanic without simultaneously fighting difficulty.

```
difficulty
   │        ╱╲      ╱╲        ╱╲
   │   ╱╲  ╱  ╲    ╱  ╲      ╱  ╲
   │  ╱  ╲╱    ╲__╱    ╲____╱    ╲
   │ ╱          ↑         ↑
   └────────────┴─────────┴──────────→ level
              new mech  new mech
              = valley  = valley
```

**The valley is within-world, not cross-world.** `T` is fixed per world by §7.2, so absolute difficulty *must* rise at every boundary — and should, since player skill rises too. The valley rule is therefore:

- W(N+1) slot 1 is the **minimum composite score within its own world**, and sits at the **floor of its tier band** on `lookahead` and `decisionPoints`. The new mechanic arrives with everything else dialled down.
- Do **not** require W(N+1)-1 to score below W(N)-10. That is unsatisfiable by construction and asks the curve to fight the progression.

**The finale is constrained on forgiveness, not score.** Slot 10 of each world must be the **minimum-`survivalRate` board in that world**, with composite breaking ties.

This is a curation constraint rather than a scoring weight, because the composite measures reasoning *demanded* while `survivalRate` measures punishment for *skipping* it, and a structural lead on the former can outrank a 20× difference in the latter. In the first curation 4-10 led its block by ~1.1 composite points while winning ~1 random walk in 4, sitting above a board that won 1 in 90; and 3-09, at 44.4% survival, sat directly below a 4.0% finale. Reweighting to fix this distorts all 40 orderings to satisfy a rule that applies to 4 slots. Constrain the slot instead.

**Measure cliffs, but treat direction asymmetrically.** The composite score measures *structural* difficulty only. Perceived difficulty is structural + novelty load, and novelty is invisible to the score. At a world boundary novelty peaks — which is precisely what the valley compensates for.

- **Upward** boundary steps above ~2× the pooled within-world median are walls. Flag and fix.
- **Downward** boundary steps are the saw curve working. Expected at every world boundary, since slot 1 sits at its tier floor while the previous slot 10 is a world peak. Report the magnitude; do not smooth it.

Sanity check instead of the ratio: the incoming valley should land near a level the player cleared recently within the previous world, not below anything they have seen. Report which previous-world level each valley is nearest in score.

**Tune on attempts, not win rate.** Industry heuristic: 1–3 attempts = easy, 20–35 = hard. The star system already counts attempts, so this is free telemetry.

### 7.4 Session one, beat by beat

| Beat | Content | Rule |
|---|---|---|
| **0:00** | App opens directly into level 1-1. | No login, no account, no avatar, no splash video. Play as guest; offer account linking much later. |
| **0:03** | Board visible. Pool of 6, three targets, `+` and `−` only. | Nothing on screen except the board. No HUD, no currency, no menus. |
| **0:10** | First equation committed. Correct. | Level 1-1 is **near-forced** — every target has `d_i = 1`. The player cannot go wrong. |
| **0:30** | Level 1-1 cleared. First stars awarded. | Star counter animates in **now** — introduced as a reward, not as pre-existing chrome. |
| **1-2 → 1-3** | Free decisions appear (`d_i = 2`), still no fatal branches. | Player learns that choices exist before learning they matter. |
| **1-4** | **THE SCRIPTED TRAP.** See §7.5. | Hand-authored, not generated. |
| **1-5** | Valley. Easy level, applying the new insight. | Recovery beat. |
| **1-6** | Same trap shape, **warning off**. Player must see it themselves. | TEACH → TEST completed. |
| **1-10** | World 1 complete. World map appears for the first time. | Map is a reward for finishing, not a hurdle before starting. |

### 7.5 The scripted trap (level 1-4)

The single most important level in the game. It converts the central mechanic from a punishment into an insight.

Hand-author a level where the **fatal branch is the obvious one**. When the player commits it:

1. The commit animation **pauses mid-flight**.
2. The camera pulls to the keystone target further down the lane.
3. One line of text: *"Wait — what makes the 15?"*
4. The only two numbers that can make it pulse in the pool.
5. The move is **rewound for free** — no star, no life, no failure recorded.
6. Player retries and succeeds.

This is the "illusion of loss" principle: new players should not actually be able to lose, but they must *feel* that they could, so the win reads as earned.

**Level 1-6 repeats the same structural shape with the warning disabled.** That is where the lesson is verified.

### 7.6 Progressive disclosure schedule

Nothing appears on screen before it is needed. Every system is a reward for progress.

| Unlocks at | System | Rationale |
|---|---|---|
| 1-1 clear | Star counter | Introduced as a prize |
| 1-4 | Fatal-move warning | The teaching device |
| 1-10 | World map | Reward for world completion |
| 2-1 | `×` | — |
| **2-8** | **Lives** | **After** the player can reliably win. Granted at full 5, explained in one screen. |
| 3-1 | `÷` | — |
| **3-3** | **Counted operators, and the count on the dial** | The remaining-uses counter appears with the rule it expresses. Before 3-3 there is nothing to count. **Never in Casual**, where operators are unlimited — an unlimited count is not a smaller number, it is a different game, and drawing an infinity symbol would teach a scarcity that is not there. |
| **3-6** | **Hint shop** | Only once the player has enough stars to actually afford something. A shop full of unaffordable items teaches "this is not for me." |
| 3-10 | **Difficulty mode selector** | Choosing a mode before understanding the game is a decision made on zero information. |
| 4-1 | `√` | Root-requiring boards are rare — 3.7% of Late candidates against 38.3% without the uniqueness rule. The mechanic unlocks at 4-1 and recurs only where curation finds a board; it is not expected on every World 4 level. Expert uniqueness is not relaxed to make it more common, because uniqueness is what makes exact budgets coherent. |
| 4-5 | Negative intermediates | — |
| 4-8 | Two-keystone levels | — |

### 7.7 Text and instruction rules

- **Guide with visuals; never with text walls.** An effective tutorial is invisible.
- **Maximum one line of text per teaching beat.** No modals, no dismissible popups, no "Next →" chains.
- **Never explain a mechanic the board can demonstrate.** Highlight, pulse, and dim carry the instruction.
- **No forced tutorial replay.** A returning or fast-learning player must be able to skip ahead; even a crude two-way split (experienced / new) measurably reduces early churn.
- **The board teaches by constraint.** In 1-1, only legal moves are tappable. The player cannot form a wrong equation, so no error message is needed.

### 7.8 Instrumentation — the FTUE funnel

Read as a **step-by-step funnel, not an average.** A single averaged retention number hides exactly where players leave.

| Event | Payload |
|---|---|
| `app_open` | first_open, session_index |
| `level_start` | level_id, attempt_number, mode |
| **`first_tap_latency`** | **ms from board render to first tap** |
| `move_commit` | level_id, expression, correct, target_index |
| `unary_transform` | level_id, from, to |
| `level_fail` | level_id, target_index_of_failure, attempt_number |
| `level_complete` | level_id, stars, attempts, duration_ms |
| `hint_purchased` | level_id, hint_type, stars_spent |
| `life_depleted` | level_id |
| `ad_watched` / `ad_failed` | placement |

**`first_tap_latency` is the key metric for this game and appears on no standard list.** It is a direct proxy for whether the player is planning. Expected shape: ~1s in World 1 (trivial), rising to 10–30s by World 3 as levels demand real lookahead.

**If it stays near 1s into World 2, players are guessing rather than planning, and the core design is not landing.** That is a design failure detectable from telemetry long before it shows up in reviews or churn.

### 7.9 Post-launch modes (generator already supports)

- **Endless / Daily** — pure generated stream, no fixed ladder
- **Practice** — replay a cleared level with a freshly generated equivalent
- **Tournaments** — same generated set for all players that week

---

## 8. Level generator

### 8.1 Fixed levels, not runtime generation

Generate thousands offline, **curate 40**. Do **not** regenerate a level when the player fails it.

Rationale: the whole reward of failure is that the retry is *informed*. The player re-reads the queue backwards and sees the trap. Changing the numbers throws that away — they paid a life and received a new puzzle they've learned nothing about.

The anti-brute-force concern is already solved twice over: **stars are permanently capped after a failure**, and **lives cap the attempt rate**. Punish guessing through score, not by deleting the player's progress.

Fixed levels are also required for: tournaments, leaderboards, difficulty tuning from real telemetry, and CI verification. A level that exists only at runtime can never be balance-tested.

### 8.2 Keystones

A **keystone** is a target that:
1. has **exactly one** valid decomposition given the pool,
2. sits **late** in the queue, and
3. whose operands are **contested** — at least one earlier target has an alternative decomposition that consumes them.

Condition 3 is what makes the trap live. If the keystone's operands were useless to earlier targets, the player would stumble into the correct line by accident. The trap exists because `3 + 5 = 8` is *tempting and looks correct*.

**Lookahead distance** = `(keystone position) − (earliest target that can steal from it)`

This is the primary difficulty metric — the number of targets the player must hold in mind. In the canonical example: keystone at 3, theft possible at 1 → distance **2**.

**Two overlapping keystones** — where reserving for one pressures the other — is where the game gets genuinely hard without getting longer. This is the target structure for World 4 and Expert mode.

### 8.3 Algorithm

Build backwards, then measure exhaustively. **Never forward-search.**

```
1. CONSTRUCT
   Pick T operand pairs + operators. Compute each target.
   → A valid solution exists by construction.

2. DESIGNATE KEYSTONE(S)
   Choose a late target. Verify it has exactly one decomposition
   given the full pool. Adjust pool if not.

3. VERIFY TRAP IS LIVE
   Confirm ≥1 earlier target has an alternative decomposition
   consuming a keystone operand.
   → If not, REGENERATE. This step is what makes it a trap
     rather than merely a level.

   EXCEPTION — the forced tier. §7.4 requires level 1-1 to be
   near-forced: every dPath_i = 1, decisionPoints = 0. That is
   mutually exclusive with trap liveness, because a live fatal move
   implies a branch. The `tutorial-forced` tier therefore disables
   the trap gate and pins decisionPoints to 0. It exists to supply
   1-1 and nothing else, and must never be used elsewhere in the
   ladder.

4. ADD DECOYS (if S > 0)
   Each decoy must create a false decomposition. Reject inert decoys.

5. SOLVE EXHAUSTIVELY
   State = (remaining multiset, target index, operator budget)
   Memoized DFS. Enumerate every path and every dead end.
   N ≤ 18, T ≤ 7 → milliseconds.

6. MEASURE + REJECT
   Compute metrics (§8.4). Outside the tier band → discard, regenerate.
```

**Exception — the trapless tutorial tier.** §7.4 gives 1-2 and 1-3 free decisions with no fatal branches, while the tutorial tier requires a live trap on every board. Both cannot hold.

§7.4 is the design intent; the band drifted from it. `tutorial-trapless` therefore requires `decisionPoints >= 1` and `maxTrapDepth = 0` — a real choice with no wrong answer, which is what "free decisions appear" means. It exists to supply 1-2 and 1-3 and must never be used elsewhere.

Distinct from `tutorial-forced`, which pins `decisionPoints` to 0 and supplies 1-1 only.

Rejection sampling against a fitness function. Cheap, fully controllable, and structurally identical to Traffic Bomb's balance simulator — but with a **stronger guarantee**, because the solver *proves* solvability rather than estimating balance.

### 8.4 Metrics

| Metric | Definition | Use |
|---|---|---|
| `dStart_i` | Legal decompositions of target `i` **from the starting pool** | Structure; keystone detection. Path-independent. |
| `dPath_i` | Legal decompositions of target `i` **from the pool as reached along the intended winning line** | Search burden. This is what the player actually faces. |
| **Decision points** | Count of targets where `dPath_i ≥ 2` | Search burden |
| **Lookahead distance** | See §8.2 | Primary difficulty dial |
| **Total solution paths** | Distinct winning lines | Uniqueness / forgiveness |
| **Trap depth** | Moves a wrong branch survives before failing | Frustration control |
| `survivalRate` | `solutionPaths / totalLinesExplored` | Forgiveness. `solutionPaths` alone is uninterpretable — 337 winning lines out of 4000 is brutal, out of 400 is a walkover. |

**Composite difficulty score.** Ordering within a world uses a single weighted score, not any metric alone:

| Input | Weight | Rationale |
|---|---|---|
| `lookaheadDistance` | 3.0 | §8.2 names it the primary metric |
| `decisionPoints` (dPath) | 2.0 | Search burden at the moment reached |
| `1 − survivalRate` | 2.0 | Punishment for not planning |
| `maxTrapDepth` | 1.5 | Distance from mistake to failure |
| `T` | 1.0 | Length; §4.5 says structure over length |
| `1 / log2(solutionPaths + 1)` | 1.0 | Uniqueness, log-scaled so a 1–4000 range cannot dominate |

**Composite and `survivalRate` measure different things and both are required.** Composite measures how much reasoning a level *demands*; `survivalRate` measures how much a player is *punished for skipping it*. A level can rank highest on composite and still be the most forgiving board in its world — this happened at 4-10 in the first curation, where the finale won ~1 random walk in 4 while the level two slots below it won 1 in 90. A finale requires both.

Notes:
**`dStart` systematically inflates `decisionPoints`, and the inflation scales with `T`.** On a Late board (`T=6–7`, `N=13–16`), target 5 is reached with only 3–6 tiles left in hand — such targets are usually *forced* in play while appearing to branch when measured against the full starting pool. Banding on `dStart` therefore rejects large boards that are correctly difficult. **`decisionPoints` must be computed on `dPath`.**

The two diverge. In the canonical level `dStart = [2, 4, 1]` but `dPath = [2, 3, 1]` — `4 − 1 = 3` is counted at the start yet is unavailable by the time target 1 is reached, because `2 × 4` consumed the 4. **Keystones are measured on `dStart`; difficulty is measured on `dPath`.** Reporting only one of them is a spec error.

- `dPath_i = 1` means a **forced move**. Not a design failure — forced moves are breathing room and the right place for tutorial beats.
- Raw combinatorics are large (8 numbers × 4 binary ops ≈ 168 candidate expressions) but the "equals the current target" filter is brutal — real `dPath_i` is typically 1–4. The player's search stays head-sized.
- **Target 2–4 decision points per level, mostly binary** (measured on `dPath`). 3 binary decision points = 8 paths — tractable and satisfying. Every target branching 3 ways = 729 paths — the player stops reasoning and starts guessing.

### 8.5 Operator budgets are solved for, not authored

**Confirmed on the canonical level:** the winning line `2×4`, `1+2`, `3×5` requires `×` twice and `+` once. A budget of `{+:2, −:1, ×:1}` admits zero winning paths — the level is unsolvable despite being generously supplied. Hand-authored budgets will do this routinely.

**Rule: mode budgets are generator output.** For each level and each mode, search for a budget that (a) admits at least one winning path and (b) meets the mode's scarcity contract:

| Mode | Contract |
|---|---|
| Casual | Unlimited |
| Normal | Consumed; **total budget exactly `T + U`** |
| Expert | Consumed; **total budget exactly `T + U`**, one operator per move, where `U` = unary transforms in the intended line |

**Exception — tutorial slots 1-2 and 1-3.** These carry a Normal budget that admits more than one winning line, unlike every other level. It is not a preference: §7.4 requires free decisions with no fatal branches, which necessarily means multiple winning lines, and Expert uniqueness forbids exactly that. Measured — 322 of 322 trapless boards have >=2 lines under Casual, and all 4 admitting a unique exact budget lose their decision to it.

§8.7's uniqueness rule names Expert. Normal inherits Expert's budget everywhere except these two slots, where teaching wins. Expert shares Normal's budget at 1-2 and 1-3 and is non-unique there too. Measured across 2322 trapless candidates: the decision survives precisely when both branches share an operator multiset, and uniqueness requires that they do not — 0 boards satisfy both. Expert was already the least-selected mode; the teaching beat matters more than uniqueness at two tutorial slots.

**Amended: Normal is exact, not slack.** Normal previously ran "counted; total > `T`, with slack". Per §6 the mode axis is assistance, not budget, so Normal and Expert now solve for the same budget and differ only by the fatal-move warning and by §8.7's uniqueness rule.

Two consequences:

- **A level with no valid exact budget is excluded from Normal as well as Expert.** The curated 40 require all three modes (§10), so any such level fails the ladder rather than shipping with a slack Normal.
- **`scarcityOf` must be called with `U` at every gate that checks Normal.** Its two-argument form verifies only the structural half (binary ops sum to `T`) and will call a budget consumed while it grants more unary uses than the line performs. That was tolerable when only Expert was gated on it; with Normal on the same contract, the weak form doubles the blind spot.

### 8.6 Metrics are per-mode, not per-level

Operator scarcity changes **trap structure**, not merely solvability.

On the canonical level under `{+:1, ×:2}`: `3 + 5 = 8` spends the only `+`, so `3` becomes unreachable from `{1, 2, 2, 4}` using `×` alone. The trap dies one move sooner — **depth 2 under free operators, depth 1 under consumed.**

Same board, three genuinely different puzzles.

**Consequences for Phase 2 curation:**
- Run `analyse()` once **per level per mode** — three metric blocks, not one
- Band against tier targets **per mode**
- A level may qualify as Mid in Normal and Late in Expert; that is expected, not an error
- Store metrics keyed by mode in the level JSON (§10)

### 8.7 Tier table

| Tier | `T` | `S` | Operators | Op scarcity | Keystones | Lookahead | Decision pts |
|---|---|---|---|---|---|---|---|
| Tutorial | 3 | 0 | `+ −` | Free | 1 | 1 | 0–1 |
| Early | 4–5 | 0 | `+ − ×` | Free | 1 | 1–2 | 1–2 |
| Mid | 5–6 | 1–2 | `+ − × ÷` | Exact | 1–2 | 2–3 | 2–3 |
| Late | 6–7 | 1–2 | all + `√` | Exact | **1–2** | 3–4 | 3–4 |
| Master ‡ | 6–7 | 2 | all | Consumed | 2+ overlapping | 4+ | 3–4 |

‡ **Master is post-launch.** Renamed from "Expert" to kill a collision: *Expert* is a **mode** (§6), applied to any level; *Master* is a **tier**. §7.2 maps World 4 to **Late**, so the 40-level launch ladder never uses Master. Master exists for Endless, Daily and tournaments. **Do not generate Master during launch curation** — its intersection yield is ~2/1000 and it buys nothing shippable.

**Mid's surplus was a point value where §3.1 supports a band.** §3.1 distinguishes `S = 0` from `S ≥ 1` and rejects `S ≥ 3`; it draws no line between 1 and 2. Mid and Late now share a surplus band and are separated by `T`, operators, keystones, lookahead and decision points.

**Mid and Late read Exact, not Counted.** Their mode of record is Normal, and §8.5 as amended makes Normal exact. Every mode except Casual is now exact, so "Counted" no longer describes any budget the ladder ships.

**Two structural facts about banding, both learned the hard way:**

1. **All `decisionPoints` figures are measured on `dPath`** (§8.4). Banding on `dStart` inflates by ~1.4 at Late and rejects correctly-difficult large boards.
2. **Master cannot band above Late on `decisionPoints`.** Consumed operators prune legal decompositions, so Master's `dPath` mean (3.13) sits *below* Late's (3.79). Master's difficulty comes from operator scarcity and overlapping keystones, not decision volume. Banding it higher is compound tightening and collapses yield 10–25×.

**Late keystones widened to 1–2.** §7.2 calls World 4 "the *first* two-keystone levels" — not all of them. 318 of 415 Late candidates have exactly one keystone; requiring two at every Late slot was the actual yield gate. Curation enforces the two-keystone requirement on **specific late World 4 slots**, not on the tier band.

**Solution uniqueness** is an additional axis: Casual permits multiple winning lines (forgiving); Expert enforces a unique solution (precise).

---

## 9. Art direction

> **Art direction is defined in ART_DIRECTION.md, which supersedes §9.1, §9.2 and §9.6's material colours. Read it before any visual work.**

### 9.0 The quality bar — non-negotiable

**Target: indistinguishable from a top-100 grossing Play Store puzzle game.** The reference is Dream Games (Royal Match, Royal Kingdom), whose stated standard is Pixar-like animation applied to casual puzzle. This is a hard bar, not an aspiration, and it applies to every screen, state and transition.

**The gate, applied to every visual deliverable:**

> Would Royal Match ship this screen?

If the answer is no or unsure, it does not ship. This is the same gate used on Traffic Bomb and it is blocking, not advisory.

**Minimum standards. A screen failing any of these is not done:**

| Requirement | Test |
|---|---|
| Depth | Nothing is a flat fill. Every surface has material, gradient or lighting. |
| Focal point | One element the eye lands on first, by design. |
| Motion on entry | Every screen animates in. Nothing appears instantaneously. |
| Designed empty state | Sparse boards and empty panels look intentional, not unfinished. |
| Four interaction states | Idle, pressed, disabled, unavailable — all designed, none defaulted. |
| No system fonts | Typography is chosen, not inherited. |
| No orphan colours | Every colour is in the §9.6 material or signal set. |

**Known gaps against the bar, tracked until closed:**

1. No character — SPECIFIED in ART_DIRECTION §2 (brass automaton, four states). Not built.
2. Tokens are geometry with material, not illustrated objects
3. Level-complete is a panel, not a celebratory sequence
4. Meta-layer has no visual payoff — SPECIFIED in ART_DIRECTION §6 (Academy restoration). Not built.
5. UI chrome is functional rather than designed
6. No screen-transition identity

**Visual quality does not wait for playtest data.** Gameplay tuning depends on telemetry; visual quality does not. They proceed in parallel. "After playtest" is how a game ships looking mediocre.

### 9.1 Backgrounds — single pre-rendered image

**Rule: composite where things move, single image where nothing does.**

Traffic Bomb composited backgrounds from pieces because the background was a *playfield* — cars drove on it, lanes aligned to gameplay coordinates, it scrolled. Lane Math's background is *wallpaper*: one fixed lane, nothing traverses the scenery, nothing scrolls.

So: **one full-resolution generated image per world.** Four images total. This is not a shortcut; it is the correct answer to a different problem.

**Contrast is the hard constraint, not aesthetics.** A math puzzle dies if `6` reads as `8`.

Generation requirements:
- Dark, desaturated, **low-detail centre**. Visual interest pushed to the edges. This is the opposite of what image models produce by default — prompt for it explicitly.
- No text, no signage, no busy high-frequency detail anywhere the lane or pool sits.
- Generate at **9:21** (tall) with a defined safe zone; crop from the edges for shorter devices.
- Fix the prompt skeleton across all four worlds, vary only the subject. Style drift across a set is the main failure mode of generated art.

**Backgrounds are classroom work surfaces, not landscapes.** Graph paper, ruled exercise page, pale wooden desktop, blueprint sheet. The theme lives in the SURFACE, not in depicted objects: the UI covers roughly 85% of the screen, so a drawn protractor or eraser would be hidden, while paper grain and grid ruling read as "maths" through a 20-pixel sliver.

**No legible content, ever.** No numbers, letters, equations or symbols anywhere in a background. Digits behind digits is the one thing this game cannot have — the player must never be unsure which numbers are the puzzle.

**Light ground, dark tokens.** Measured across the shipped set the darkest background point is 0.3537, so tokens must stay BELOW 0.0846 luminance. Because the surfaces are uniformly lit, the DARKEST background point is the binding constraint, not the brightest — the inverse of the dark-background case.

**Superseded:** the dark atmospheric landscape direction and the monotonic-darkening rule. Both are void. The prior guidance also over-constrained darkness by roughly 3x — the real constraint was never "dark", only "3:1 from the tokens".

**Backdrops are for separation, not contrast.** The shipped set clears 3:1 with no backdrop at all. Band backdrop opacity is therefore a visual-separation choice, and the brightness gate must still be measured through whatever opacity is set, so a future brighter background cannot hide behind it.

**CI gate — reuse the Traffic Bomb brightness sampler.** The per-world 5-point median sampler already exists. Extend it: sample under the lane and pool zones, compute contrast ratio against token colour, **fail the build below threshold.** This problem was already solved once.

File size: backgrounds are the worst offender for bundle bloat (Traffic Bomb: 46 MB → 1.84 MB). A low-detail background upscales invisibly — ship **~720×1560 WebP q75**, not full native resolution.

### 9.2 Tokens — sprite atlas (composited)

Tokens move, but they are geometry rather than imagery — see below.

**The art has one job: communicate scarcity.** Numbers are consumed permanently, so they must look like physical objects you spend — chunky bevelled tiles, Scrabble weight, slight drop shadow. Text reads as *information*; a tile reads as *a finite thing*.

**Tokens are drawn procedurally, not atlased.** Rounded squares, hexagons and circles are geometry — PixiJS Graphics plus BitmapText renders them crisper at every scale than any sprite sheet, with no atlas, no compression step, no resolution ceiling, and trivial recolouring for state changes. The sprite-atlas approach in §11 was inherited from Traffic Bomb, where the moving objects were cars. Digits are not cars.

**Backgrounds remain the only raster assets in the game** (§9.1).

**Shape-code, don't colour-code** — faster to parse, colourblind-safe:

| Element | Shape | Treatment |
|---|---|---|
| **Targets** (in lane) | Hexagonal plate | Ink navy `0x1e2a3a` |
| **Pool numbers** | Rounded square tile | Dark walnut `0x33241a` |
| **Operators** | Circle | Teal-slate `0x22333b` |

Different shapes for numbers and operators mean the player can never wonder what goes where.

**Token size scales inversely with board size.** A 6-tile World 1 pool renders large and chunky; a 16-tile World 4 pool renders dense. The screen stays full at every board size, sparse levels read as generous rather than unfinished, and shrinking tiles become a free signal that the boards are growing harder. Bound the scale so the largest board stays tappable and the smallest does not look childish.

**Tokens are dark ink on a light ground.** Digits on the tokens are therefore LIGHT — cream, drawn from the paper. This is the inverse of the previous direction and both the token fill and the digit ink move together; changing one without the other produced a 1.99:1 failure last time.

**Typography:** heavy geometric sans, tabular figures, unambiguous `6`/`9`/`0`/`8`. Digits are the entire UI — this is not a place to be stylish at legibility's expense.

### 9.3 The commit animation

The emotional core. When `=` fires correctly, the two number tiles and the operator must **shatter into** the target — not fade, not slide off. Destruction must read as destruction.

This single animation teaches "gone forever" better than any tutorial text. Traffic Bomb's 23-gate animation quality standard applies directly.

**The pool does not re-pack.** Consumed tiles leave their slot empty and every surviving tile keeps its position for the whole level.

This is a planning requirement, not a visual one. The player builds a spatial map of the board — *the 7 I need for the 15 is second row, third along* — and re-packing scrambles that map on every move, in a game whose entire skill is holding a multi-move plan in mind.

Ghost outlines therefore render in the vacated slot, stroke-only, and cannot collide with a live tile. They are the visible record of what has been spent.

**Do not visually mark keystones by default** — that is a free hint. Reserve the highlight for purchased hints.

### 9.4 The failure moment

Failure must read as **the lane rejecting the number**, not as a system verdict. The front target sits in place, pulses, and refuses to advance; the pool visibly cannot feed it.

Do **not** announce failure with a banner, modal or status text reading "no solution exists". The rule in §4.1 is legible by construction — the player can verify it on the board — so the board should say it. Text is a fallback for when the visual fails, not the primary channel.

An interim banner is acceptable during Phases 3–4 for debuggability and must be replaced in the Phase 5 art pass.

**§9.4 governs the moment, not the aftermath.** The board announces failure by rejecting the number — no banner, no modal, no "no solution exists". Once that has read, the player needs a way out.

Options appear AFTER the rejection has settled, not during it:

| Option | Effect |
|---|---|
| **Restart** | Rewind to level start (§4.3). Costs a life unless it is the first failure on a never-cleared level (§5.2). |
| **Continue** | Watch a rewarded ad. Rewind to the BRANCH POINT — the state just before the move that doomed the level. Costs no life. |
| **Map** | Leave. Progress is retained. |

**Continue deliberately leaks where the mistake was.** §4.3 rewinds to the start precisely because rewinding to the branch point tells the player which move was wrong. Selling that information is consistent with §5.4's hints, which sell the same thing. Failures still count against stars (§5.1), so it cannot be farmed for a 3-star clear.

Limit: at most TWO continues per level attempt, so a level cannot be brute-forced entirely through ads.

### 9.5 Feel

**Feel is built before art, on placeholder geometry.** It is the largest single driver of retention and cannot be bolted on at the end.

**The register is weight, not energy.** This is a game of deliberate planning, so effects read as physical mass — settling, resistance, momentum — never as celebration or impact. No screen shake. No confetti. No cartoon bounce.

**Feel targets, per action:**

| Action | Response |
|---|---|
| Tap a pool tile | Lifts toward the viewer, slight scale, shadow deepens, soft click |
| Place into slot | Settles with weight and a small overshoot, not a snap |
| Tap to return | Slides back to its own slot, never re-packs |
| Commit correct | Brief hold, then shatter into the target (§9.3); the lane advances with mass |
| Commit incorrect | Equation row resists — a short lateral shudder, tiles stay put |
| Unary transform | The tile visibly rewrites itself in place; the change is the event |
| Failure | §9.4's pulse only; no modal, no banner |
| Level complete | Stars arrive one at a time, weighted, not sprayed |

**Retry must be instantaneous.** Failure rewinds to the start of the level, which is the harshest retry in casual puzzle. Top-grossing titles strip every screen out of the retry path so players spend zero time outside the level. No modal, no failure screen, no transition beyond a beat.

**Hit-stop before the payoff.** A brief pause (~60-100ms) before the shatter fires makes the commit land. This is the cheapest single improvement available and it suits a deliberate game.

### 9.6 Palette and material

**Materials and signals are separate sets.**

*Materials* — cream paper ground, ink navy plates, dark walnut tiles, teal-slate operators. Nothing else. A material colour never carries meaning.

*Signals* — exactly two, and no more may be added without an amendment:

| Signal | Colour | Means |
|---|---|---|
| Gold | accent | ready, armed, earned |
| Failure red | `0x7a2020` | refused, blocked |

Green was removed because gold already meant "ready", so green meant nothing. Failure red stays because it means something gold does not, and because §9.4's pulse is transient — once the board settles, the refused state still has to read.

**Dim is less presence, not a different substance.** A dimmed token keeps its own colour and loses opacity, elevation and shadow depth. Shifting hue to neutral grey introduces a colour outside the palette and reads as a disabled web control.

**Tokens are objects, not buttons.** Procedural geometry (§9.2) plus material treatment: inner shadow along the top edge, a faint rim light along the bottom, and a subtle grain overlay drawn from one small tileable texture shared across all token types. The goal is that a tile reads as a thing you could pick up.

**Furniture carries the theme.** Band backdrops are not neutral panels. The lane is a strip of squared paper; the pool is a shallow wooden tray. Top-grossing puzzle titles integrate theme into every visual element — the pieces themselves are objects from the game's world — and this is the cheapest place to do the same.

---

## 10. Level format

```json
{
  "id": "1-04",
  "world": 1,
  "pool": [1, 2, 2, 3, 4, 5],
  "targets": [8, 3, 15],
  "rules": { "allowNegative": false, "integerOnly": true },

  "modes": {
    "casual": {
      "budget":  { "+": null, "-": null, "*": null },
      "tier":    "tutorial",
      "metrics": {
        "solvable": true, "solutionPaths": 1,
        "dStart": [2, 4, 1], "dPath": [2, 3, 1],
        "decisionPoints": 2, "keystones": [2],
        "lookaheadDistance": 2, "maxTrapDepth": 2
      }
    },
    "normal": {
      "budget":  { "+": 2, "-": 1, "*": 2 },
      "tier":    "tutorial",
      "metrics": { "solvable": true, "solutionPaths": 1, "maxTrapDepth": 2 }
    },
    "expert": {
      "budget":  { "+": 1, "*": 2 },
      "tier":    "early",
      "metrics": { "solvable": true, "solutionPaths": 1, "maxTrapDepth": 1 }
    }
  },

  "surplus": 0
}
```

**Metrics do not ship.** The fields under `metrics` are generator and curation output consumed by CI and difficulty tuning, and no runtime code reads them. The repo holds the full files; the build derives a runtime file carrying only the fields the loader accesses. Shipping the metrics cost 549KB of the 560KB level payload.

`null` = unlimited. Budgets are **generator output** (§8.5), never hand-authored. Metrics are per-mode (§8.6), used by CI and difficulty tuning — never read by gameplay code.

Expert budget sums to exactly `T = 3`. Note `maxTrapDepth` differs by mode on the same board.

**Mode absence is scope-dependent:**

| Scope | Policy |
|---|---|
| **Generated corpus** | A mode may be absent. Accepting a board without Expert is correct — it stays available for Casual/Normal use. |
| **The curated 40-level ladder** | **All three modes mandatory.** Curate with `--require-all-modes`. |
| **Endless / Daily / Practice** | Absence permitted; serve the modes a board supports. |

Rationale: §6 promises the same 40 levels across three modes. A ladder level lacking Expert leaves an Expert player with a hole in progression and nothing coherent to track. The corpus can be permissive; the ladder cannot.

---

## 11. Reuse from Traffic Bomb

### Take

| Asset | Why |
|---|---|
| **GitHub Actions + Pages + Capacitor + signed keystore** | Highest-value reuse by far. Weeks of plumbing, near-zero carry cost. |
| **AdMob integration** | Rewarded ads for life refills — already shipped and working. |
| **Director/Renderer split via command pattern** | Same architecture, much simpler brain. The structural reuse that matters. |
| **Headless-simulator-in-CI *pattern*** | Not the code — the *role*. Here it's a solver, and it gives a stronger guarantee: proof of solvability, not an estimate of balance. |
| **Brightness sampler** | Direct reuse as the background contrast gate (§9.1). |
| **Sprite compression pipeline** | 46 MB → 1.84 MB. Directly applicable. |
| **PixiJS v8 setup + asset pipeline** | Straight lift. |
| **CLAUDE.md process rules** | Screenshot review loop, branch-first, wait-condition antipattern, instrument rule, verification cost bound. Pure process, fully portable. |
| **CI asset-presence check** | Traffic Bomb shipped placeholder bugs from gitignored raw sprites causing silent 404s. Keep the guard. |

### Leave

| Asset | Why |
|---|---|
| **Three.js** | Present only for 3D car models. Lane Math renders digits. Large bundle win, one less dependency. |
| **Balance simulator logic** | HP, spawn budgets, damage carry-over — none of it maps. |
| **DDA / fail-streak mercy** | **Critical.** A deterministic puzzle with a known solution must never have hidden difficulty adjustment — it breaks the fairness contract that makes planning worth doing. The honest equivalent is the hint shop, which already exists. |
| **Tiled/composited background system** | Superseded by §9.1. |
| **World scene system (9 scenes)** | Overweight for 4 static backgrounds. |
| **The 642 tests** | Reuse the harness, not the tests. |

### Principal risk

Traffic Bomb's architecture is built for a real-time stochastic simulation. **Lane Math's entire appeal is that it is small, tight, and deterministic.** The generator being simple enough to exhaustively verify is a *feature*. Porting weight over "because it exists" is the failure mode to guard against.

---

## 12. Build order

| Phase | Deliverable | Gate |
|---|---|---|
| **1** | Headless solver + generator, no rendering | Generates 1000 valid levels; every one provably solvable; metrics computed |
| **2** | Level curation — pick 40, tune tier bands | Full ladder passes metric bands |
| **3** | PixiJS renderer: lane, pools, slots, `=`, drag/tap | Playable, no juice |
| **4** | Failure, restart, stars, lives, hint shop | Full loop closed |
| **4C** | Telemetry: the §7.8 event funnel, local sink | `first_tap_latency` recorded on every level |
| **5** | Art pass: backgrounds, tokens, commit animation | Brightness CI gate green; 23-gate animation pass |
| **6** | Capacitor build, AdMob, CI/CD, signed release | Shipped |

Phase 1 is the whole design de-risked. **If the generator can't reliably produce live traps at the target lookahead distances, the game doesn't work — and that is knowable before a single pixel is drawn.**

---

## 13. Risk register

Audited before Phase 1. Severity 1 items must be resolved in the spec before implementation begins.

### Severity 1 — could invalidate a design decision

| Risk | Resolution |
|---|---|
| ~~**Cross-mode solvability is not free.**~~ **DOWNGRADED.** The canonical-level failure (`{+:2, −:1, ×:1}` → zero paths) was an artifact of *hand-authoring* the budget. A budget derived from a real winning line always sums correctly and is always executable, so Expert unsolvability essentially never fires. | Budgets are solved for, not authored (§8.5) — this fully resolves solvability. What remains is the **uniqueness** rule, a design choice rather than a constraint. Still verify per mode. |
| **Operator scarcity changes trap structure, not just solvability. CONFIRMED:** `3+5=8` is trap depth 2 under free operators, depth 1 under `{+:1, ×:2}`. | Metrics banded **per mode** (§8.6). Phase 2 curation cost is ~3× the original estimate. |
| **`d_i` was ambiguous** — starting pool or pool-as-reached? They diverge (`[2,4,1]` vs `[2,3,1]` on the canonical level). | Split into `dStart` (structure, keystones) and `dPath` (search burden, decision points). §8.4. |
| **Keystone uniqueness is ambiguous** — unique from the *starting* pool or the pool *as reached*? | **Starting pool.** That is what the player can see and reason about at level open. Any other definition makes the keystone unknowable in advance. |
| **Commutative pairs inflate every metric.** `3+5` and `5+3` are one decomposition. | Canonicalize at enumeration. Without this, `d_i` roughly doubles for `+` and `×` and every tier band is wrong. |
| **The design front-loads all thinking.** Full queue visibility means a strong player solves the level mentally before the first tap, then executes. | Accepted (chess-puzzle model), but it means juice, animation and pacing carry the entire minute-to-minute experience, and the win screen carries most of the reward. Budget Phase 5 accordingly. |

### Severity 2 — bugs and exploits

| Risk | Resolution |
|---|---|
| Failure counter lost on app kill → free 3 stars | Persist with save data, not session state |
| Device-clock exploit on life regeneration | Server timestamp on refill; detect and refuse clock jumps |
| **Hard-lock**: zero lives, zero gold, ad fails or offline | Guaranteed slow regeneration that ignores all other state, or one free life on cold start after an interval |
| Hint bought, level failed, restart — is it still revealed? | **Yes.** Never charge twice for the same information on the same level |
| `÷ 0` and `0 ×` undefined in generator | Pool values are **positive integers only** |
| **Trap liveness ≠ trap temptation.** Generator verifies a false decomposition *exists*, not that anyone would take it. | Weight the check: the false path must be at least as *natural* as the correct one (smaller numbers, `+`/`×` over `÷`). A trap nobody falls into is not a trap. |

### Severity 3 — cheap guards

- Hash `(pool, targets)` and dedupe the generated batch
- Measure solver latency on real low-end Android (Casual runs it every commit); keep off the render thread
- Persist in-progress equation state on backgrounding, or clear cleanly on resume
- **Version the save schema from day one** (City Repair migration precedent)
- Sample the background contrast gate at the **extremes** of the supported aspect range, not just the design ratio

---

## 14. Deferred

- Gold economy and IAP
- Tournaments and leaderboards
- Endless / Daily mode
- Practice mode (regenerated equivalents of cleared levels)
- `x²` beyond World 4

---

## 15. Sources

FTUE and onboarding practice in §7 draws on:

- Game Developer — *Best practices for a successful FTUE*
- Keewano — *First-Time User Experience: 5 Tips for Mobile Games*
- Mistplay — *Mobile game player retention: comprehensive guide* (AppsFlyer churn data)
- Playio — *Onboarding Decides Your D1: First-Session Design and the FTUE Metrics That Matter*
- Gamigion — *How to Design Difficulty in Puzzle Games* (Playliner attempt-based tuning)
- Mobile Game Doctor — *Illuminating Level Creation For Free-to-play Puzzle Games* (saw curve; auto-play AI caution)
- GameDesignSkills — *Puzzle Game Design: Principles, Levels, Template* (invisible tutorial; Portal/Baba Is You teaching model)
- Mark Brown / *Super Mario 3D World's 4 Step Level Design* (introduce → develop → twist → conclude)
