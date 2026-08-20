# Lane Math — Art Direction

**Status:** Locked. Supersedes GDD §9.1, §9.2 and §9.6 material language.
**Audience:** Children first, adults welcome.
**Family:** Rendered opulence (Royal Match / Royal Kingdom tier).

---

## 1. The world

**The Academy of Small Wonders.**

A warm, brass-and-glass school where mathematics is a craft with instruments. Not dusty or scholarly — bright, curious, slightly magical. Everything is a beautiful object: brass calipers, glass beakers, polished abacus frames, inkwells, orreries, telescopes.

**The player is a student at a desk.** Targets arrive from the room; resources sit on the desk in front of them.

This world is **bolted on, and that is correct.** Royal Match's match-3 has nothing to do with castles either. A world exists to give wins meaning and give the store page a face — not to explain the mechanic.

### The four rooms

| World | Room | Character |
|---|---|---|
| 1 | **Classroom** | Warm wood, morning light, chalk, simple instruments |
| 2 | **Library** | Tall shelves, ladders, leather and gilt, amber lamplight |
| 3 | **Laboratory** | Glass apparatus, copper pipes, coloured liquids, brass fittings |
| 4 | **Observatory** | Domed ceiling, orrery, telescope, deep blue night, stars |

Wonder escalates with difficulty. The player is literally climbing the building.

---

## 2. The character

**A small brass clockwork automaton.** Unnamed for now; naming is a later marketing decision.

**Design:**
- Round brass body, roughly a squat egg, copper and warm brass
- **One large glass lens** as its face — the single expressive element
- A wind-up key on its back
- Short stubby limbs, no fingers
- Sits on the desk beside the board

**Why an automaton and not an animal:** Duolingo owns the owl in every education-adjacent context. More practically, geometric forms survive image generation consistently where organic faces drift between prompts. Simplicity is a production requirement, not just a style choice.

**Four states only.** Expression lives in the lens (brightness, shape of the iris) and in body posture. Do not attempt a full animation set.

| State | Reads as |
|---|---|
| **Idle** | Lens softly lit, watching the board, small breathing motion |
| **Thinking** | Lens narrows, head tilts — fires when the player has paused a long time |
| **Delighted** | Lens wide and bright, body lifts — on a clear |
| **Concerned** | Lens dims, body sinks slightly — on a failure. Never mocking. |

**Roles it must carry:** store icon, every ad creative, the empty-state of the map, the face of the out-of-lives screen.

---

## 3. Rendering rules

**Family A — rendered opulence.** Objects look like small physical things photographed under studio lighting, not like drawings.

Non-negotiable, applied to every asset:

| Rule | Detail |
|---|---|
| **One light source** | Upper-left, warm, consistent across every asset in the game |
| **Specular highlight** | Every object has one. Glass gets two: a sharp one and a soft one |
| **Contact shadow** | Every object sits on something. Soft, warm, directly beneath |
| **Rounded everything** | No sharp corners anywhere. Beveled, tumbled, toy-like |
| **Readable silhouette** | Recognisable as a black shape at 55px |
| **Slight asymmetry** | Hand-placed highlights and wear. Perfect symmetry reads as procedural |

**No outlines.** This is not the toon family. Separation comes from lighting and contact shadow.

---

## 4. Palette

**Brand signature: glowing amber glass on warm brass.** This is the thumbnail identity — what a player recognises before reading anything. Colour is a brand system, not decoration.

| Role | Colour | Use |
|---|---|---|
| **Brass** | `#C9A227` → `#8A6D1F` gradient | Plates, dials, frames, furniture, the automaton |
| **Amber glass** | `#F2A93B` core, `#FFD98A` inner glow | Number tiles. The signature. |
| **Deep wood** | `#4A3428` | Desk surface, trays |
| **Ink navy** | `#1E2A3A` | Numerals on brass, dark accents |
| **Cream** | `#F4E9D4` | Numerals in glass, light text |
| **Gold accent** | `#FFC94A` | Ready, armed, earned. Stars. |
| **Failure red** | `#7A2020` | Refused, blocked. Unchanged from §9.6. |

**Rooms carry hue variation, objects do not.** The classroom is warm daylight, the library amber, the laboratory cool green-glass, the observatory deep blue. The tokens stay identical across all four so the board never has to be relearned.

---

## 5. The object language

Shape-coding from GDD §9.2 is preserved exactly. Only the material changes.

### Number tiles — glass cubes

Rounded glass cubes with the numeral **suspended inside**, lit from within. Amber core, cream numeral, sharp specular on the upper-left face, soft internal glow, faint refraction at the edges.

**Why glass:** the design premise is that numbers are precious and permanently spent. Glass reads as valuable, and it makes §9.3's shatter literal rather than metaphorical. It also holds the rounded-square shape code — marbles or beads would collide with circular operators.

States:
- **Idle** — fully lit, glowing
- **Pressed** — depresses, highlight compresses, glow briefly intensifies
- **Dimmed** — the light inside goes out. Still glass, still there, no longer live.
- **Spent** — a glass ghost: the cube's outline only, no fill, no glow

