# Track C — CI / supply-chain DESIGN (docs-only)

**Status:** DESIGN / REPORT ONLY — **no** workflow YAML, tooling, or test-floor behavior changes in this PR.  
**Tip inspected:** `010e3a13d3e012ac9035595e1ed1271a21c0682f` (`origin/master` after Track A / PR #38 merge).  
**Suite floor context:** lane now **548** (Track A landed); CI default `MIN` in `tools/assert-suite-size.mjs` is still **495**; workflow step title still says `Full suite (≥495)`.  
**Hard rules:** No Base44 / ChronosGlobe / GDD / ART / CLAUDE / UI / economy / schema. No stacked behavior branch. **Do not implement** until Codex assigns scope. **MERGE HOLD.**  
**Repo CI surface (actual):** single workflow `.github/workflows/ci.yml` only — no Dependabot, CodeQL, secret-scan, or other `.github/` config files on this tip.

---

## Inventory (read from tip — do not invent)

| Asset | Path / fact |
| --- | --- |
| Workflow | `.github/workflows/ci.yml` — jobs `gates` + `deploy` |
| Top-level permissions | `contents: read`, `pages: write`, `id-token: write` (workflow-wide) |
| Actions used | `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4` — **floating major tags, not commit SHAs** |
| Suite floor | `tools/assert-suite-size.mjs` → `MIN = Number(process.env.MIN_TESTS ?? 495)` |
| Pages deploy | `gates` uploads `dist-pages` (harness-off); `deploy` runs only if `github.ref == 'refs/heads/master'`, environment `github-pages` |
| Scanners | **None** in CI or `package.json` scripts (`npm audit`, Dependabot, CodeQL, gitleaks/trivy/semgrep absent) |
| Secret ignore | `.gitignore` covers `android/keystore.properties`, `*.keystore`, `*.jks`, `keystore-new.txt` — no CI enforcement |
| Prior S0 pointer | `handoffs/SECURITY_PRIVACY_RELEASE_AUDIT_2be7ad1.md` § Track C (propose only) |

---

## 1. CI least privilege (pages / id-token scoped to deploy)

### Current state
Workflow-level `permissions` grant `pages: write` and `id-token: write` on **every** push (all branches), including the `gates` job that never deploys. Only `deploy` publishes, and it is gated with `if: github.ref == 'refs/heads/master'` plus environment `github-pages`. Concurrency group is `pages` with `cancel-in-progress: true`. `contents: read` is already least-privilege for checkout.

### Proposed change (later impl)
- Keep workflow default permissions at `contents: read` only (drop top-level `pages` / `id-token` write).
- Grant `pages: write` + `id-token: write` **only** on the `deploy` job (and keep master + environment gates).
- Optionally set `gates.permissions: { contents: read }` explicitly so job tokens cannot escalate via repo defaults.
- Do **not** widen `contents` or add unrelated write scopes.

### Acceptance criteria
- Non-master branch CI still runs `gates` green without Pages publish.
- Master push still deploys via `deploy-pages` with OIDC/Pages token.
- Workflow permissions in the Actions UI / job logs show write scopes only on `deploy`.

### Risks
- Mis-scoped job permissions can break Pages deploy (OIDC / artifact consume).
- Repo or org default permissions could interact unexpectedly — verify after change.

### Rollback
Revert the workflow commit; redeploy from last green master if needed.

### Behavior-free in this PR?
**Yes** — docs only. Workflow change is a later Codex-scoped PR.

---

## 2. Third-party action pinning

### Current state
All four third-party actions use **mutable major tags** (`@v4` / `@v3`), not immutable commit SHAs. There is no pin comment, no `dependabot` updates for Actions, and no other workflows. Tags can move; supply-chain compromise of a tag would affect every push.

### Proposed change (later impl)
- Pin each `uses:` to a full commit SHA with a trailing comment naming the resolved tag (e.g. `# v4.2.2`).
- Prefer Dependabot `package-ecosystem: github-actions` (or Renovate) to open SHA-bump PRs.
- Keep official `actions/*` only unless Codex approves new third parties.

### Acceptance criteria
- Every `uses:` line is SHA-pinned; CI green on a throwaway branch.
- Documented process for bumping pins (Dependabot PR or Eng checklist).
- No new unpinned actions introduced without review.

### Risks
- SHA pins without automation rot and surprise break on major-version EOL.
- Incorrect SHA (typo) fails checkout/setup immediately — fail-closed, but blocks CI.

### Rollback
Revert pin commit to previous tags/SHAs.

### Behavior-free in this PR?
**Yes** — docs only. Pinning is a later workflow-only change.

---

## 3. Dependency / security scanning

### Current state
`package-lock.json` + `npm ci` give reproducible installs. **No** `npm audit` step, **no** Dependabot for npm, **no** CodeQL / OSV / Snyk / Trivy in `.github/`. `package.json` has no audit script. Prior S0 audit already flagged this as propose-only.

### Proposed change (later impl)
Phased, low-noise:
1. **Non-blocking** `npm audit` covering **all** dependencies (production **and** build/dev) on `gates` with `continue-on-error: true` + step summary — visibility first. Build/dev tools run in CI and are part of the supply-chain surface; do **not** use `--omit=dev` / `--production` for the initial visibility gate. You may **separately** summarize production-only findings in the step summary, but that summary must not replace or exclude the all-deps audit.
2. Add Dependabot **scheduled version updates** (distinct from GitHub **security** updates):
   - Weekly **npm** version updates with **conservative grouping** and **open-PR limits**; Eng reviews.
   - Weekly **github-actions** version updates (once Actions are SHA-pinned).
   - GitHub **security updates** (Dependabot security alerts / auto-security PRs) are a **separate** product path — enable/handle in repo settings when desired. **`dependabot.yml` does not create a security-only mode**; it configures scheduled version-update PRs only.
3. Optional later: CodeQL JS (default queries) on master/PRs — only if Codex wants SARIF noise budget.

Out of scope unless assigned: mandatory fail-on-high that blocks Pages without an allowlist story.

### Acceptance criteria
- Non-blocking all-deps `npm audit` surfaces advisories (including transitive build/dev) without breaking green master deploy on day one unless explicitly made blocking. Green/non-blocking ≠ secure supply chain.
- Dependabot version-update config (weekly npm + actions, grouping/limits) is documented as **≠** security updates; security updates remain a separate enablement path.
- Lockfile remains the install source of truth (`npm ci` unchanged).
- No Base44 / native secret stores introduced.

### Risks
- Noisy advisories in transitive Vite/Playwright/Pixi trees → alert fatigue.
- Blocking audit too early can halt legitimate merges.

### Rollback
Remove the job/config file; Dependabot can be disabled in repo settings.

### Behavior-free in this PR?
**Yes** — docs only. Any scanner job is a later workflow/config change.

---

## 4. Secret-pattern detection

### Current state
Defense is **gitignore-only** for Android keystore materials. No gitleaks, TruffleHog, GitHub secret scanning push protection config in-repo, and no CI step that greps for key patterns. S0 release checklist listed “no production secrets in repo” as propose-scan.

### Proposed change (later impl)
- Enable GitHub **secret scanning** + push protection at repo/org (settings — may not need YAML).
- Optional CI: `gitleaks` (or equivalent) on PRs with a checked-in `.gitleaks.toml` allowlisting known false positives (e.g. AdMob **test** IDs if they trip patterns).
- Keep keystore paths gitignored; never add signing secrets to Actions secrets unless Codex designs Android release separately.

### Acceptance criteria
- New accidental key/token commits are blocked or flagged before merge.
- Documented response: rotate, purge if needed, reopen PR.
- CI false-positive rate acceptable to Eng (allowlist reviewed).

### Risks
- False positives on public test AdMob IDs / example strings.
- History already may contain material — scanning HEAD ≠ history purge.

### Rollback
Disable the Action / turn off push protection; keep gitignore.

### Behavior-free in this PR?
**Yes** — docs only. Settings or scanner workflow come later.

---

## 5. Test-floor correction (assert default MIN ≥548)

### Current state
- Track A landed on master; GROK / lane verify path reports **`npm test` → 548**.
- `tools/assert-suite-size.mjs` default remains **`MIN_TESTS ?? 495`**.
- `.github/workflows/ci.yml` step name is still `Full suite (≥495)` and invokes the tool **without** `MIN_TESTS`, so the effective CI floor is **495**, not 548.
- Shrink protection therefore allows silently dropping up to ~53 tests while staying green.

### Proposed change (later impl — **not** in this docs PR)
- Bump default in `tools/assert-suite-size.mjs` from `495` → **`548`** (or `Number(process.env.MIN_TESTS ?? 548)`).
- Update CI step title comment/`Full suite (≥548)` to match.
- Refresh stale “~495” comments in the same workflow only when touching that file.
- Optional: document `MIN_TESTS` override for local bisect.

**This PR:** docs mention of the proposed change only — **do not** edit `assert-suite-size.mjs` or `ci.yml` here.

### Acceptance criteria (when Codex assigns)
- Default `node tools/assert-suite-size.mjs` fails if `numTotalTests < 548`.
- CI gates step reports ≥548; master stays green at current suite size.
- Override `MIN_TESTS` still works for intentional local runs.

### Risks
- If suite count on a machine differs (flaky discovery / path filter), a hard 548 could false-fail — verify once on CI before merge.
- Future intentional deletions need a coordinated floor bump-down (rare).

### Rollback
Revert the one-line default (and step title) to previous floor.

### Behavior-free in this PR?
**Yes** — **docs-only mention**. Actual MIN bump = later tiny tools+comment PR (behavior change to the gate).

---

## 6. Release evidence checks

### Current state
Release reliability on tip is strong for **gates**: typecheck, named vitest gates, `curate:verify`, suite floor (495), atlas verify, Pages-base build, harness-off assert, harness-on assert, Playwright smoke ×2, viewport fit, font coverage, then Pages artifact + master-only deploy. Step summary records web build `du` size. **Missing as formal evidence:** signed attestation of artifact provenance beyond Pages OIDC, npm audit trail, secret-scan clean bill, explicit “release checklist” artifact attached to the deploy job, and Android/store evidence (out of GitHub Pages path).

### Proposed change (later impl)
Lightweight evidence pack on `deploy` (or a master-only follow-on job), e.g.:
- Persist / summarize: git SHA, workflow run URL, `du` of `dist-pages`, harness-off assert result, suite floor value used, Node version.
- Optional: `actions/attest-build-provenance` (or Pages-native provenance) once least-privilege pins land.
- Link S0 / Track A acceptance rows still required for human release (AdMob prod IDs, child-directed decisions) — **Codex/Nadav**, not automated green CI.

Do **not** invent APK signing evidence in this track unless Android release is separately scoped.

### Acceptance criteria
- A human can open one CI run / summary and answer: what SHA shipped, did harness stay off in Pages artifact, what suite floor was enforced, did smoke pass.
- Deploy path unchanged in meaning (master-only Pages).
- No false claim of store/play compliance from web CI alone.

### Risks
- Attestation APIs / permission changes can break deploy if bolted on carelessly.
- Over-claiming “secure release” from client-side web CI.

### Rollback
Remove evidence steps; Pages deploy reverts to current upload + deploy-pages pair.

### Behavior-free in this PR?
**Yes** — docs only. Evidence job/attestation = later workflow change.

---

## Summary table (for PR body)

| # | Item | Current (tip `010e3a1`) | Proposed (later) | This PR behavior-free? |
| --- | --- | --- | --- | --- |
| 1 | Least privilege | Workflow-wide `pages`+`id-token` write | Scope writes to `deploy` only | **Yes** (docs) |
| 2 | Action pinning | Floating `@v3`/`@v4` tags | SHA pins + Actions Dependabot | **Yes** (docs) |
| 3 | Dep/security scan | Lockfile only; no audit/Dependabot/CodeQL | Non-blocking **all-deps** audit → Dependabot **version** updates (≠ security updates) → optional CodeQL | **Yes** (docs) |
| 4 | Secret patterns | gitignore keystores only | Secret scanning / optional gitleaks | **Yes** (docs) |
| 5 | Test floor | Default MIN **495**; lane **548** | Default MIN **≥548** + CI label | **Yes** (docs mention only; no bump here) |
| 6 | Release evidence | Strong gates; thin provenance narrative | Deploy evidence summary ± provenance | **Yes** (docs) |

---

## Explicit non-goals (this PR and until Codex assigns)

- No `.github/workflows/*.yml` edits.
- No `tools/assert-suite-size.mjs` MIN bump in this PR.
- No Dependabot/CodeQL/gitleaks files landed here.
- No Base44 / ChronosGlobe / GDD / ART / CLAUDE / UI / economy / schema / Track A re-litigation.
- **Do not merge** until CoS/Codex lift MERGE HOLD.

## Suggested impl order (when assigned)

1. Test-floor MIN → 548 (tiny, high value, matches lane).  
2. Least-privilege permissions on `deploy`.  
3. Action SHA pins (+ Actions Dependabot).  
4. Non-blocking all-deps `npm audit` + Dependabot version updates (npm + actions; ≠ security updates).  
5. Secret scanning / gitleaks.  
6. Release evidence summary (± attest).
