# Token Parity and Tray Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the token contrast bar, make felt and desk read as warm physical materials, and give operators exact size parity with number tiles without overflowing any supported board.

**Architecture:** Keep measured contrast policy in the art gate, board geometry in the pure layout module, and PixiJS material rendering in the token factory. Operator count enters the layout solver and produces an operator grid at the same solved size as the number grid. No sprite source or atlas is regenerated.

**Tech Stack:** TypeScript, PixiJS 8, Vitest, Sharp, Playwright, Vite.

---

### Task 1: Preserve the visual baseline

**Files:**
- Create: `art-review/01-world-1-before.png`
- Create: `art-review/00-labels.txt`

- [ ] **Step 1: Clear the visual-review directory without touching raw art**

Resolve `art-review` inside the repository, remove only that directory, and recreate it. Leave `assets/raw` untouched.

- [ ] **Step 2: Capture the current World 1 sprite board**

Open `http://127.0.0.1:5173/?sprites=1` at `393x852`. Wait until `window.laneMath.diagnostics().spritesLoaded === 8` and `entranceBand0 === -1`, then save `art-review/01-world-1-before.png`.

- [ ] **Step 3: Label the baseline**

Write this exact entry to `art-review/00-labels.txt`:

```text
01-world-1-before.png - World 1 before parity, 393x852, ?sprites=1, 116px glass tiles and 58px brass operators
```

### Task 2: Correct palette and contrast policy

**Files:**
- Modify: `src/renderer/layout.ts`
- Modify: `src/art/brightness.ts`
- Modify: `src/art/brightness-gate.test.ts`
- Modify: `ART_DIRECTION.md`

- [ ] **Step 1: Write failing palette and contrast tests**

Change the real-art family expectations so both glass and brass use `MIN_CONTRAST`, and replace the old felt derivation test with:

```ts
it("uses the approved felt and 3:1 graphical-token bar", () => {
  expect(PALETTE.felt).toBe(0x241812);
  expect(PALETTE.placeholderDesk).toBe(0x704a32);
  const felt = luminance(rgbFromHex(PALETTE.felt));
  expect((0.223 + 0.05) / (felt + 0.05)).toBeGreaterThanOrEqual(MIN_CONTRAST);
});
```

Add `MIN_TEXT_CONTRAST = 4.5` and a test that extracts the central 42% of each glass frame's recorded content box, measures its 20th-percentile representative colour, and asserts ink navy clears `MIN_TEXT_CONTRAST`.

- [ ] **Step 2: Run the focused gate and verify it fails**

Run:

```sh
npx vitest run src/art/brightness-gate.test.ts
```

Expected: failure because brass still requires `4.5`, the palette still contains `#0E0805` and `#4A3428`, and `MIN_TEXT_CONTRAST` does not exist.

- [ ] **Step 3: Implement the policy and palette constants**

Use:

```ts
placeholderDesk: 0x704a32,
background: 0x704a32,
felt: 0x241812,
```

Keep graphical tokens at:

```ts
export const MIN_CONTRAST = 3;
export const MIN_TEXT_CONTRAST = 4.5;
```

Set both real-art families to `minimum: MIN_CONTRAST`. Update the gate label to name desk `#704A32` and felt `#241812`. Update the palette rows in `ART_DIRECTION.md` without changing sprite art guidance.

- [ ] **Step 4: Run the focused gate and verify it passes**

Run:

```sh
npx vitest run src/art/brightness-gate.test.ts
```

Expected: all eight token frames clear `3:1`, and all three glass-centre numeral checks clear `4.5:1`.

- [ ] **Step 5: Commit the contrast correction**

```sh
git add ART_DIRECTION.md src/renderer/layout.ts src/art/brightness.ts src/art/brightness-gate.test.ts
git commit -m "fix(art): correct token and numeral contrast gates"
```

### Task 3: Make operators share the number-tile scale

**Files:**
- Modify: `src/renderer/layout.ts`
- Modify: `src/renderer/layout.test.ts`
- Modify: `src/renderer/renderer.ts`
- Modify: `src/art/brightness-gate.test.ts`

- [ ] **Step 1: Write failing parity and zero-slack tests**

Extend `BoardSize` fixtures with `operators`. Add these assertions:

```ts
it("gives World 1 operators exact parity with number tiles", () => {
  const board = bands({ targets: 3, tiles: 6, hints: 0, operators: 2 });
  expect(board.grid.size).toBe(106);
  const slot = operatorSlot(0, 2, board.operators, board.operatorGrid);
  expect(slot.width).toBe(board.grid.size);
  expect(slot.height).toBe(board.grid.size);
});

it("pins the shipped 876px worst case to both 12px anchors", () => {
  const board = bands({ targets: 6, tiles: 14, hints: 1, operators: 5 });
  expect(board.grid.size).toBe(59);
  expect(board.lane.y).toBe(12);
  expect(board.status.y + board.status.height).toBe(888);
});
```

Add a complete matrix test over 3-7 targets, 6-16 tiles, 0/1/3 hints, and 1-5 operators. Assert every operator slot is inside its band and every board ends at or above the 12px bottom anchor.

- [ ] **Step 2: Run the layout tests and verify they fail**

Run:

```sh
npx vitest run src/renderer/layout.test.ts
```

Expected: compile failures because `BoardSize.operators` and `Bands.operatorGrid` do not exist and `operatorSlot` has the old signature.

- [ ] **Step 3: Implement the shared operator grid**

Add `operators: number` to `BoardSize` and `operatorGrid: Grid` to `Bands`. Use the common solved size:

