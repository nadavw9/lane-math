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

**Phase 5 — art pass.** This is the current unfinished gate in GDD §12. Solver, generator,
curation, renderer, feel, audio, economy, map, Capacitor, AdMob, CI and the signed release are all
done. Phase 6's technical shipping work was completed ahead of sequence; the game is not finished
until the Phase 5 art gate clears.

The phase is not decoration. It decides how work gets verified (below). Update this when the phase
changes. A stale phase marker misleads every agent that reads this file.

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

   **Any cache keyed on a value-class multiset is unsafe on pools with repeated values.** This
   already cost a corpus. `legalMoves` was cached on `stateKey` — a value-class key — while the
   `Move` objects it returned carried concrete tile ids. Two states reaching the same value
   signature by consuming different tiles shared one entry, the second got moves naming tiles it
   did not hold, and `applyMove`'s id filter removed nothing while the target index advanced.
   No crash; just wrong numbers on exactly the large duplicate-heavy boards that matter most.

   A move cache must be keyed by tile **identity**: id *and* current value *and* transform state.
   The id alone is not enough — a unary transform rewrites a tile in place and keeps its id, so
   `16` and `4` can be the same tile at different moments and do not offer the same moves.
   Memoising *winnability* on the value-class key stays correct, because whether a board can be
   won genuinely depends on values rather than on which tile carries them.
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
8. **Frame-dependent correctness.** Logic that is correct only while frames keep arriving. A
   collection pruned inside a ticker callback is unbounded in a background tab, during a long GC,
   or on a device under thermal load. Prefer a structural bound (keyed by a fixed set) over
   pruning harder.

   *Symptom:* linear degradation under synchronous input that disappears when a rAF yield is
   inserted — so it does not reproduce at human speed and does not show up in a profiler.

   This cost a bisect. The feel layer's in-flight token list was an array pruned only in the
   ticker; under input faster than frames it reached 1200 entries in 600 taps, each drawing an
   extra token every redraw, taking tap cost from 3ms to 36ms and the heap to 3.7GB. It is now
   keyed by equation slot, so it cannot exceed three whatever arrives. The tell that something
   was wrong showed up first as an A/B measurement where the *muted* run was slower than the
   unmuted one — an impossible result that was the leak, not noise.

9. **A second clock.** Map and title arrivals ran on a bare `requestAnimationFrame` fed a
   hardcoded 16.7ms, beside Pixi's ticker — so under software rendering the arrival ran ~20x
   slow while the scene graph was perfectly correct. Any timing not driven by the renderer's own
   frame is a second clock, and it will disagree with the first under load, in a background tab,
   or on a slow device. Drive time from one source.

   *Symptom:* a screen photographed frozen part-way through an animation, with everything that
   had landed drawn correctly and everything that had not simply absent — while every runtime
   inspection of the same screen showed the finished state. The scene graph and the picture
   disagree, and both are telling the truth about different moments.

   Two fixes were needed and either alone leaves the trap set: register the animation on the
   renderer's ticker (`renderer.onFrame`), AND derive elapsed time from `performance.now()`
   rather than accumulating the delta the caller passed. The second matters because an arrival
   fed a fixed 16.7ms per callback takes 700 FRAMES rather than 700 milliseconds.

---

## QUALITY GATE

Before announcing any visual work done, apply GDD §9.0. Ask **"would Royal Match
ship this screen?"** and check the seven minimum standards. If any fails, it is
not done. Report which of the six tracked gaps a change closes or moves.

---

## Silent-blank boot failure

Module load dies with no visible throw and an empty canvas. **Green CI does not
imply the page loads.** Always assert boot against BUILT output, never the dev
server — every instance so far has been invisible in dev.

Three so far, each with a fully green suite:

1. the background tool wrote `assets/bg` while the game loaded `public/assets/bg`
2. `loadAdMob()` returned Capacitor's plugin proxy from an `async` function, so
   awaiting it called `AdMob.then()`, which the web shim throws on
3. PixiJS's environment auto-detect deadlocked across split chunks, so
   `Application.init()` never settled — no error, no rejection, nothing in the
   console, just a blank page

The tell for the third kind is the worst: a PENDING promise logs nothing at all.
If boot stops partway with an empty console, instrument the awaits rather than
looking for an exception that does not exist.

`npm run smoke` is the guard. It serves `dist/` through a plain static server —
not a dev tool, whose conveniences hid two of the three — and asserts
`window.laneMath` exists, the canvas has real dimensions, the renderer drew a
frame, and nothing errored during boot.

