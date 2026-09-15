# Lane Math

A single-lane arithmetic puzzle where difficulty is **resource planning, not arithmetic**. You get a pool of numbers and a queue of targets; each commit combines two numbers with one operator to clear the front target, permanently spending the pieces you used.

**Canonical example** (GDD §1): pool `1, 2, 2, 3, 4, 5` · ordered queue `8 → 3 → 15`. The only winning line is `2×4`, `1+2`, `3×5`; several earlier moves look correct and fail two targets later.

**Current public GitHub build:** [https://nadavw9.github.io/lane-math/](https://nadavw9.github.io/lane-math/) (GitHub Pages; workflow deploys from `master` only).  
**Lane Math Next** is currently being developed in Base44 and is not yet publicly published.

## Setup

Requires **Node 22** (CI baseline via `.github/workflows/ci.yml`; `@types/node` ^22).

```bash
npm install          # primary newcomer install
npm run dev          # Vite dev server
npm test             # vitest run (~59 files / ~494 tests)
npm run typecheck    # tsc --noEmit
npm run build        # prebuild levels:build + vite build
```

For a clean/CI-style install from the lockfile, use `npm ci` instead of `npm install`.

No separate `lint` script in `package.json`.

Useful extras: `npm run generate`, `npm run curate:*`, `npm run levels:build`, `npm run smoke`, `npm run atlas:*` / `atlas:verify`.

## Layout

| Path | Role |
|---|---|
| `src/` | App code: game loop, solver, generator, curation, renderer, economy/save, map, art gates, audio, ads, telemetry |
| `levels/` | Authored 40-level launch ladder (`1-01`…`4-10`) plus curation metadata |
| `tools/` | Build/verify helpers (shipped levels strip, smoke, font coverage, atlases, viewports) |
| `assets/` | Raw art sources for atlas processing (`raw/`, `bg-raw/`, …) |
| `public/` | Static web assets served as-is (fonts, processed atlases under `public/assets/`) |

## Governing docs (do not duplicate here)

| Doc | Governs |
|---|---|
| [`LANE_MATH_GDD.md`](./LANE_MATH_GDD.md) | Design source of truth — mechanics, economy, generator metrics, build order |
| [`ART_DIRECTION.md`](./ART_DIRECTION.md) | Locked art world; supersedes GDD §9.1 / §9.2 / §9.6 material language |
| [`CLAUDE.md`](./CLAUDE.md) | Agent working agreement — phase, verification rules, hard invariants (`AGENTS.md` → same file) |

## CI gates (`.github/workflows/ci.yml`)

One `gates` job on every push; `deploy` only when `github.ref == refs/heads/master`.

| Step | Protects |
|---|---|
| `npm run typecheck` | Type errors before runtime |
| Brightness / retry / flight / shipped-levels named vitest files | Contrast (GDD §9.1), single-render restart (GDD §9.5), frame-bound flights, metrics stripped from payload (GDD §10) |
| Full `vitest run` | Behavioural regression suite |
| `atlas:verify` | Sprite atlases rebuild to the same bytes |
| `vite build --base=/lane-math/` | Production bundle for Pages prefix |
| Playwright smoke (+ `?sprites=0`) | Built artefact boots (sprites + procedural escape hatch) |
| `verify-viewports` / `font-coverage` | Board fits phones; every UI glyph present in the shipped font |

Doc / CI gap notes: [`handoffs/DOC_AUDIT_8cf2f07.md`](./handoffs/DOC_AUDIT_8cf2f07.md).
