# GROK — Eng Track A (Academy reprice + star gates)

**Status:** DONE — draft PR open  
**Branch:** `feat/academy-reprice-star-gates`  
**Base:** `origin/master` @ `1ad4889` (no merge to master)  
**Tip SHA:** `69d9563a5aa7eaaf3a7efc73929b17e2eb6b12bb` (`69d9563`)  
**Writer:** Grok (one-writer lane)  
**Out of scope this run:** Track B (toast/mascot), Base44, `handoffs/CODEX.md`

## Contracts applied

| Contract | Before | After | Touched |
|---|---|---|---|
| Academy `Economy.RESTORE_COSTS` / `nextRestoreCost` ladder | `[2,2,3,3]` (10★/room, 40★ ladder) | `[1,1,2,2]` (6★/room, 24★ ladder) | `src/economy/economy.ts`, `ART_DIRECTION.md` §6 note |
| `STAR_GATE_WORLD_2/3/4` | `10 / 25 / 40` | `10 / 20 / 30` | `src/economy/config.ts` |
| Hints `HINT_COST` | narrow/contested/branch `1/2/3` | **unchanged** `1/2/3` | none |

Meaning audit (what these numbers are):
- **Restore ladder:** per-object star cost to furnish the next Academy object in a world room (indices 0..3). Runtime constant on `Economy`; not persisted.
- **Star gates:** star totals required to enter world bunches 2/3/4 via `economy.config.worldStarGates` (map lock reason `not-enough-stars`).
- **Hints:** separate star sink (`HINT_COST`); same `starsSpent` pool as restoration, but prices left alone per CoS.

## Migration / save-loss

- **Schema bump: NOT needed.** `SAVE_SCHEMA_VERSION` stays **2**.
- Persisted fields: `restored[world]` (0–4 count) + `starsSpent` / `totalStars`. Prices and gates are **code constants**, not save fields.
- Existing saves keep restored object counts and spent stars. Next purchase uses the new ladder from the current index (e.g. `restored=2` → next cost is `RESTORE_COSTS[2]=2`).
- No wipe of solver / Director / levels. No Base44.
- Mild economy windfall for players who already paid old 2/2/3/3 mid-room; no loss of purchases or progress.

## Tests

```
npm test  →  vitest run
Test Files  57 passed (57)
Tests       478 passed (478)
```

Updated: `src/economy/restoration.test.ts` (ladder totals + pool-sharing cases for new first-slot cost 1★).  
Star-gate unit test in `src/map/model.test.ts` overrides gates locally — still green against new defaults.

## Files changed

- `src/economy/config.ts` — gates 10/20/30
- `src/economy/economy.ts` — `RESTORE_COSTS = [1,1,2,2]` + comment
- `src/economy/restoration.test.ts` — expectations
- `ART_DIRECTION.md` — §6 price paragraph aligned to code
- `handoffs/GROK.md` — this note (for Codex/Base44 readers)

## Draft PR

(URL filled after `gh pr create --draft`)

## ChatGPT-path regression skim (post Claude/Codex exhaustion)

Recent `origin/master` tip merges (#23–#27): warning-latency CI flake, CTA chrome sprites, HUD emblem sprites, modal frame sprites, commit-key sprites — UI/chrome only. **No economy / solver / Director / levels edits in that window.** No obvious ChatGPT-path salvage regressions visible on this checkout. Untracked local `tools/_*.mjs` + a couple `docs/review/*.png` left from prior arms; not committed here.

## CoS / Eng Lead reply kit

- Tip SHA + draft PR URL below after push.
- Blocker: none for Track A.
- Hints intentionally untouched (1/2/3).
- Schema: no bump.
