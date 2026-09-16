# Track A PROOF — validation implementation review

**Branch:** `feat/track-a-save-validation-harness` (DRAFT PR #38)  
**Schema:** `SAVE_SCHEMA_VERSION = 2` (unchanged)  
**Scope:** structural fail-closed migrate + prod harness DCE. **Not** cheat-proof / crypto / server-grade.

## Entry points / type guards

| Helper | Role |
|---|---|
| `isPlainObject` | object ∧ non-null ∧ ¬array |
| `isFiniteNonNegInt` | typeof number ∧ Integer ∧ Finite ∧ ≥ 0 (**no string coerce**) |
| `validateHints` | absent → `[]`; else string[] or reject |
| `validateLevelProgress` | per-level record; absent fields → `EMPTY_PROGRESS` defaults |
| `validateLevels` / `validateRestored` | absent → `{}`; array/non-object → reject; rebuild plain maps |
| `migrate(raw)` | **sole** public climb+validate entry; returns `SaveData \| null` |
| `classifySaveRaw(raw)` | distinguishes `json-parse-fail` / `structural-fail` / `unsupported-schema` / `ok` |
| `tryParseMigrate` | JSON.parse + migrate; all failures → null (load path) |

## Validation before defaults?

**Yes for presence checks, then default-or-validate:** for each known field, `undefined` selects the documented default; any other value (including `null`) is type-checked and may reject. Defaults are **not** applied after accepting invalid values.

## Absent vs explicit invalid

| Input | Result |
|---|---|
| Field absent (`undefined`) | Documented default |
| Explicit `null` on typed known field | **Reject** |
| Wrong primitive / numeric string | **Reject** (no coerce) |
| Array where map (`levels` / `restored`) | **Reject** |
| Unknown top-level keys | **Ignored** (not spread into `SaveData`) when knowns validate |

## Newly constructed outputs?

**Yes.** `migrate` always returns a freshly built `SaveData`: new `levels` / `restored` maps and new per-level objects from validators. No `...raw` spread into the result. Unknown keys never appear on the returned object.

## Deferred cross-field invariants (NOT clamped)

Documented unresolved — structural migrate does **not** enforce or silently fix:

- `starsSpent > totalStars`
- `bestStars > 0` with `cleared: false`
- `clockHighWater < lastLifeGrantedAt`
- `lives` vs `maxLives` (lives may exceed maxLives; no lifetime cap)

Economy / product may prove invariants later; until then **do not silently clamp**.

## Historical shapes that may still reject

Legitimate game-written saves should load. Shapes that previously silent-normalized and now **reject** (→ #30 recovery/backup if primary):

- `ratingAttempt` ∉ {`clean`,`tainted`} (old path coerced → `tainted`)
- Non-boolean `muted` (e.g. `0`/`1`)
- Non-integer counters/timestamps (floats, NaN, Infinity, negatives, numeric strings)
- `bestStars` ∉ [0,3]; `restored[*]` ∉ [0,4]
- `hintsPurchased` with non-strings; `levels`/`restored` as arrays
- Newer / unclimbable `schemaVersion`

## Failure-class distinctions (recovery)

All non-ok classes share the load path: preserve raw once in `SAVE_RECOVERY_KEY` → try backup → else emptySave with write blocks when recovery unsecured.

| Class | Meaning |
|---|---|
| `json-parse-fail` | `JSON.parse` throws |
| `structural-fail` | Parsed JSON; climbable schema major; migrate rejects |
| `unsupported-schema` | Finite `schemaVersion` this build cannot climb (newer or unknown major) |

## Harness / DCE

- Gate: `import.meta.env.DEV \|\| import.meta.env.VITE_LANE_MATH_HARNESS === "1"` (compile-time; Vite DCE).
- Default Pages/APK: flag **unset**. Deploy artifact = **`dist-pages/`** (harness-off). Harness-on rebuild is a separate `./dist` for smoke only.
- `tools/assert-no-prod-harness.mjs` / `assert-harness-present.mjs`: **string-scan regression gates, not security proofs.**

## Cheat-proof disclaimer

Structural validation improves load integrity and recovery. It does **NOT** make client saves cheat-proof, authenticated, or tamper-evident.