---

## Silent degradation — the wrong picture, not no picture

The sibling of the class above, and harder to spot because the page looks fine.
A fallback path renders something plausible while the real asset is absent. No
throw, no 404 in view, no blank screen — and to anyone who did not write it, the
fallback reads as a deliberate art style.

Two so far:

1. **The font was the wrong subset.** `outfit-800.woff2` was Google's LATIN-EXT
   file, whose `unicode-range` starts at U+0100, so it contained no digits, no
   `=` and no punctuation. Every glyph in the game fell back to `system-ui` for
   weeks; the game never once rendered in Outfit. The visible symptom was one
   button drawing a bar where `=` belonged. Cause: `grep ... | head -1` over a
   `css2` response that returns TWO `@font-face` blocks, latin-ext first.
2. **A missing atlas turns the sprite path off.** `Renderer.init` calls
   `setSpritesEnabled(false)` when a family fails to load, and `spriteFor()`
   returns early while disabled — so it records NO misses and `spritesMissing`
   stays 0 while the entire board draws procedurally. The diagnostic that looks
   like it covers this does not. `spriteAtlasFailures` is the one that does.

**The rule: for anything with a fallback, the build must assert the real path
was taken.** A player is well served by a graceful fallback; a build is not.
`SMOKE_QUERY=?sprites=1 npm run smoke` fails on any atlas failure or sprite
miss, and `npm run font:coverage` fails on any character drawn as text that the
bundled font cannot supply.

---

## Untested real path

**A feature verified only through a programmatic entry point is unverified.** The
export gesture sat under the restart button's hit area for its entire life
because every check called `exportTelemetry()` directly or used `?telemetry=1` —
the one route a phone actually uses was the one route never exercised. Test the
path the user takes, not the path that is convenient to drive.

It was worse than dead: the long-press landed on **restart**, so the gesture a
playtester was told to use would have thrown their level away.

**A harness that observes only what it renders cannot see what it clipped.**
Screenshots were cropped to the viewport, so 139x302 of overflow was invisible
in every review image this project produced.

**This is the fourth instance of one shape in this project.** Each time, a check
exercised something ADJACENT to the real thing and passed on the adjacent thing:

1. **boot smoke against a dev server** — the dev server's conveniences hid two
   of the three silent-blank failures, because the artefact it served was not
   the artefact that shipped
2. **font coverage answered by a stale port** — a node process from the previous
   day served the requests while `listen()` resolved without error, so the gate
   measured someone else's output and reported a confident PASS
3. **the export gesture** — driven through the debug API, never through the
   600ms hold that is the only route on a phone
4. **viewport overflow hidden by the screenshot's own frame** — the board
   overflowed by 139x302px at the design viewport and every review image looked
   correct, because the screenshot was cropped to the same viewport the layout
   was busy escaping

**The question that catches all four: what exactly did this check touch, and is
it the same object the user touches? A check that constructs its own subject is
testing itself.**

---

## Fix the rule, not the instance

**Fixing a defect where you found it is half the job.** When a rule is learned —
cream is not a surface, a test must call its subject, a cached value drifts —
the next step is to find every other place it already applies. The hint shop
kept the cream card for two rounds after the warning panel taught the rule,
because the fix was applied where the bug was noticed rather than everywhere it
was true.

**A change to the GROUND is a change to every ink on it.** Giving the status
band a felt tray was a one-line composition fix; it also moved four strings from
desk onto felt, where `text` measures 1.17:1, `textDim` 3.03:1 and
`highlightInk` 2.92:1 — those three are the PAPER inks and the palette says so.
The lesson generalises past colour: whenever a surface is added, replaced or
lined, re-ask every question that was answered against the old surface. The
brightness gate had the same hole in the other direction — it measured tiles in
the pool and never in the equation row, so lining the row changed a ground the
gate had never looked at.

---

## Broken harness, not broken product

**A test that REIMPLEMENTS its subject tests its own copy.**
`coverfit.test.ts` recomputed cover-fit arithmetic locally instead of calling
the renderer's implementation. `setWorld` was a stub for the entire life of the
project — every background ever generated went unshipped, through four art
directions — and the test passed the whole time. It would have passed with the
renderer deleted.

This subsumes the other harness failures: a check that constructs its own
subject, its own server, its own entry point or its own copy of the logic is
measuring itself. Call the real thing or the check is decorative.

