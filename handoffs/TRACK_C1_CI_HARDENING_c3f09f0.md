# Track C1 — CI hardening (implementation)

**Status:** DRAFT PR — **do not merge** until CoS/Codex say otherwise.  
**Base:** `master` @ `c3f09f0f260fa8ef9c9d14d746f6783eb8f1f75a` (after #39 Track C design merge)  
**Branch:** `ci/track-c1-ci-hardening`  
**Suite:** **548** tests; default MIN **548** (was 495). `MIN_TESTS` override preserved.

## What landed

### A. Suite shrink protection
- `tools/assert-suite-size.mjs`: `MIN_TESTS ?? 548`
- CI step title: `Full suite (≥548)`
- Proof (local):
  - **Pass @ 548:** `node tools/assert-suite-size.mjs` → `numTotalTests=548 (≥548)` (exit 0)
  - **Fail one below floor:** `MIN_TESTS=549 node tools/assert-suite-size.mjs` → `numTotalTests=548 is below floor 549` (exit 1) — same predicate as suite=**547** vs MIN=**548**
  - Focused comparator: `node -e 'const MIN=548,total=547; if(total<MIN){console.error(`assert-suite-size: numTotalTests=${total} is below floor ${MIN}`); process.exit(1)}'` → exit 1

### B. CI least privilege (permission diff)
| Scope | Before | After |
| --- | --- | --- |
| Workflow default | `contents: read`, `pages: write`, `id-token: write` | `contents: read` **only** |
| `gates` job | (inherited writes) | `contents: read` only (explicit) |
| `deploy` job | (inherited) | `pages: write` + `id-token: write` only |
| Deploy gate | `if: github.ref == 'refs/heads/master'` + env `github-pages` | **unchanged** |

Branch CI cannot deploy (master-only `if` + environment). Master deploy remains functional by config review (OIDC/Pages scopes on `deploy` only).

### C. Action integrity (SHA pins — no new third parties)
| Action | Was | Pin (immutable) | Resolved tag |
| --- | --- | --- | --- |
| `actions/checkout` | `@v4` | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0 |
| `actions/setup-node` | `@v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0 |
| `actions/upload-pages-artifact` | `@v3` | `56afc609e74202658d3ffba0e8f6dda462b719fa` | v3.0.1 |
| `actions/deploy-pages` | `@v4` | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` | v4.0.5 |

Trailing `# vX.Y.Z` comments on every pin. SHAs resolved from the previously used major tags.

### D. Dependabot (`.github/dependabot.yml`)
- Weekly **github-actions** version updates (`open-pull-requests-limit: 5`)
- Weekly **npm** version updates with conservative grouping (dev/prod minor+patch groups) + `open-pull-requests-limit: 5`
- **Scheduled version updates ≠ GitHub security updates.** `dependabot.yml` does **not** create a security-only mode; security alerts/PRs are a separate Settings path when enabled.

### E. Dependency visibility
- Non-blocking `npm audit` covering **all** dependencies (`continue-on-error: true` + step summary)
- Optional production-only summary in the same step (informational; does not replace all-deps)
- **Green / non-blocking ≠ secure supply chain** — visibility only in C1

## Deferred (not in C1)
CodeQL, gitleaks/new scanners, provenance/attestation, Android signing, Base44, ChronosGlobe, gameplay/economy/schema/governing docs.

## Risks
- SHA pins can rot without Dependabot merges; wrong SHA fails CI immediately (fail-closed).
- Job-scoped permissions: if Pages OIDC ever needs extra scopes, deploy breaks until adjusted.
- Non-blocking audit can create alert fatigue; must not be read as a security proof.
- Suite floor 548 will fail intentional large deletions until Eng bumps the floor down in a coordinated PR.

## Rollback
Revert this PR / workflow+tools+dependabot commits; redeploy from last green master if Pages broke.

## Acceptance (local)
- Full suite ≥548; typecheck / build / curate:verify / atlas:verify / smoke×2 / viewport / font green
- Branch CI cannot deploy; master deploy config reviewed (unchanged master-only + environment)
