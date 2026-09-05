# Automaton motion — Scout REJECT fix

Branch: feat/automaton-win-fail-motion (PR #7). DRAFT ONLY — never merge.

Scout rejected mid-hop / mid-slump review shots: brass robot buried under orange shatter FX (fx layer draws above board root; shatter ~420ms overlaps hop/droop).

## Fix (proof harness only)
- `Renderer.clearShatters()` + `laneMath.clearShatters()` — drops live shatter debris without touching automatonFeel / TIMING.
- `tools/shot-automaton-motion.mjs` freezes mid-motion then clears shatter before shutter.
- Rest shots (01/02/11b/12b) also clear leftover debris.

## Unchanged
- Hop ~420ms / droop ~380ms; no elastic bounce; PE-01 gutter placement; once-on-enter.
