# FTUE polish 101 — map star-gate honesty handoff

**Branch:** `feat/ftue-polish-101-map-sync`  
**PR:** #12 (DRAFT ONLY — never merge)  
**Review evidence:** `docs/review/02-map-star-gate-shortfall.png`  
**Morning pack:** `/workspace/reviews/morning-pack/02-map-star-gate-shortfall.png`

## Scout/Games honesty fix

A zero-star bank can coexist with seeded or legacy cleared levels, but the map must not present that clear tally as earned progress. The rule now applies to both the map footer and the Academy header badge: progress arithmetic is omitted while `totalStars === 0`; the Academy title and room art remain visible.

Visible in the fresh shortfall shot:

- Gate: `Need 10 stars to open this bunch. You have 0.`
- Footer: `0 stars earned` (no `N of 40 cleared` beside it).
- Academy: `THE ACADEMY`; no restored/cleared arithmetic badge beside the zero-star bank.
- Unreached worlds: `Clear the previous bunch to reach this one.`

## Coverage

- `academyProgressCopy(…, 0)` omits the Academy badge, including the legacy-shaped `10 of 40` case.
- Positive-star Academy progress still renders `10 of 16 restored`.
- Existing `mapProgressCopy` behavior and 1-01 map/board flow remain covered.

DRAFT ONLY — never merge.

## Residual reject fix

The map renderer now empties every cleared plate star well while totalStars is zero, including stale cleared plates in locked later worlds. A non-zero bank keeps the existing best-star meter.

Reproducible review save: tools/map-star-gate-shortfall.json. Fresh evidence has empty star wells on all plates at the 0-star bank; no filled plate stars remain.

## PR #18 — clear-to-map mid-handoff freeze

The review harness now has `SHOT_SCREEN=map-handoff-mid`, using `tools/ftue-map-handoff-mid.json` (1-01..1-09 cleared, 1-10 live). It solves 1-10, opens the map, runs the entrance for 300ms, then freezes the frame.

- Evidence: `docs/review/18-map-handoff-mid-201.png`
- Settled comparison retained: `docs/review/17-map-library-201.png`
- The freeze catches Library plate `1` for 2-01 while its open-plate alpha clamp is active; `mapPlateEntryAlpha` remains covered by the map presentation test at `>= 0.72`.
- Capture: `SHOT_SAVE_FILE=tools/ftue-map-handoff-mid.json SHOT_LEVEL=1-10 SHOT_SCREEN=map-handoff-mid SHOT_QUERY=?sprites=1 node tools/shot.mjs 18-map-handoff-mid-201.png`

DRAFT ONLY — never merge.
