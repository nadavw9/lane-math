# lane-math OOL phone-eye clips — overnight handoff

**Branch:** `fix/ool-phone-eye-clips`  
**Base:** `origin/master` (PR #5 phone-eye P0 merged)  
**Rule:** **DRAFT ONLY — never merge** until Nadav morning shot review.  
**When:** 2026-09-05 ~11:00 Europe/Athens (UTC+3)

## PR
https://github.com/nadavw9/lane-math/pull/8 (draft)

## Scout REJECT → SAFE_TOP fix

Scout rejected draft PR #8 for **one remaining fail**: top chrome SAFE_TOP.
OOL cartouche still showed pale slivers under the diamond tab (same class as
Nadav's half-clipped cartouche `13`); HUD stars kissed the lane top edge.

| ID | Bug | Fix |
|----|-----|-----|
| **1** | Front plaque cool rim / outline not flush on brass hex | *(kept PASS)* Cool lip on felt well; no floating Graphics hex over atlas plaques. |
| **2** | OOL footer wait copy straddled gold frame | *(kept PASS)* Layout against `framedPanel.interior`; wait bottom-anchored inside felt. |
| **3** | Top star/cartouche half-hidden / kissing status chrome | **Scout REJECT fix:** `SAFE_TOP` 36→**56**; `LANE_HEADER` 44→**72** so HUD sits at `SAFE_TOP+10` with air inside the lane; cartouche clearance `border*0.38+16`; framedPanel cartouche taller so brass bridges the felt rim (kills pale slivers under the gem). Map header still uses SAFE_TOP. |

Does **not** depend on merging open PR #7 (automaton motion).

## Tests
- `tsc --noEmit` — pass  
- `vitest run` — **410/410** pass (incl. `ool-phone-eye.test.ts`)

## Evidence
- Repo: `docs/review/20-ool-fixed.png` … `25-map-star-close.png`, `00-labels-ool-phone-eye.txt`  
- Morning pack: `/workspace/reviews/morning-pack/20-ool-fixed.png` … `25-map-star-close.png`  
- Nadav bug photo copy: `/workspace/reviews/ool-phone-eye-bug-evidence.jpg`

## Scout gate (re-check) — Codex sol / Claude sonnet
- [ ] 10s: no cool stroke floating off the brass hex silhouette  
- [ ] Wait copy fully on felt, zero pixels on brass border  
- [ ] OOL cartouche gem clean (no pale slivers) + HUD / map banked stars fully below status with honest SAFE_TOP air  

## Files
`src/renderer/tokens.ts`, `renderer.ts`, `layout.ts`, `ool-phone-eye.test.ts`, `layout.test.ts`  
`src/map/map-screen.ts`  
`docs/review/20–25*`, `00-labels-ool-phone-eye.txt`, `OOL_PHONE_EYE_HANDOFF.md`

DRAFT ONLY — never merge.

## Scout agents
Cloud Agents (Codex Sol / Claude Sonnet) could not launch — plan has no Cloud Agents.
Morning Scout should still run the 10s gate on docs/review/20–25 shots.

DRAFT ONLY — never merge.