**A RESOURCE LIMIT IN A CHECK REPORTS AS THE THING THE CHECK MEASURES.** The
brightness gate went from one flat surface to four full-resolution rooms and
started failing in the suite while passing in isolation. It reported as
`1 failed` on a contrast gate — which reads as the art regressing, and would
have sent the next person hunting a rendering bug. It was a 15-second timeout.

Before believing a gate's verdict, check that it finished. This applies to any
check with a budget: a timeout, an out-of-memory, a truncated read, a killed
subprocess. All of them fail in the vocabulary of the thing being measured
rather than in their own.

**A broken harness and a broken product look identical from the output.** When a
result is surprising, or contradicts a previous run, suspect the harness first.

- **Stale server answering a probe.** On Windows a second `listen()` can resolve
  WITHOUT ERROR while another process keeps serving the port. "My server
  started" is therefore not evidence that my server answered. Five node
  processes from the previous day were serving ports 4175–4179 here, and a new
  tool reported a confident PASS on every run before this was noticed — the tell
  was that a debug line inside the request handler printed nothing. **Any tool
  that starts its own server must probe the port first and refuse to run if
  something already answers, and must fail if the app painted nothing.** A gate
  that measures nothing reports PASS.
- **Byte-comparing `getImageData` measures antialiasing jitter, not glyph
  presence.** Successive canvas draws of the same glyph differ by a pixel or
  two, so a naive bitmap diff called every character present — including `★` in
  a 6KB subset with no star in it. Use **advance width plus ink-pixel count**:
  width alone cannot see a space (no ink, real advance), ink alone cannot
  separate glyphs sharing an advance.
- **Git Bash rewrites `/lane-math/`** into `C:/Program Files/Git/lane-math/`, in
  argv AND in env. Prefix with `MSYS_NO_PATHCONV=1`; the tools also normalise.

---

## Cached derived values — a number that was true once

A value computed from other data and then STORED is a lie waiting to happen.
Nothing invalidates it, so it stays confidently wrong while every input moves
underneath it, and the check that reads it fails work that is actually correct.

**Prefer derivation at read time to a CI assertion.** An assertion only tells you
after the drift has happened, and it tells you as a failing build on unrelated
work. Deleting the cache removes the failure mode instead of reporting it.

Instances:

- **`curation.compositeScore`** was written when a board was first placed and
  never recomputed. Then Normal's budget went from counted-with-slack to exact
  (§8.5), which moves decisionPoints, maxTrapDepth and solutionPaths — and Mid
  and Late score against Normal; then four levels were re-slotted between worlds
  and were being scored against a tier they no longer sat in; then the solver
  changed. **4-02 stored 27 while actually scoring 29.92.** A valley check
  reading the stored field failed a board that passes, and the near-miss was
  reporting a real regression that did not exist. Now derived by
  `curation/ladder-score.ts` and absent from the level files.
- **`verify-ladder-cli` banded by `j.generator.targetTier`** — where the board
  was BORN, not where it sits. Same shape: a stored value that agreed with
  reality only until something moved. Four re-slotted levels made it report two
  correctly-placed levels out of band.
- **`generator.transforms` was the inverse failure**: computed and never stored
  at all, so whether a board was built to need a root could not be audited. The
  rule is not "store nothing" — it is that **provenance is stored and
  derivations are derived.** A seed and a hash are facts about how a board came
  to exist; a score is a function of data that changes.

---

## Settled: do not re-investigate

**PixiJS tree-shaking is not worth it.** Measured 2026-08-20 by splitting Pixi
into per-feature chunks. The features this game never touches — filters, bitmap
text, accessibility, spritesheet, dom, mesh — total **58,491 bytes raw / 19,310
gzipped**, about 9% of Pixi and 3% of the bundle. `pixi-rendering` at 233KB raw
is the irreducible core.

Collecting it means dropping the `pixi.js` barrel for subpath imports and
hand-registering the init side effects the barrel pulls in, where a missed one
makes a render path degrade *silently* rather than throw — a failure class no
test here would catch. Not worth 19KB.

Two related facts, so nobody re-derives them:
- **There is no production Pixi build to select.** Pixi 8.19 publishes one
  artefact; `exports["."]` has no production/development condition.
- **The deprecation strings are not evidence of a dev build.** The deprecation
  helper is ungated — `NODE_ENV` appears nowhere in `pixi.js/lib` — so those
  strings ship in every Pixi 8 build.

For scale, the level-metadata strip (GDD §10) saved **339KB raw at zero runtime
risk**. Look for that kind of win before this kind.

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
