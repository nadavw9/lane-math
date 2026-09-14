# Governing-doc + CI audit @ `8cf2f07`

**Tip:** `8cf2f0794fbb5f477f54727fcc51de8dbc37c6bd` — `Merge pull request #30 from nadavw9/feat/save-backup-recovery`  
**Branch for this report:** `docs/readme-and-audits`  
**Scope:** Read-only audit of `LANE_MATH_GDD.md`, `ART_DIRECTION.md`, `CLAUDE.md`, CI vs code. Governing docs were **not** edited.  
**P0 data-loss / security / solver / deploy:** none newly found that require stopping (save-backup-recovery is already on tip).

---

## 1. Doc ≠ code

| Finding | Where | Notes |
|---|---|---|
| GDD header still says **“Design locked, pre-implementation”** | `LANE_MATH_GDD.md` L3 | Tip ships solver, generator, 40-level ladder, Pixi renderer, economy/save v2 + backup/recovery, map, Capacitor/AdMob, CI Pages deploy. Status is false. |
| GDD §12 build-order table has no “done” markers | `LANE_MATH_GDD.md` §12 | Phases 1–4 / 4C / 6 technical work are implemented (CLAUDE: Phase 5 art unfinished; Phase 6 technical ahead of sequence). Table still reads as a future plan. |
| GDD §9.1–§9.2 still describe **classroom paper surfaces** and **procedural tokens** | `LANE_MATH_GDD.md` §9 | Runtime is Academy desk-in-room + illustrated sprite atlases (`ART_DIRECTION.md` locked). Old text remains as if current. |
| GDD §5.2: refill “**remote-configurable or single JSON** deployable without store release” | GDD §5.2 vs `src/economy/config.ts` | Rate is a TypeScript constant (`lifeRegenMinutes: 20`). No remote/JSON deploy path. Aspiration unmet. |
| Device-clock exploit: GDD wants server timestamp / refuse jumps | GDD §13 Sev2 vs `src/economy` | Code uses local monotonic/high-water client clock; no server timestamp. |
| `src/map/model.ts` comment: “**There is no star gate on progression**” (§8.1 fairness) | `map/model.ts` vs `DEFAULT_ECONOMY.worldStarGates` | Code gates worlds at **0 / 10 / 20 / 30** stars (Track A). Comment contradicts implementation. |
| `src/economy/save.ts` header: migration hook “**has nothing to migrate yet**” | `save.ts` L5–7 | `SAVE_SCHEMA_VERSION = 2` and `migrate` implements **v1 → v2** (`restored: {}`). Comment is stale beside working migration. |
| CI comment “1 of **270** tests failed” | `.github/workflows/ci.yml` | Suite at tip is **~494** tests / **59** files. Stale count in workflow comments only (not a gate). |
| `handoffs/GROK.md` still framed as **MERGE HOLD / draft PR #30** | `handoffs/GROK.md` | Tip **is** the merge of #30. Status text superseded by history; keep as historical record but do not treat as open hold. |

Aligned (no action): lives **5**, regen **1 / 20 min**, unlock **2-08**, W1 lives off, star bands 3/2/1 by failures — match GDD §5 / §7.6 and `DEFAULT_ECONOMY`.

---

## 2. Code missing from docs

| Finding | Code | Docs |
|---|---|---|
| **World star gates** 10/20/30 | `src/economy/config.ts` (`STAR_GATE_WORLD_*`), map lock logic | **Not specified** in GDD (no star-toll section). Track A product rule lives only in code + tests. |
| Save **backup / recovery** keys + export UX | `SAVE_BACKUP_KEY`, `SAVE_RECOVERY_KEY`, map Export chip | GDD §13 only asks to version schema; backup/recovery narrative is in `handoffs/GROK.md`, not GDD. |
| Capacitor + AdMob + Android tree | `android/`, `@capacitor/*`, `src/ads/` | GDD §11/§12 mention AdMob/Capacitor as Phase 6 deliverables; little operational detail in governing docs. |
| Telemetry funnel implementation | `src/telemetry/` | GDD §7.8 lists events; CLAUDE phase note says telemetry done — OK, but no “shipped shape” pointer in GDD header/status. |
| FTUE / teach-by-doing beats beyond GDD §7.5 | `src/game/ftue.ts`, ftue-shape tests, `tools/ftue-*.json` | Partial overlap with GDD session-one table; many phone-eye / FTUE notes live under `docs/review/` only. |

---

## 3. Duplicated numbers

| Number | Copies | Risk |
|---|---|---|
| Canonical metrics (`dStart [2,4,1]`, `dPath [2,3,1]`, trap depths, paths=1) | GDD §1, GDD §8.4, GDD §10 example JSON, solver fixtures/tests, CLAUDE | OK if fixtures stay authoritative; GDD repeats for readability. Drift would be caught by `canonical-level` tests. |
| `549KB` metrics payload / strip rationale | GDD §10, `tools/build-levels.mts`, `shipped-levels.test.ts`, CI comments | Historical measurement; ratio assertion in tests is safer than the absolute. |
| Lives `5` / `20` min / full refill ≈ `100` min | GDD §5.2 and comments | Code single-sources via `DEFAULT_ECONOMY`; GDD restates. Fine while they match. |
| Composite score weights (lookahead 3.0, decisionPoints 2.0, …) | GDD §8.4 table vs `src/curation/score.ts` | **Must** stay in sync; no automated “GDD table == code weights” check in CI. |
| World star gates 10/20/30 | `config.ts` constants + `config.test.ts` + comments | Duplicated in code comments only; **absent from GDD** (see §2). |

---

## 4. Superseded text beside replacement

