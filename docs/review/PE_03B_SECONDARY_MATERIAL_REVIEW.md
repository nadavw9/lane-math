# PE-03b — secondary brass/felt material review

**Branch:** `feat/pe-03b-secondary-material`
**Base:** `ee1edb1` (`origin/master`, PR #13 merged)
**Status:** Draft PR only; never merge.

## What changed

Cleared Replay/Map and failed-board Restart/Map continue to use the shared secondary button material. The secondary face is a broad felt well held in quiet brass, with a restrained upper-left sheen drawn inside the face and a short contact shadow. The sheen is quieter than the primary Next Level / Continue key, while the face still has enough casting to read as a small physical instrument rather than a stroke-only outline.

The material is shared in `src/renderer/button.ts`; the regression suite now checks the secondary face sheen stroke and the reduced rim glint. No Go Back underlay or locked-plate meter changes were reopened.

## Review evidence

- `docs/review/01-pe-03b-cleared-close.png` — cleared modal close-up. Replay and Map visibly share the felt face, upper-left sheen, and short contact shadow; Next Level remains primary.
- `docs/review/02-pe-03b-restart-close.png` — failed-board close-up. Restart and Map use the same quiet secondary material under the primary continue action.
- `/workspace/reviews/morning-pack/01-pe-03b-cleared-close.png` and `02-pe-03b-restart-close.png` — copies for morning review.
- `docs/review/00-labels-pe-03b.txt` — shot labels and capture facts.

Capture facts: built `dist/`, `?sprites=1`, DPR 3, atlas loaded 36, missing 0. The close-ups are crops from the 393x852 phone captures.
DRAFT ONLY — never merge.
## Checks
typecheck: green
build: green
button-press suite: green, 10 tests
full Vitest: green, 447 tests
