# Brass/glass CTA kit

Implemented as procedural Pixi Graphics. No atlas, background, confetti, energy effect, target choreography, or clear choreography changed.

## Files

- `src/renderer/button.ts` — shared primary/secondary material kit and idle, pressed, armed, disabled, unavailable rendering.
- `src/renderer/renderer.ts` — board footer, commit key, warning, hint shop, failure, cleared, and out-of-lives mappings.
- `src/map/map-screen.ts` — mute, map footer, level-plate face, and Academy purchase mappings.
- `src/renderer/button-press.test.ts` — material, colour, elevation, and state-separation coverage on real Pixi display objects.
- `src/test-setup.ts`, `vite.config.ts` — Node 20 `navigator` setup required before Pixi renderer suites can collect.
- `src/game/hints.ts` — Title Case hint labels.
- `docs/review/00-labels.txt`, `docs/review/*.png` — built-output phone review batch with the real sprite path.

## Material states

| State | Material treatment | Interaction meaning |
|---|---|---|
| Idle | Full material with upper-left sheen and contact shadow | Available |
| Pressed | Face sinks by `PRESS_DEPTH`; contact shadow closes immediately | Pointer is down |
| Armed | Gold material/rim and gold label at full opacity | Ready, selected, or earned |
| Disabled | Idle material remains elevated under `DIM` | Temporarily unavailable; can return now |
| Unavailable | Spent brass/inert felt, full opacity, flush with no shadow | Locked, exhausted, or unaffordable in this context |

## Variant map

| Surface | Variant/state |
|---|---|
| Commit key | Primary custom brass face; armed when ready, disabled before the equation is complete |
| Board Restart / Map | Secondary; Restart becomes armed after failure |
| Board Hints chip | Secondary; armed while the shop is open |
| Hint rows | Primary when affordable; secondary armed when owned; secondary unavailable when unaffordable |
| Warning actions | Secondary |
| Failure Continue | Primary idle or unavailable; Restart and Map secondary |
| Cleared Next Level | Primary; Replay and Map secondary |
| Out-of-lives Continue | Primary |
| Map Sound On/Off | Secondary |
| Map level plates | Existing plaque supplied as a transparent custom face; locked is unavailable |
| Map Hints and modes | Secondary; selected mode armed |
| Academy Cancel / Restore | Secondary Cancel; primary Restore, unavailable when unaffordable |

## Art-gate result

This closes GDD §9.0 tracked gap 5, “UI chrome is functional rather than designed,” for the requested CTA surfaces and closes honest visual-gap Top-5 item 1. It only moves the presentation edge of tracked gap 3 (level-complete remains a broader celebration task) and gap 4 (the meta-layer still has separate focal/restoration work); it does not claim those gates are closed.