### Target plates — brass plaques

Hexagonal engraved brass plaques. Numeral stamped in ink navy, recessed with a shadow inside the stamp. Aged, faintly scratched.

- **Queued** — flat brass, slightly darkened
- **Front target** — lit, gold rim, a soft glow behind it
- **Refused** (§9.4) — the brass reddens and the plaque shoves out of alignment

### Operators — brass dials

Circular brass dials with the symbol raised in relief. Knurled edge, like an instrument control. `√` is visually distinct — a different faceplate — because it behaves differently (§3.5).

### Furniture

- **Lane** — a brass rail the plaques travel along, mounted on the wall behind the desk
- **Pool** — a shallow wooden tray with a felt lining, sitting on the desk
- **Equation row** — a brass instrument slot; three empty settings and a large `=` key

### Backgrounds — the desk in the room

**Composition changed from flat surfaces to a scene.** The upper portion of the image is the room — shelves, window, instruments, out of focus. The lower portion is the **desk surface** the play area rests on.

This gives world identity without fighting the UI: the room reads in the strip above the lane, and the desk is what the tray sits on. Both are mostly occluded, which is fine — the point is that the visible slivers say *library* rather than *paper*.

Contrast rules from §9.1 still apply, inverted as needed: the gate governs, not taste.

---

## 6. The meta-layer

**Stars restore the Academy.** Each room begins shabby — dust sheets, empty shelves, dark lamps — and stars furnish it: a globe, a telescope, a reading lamp, a specimen case.

This is the Royal Match loop and it is the single largest thing missing from the current design. Stars currently buy hints, which is a utility, not a reason to return. Both can coexist: hints are a spend, restoration is the *goal*.

Restoration is visible on the map, so the map becomes the reward screen rather than a list.

---

## 7. Motion

GDD §9.5's register stands — **weight, not energy** — but it is now a physical world, so weight is literal.

- Glass has mass. Tiles settle, they do not float.
- Brass is heavier still. Plaques slide along the rail with resistance.
- The shatter is glass shattering: sharp shards, a brief bright flash at the break, debris that falls rather than sprays.
- The automaton is the only thing that moves when nothing else does. It is the game's idle motion.

---

## 8. Asset inventory

Generated at 4× target size and downscaled. Largest on-screen token is 92 design px; at 3× device pixel ratio that is 276px, so **512px generation is the floor** for tokens.

| Asset | Count | Generate at | Notes |
|---|---|---|---|
| Glass cube base | 3 variants | 512² | Variants prevent visible repetition |
| Glass cube, spent ghost | 1 | 512² | Outline only |
| Brass plaque base | 2 variants | 1024×384 | Numeral drawn as text over it |
| Brass plaque, lit | 1 | 1024×384 | Front-target state |
| Operator dials | 5 | 512² | `+ − × ÷ √` |
| Button base | 1 | 1024×384 | 9-slice |
| Wooden tray | 1 | 1024×512 | 9-slice |
| Brass rail | 1 | 1024×256 | 9-slice |
| Automaton | 4 states | 1024² | The hardest assets. Generate last, from a locked reference. |
| Star | 1 | 256² | |
| Life / heart | 1 | 256² | Brass pocket-watch instead of a heart |
| Room backgrounds | 4 | 1024×1536 | Desk-in-room composition |
| Restoration objects | 4 per room = 16 | 512² | Meta-layer. Can follow launch. |

**Numerals are never generated.** Every number is BitmapText drawn over a base sprite. Only the base is art.

---

## 9. Production pipeline

**Sheet generation.** Generate related objects **together in one image** — all five operator dials in a single 2×3 grid, all three glass cubes in one row. Lighting cannot drift within a single image, which is where per-asset generation fails. Claude Code slices the sheet.

**Magenta keying.** Generate on flat magenta `#FF00FF`, never on transparency. Model-produced alpha is unreliable; keying is deterministic and Claude Code does it in the build.

**Locked reference.** Once one asset in a family is right, it is uploaded as a reference for every subsequent generation in that family. Never generate a set independently.

**Consistency audit.** Claude Code measures lighting direction, specular position and palette across a completed sprite set and flags outliers. More reliable than the human eye across forty assets.

**Atlas and compression.** Traffic Bomb's pipeline returns (GDD §11). It was excluded only because tokens were procedural.

---

## 10. What this supersedes

| Superseded | Replaced by |
|---|---|
| §9.1 classroom paper surfaces | §5 — desk-in-room scenes |
| §9.2 procedural tokens | §5 — illustrated sprite bases + BitmapText |
| §9.2 dark-ink-on-light-ground palette | §4 — brass and amber glass |
| §9.6 material colours | §4 — full palette table |
| "No character" as a tracked gap (§9.0) | §2 — the automaton |
| "Meta-layer has no visual payoff" (§9.0) | §6 — Academy restoration |

Shape-coding (§9.2 table), the feel register (§9.5), the failure moment (§9.4), the quality bar (§9.0) and the two-signal rule (§9.6) all **survive unchanged**.
