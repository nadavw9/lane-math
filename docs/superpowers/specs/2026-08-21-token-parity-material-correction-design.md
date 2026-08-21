# Token Parity and Tray Material Correction

## Scope

Correct the real-sprite presentation without replacing or regenerating either source sheet. The existing `?sprites=1` feature flag and procedural fallback remain intact.

## Contrast Gates

- Large graphical tokens must maintain at least `3:1` non-text contrast against the surface they touch.
- Numerals drawn over glass remain text and must maintain at least `4.5:1` against the glass content area.
- Tokens are measured against the opaque felt lining, not against the desk or room.
- The real brass and glass atlases are rerun through the gate after the palette correction. Failure is reported; art and thresholds are not adjusted to manufacture a pass.

## Felt-Lined Trays

Use dark brown felt `#241812`. With the current representative brass luminance of `0.223`, it measures `4.50:1`, clearing the corrected `3:1` token requirement.

The felt must read as a material rather than a flat fill:

- reuse the existing shared grain texture at restrained opacity;
- use the same texture to give the surface a fine, soft nap;
- add a soft layered inner shadow where the lining meets the wooden tray wall;
- add no new raster asset.

## Placeholder Desk

Replace placeholder desk `#4A3428` with warm walnut `#704A32`.

Measured relationships:

- desk luminance: `0.0857`;
- desk against felt: `2.24:1`;
- light brass `#C9A227` against desk: `3.20:1`;
- the 55%-opaque wooden tray rim composited over the desk is approximately `#A17D59` and measures `2.06:1` against it;
- real brass tokens remain measured against felt at `4.50:1`.

The desk is explicitly a placeholder until the desk-in-room scenes arrive.

## Shared Token Scale

Operators and number tiles are equal-status consumable pieces. Both use the same solved `grid.size`; operator count becomes an input to the board layout so the operator band participates in the scale search.

The operator row uses the same 8px gap and wraps only when the solved size cannot fit the available width. Shipped World 4 boards fit all five operators on one row.

Expected measurements:

- World 1 without hint rows: numbers and operators are both `106px` (previously `116px` and `58px` respectively).
- Shipped World 4 with no hint rows: both families resolve to `55-61px`.
- Shipped World 4 with three hint rows: both families resolve to `50-55px`.
- Across the complete layout matrix (3-7 targets, 6-16 tiles, 0/1/3 hints, and 1-5 operators), the minimum solved size is `50px`, above the `46px` tap floor.

## Zero-Slack Regression

The usable vertical budget is exactly `876px`: a 900px design surface minus 12px at each edge. At least one shipped configuration consumes all of it:

- World `4-01`, casual mode;
- 6 targets, 14 tiles, 1 visible hint, 5 operators;
- shared token size `59px`;
- total column height `876px`;
- top edge `12px`, bottom edge `888px`.

Add an explicit layout test for this configuration. It must assert the solved size, the exact 12px top anchor, and the exact 12px bottom anchor so future vertical additions fail loudly.

There is no guaranteed flow space for the automaton on a portrait phone. It must be a non-flow overlay on the desk/room layer, working in the narrow desk margin beside or partially behind the column rather than above or below it. Putting decoration into layout flow would shrink every token on every board; the board is the game and the character is not. Overlay placement costs the layout nothing and must not later be "fixed" by giving the automaton a dedicated row.

This placement constrains the future automaton art:

- it must read clearly at small size because the available margin is narrow;
- its silhouette must survive partial occlusion by the board column;
- it must not depend on centred or full-height presentation;
- it must also work large and isolated for the store icon and advertising creative, which use a different composition from the in-game overlay.

The in-game overlay and large isolated presentation may require two separate assets rather than one compromised source. The automaton itself is not implemented in this change.

## Visual Acceptance

Preserve the current World 1 phone screenshot as the before reference. Capture after screenshots at phone aspect with `?sprites=1` for World 1 and World 4.

World 1 must not read emptier after its tiles shrink from 116px to 106px. Judge the before/after composition visually, accounting for the much larger equal-status operators. If the after frame reads emptier, report that result rather than adding a low-operator exception without approval.

## Verification

- Unit tests cover the `3:1` token gate, `4.5:1` numeral gate, operator parity, five-operator World 4 fit, complete layout matrix, and the exact 876px regression case.
- The real brass and glass frame table is reported after the gate runs.
- Type checking, the full test suite, production build, and sprite-enabled browser smoke test pass.
- Phone screenshots show real sprites, the new felt finish, and the warmer placeholder desk.
