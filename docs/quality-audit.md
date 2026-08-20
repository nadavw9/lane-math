# Quality audit against GDD §9.0

Every screen currently in the game, judged against the seven minimum standards
and the six tracked gaps. Verified against the code, not from memory.

**Verdict up front: nothing in this game passes §9.0. Six screens, zero passes.**

## Three standards fail on every single screen

Worth stating separately, because they are not per-screen problems — they are
one problem each, repeated six times.

**No system fonts — fails 6/6.** There is not one font file in the repo. No
`@font-face`, nothing under `public/`. All UI text is literally
`fontFamily: "system-ui, sans-serif"`, and the digit stack —
`"DIN Alternate", "Roboto Condensed", "Arial Narrow", system-ui` — names three
fonts that **do not exist on Android**. So on the target platform every digit in
the game, which §9.2 calls "the entire UI", renders in Roboto by default. The
typography is not chosen; it is whatever the device had.

**Motion on entry — fails 6/6.** No screen animates in. `showMap()` and
`showBoard()` are `root.visible = true/false`. The board draws instantly on
`open()`. Panels appear between one frame and the next. The feel layer (§9.5) is
good and covers *interactions*; it does nothing at all for *arrivals*.

**Four interaction states — fails 6/6.** There is idle, and there is dim. "Dim"
is doing the work of both disabled and unavailable everywhere: a spent operator
with zero budget looks identical to one that is merely inactive this step, and a
locked level looks identical to one you cannot afford to enter. Pressed exists
only on pool tiles (the §9.5 lift). No button in the game has a pressed state.

---

## 1. Map screen

| Standard | | Detail |
|---|---|---|
| Depth | **FAIL** | Trays have grain, inner shadow and rim light. The 40 level plates do not — `map-screen.ts` draws its own polygon and never calls `grainOver`, so every plate is a flat fill with a stroke. The screen's main content is its flattest element. |
| Focal point | **FAIL** | Forty near-identical hexagons in four identical trays. The one open level differs from the locked ones by opacity. Nothing is designed to be seen first. |
| Motion on entry | **FAIL** | Visibility toggle. |
| Designed empty state | **FAIL** | ~280px of bare paper below World 4, unconsidered. The screen ends because it ran out of content. |
| Four states | **FAIL** | Idle and locked-at-0.62-alpha. No pressed. Cleared vs open is a fill change only. |
| No system fonts | **FAIL** | `system-ui` throughout, including the title. |
| No orphan colours | PASS | Navy, walnut, paper, gold. Clean. |

**Gaps touched:** 4 (this *is* the meta layer and nothing visibly grows — stars
are a number in a corner), 5, 6, and 1 by omission.

**Would Royal Match ship this?** No. It is a functional level select, and it
would have looked dated in 2014. It is the screen that most obviously says
"programmer art" — worse than the board it leads to, which is the wrong way
round for the screen a player sees before every level.

## 2. Gameplay board

| Standard | | Detail |
|---|---|---|
| Depth | **PARTIAL** | The best surface in the game: tokens have grain, inner shadow, rim light and a travelling drop shadow; the tray reads as wood; the lane reads as paper. But every *control* is a flat rounded rect with a two-line bevel — restart, map, commit, mode chips. |
| Focal point | PASS | The front target: deeper navy, gold rim, and it is where the queue converges. Designed, and it works. |
| Motion on entry | **FAIL** | The board is simply there. |
| Designed empty state | PASS | The one standard this game has genuinely earned — bands size to content, ghosts mark spent slots, the lane visibly empties. This was built deliberately and it holds up. |
| Four states | **PARTIAL FAIL** | Idle, pressed and dim are all designed. Disabled and unavailable are the same treatment, which is a real conflation: "you have no `+` left" and "you cannot use `+` right now" look identical. |
| No system fonts | **FAIL** | See above — the digits are the whole UI and they are Roboto on Android. |
| No orphan colours | PASS | Post-§9.6, clean. |

**Gaps touched:** 2 (tokens are geometry with material, not objects), 5, 6.

**Would Royal Match ship this?** No — but it is the closest, and the gap is
narrower than it looks. The material work is real. What gives it away is chrome
and stillness: nothing arrives, buttons are rectangles, and the typography is
inherited.

## 3. Cleared panel

| Standard | | Detail |
|---|---|---|
| Depth | **FAIL** | Navy plate with a top shadow, bottom rim light and a gold border — but no grain, unlike every token beside it. It is a flat fill pretending to be the same material as the plates it sits over. |
| Focal point | PASS | CLEARED, then the stars beneath a gold rule. |
| Motion on entry | **PARTIAL** | The stars are the best motion in the game — one at a time, weighted, settling from oversize. The panel itself pops in instantly underneath them, which undercuts them completely. |
| Designed empty state | n/a | |
| Four states | **FAIL** | "replay" is the same generic chip as "restart". No pressed state. |
| No system fonts | **FAIL** | |
| No orphan colours | PASS | |

