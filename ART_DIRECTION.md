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

**Transparent and opaque materials show the same light differently.** Brass shows a specular highlight in the upper-left quadrant. Glass refracts light through its body and concentrates it at the lower-right. Both are correct under the same upper-left source. A consistency audit must not treat this as drift — compare like materials only.

**No outlines.** This is not the toon family. Separation comes from lighting and contact shadow.

---

## 4. Palette

**Brand signature: glowing amber glass on warm brass.** This is the thumbnail identity — what a player recognises before reading anything. Colour is a brand system, not decoration.

| Role | Colour | Use |
|---|---|---|
| **Brass** | `#C9A227` → `#8A6D1F` gradient | Plates, dials, frames, furniture, the automaton |
| **Amber glass** | `#F2A93B` core, `#FFD98A` inner glow | Number tiles. The signature. |
| **Warm walnut** | `#704A32` | Placeholder desk surface; replaced when desk-in-room scenes arrive |
| **Felt lining** | `#241812` | Dark brown opaque token surface inside trays |
| **Ink navy** | `#1E2A3A` | Live numerals on glass, dark accents |
| **Cream** | `#F4E9D4` | Light text only. NOT numerals on glass — see §5. |
| **Gold accent** | `#FFC94A` | Ready, armed, earned. Stars. |
| **Failure red** | `#7A2020` | Refused, blocked. Unchanged from §9.6. |

**Rooms carry hue variation, objects do not.** The classroom is warm daylight, the library amber, the laboratory cool green-glass, the observatory deep blue. The tokens stay identical across all four so the board never has to be relearned.

---

## 5. The object language

Shape-coding from GDD §9.2 is preserved exactly. Only the material changes.

### Number tiles — glass cubes

Rounded glass cubes with the numeral **suspended inside**, lit from within. Amber core, DARK numeral in ink navy #1E2A3A.

Measured: the glass centre sits at 0.70 relative luminance — nearly as bright as cream. Cream numerals score 1.17:1 against it and would be invisible. Ink navy scores 10.34:1. The glow surrounds the digit rather than competing with it.

**Why glass:** the design premise is that numbers are precious and permanently spent. Glass reads as valuable, and it makes §9.3's shatter literal rather than metaphorical. It also holds the rounded-square shape code — marbles or beads would collide with circular operators.

States:
- **Idle** — fully lit, glowing
- **Pressed** — depresses, highlight compresses, glow briefly intensifies
- **Dimmed** — the light inside goes out. Still glass, still there, no longer live.
- **Spent** — a glass ghost: the cube's outline only, no fill, no glow

### Target plates — brass plaques

Hexagonal engraved brass plaques. Numeral stamped in ink navy, recessed with a shadow inside the stamp. Aged, faintly scratched.

The numeral does not sit directly on the brass. Measured, plaque brass is L 0.206 — a mid-tone that crowds both light and dark text, giving 3.54:1 for ink navy and 3.41:1 for cream, both below the 4.5:1 text bar. A RECESSED DARK PANEL (felt #241812) is inset into the plaque centre and the numeral is drawn in cream on that, at 14.37:1. This is also what an engraved instrument nameplate looks like.

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

Generated at 4× target size and downscaled. Largest on-screen token is capped at 120 design px; at 3× device pixel ratio that is 360px, so **512px generation is the floor** for tokens.

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

**Consistency audit.** Claude Code measures lighting direction, specular position and palette across a completed sprite set and flags outliers. More reliable than the human eye across forty assets. Judge **consistency**, not an implementation-independent absolute angle: within one sheet, the measured spread must stay under 3 degrees. Compare mean angles only between sheets of the same material, against that material's recorded baseline (within 5 degrees). Never compare brass and glass; §3 explains why the same upper-left source presents differently through each material.

**Brass baseline (this tool).** `operators-sheet.png` measures **118 degrees mean light angle with a 1.3-degree spread** across its five dials, via `src/art/audit.ts`. Re-derived 2026-08-22 when the angle moved to fractional coordinates; it was 117/1.2 under the old pixel-offset metric, and near-square objects barely move under the change, which is the expected shape of it. This value still belongs to the implementation's high-luminance-centroid metric rather than to the art, so re-derive it again whenever that measurement changes — but it is now invariant to aspect and to scale, so the tool's downscale setting no longer perturbs it.

**When the metric is wrong, not the art.** Twice now the consistency audit has rejected art that was correct, and both times the fault was a geometry assumption baked into the measurement rather than anything in the image.

1. **Glass judged against brass.** The same upper-left source presents at the lower right through a transparent body, so glass read as drift from the brass baseline. The fix is the rule above — compare like materials only, never brass against glass (§3).
2. **Angle measured in pixel coordinates.** Specular angle computed from pixel offsets lets the object's aspect ratio rotate the result: a wide plaque and a square dial with the SAME specular position within their bounds report different angles. Measured in fractional coordinates within the bounding box, the aspect cancels and the two agree.

The pattern to watch for: a metric that is correct for the shape it was written against and silently wrong for any other shape. Before trusting a rejection, check whether the number would change if the object were merely stretched or made of a different material — if it would, the metric is measuring the container, not the light.

**Silhouette is a third confound, alongside material and aspect ratio.** A closed bright rim — the knurled edge of a dial — drags the measured specular centroid toward the object's centre; a long straight bevel on a wide plaque does not. Measured: masking the knurl moved all five operator dials +5.9 degrees toward the nominal 135.

The metric therefore erodes the mask before locating the specular, so it reads the object's face rather than its edge treatment. Absolute cross-family angles remain advisory; WITHIN-family spread is the binding check.

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
