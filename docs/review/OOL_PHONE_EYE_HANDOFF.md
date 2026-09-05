# lane-math OOL phone-eye clips — overnight handoff

**Branch:** `fix/ool-phone-eye-clips`  
**Base:** `origin/master` (PR #5 phone-eye P0 merged)  
**Rule:** **DRAFT ONLY — never merge** until Nadav morning shot review.  
**When:** 2026-09-05 ~10:30 Europe/Athens (UTC+3)

## PR
(see draft URL below once opened)

## Fixed (P0)

| ID | Bug | Fix |
|----|-----|-----|
| **1** | Front plaque cool rim / outline not flush on brass hex | Removed floating Graphics hex stroke over atlas plaques (stretched casting never matched procedural hex). Live-target signal is a cool lip on the felt well (`recessedPanel`), seated with inner alignment. Procedural plates keep matching hex outline. |
| **2** | OOL footer “or wait — the timer is always running” straddled gold frame | `drawOutOfLives` now lays out against `framedPanel.interior`; wait line bottom-anchored at `contentBottom - 18` inside felt. Panel height 264. |
| **3** | Top star/cartouche half-hidden under status chrome | `SAFE_TOP = 36` design-space inset. OOL panel Y clamped so cartouche clears SAFE_TOP; board HUD and map header banked stars use SAFE_TOP. |

Does **not** depend on merging open PR #7 (automaton motion).

## Tests
- `tsc --noEmit` — pass  
- `vitest run` — **410/410** pass (incl. new `ool-phone-eye.test.ts`)

## Evidence
- Repo: `docs/review/20-ool-fixed.png` … `25-map-star-close.png`, `00-labels-ool-phone-eye.txt`  
- Morning pack: `/workspace/reviews/morning-pack/20-ool-fixed.png` … `25-map-star-close.png`  
- Nadav bug photo copy: `/workspace/reviews/ool-phone-eye-bug-evidence.jpg`

## Scout gate (morning) — Codex sol / Claude sonnet
- [ ] 10s: no cool stroke floating off the brass hex silhouette  
- [ ] Wait copy fully on felt, zero pixels on brass border  
- [ ] OOL cartouche + HUD / map banked stars fully below status/header chrome  

## Files
`src/renderer/tokens.ts`, `renderer.ts`, `layout.ts`, `ool-phone-eye.test.ts`  
`src/map/map-screen.ts`, `src/economy/economy.ts`, `src/main.ts`, `tools/shot.mjs`  
`docs/review/20–25*`, `00-labels-ool-phone-eye.txt`

DRAFT ONLY — never merge.
