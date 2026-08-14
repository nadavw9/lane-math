# Lane Math — working agreement

Single-lane arithmetic puzzle. **`LANE_MATH_GDD.md` is the source of truth.** Read it before
changing behaviour. If code and GDD disagree, the GDD wins or the GDD gets amended — never a
silent divergence.

### The GDD is maintained in-repo

**The copy on disk is the only copy.** Amendments arrive as dictated text in the prompt and get
applied to `LANE_MATH_GDD.md` here, in their own commit, before any work that depends on them.

This exists because three amendments were lost: the file was arriving as a browser download named
`LANE_MATH_GDD_2.md`, `_3.md` and so on, never overwriting, so the repo kept whichever copy
happened to be picked up while the spec had already moved on. Two sessions of work were done
against stale bands.

Consequences that matter:

- **Never work from a file outside the repo**, and never assume a newer copy exists somewhere.
  If the prompt says a section changed and the section on disk has not, say so immediately rather
  than guessing at the wording.
- **Never invent amendment wording.** If something is missing, name it and ask.
- When touching the GDD for one amendment, it is cheap to audit the neighbouring sections against
  what the code already implements. Drift is silent and compounds.

The one-line premise, because it decides arguments: **the arithmetic is trivial on purpose so
that all difficulty lands on resource planning.** Anything that makes the mental math harder
(fractions, huge numbers, cascading transforms) is working against the design.

---

## Current phase

**Phase 2 — level generator.** Solver (Phase 1) is done; change it only to add functions it is
missing. See GDD §12 for the phase ladder.

The phase is not decoration. It decides how work gets verified (below). Update this heading when
the phase changes, in the same commit that crosses the boundary.

### Resolved spec questions

All four gaps recorded here previously are now settled in the GDD. Kept as a short record of what
the answers are, because each one silently changes measured numbers if it drifts back:

- **Consumed mode is `#ops = T + U`**, not `T` (§8.5). A unary transform consumes an operator
  without clearing a target. `scarcityOf` takes the line's `U` — without it, it can only check the
  structural half and will pass a budget that over-grants unary uses.
- **`d_i` is two metrics** (§8.4). `dStart` for structure and keystones; `dPath` for search burden.
  **`decisionPoints` comes from `dPath`.** Banding on `dStart` inflates it by ~1.4 on a Late board
  and wrongly rejects boards that are correctly difficult — measured, not assumed.
- **Metrics and budgets are per-mode** (§8.6, §10), keyed inside `modes{}`. One board is three
  puzzles.
- **A mode may be absent** when no valid budget exists for it (§10). Excluded, not forced, and not
  a reason to discard the level — unless it is the mode the tier is banded under.

### Known lever, not built

**`no-keystone` is the dominant rejection filter (~55%) above Early.** The `directed` construction
strategy only reorders the queue; it never selects keystone-friendly operand values.

Constructing keystone operands first — picking values whose sum or product is hard to reproduce
from the rest of the pool — attacks that filter directly rather than waiting for it to be satisfied
by chance. Not needed at current yields. Reach for it if curation later demands specific
structures rather than whatever survives sampling.

---

## Verification is phase-dependent

### Phases 1–2 — solver, generator, level curation

**There is no UI. The test suite is the verification.** Nothing else counts.

- No screenshot loop. No browser. No Playwright. Do not ask for visual review — there is nothing
  to look at.
- Every behavioural claim is backed by a test that fails before the change and passes after.
- The canonical fixture (GDD §1: pool `[1,2,2,3,4,5]`, targets `[8,3,15]`) is the regression
  anchor. Its measured metrics are asserted exactly. If a change moves them, that is either a bug
  or a deliberate redefinition that gets written down in the GDD first.
- Solver correctness claims are proofs, not samples. "I ran it on 50 levels and it looked right"
  is not evidence of exhaustiveness.

### Phases 3–5 — renderer, game loop, art

**The screenshot review loop applies from the first pixel.**

- Wipe the review directory, then write numbered PNGs plus a `00-labels.txt` naming each one.
  Every review batch, not just the ones attached to a commit.
- A change to anything visible is not done until it has been seen. Passing tests do not
  demonstrate that a tile is legible, that the commit animation reads as destruction, or that
  `6` does not read as `8`.
- Report the full path to any screenshot at the end of the response.

---

## Always, in every phase

### Branch first

Never work on `main`. Create the branch before the first edit, not after. If you find yourself on
`main` with uncommitted work, branch immediately — do not "just finish this bit first".

Commit and push only when asked.