```ts
function operatorGridFor(count: number, size: number): Grid {
  const fits = Math.max(1, Math.floor((bandWidth + GAP) / (size + GAP)));
  const perRow = Math.max(1, Math.min(count, fits));
  return { size, perRow, rows: Math.max(1, Math.ceil(count / perRow)) };
}
```

Replace the fixed operator height in `heightsAt` with:

```ts
const operatorGrid = operatorGridFor(board.operators, size);
operatorGrid.rows * (size + GAP) - GAP;
```

Include `operators` in the fitted-size cache key. Return the calculated `operatorGrid` from `bands`.

Replace `operatorSlot` with a row-aware centred implementation:

```ts
export function operatorSlot(
  index: number,
  count: number,
  operators: Rect,
  grid: Grid,
): Rect {
  const row = Math.floor(index / grid.perRow);
  const col = index % grid.perRow;
  const rowCount = Math.min(grid.perRow, count - row * grid.perRow);
  const rowWidth = rowCount * grid.size + Math.max(0, rowCount - 1) * GAP;
  const left = operators.x + (operators.width - rowWidth) / 2;
  return {
    x: left + col * (grid.size + GAP),
    y: operators.y + row * (grid.size + GAP),
    width: grid.size,
    height: grid.size,
  };
}
```

- [ ] **Step 4: Wire operator count through the renderer and gate zones**

In `bandsFor`, pass:

```ts
operators: Object.keys(state.budget).length,
```

Call `operatorSlot(i, available.length, operators, board.operatorGrid)`. Add operator counts to every brightness-gate `bands` fixture so its measured zones follow the new geometry.

- [ ] **Step 5: Run focused layout, renderer, and gate tests**

Run:

```sh
npx vitest run src/renderer/layout.test.ts src/art/brightness-gate.test.ts src/renderer/sprites.test.ts
```

Expected: parity is exact, the `4-01` regression consumes exactly 876px, and no matrix case overflows.

- [ ] **Step 6: Commit shared-scale layout**

```sh
git add src/renderer/layout.ts src/renderer/layout.test.ts src/renderer/renderer.ts src/art/brightness-gate.test.ts
git commit -m "feat(renderer): give operators shared token scale"
```

### Task 4: Render the felt as a material

**Files:**
- Modify: `src/renderer/tokens.ts`

- [ ] **Step 1: Replace the flat lining with layered material rendering**

Build the felt in one `Graphics` object inside the existing 6px wooden rim:

```ts
const inset = 6;
const lining = new Graphics();
const drawFelt = (g: Graphics): Graphics =>
  g.roundRect(inset, inset, Math.max(0, w - inset * 2), Math.max(0, h - inset * 2), 7);

drawFelt(lining).fill({ color: felt });
grainOver(lining, drawFelt, 0.24);
drawFelt(lining).stroke({ width: 5, color: 0x000000, alpha: 0.2, alignment: 1 });
lining
  .roundRect(inset + 2, inset + 2, Math.max(0, w - inset * 2 - 4), Math.max(0, h - inset * 2 - 4), 5)
  .stroke({ width: 2, color: 0x000000, alpha: 0.1, alignment: 1 });
```

The shared grain supplies the fine nap; the two low-alpha inset strokes supply the soft tray-wall shadow. Add no texture or generated asset.

- [ ] **Step 2: Run type checking and focused tests**

Run:

```sh
npm run typecheck
npx vitest run src/renderer/layout.test.ts src/art/brightness-gate.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the felt finish**

```sh
git add src/renderer/tokens.ts
git commit -m "feat(renderer): give tray felt visible material"
```

### Task 5: Verify the complete visual and shipping path

**Files:**
- Modify: `art-review/00-labels.txt`
- Create: `art-review/02-world-1-after.png`
- Create: `art-review/03-world-4-after.png`

- [ ] **Step 1: Run the full verification bound**

Run:

```powershell
npm run typecheck
npm test
npm run build -- --base=/lane-math/
$env:SMOKE_BASE = '/lane-math/'
Remove-Item Env:SMOKE_QUERY -ErrorAction SilentlyContinue
npm run smoke
$env:SMOKE_QUERY = '?sprites=1'
npm run smoke
```

Expected: typecheck passes, all tests pass, production build succeeds, and both built-output smoke runs draw a board without errors; the sprite run loads 8/8 WebP frames.

- [ ] **Step 2: Capture World 1 after parity**

At `393x852`, open `?sprites=1`, wait for eight sprites and completed entrance, and save `art-review/02-world-1-after.png`.

- [ ] **Step 3: Capture World 4 with all five operators**

Use `window.laneMath.send({ type: "selectMode", mode: "casual" })`, then `window.laneMath.load("4-01")`. Wait until level `4-01`, eight sprites, and completed entrance are reported. Save `art-review/03-world-4-after.png`.

- [ ] **Step 4: Complete the review labels**

Append:

```text
02-world-1-after.png - World 1 after parity, 393x852, ?sprites=1, 106px glass tiles and brass operators
03-world-4-after.png - World 4-01 casual, 393x852, ?sprites=1, five equal-scale brass operators
```

- [ ] **Step 5: Visually compare World 1 before and after**

Inspect both images at full phone frame. Confirm whether the larger operators offset the 10px tile reduction and whether the board reads at least as occupied as before. If it reads emptier, stop and report that result without adding a low-operator exception.

- [ ] **Step 6: Confirm only intended source and documentation are tracked**

Keep `art-review` and `assets/raw` untracked. Verify every source change is already committed and no generated review file entered the index:

```sh
git diff --check
git status --short
```

- [ ] **Step 7: Push branch, require green GitHub CI, merge to master, and confirm Pages**

Push `codex/token-parity-materials`, wait for the CI completion signal, merge with `--no-ff`, push `master`, and wait for the Pages deployment job. Verify the reported Pages URL returns HTTP 200.
