# Quality audit against GDD §9.0 — second pass

Re-run after the font, the entry system and the button component. Verified
against the code, not against the intention: every claim below was checked by
grepping for the thing that would have to be true.

**Verdict: three standards moved, and two of the three did NOT go green
everywhere. Still zero screens passing.**

## First pass vs now

| Screen | Depth | Focal | Motion | Empty | States | Fonts | Colours | Ship? |
|---|---|---|---|---|---|---|---|---|
| Map | ✗ | ✗→~ | ✗→**✓** | ✗ | ✗→~ | ✗→**✓** | ✓ | No |
| Board | ~ | ✓ | ✗→**✓** | ✓ | ~→**✓** | ✗→**✓** | ✓ | No |
| Cleared | ✗ | ✓ | ~→**✓** | – | ✗→**✓** | ✗→**✓** | ✓ | No |
| Failure | – | ✓ | ✓ | ✗ | ✗→**✓** | ✗→**✓** | ✓ | No |
| Hint shop | ✗ | ✗ | ✗ | ✗ | ~→**✓** | ✗→**✓** | ✓ | No |
| Out of lives | ✗ | ✗ | ✗ | ✗ | ✗ | ✗→**✓** | ✓ | No |

## What actually went green

**Fonts — 6/6, genuinely.** Outfit 800 is bundled (6,472 bytes woff2) and every
text path in the game goes through `DIGIT_FONT`/`UI_FONT`. Verified: no
`fontFamily: "system-ui"` remains anywhere in `src/`. This was one problem
repeated six times and one fix closed all six.

## What did NOT go green, despite being fixed

**Motion — 4/6, not 6/6.** The board, the map, the cleared panel and the failure
state all arrive now. Two do not, and I did not wire them:

- **The hint shop panel still appears instantly.** Verified: zero `this.entry`
  calls in the `shopOpen` block. It is drawn straight to root on the frame it
  opens.
- **Out of lives still appears instantly**, because it is one line of text with
  no container to arrive.

**Four states — 5/6, not 6/6.** Every control on the board, the cleared panel,
the failure state and the shop now routes through one button with a synchronous
pressed state. Three things still bypass it:

- **Map level plates are still raw hit areas.** `cell.eventMode = "static"` on a
  bare Container — no pressed state, and locked reads as an opacity change
  rather than as `unavailable`. This is the map's primary interaction, forty
  times over, and it is the one control I did not convert.
- Pool tiles and operators are tokens rather than buttons, which is correct —
  they have the §9.5 lift as their pressed state and the dim/unlit split as
  their disabled/unavailable. Counted as passing.
- The build string long-press target is deliberately not a button (§7.8): it is
  a developer affordance that must not look like a control.

**`unavailable` is implemented and unused.** The button supports it, nothing
passes it. Spent operators, locked levels and unaffordable hints are all still
`disabled`, so the distinction the first audit called out as collapsed is
available but not yet applied. That is a real gap, not a technicality — it is
the state that says "gone" in a game about permanent loss.

## What did not move, correctly

**Depth** — unchanged everywhere except that buttons now have material and
lighting. Map plates are still flat fills that never call `grainOver`; the shop
is still a flat cream card. Both need art.

**Focal point** — the map now has one *in motion* (the open level lands last),
but statically it is still forty near-identical hexagons, so it is a partial at
best and I have not marked it green. The shop is still three identical rows.

**Designed empty state** — untouched. The map still ends in ~280px of bare paper,
the failure state still has nothing after the pulse decays, the shop still greys
its rows.

**Out of lives is still one line of red text**, and the rewarded ad still has no
player-facing entry point. Nothing in this pass touched the worst screen in the
game, which is also the monetisation moment.

## Honest summary

Three standards were targeted. **One closed completely, two closed partially,
and I reported them as done in the commit message before checking the two
screens I had not wired.** The shop and out-of-lives were not oversights of
detail — they are entire screens I did not touch while fixing "all six".

Six screens, zero passes, and the ship answer is still no on every one. The
remaining work splits cleanly:

- **Needs art:** map plate material, shop material, the automaton, room
  backgrounds. Correctly blocked.
- **Does not need art, and is not done:** shop and out-of-lives entry motion,
  map plates as real buttons, `unavailable` actually applied, out-of-lives as a
  designed screen with the ad wired to it, and every designed empty state.