| Old text still present | Replacement | Issue |
|---|---|---|
| GDD §9.1 classroom paper / light-ground dark-ink; §9.2 “tokens drawn procedurally, not atlased”; “backgrounds remain the only raster assets” | `ART_DIRECTION.md` (Locked; supersedes §9.1, §9.2, §9.6 material language) + atlas pipeline in `package.json` / `tools/process-sprites.mts` | Agents reading GDD §9 alone will implement the wrong art stack. ART_DIRECTION has an explicit supersession table (§10); GDD body does not point forward at the section head. |
| GDD §9.6 material colours (partially) | ART_DIRECTION §4 palette | Same class of drift. |
| GDD status “pre-implementation” | CLAUDE “Current phase: Phase 5 — art pass” | Two contradictory status lines; CLAUDE is closer to reality. |
| `handoffs/GROK.md` MERGE HOLD for #30 | Merge commit on tip | Superseded operational status left in place. |

Shape-coding, feel register (§9.5), failure moment (§9.4), quality bar — ART_DIRECTION correctly marks these as **surviving**; not false supersession.

---

## 5. Stale phase / status

| Marker | Claim | Reality @ `8cf2f07` |
|---|---|---|
| GDD L3 | pre-implementation | Post Phase 4/4C/6-tech; Phase 5 art open |
| CLAUDE “Current phase” | Phase 5 — art pass | Consistent with unfinished art gate; trust this over GDD header |
| GDD §12 Phase 1 narrative | “before a single pixel is drawn” | Historical; fine as archive if status/phase are updated elsewhere |
| CI comment 270 tests | Old suite size | Update comment when convenient |
| GitHub Pages API `source.branch: feat/solver` | Legacy Pages “source” field | Deploy is **workflow** `deploy` job gated on `master`. Live URL `https://nadavw9.github.io/lane-math/` is real. Treat API `source.branch` as stale metadata, not the deploy policy. |

---

## 6. Base44-era assumptions

| Location | Finding |
|---|---|
| `LANE_MATH_GDD.md`, `ART_DIRECTION.md`, `CLAUDE.md` | **No** Base44 / ChronosGlobe references. |
| `handoffs/GROK.md` | Heavy Base44 sync / MERGE HOLD language tied to PR #30. Appropriate as a handoff archive; **not** a governing-doc assumption. Do not copy Base44 requirements into GDD without Codex. |
| Save path | GitHub uses `localStorage` (`LocalStorageStore`); Capacitor Preferences called out as future — matches GROK residual list, not a silent Base44 dependency in product code. |

---

## 7. CI / release audit (report only — no new jobs)

### What CI already protects

| Concern | Protected? | How |
|---|---|---|
| Full behavioural suite (~494 / 59) | **Yes (implicit)** | Final `npx vitest run` after named gates |
| Typecheck | **Yes** | `npm run typecheck` |
| Production build | **Yes** | `npm run build -- --base=/lane-math/` |
| Lint | **No** | No `lint` / eslint script in `package.json`; no CI lint step |
| Save migration + corrupt recovery | **Yes (via suite)** | `save-recovery.test.ts`, schema tests in `economy.test.ts` / `restoration.test.ts` run inside full vitest — **not** a named CI step |
| Level / schema validation | **Partial** | `shipped-levels.test.ts` (named): field set, no metrics, authored↔shipped sync, size ratio. Authored JSON schema / band re-verify is **not** a CI step (`curate:verify` / `verify-ladder-cli` exist locally only) |
| Accidental solver / level content changes | **Partial** | Suite + shipped-levels catch many regressions; **no** golden hash / explicit “levels/** freeze” or solver oracle job beyond tests |
| Deploy only from intended branch | **Yes** | `deploy` job `if: github.ref == 'refs/heads/master'`; gates run on all branches |
| Atlas reproducibility / boot smoke / viewports / fonts | **Yes** | Dedicated steps after build |
| Explicit **494-test baseline floor** | **No** | Suite must pass, but shrinking the suite (delete tests) still goes green |

### Substantive missing gates (recommendations only)

1. **Assert minimum test count** (e.g. `vitest` summary ≥ 494 / 59 files, or fail if count drops without intentional bump) — protects the “494 baseline” called out by Eng Lead without adding filler tests.
2. **Named CI step for save migration + recovery** (`src/economy/save-recovery.test.ts` ± schema migrate cases) — same pattern as brightness/retry/flights so a failure names itself.
3. **Ladder integrity job:** `npm run curate:verify` (or `verify-ladder-cli`) on `levels/` — catches solver/metric drift vs curated bands that unit tests may not all cover.
4. **Optional levels content freeze:** fail if `levels/*.json` change without an accompanying curation note / allowlist label (policy gate), to surface accidental ladder edits in PRs.
5. **Lint gate** once an eslint/prettier script exists — currently N/A; do not invent config in this PR.
6. **Node engine:** CI uses Node 22; document local Node ≥22 (Capacitor packages already require it).
7. **Do not** treat Pages API `source.branch: feat/solver` as deploy policy — workflow `master`-only is the real control; optionally clean Pages settings in GitHub UI for less confusion.

### Explicit non-goals of this PR

No new CI jobs, no filler tests, no governing-doc edits, no Base44/ChronosGlobe touches.

---

## 8. Suggested doc follow-ups (Codex / Nadav — not done here)

1. Flip GDD status line; mark §12 phases complete vs open (Phase 5).
2. At top of GDD §9, one-line pointer: material/world language → `ART_DIRECTION.md`.
3. Amend GDD with world star gates **or** remove/relocate gates if §8.1 “no second difficulty curve” is still law.
4. Refresh `save.ts` migration comment; archive or retitle `handoffs/GROK.md` #30 hold language now that #30 is merged.
5. Make refill remote/JSON **or** soften GDD §5.2 wording to “single module constant”.
