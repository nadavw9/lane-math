# lane-math phone-eye P0 — overnight handoff

**Branch:** `feat/phone-eye-p0`  
**Base:** `origin/master` (PR #4 brass CTA kit)  
**Rule:** **DRAFT ONLY — never merge** until Nadav morning shot review.  
**When:** 2026-09-05 ~01:30 Europe/Athens

## PR
https://github.com/nadavw9/lane-math/pull/5 (draft)

## Fixed in this draft

| ID | Fix |
|----|-----|
| **PE-01 / P0-1** | Automaton seated in left desk gutter; layout biases spare slack left (`AUTOMATON_DESK`); content-box clearance so soft atlas shadow does not eat tiles; drawn above pool tiles (`zIndex` + post-pool `addChild`). |
| **PE-02 / P0-2** | Plaque felt well is a fixed fraction of the brass frame (fixed fraction of plate (rivet-to-rivet)), centered on content centre — short numerals like `3` share seating with longer values. Map plaques share `targetPlate`. |
| **P0-3 / PE-09** | Front target uses cool steel rim (`PALETTE.targetFrontRim`), thicker outline, slight lift; queued plaques dim harder (`≤0.7`). Not brighter gold. |
| **PE-03 / PE-06** | Secondary CTA weight: deeper contact shadow, thicker brass lip, taller face bevel (`button.ts`). |
| **PE-04** | OOL concerned automaton seat ~96px (was 58), panel taller, aspect preserved. |
| **PE-05** | Empty equation wells lighter felt recess + brass-lit edge invite. |

## Deferred
- P1-2 hint shop vs pool occlusion  
- P1-3 map next-focal / plate farm  
- Lit front-plaque atlas frame (art)  
- Star emblem / clear choreography  
- Cube spent ghost frame  

## Tests
- `tsc --noEmit` — pass  
- `vitest run` — **402/402** pass (incl. brightness gate)

## Evidence
- Repo: `docs/review/01-board.png` … `05-ool.png`, `06-tight-gutter.png`, `00-labels.txt`  
- Morning pack: `/workspace/reviews/morning-pack/01-board.png` … `05-ool.png`

## Files touched
`src/renderer/automaton.ts`, `layout.ts`, `tokens.ts`, `renderer.ts`, `button.ts`, `docs/review/*`

## Scout gate (morning)
- [ ] 10s scan: automaton full silhouette, not under cubes  
- [ ] Front `3` well optically centered in hex  
- [ ] Cool rim (not gold-on-gold) finds the live target  
- [ ] Secondary Restart/Map read as instruments  
- [ ] OOL face is brand-scale, not postage  

PR: https://github.com/nadavw9/lane-math/pull/5

## Scout REJECT → fix (2026-09-05 ~02:05 Athens)
Scout rejected first draft for incomplete PE-01/PE-02 on dense + OOL.
Follow-up commits on same PR branch: deskRepairSize + AUTOMATON_DESK=110, GUTTER_CLEARANCE=20, plaque well optical seating.
PE-03 remains PARKED.
Evidence: docs/review/06-tight-gutter.png, 05-ool.png, 05-ool-board.png, 05-ool-targets.png + morning-pack copies.
DRAFT ONLY — never merge.