### The instrument rule

When something does not behave as expected, **the next action is instrumentation, not a fix.**

Add the failing test, the assertion, the dump of the actual state — make the wrong behaviour
visible and reproducible first. A fix applied to a defect you have not observed is a guess, and a
guess that happens to make the symptom disappear is worse than the bug: it hides it.

Two speculative fixes in a row without new evidence is the signal to stop and instrument.

This matters more here than in most projects, because the solver's output is a claim about
*every* path through a level. A solver bug does not crash — it quietly reports the wrong metric,
and forty levels get curated against it.

### Verification cost bound

Scale the verification to the change, and decide the bound *before* starting.

- Touched one pure function → run that file's tests.
- Touched shared solver internals → run the full suite. It is seconds; there is no excuse.
- Touched the fixture, the metric definitions, or the enumeration canonicalisation → full suite
  plus re-report the fixture metrics in the response.

The bound cuts both ways. Do not run a five-minute sweep to validate a typo, and do not claim
"done" off a single passing test when the change reached into shared state. If verifying honestly
would cost more than the change is worth, say so and let the user decide — do not quietly skip it
and report success anyway.

### The wait-condition antipattern

**Never sleep for a duration and hope.** No `setTimeout(2000)` before asserting, no fixed delay
before screenshotting, no retry-after-sleep loop.

Wait on the actual condition: the promise, the event, the predicate, the file existing. If a
condition cannot be expressed, that is a design problem in the thing being waited on — fix that
instead of padding the timeout.

For long-running commands, run them in the background and be notified. Do not block the session
polling.

### Instrumentation before optimisation

The solver runs on real low-end Android at every commit in Casual mode (GDD §13). Performance
claims need a measurement, not an intuition. Measure, then change, then measure again.

---

## Hard invariants — these are bugs waiting to happen

Each of these has already cost someone a day somewhere. They are asserted in tests; keep them
that way.

1. **Commutative pairs are canonicalised.** `3+5` and `5+3` are ONE decomposition, and so are
   `2×4` / `4×2`. Without this every metric roughly doubles and the tier bands in GDD §8.5 are
   meaningless. `−` and `÷` are ordered and stay distinct.
2. **Tiles are consumed by index, not by value.** Pool `[2,2]` holds two distinguishable tiles.
   The renderer needs to know *which* one shattered. Enumeration canonicalises by value class;
   moves still carry tile ids.
3. **Integers only, positive pool.** `÷` is legal only on exact division, `√` only on perfect
   squares. Pool values are positive integers — this is what makes `÷0` unrepresentable rather
   than merely guarded.
4. **Keystone uniqueness is measured against the STARTING pool** — `dStart`, never `dPath`
   (GDD §13). Any other definition makes the keystone unknowable at level open, which is the one
   thing the player is supposed to be able to reason about. The mirror of this is that
   `decisionPoints` must use `dPath` and never `dStart` (§8.4). The two metrics are not
   interchangeable and swapping either one silently moves every tier band.
5. **All three operator scarcities are real modes.** Free, counted, consumed. Metrics are computed
   per mode, not per level (§8.6) — scarcity changes trap structure, not just solvability. Never
   assume one mode's result transfers to another.
6. **No cascading unary transforms.** One transform per tile, even where `√4 = 2` is legal. A
   unary transform counts as a move for failure detection.
7. **No hidden difficulty adjustment, ever.** No DDA, no fail-streak mercy, no regenerating a
   level on failure. The fairness contract is what makes planning worth doing (GDD §8.1, §11).

---

## Scope discipline

The principal risk on this project is porting weight from Traffic Bomb "because it exists"
(GDD §11). Lane Math's appeal is that it is small, tight and deterministic; the generator being
simple enough to verify exhaustively is a *feature*.

- **Never add Three.js.** Lane Math renders digits.
- Do not add a dependency to solve something the standard library solves.
- Build the phase you are in. Phase 1 is the solver — not the generator, not level content, not
  a renderer.

---

## Commands

```sh
npm test              # vitest run — the Phase 1/2 verification
npm run test:watch
npm run typecheck     # tsc --noEmit, strict

npm run generate      # all tiers, both construction strategies -> generated/
npm run generate:top  # late + expert only, more attempts
# flags: --attempts N --seed N --target N --tiers a,b --strategies random,directed
```

`generate` always re-reads every level it wrote back off disk and re-solves it in all three modes
(`verify.ts`). A non-zero exit means an emitted level does not survive its own verification —
treat that as a build break, not a warning.
