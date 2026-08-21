# Quality audit against GDD §9.0 — third pass

Every claim below was verified by grepping for the mechanism that would have to
exist, on every screen, before being written down. The second pass claimed three
standards closed and two were not; the list of things claimed and then disproved
is at the bottom, because it is the more useful one.

**Verdict: four standards now green on all six screens. Depth and focal point
still fail, and both are correctly blocked on art. Still zero screens shipping.**

## The grid

| Screen | Depth | Focal | Motion | Empty | States | Fonts | Colours | Ship? |
|---|---|---|---|---|---|---|---|---|
| Map | ~ | ~ | ✓ | ~ | ✓ | ✓ | ✓ | No |
| Board | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | No |
| Cleared | ✗ | ✓ | ✓ | – | ✓ | ✓ | ✓ | No |
| Failure | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | No |
| Hint shop | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | No |
| Out of lives | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | No |

## Verified green

**Motion — 6/6.** Entry calls counted per region: map 7, shop 4, out-of-lives 8,
plus board and cleared from the previous pass. The two screens the last audit
caught as missing are wired.

**Four states — 6/6.** `unavailable` is passed in three places now, verified:
spent operators, locked map levels, unaffordable hints. Every control routes
through the button component; the only remaining bare hit areas are pool tokens
(whose pressed state is the §9.5 lift) and the telemetry long-press target,
which is deliberately not a control.

**Fonts — 6/6.** No `system-ui` anywhere in `src/` outside the font constant.

**Colours — 6/6.** Nothing outside the §9.6 material and signal sets.

**Designed empty state — 5/5 applicable.** Map closes with a progress line
instead of 280px of nothing; the shop tells a player with no stars how to earn
them rather than greying three rows at them, which is the exact "this is not for
me" §7.6 warns against; failure gives the restart control the gold the game uses
for "ready", so there is a designed way out without a banner §9.4 forbids; and
out-of-lives is now a screen rather than a sentence.

## Still failing, and why

**Depth.** Every surface that has material now has it because a component draws
it — buttons, tokens, trays. What remains flat is what needs illustration: the
cleared panel's fill, the shop card, the out-of-lives panel, and the map plates,
which now have lighting and elevation from the button component but no grain and
no glass. ART_DIRECTION §5 replaces all of these with rendered objects.

**Focal point.** The shop is still three identical rows — it needs the visual
hierarchy that comes with real art. The map is better than it was (the open
level lands last and is one of the few elevated plates) but forty near-identical
hexagons still do not point anywhere, and §6's Academy restoration is the
intended answer.

**Out of lives is a `~` on depth, not a `✓`.** The panel has the lighting but a
flat fill, and the automaton's seat is a grey disc. It is laid out for the
character (§2's concerned state) rather than around a placeholder, which is the
point, but the screen is not finished until that art exists.

## Claimed, then disproved

The instruction was to check every screen for the mechanism rather than reason
from what I had built. Doing that caught one thing I would otherwise have
reported as green:

**Operators had no pressed state.** `lifts` was populated only by tile
placement, so tapping a dial was the single interaction on the board with no
visible response at all. The button work did not cover it because operators are
tokens, not buttons, and I would have counted the board's four states as green
on the strength of the buttons alone. Now fixed — operators take the same §9.5
lift a tile does, keyed off a negative id so it cannot collide with a tile.

Everything else I set out to close this pass verified on the first check.

## What is left

**Needs art, correctly blocked:** map plate material, shop material, cleared and
out-of-lives panel material, the automaton, room backgrounds, and §6's Academy
restoration as the map's real empty state.

**Does not need art:** nothing outstanding from the §9.0 list.
