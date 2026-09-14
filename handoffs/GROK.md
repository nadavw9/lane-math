# GROK — Eng Track B (TX-P0 readable overlays + mascot idle)

**Status:** **PRODUCTION-BOUND** on GitHub — draft PR open; **MERGE HOLD** until CoS + Codex approve sync/merge  
**Role of this branch:** Production-bound Track B for the Wolf Academy app (same product; Codex will sync approved GitHub work to Base44). **Not** a disposable candidate lane. Scout SHIP on stills ≠ auto-merge / ≠ live. Soft parks remain soft.  
**Branch:** `feat/tx-p0-readable-toasts-mascot-idle`  
**PR:** https://github.com/nadavw9/lane-math/pull/29 (draft)  
**Base:** `origin/master` @ `cce5602` (`cce560219117dbd321b46783aa2d7f8656298219`) — NOT the old economy branch  
**Impl commit (reviewed):** `dff2b98` (`dff2b98d711b0a83231379d9d50343a423767389`) — record separately; do not chase tip SHA  
**Docs/handoff tip:** see branch tip after docs commits (do not chase)  
**Writer:** Grok (Eng Lead sole writer on this lane)  
**Out of scope / hard rules:** No Base44 edits; no ChronosGlobe; no solver/Director/levels/economy changes; never write `handoffs/CODEX.md`. Codex = exclusive Base44 writer + final product/architecture integrator. P0 SAVE-LOSS lives on a **separate** worktree/`feat/save-backup-recovery` (PR #30) — do not mix into this tree.

## Production-bound framing (CoS / Nadav / Codex)

- Track B is **production-bound** for the Wolf Academy app — resume as the real path to ship, not a throwaway experiment.
- **Scout SHIP ≠ auto-merge.** Visual Scout CANDIDATE SHIP of TX-P0-1/2/3 is evidence only; merge still requires CoS + Codex.
- **MERGE HOLD** until CoS **and** Codex explicitly clear — even if Scout / Games Lab SHIP the stills.
- Codex (exclusive Base44 writer) will sync approved GitHub work to Base44 **if** CoS/Codex approve. Grok never mutates Base44/ChronosGlobe.
- Do **not** redefine Wolf Academy visual language from GitHub stills alone; Codex owns live adaptation.

## Soft parks (remain SOFT — not P0)

Scout SHIP’d TX-P0-1/2/3 with **soft** nits still parked (do not treat as P0; no big polish cycle unless cheap one-commit):

| Soft park | Note |
|-----------|------|
| Wait-pill ghost | OOL wait pill may still read slightly ghosty vs gold CTA |
| Shop ↔ dials proximity | Shop floor at 360 CSS may still sit near / occlude operator dials (clears cube tops) |

## Explicit Codex ask

Please review **impl `dff2b98`** against the **current Base44 app `6aa7c38d569a74337f54f559`**, then **select / adapt / reject** for production sync.  
Wire nothing to live Base44 from this PR until you decide. Grok will not touch Base44 or ChronosGlobe.

## Track / scope (unchanged)

| ID | Gate | Candidate fix |
|----|------|---------------|
| **TX-P0-1** | OOL CTA double-print (CTA + “or wait…” on same surface) | One CTA string on gold button; wait line in its **own** `feltPill` row **above** CTA inside felt well (not under CTA, not on brass rim) |
| **TX-P0-2** | Hints header under cartouche / low contrast | Shorter copy (“Hint Shop” / “Earn Hint Stars”) on dedicated felt plaque; ≥20 CSS under cartouche gem (≥8 required) |
| **TX-P0-3** | Hints shop bottom brass over pool cube tops | Re-anchor shop so `panelBottom ≤ pool.y - 56`; floor panel tall enough for ornate felt well |
| **Mascot idle** | Desk companion static | `sampleAutomatonIdle`: breathe (~2.5s) + L/R sway (~3.8s); clamp dx so body never enters pool; keep jump/droop; honor `prefers-reduced-motion` |

Evidence (before): `docs/review/46-modal-ool.png`, `44-modal-shop.png`, `37-hud-hint-gems-shop.png`; brief `/workspace/reviews/lane-math-text-overlay-collisions-2026-09-14.md`.

## Commits + changed files

**Impl `dff2b98`:**
- `src/renderer/renderer.ts` — OOL wait pill + CTA stack; shop plaque/header/anchor; idle life clock + reduced-motion gate
- `src/renderer/tokens.ts` — `feltPill()` readable secondary box
- `src/renderer/automaton.ts` — `dx` on motion sample; `sampleAutomatonIdle`; `prefersReducedMotion`; PE-01 x clamp with sway
- `src/renderer/automaton.test.ts` — idle sampler + reduced-motion default
- `src/renderer/ool-phone-eye.test.ts` — TX-P0-1/2/3 layout contracts

**Docs tip (screenshots + this handoff):**
- `docs/review/49-track-b-ool-after.png`
- `docs/review/50-track-b-shop-after.png`
- `docs/review/51-track-b-mascot-idle.png`
- `handoffs/GROK.md`

## Exact test / build / lint

```
npm test       →  vitest run
Test Files  58 passed (58)
Tests       487 passed (487)

npm run typecheck  →  tsc --noEmit   OK
npm run build      →  vite build     OK (prebuild levels:build OK)
```

No separate lint script in `package.json`. Suite green; no disappearing-tests incident this run. Re-verified 2026-09-14 Track B UNPAUSE.

## Screenshot paths

| Shot | Path | Notes |
|------|------|-------|
| OOL after | `docs/review/49-track-b-ool-after.png` | Wait pill above “Watch to Continue”; lockedOut |
| Shop after | `docs/review/50-track-b-shop-after.png` | “Hint Shop” plaque; bottom brass clear of cube tops |
| Mascot idle | `docs/review/51-track-b-mascot-idle.png` | Board-first 2-08; effect clock frozen mid-idle |
| Before refs | `46-modal-ool.png`, `44-modal-shop.png`, `37-hud-hint-gems-shop.png` | Unchanged evidence |

Capture: Playwright phone viewport `393×852` @ DPR 3, `?sprites=1`, seed `docs/review/_hud-emblem-seed.json`, intro dismissed.

## Gate findings (production-bound impl — not live until Codex sync)

| Gate | Status | Finding |
|------|--------|---------|
| TX-P0-1 | **PASS (Scout CANDIDATE SHIP; soft wait-pill ghost parked)** | CTA alone on gold; wait on separate felt pill above CTA inside panel |
| TX-P0-2 | **PASS (Scout CANDIDATE SHIP)** | Short title on plaque; pad under cartouche ≥8 (ships 20) |
| TX-P0-3 | **PASS (Scout CANDIDATE SHIP; soft shop↔dials proximity parked)** | Shop bottom anchored `pool.y - 56`; cubes readable under brass |
| Mascot idle | **PASS** | Breathe + sway; jump/droop unchanged; reduced-motion holds static |

## Unresolved risks / escalate-to-Codex triggers

- Shop panel floors at **360** CSS for ornate 9-slice felt well — may still occlude **operator dials** (phone-eye / TX-P1-3 class) while clearing cube tops. Soft park for Codex/Scout; not P0.
- Wait-pill may still read slightly ghosty vs gold CTA — soft park; not P0.
- Continuous idle redraw while companion is up (perf); gated off under reduced-motion / locked-out / enter tween.
- Stash `stash@{0}` had prior WIP; applied after verify vs `cce5602` (renderer tree matched stash base for these files). Did not overwrite before-evidence PNGs.

**Escalate if:** save risk, contract conflict, disappearing tests, Base44 duplication, visual-direction conflict, or scope blockers.  
**This run:** no save/schema risk; no economy/solver/Director contract edits; tests 487 green (up from 478 on master via new idle/OOL asserts); **no Base44 duplication** (Grok did not touch Base44); production-bound GitHub path — Codex must select/adapt/reject vs Base44 app `6aa7c38d569a74337f54f559` before any live sync.

## Base44 sync needed

**Pending CoS + Codex approval.** From Grok: **No** direct Base44 writes. Codex exclusive writer syncs if approved.

## Prior Track A (merged)

Academy reprice + star gates landed via PR #28 @ `cce5602`.
