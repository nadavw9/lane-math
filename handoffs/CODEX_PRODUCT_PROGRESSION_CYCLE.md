# Codex Product / Progression Cycle

**Status:** ACTIVE implementation lane
**Base:** `0fffa1c95abc304fa1d8bdcad4432f67341d158f`
**Branch:** `codex/product-progression-cycle`

## Mission
Improve the actual Lane Math product in parallel with Grok's infrastructure/security mission. This lane owns gameplay/UX/progression/content work and must not modify Grok's Track C infrastructure files.

## Locked constraints
- Preserve the launch structure of 4 worlds × 10 curated levels unless evidence justifies a separate product decision.
- Do not add filler levels. Candidate boards must improve teaching, pacing, structural difficulty, or post-launch replay value.
- Respect TEACH → TEST → TWIST → MASTER, within-world valleys, constrained finales, full queue visibility, T ≤ 7, integer-only results, and fixed-level informed retries.
- Generated candidates are evidence inputs, not automatically shipped content.
- Preserve suite floor ≥548 and existing deterministic level/curation/build gates.
- Base44 synchronization is a separate integration decision; ChronosGlobe is unrelated.

## Work cycle
1. Audit the 40-level ladder and existing curation metrics for mechanic introduction, difficulty valleys/cliffs, keystones, survival/forgiveness, and repetition.
2. Audit current gameplay/UX against locked FTUE and wrong-answer contracts, including `clearEquation` and readable recovery surfaces.
3. Implement the highest-value gaps on this branch.
4. Generate/curate replacement or post-launch level candidates only where the audit identifies a concrete need.
5. Verify with solver/curation gates, full suite, typecheck/build, production-harness checks, and browser/visual evidence for visible changes.
6. Deliver one wider checkpoint rather than stopping after each small change.

## Definition of Done for this cycle
- At least one material product improvement implemented, not just planning/docs.
- Progression audit produces actionable evidence and either validated content changes or an explicit evidence-based decision to keep the current 40 unchanged.
- No regression to existing gameplay/economy/save invariants.
- All relevant automated gates green at exact branch tip.
- Visible changes have browser-level evidence.