**Gaps touched:** 3 (this is the gap, verbatim — a panel, not a sequence), 5.

**Would Royal Match ship this?** No. Their level-complete is a multi-second
sequence: the board resolves, the reward flies to a counter, the counter reacts.
Ours is a rectangle with three stars in it. The stars are right; everything
around them is a placeholder that got comments written about it.

## 4. Failure state

| Standard | | Detail |
|---|---|---|
| Depth | n/a | Inherits the board. |
| Focal point | PASS | The front plate turns red and shudders. Unambiguous. |
| Motion on entry | PASS | `RejectPulse` — two shoves and a shiver, decaying. Genuinely good. |
| Designed empty state | **FAIL** | Once the pulse decays, nothing. The board sits refused, and the only way out is a small grey "restart" chip in the status band. The moment is designed; the thirty seconds after it are not. |
| Four states | **FAIL** | |
| No system fonts | **FAIL** | |
| No orphan colours | PASS | Failure red is a §9.6 signal. |

**Gaps touched:** 5.

**Would Royal Match ship this?** No. §9.4's restraint is right — no banner, no
"no solution exists" — but restraint is not the same as designed. Right now
failure reads as *the game stopped responding properly*, and the recovery path
is the least designed control on the screen.

## 5. Hint shop

| Standard | | Detail |
|---|---|---|
| Depth | **FAIL** | A flat cream card with a 2px border. Rows are flat rects. No material anywhere, on the screen where the player spends the currency. |
| Focal point | **FAIL** | Three identical rows. |
| Motion on entry | **FAIL** | Appears. |
| Designed empty state | **FAIL** | Unaffordable hints are the same rows at lower alpha. A player with no stars sees a greyed list — which §7.6 explicitly calls out as teaching "this is not for me". |
| Four states | **PARTIAL FAIL** | Owned / affordable / unaffordable exist, but unaffordable is an alpha change. |
| No system fonts | **FAIL** | |
| No orphan colours | PASS | |

**Gaps touched:** 4 (stars go in, nothing visibly grows), 5.

**Would Royal Match ship this?** No. This is a settings menu with prices. Their
shop is the most-designed screen in the game because it is where money happens.

## 6. Out of lives

**The worst screen in the game, and it is also the monetisation moment.**

It is one line of red text — `"out of lives — waiting for a refill"` — positioned
in the lane. There is no panel, no timer, no countdown to the next life, and no
offer. It fails depth, focal point, motion, empty state, four states and fonts.
It passes only "no orphan colours", because it is a single colour of text.

**And a finding that outranks the styling:** the rewarded ad has **no
player-facing entry point at all**. `offerLifeForAd` is fully built and tested,
and the only caller in the entire codebase is `window.laneMath.watchAdForLife` —
the debug harness. §5.2's life refill is unreachable by a player. A person who
runs out of lives is told to wait, with no way to do the thing the game was
built to offer them.

**Gaps touched:** 4, 5.

**Would Royal Match ship this?** Not in any form. This is the screen where a
top-grossing title spends its best animation and its clearest call to action,
and ours is a sentence.

---

## Summary

| Screen | Depth | Focal | Motion | Empty | States | Fonts | Colours | Ship? |
|---|---|---|---|---|---|---|---|---|
| Map | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | No |
| Board | ~ | ✓ | ✗ | ✓ | ~ | ✗ | ✓ | No |
| Cleared | ✗ | ✓ | ~ | – | ✗ | ✗ | ✓ | No |
| Failure | – | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | No |
| Hint shop | ✗ | ✗ | ✗ | ✗ | ~ | ✗ | ✓ | No |
| Out of lives | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | No |

**What the audit says about where the effort went.** The board's *materials* and
the feel layer's *interactions* are genuinely good, because those are the two
things that got dedicated sessions. Everything else — every screen that is not
the board, every arrival, every button, and all typography — is at placeholder
quality and has been the whole time. The polish is a millimetre wide and a mile
deep in exactly two places.

**Cheapest wins by ratio, for whatever the work order ends up being:**

1. **One font**, bundled. Fixes a standard on all six screens at once and is the
   single highest-leverage change available.
2. **Screen entry motion**, once, shared. Fixes another standard on all six and
   closes gap 6.
3. **A designed button**, once, shared — depth, pressed, disabled, unavailable.
   Fixes chrome across all six and moves gap 5.
4. **Out of lives as a real screen**, with the ad offer wired to it. Closes the
   worst screen and connects a built, tested, unreachable feature.

Items 1–3 are one shared component each, applied everywhere. They would move
five of the seven standards on every screen in the game.
