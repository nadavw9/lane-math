# Automaton win/fail motion — review shots

Scout REJECT fix: mid-hop / mid-slump shutter calls `laneMath.clearShatters()`
(proof harness only) so orange shatter debris does not bury the brass companion.
Motion timings unchanged (hop 420ms / droop 380ms).

- win mid-hop feel: {"phase":"won","feel":{"speed":0,"holding":false,"holdRemainingMs":0,"lifts":[],"flights":[{"kind":"toSlot","slot":0,"label":"5","at":0.853},{"kind":"toSlot","slot":2,"label":"9","at":0.853}],"rewrites":[],"laneAdvance":0.446,"resist":null,"stars":[0.506,0,0],"automaton":{"kind":"jump","at":0.361},"shatters":0},"shatterCleared":true}
- fail mid-slump feel: {"phase":"failed","feel":{"speed":0,"holding":false,"holdRemainingMs":0,"lifts":[],"flights":[{"kind":"toSlot","slot":0,"label":"3","at":0.705},{"kind":"toSlot","slot":2,"label":"8","at":0.705}],"rewrites":[],"laneAdvance":0.306,"resist":null,"stars":[],"automaton":{"kind":"droop","at":0.274},"shatters":0},"shatterCleared":true}

Gate: atlas poses only; weighty hop / settle slump; no elastic bounce; PE-01 gutter untouched; fire once on phase enter; robot fully visible mid-motion.
