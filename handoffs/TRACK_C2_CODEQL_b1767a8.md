# Track C2 — CodeQL (javascript-typescript only)

**Status:** DRAFT PR — **do not merge** until CoS/Codex say otherwise.  
**Base:** `master` @ `b1767a8dd61aeb1f27eba231a5daefbb8495ca41` (after #40 Track C1 merge)  
**Branch:** `ci/track-c2-codeql`  
**Workflow:** [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) (separate from `ci.yml`)  
**Suite floor:** unchanged (≥548). Existing gates/deploy untouched.

## Why a separate workflow (not `ci.yml`)

| Option | Verdict |
| --- | --- |
| Add CodeQL steps into `ci.yml` `gates` | Rejected — would share the Pages `concurrency: group: pages`, stretch the already-long gates job, and risk SARIF / tool noise coupling to deploy |
| **New `.github/workflows/codeql.yml`** | **Chosen** — isolates `security-events: write`, own concurrency group, independent failure surface; **cannot** block Pages deploy (deploy still only `needs: gates` in `ci.yml`) |

Existing least-privilege CI (`contents: read` default; deploy-only `pages`+`id-token`) is preserved verbatim. No gitleaks, provenance/attestation, Android, Base44, ChronosGlobe, gameplay/economy/UI/schema/governing-doc changes.

## Triggers

| Event | Scope |
| --- | --- |
| `push` | `master` |
| `pull_request` | targeting `master` |
| `schedule` | `cron: '17 4 * * 1'` (weekly Monday 04:17 UTC) |

Weekly cron is cheap for this repo (single JS/TS matrix leg, minutes of Actions) and catches drift when master is quiet. Documented so cost is explicit.

## Language matrix + permissions

| Item | Value |
| --- | --- |
| Languages | **`javascript-typescript` only** |
| Out of matrix | Android / Java-Kotlin (Capacitor `android/` exists but **explicitly out of C2**), Python, etc. |
| Workflow default perms | `contents: read` |
| Job `analyze` perms | `security-events: write`, `actions: read`, `contents: read` |
| Build | None (interpreted language; no autobuild) |

## Action SHA pins (immutable; C1 style)

| Action | Pin | Tag comment |
| --- | --- | --- |
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0 (same as C1) |
| `github/codeql-action/init` | `b96794f015dfd88f77b49b1c93e0fa7110f94c63` | v4.38.0 |
| `github/codeql-action/analyze` | `b96794f015dfd88f77b49b1c93e0fa7110f94c63` | v4.38.0 |

No other third-party Actions introduced. Dependabot already watches `github-actions` weekly (C1).

## Fail / block policy (C2)

- **Pages deploy path:** unaffected. CodeQL is not a `needs:` of `deploy`.
- **Findings:** surface as GitHub **code scanning alerts** (Security tab / PR annotations). Default `analyze` does **not** treat “alerts found” as a hard deploy blocker.
- **Job failure:** tool/config/upload errors fail the CodeQL workflow job only.
- Making CodeQL a required check / fail-on-severity gate = **later CoS decision**, not C2.

## Runtime / cost implications

- Extra Actions minutes on master pushes, PRs to master, and weekly cron.
- Typical JS/TS CodeQL on this size codebase: on the order of a few minutes per run (not a second full vitest/playwright gates pass).
- Does not duplicate `npm ci` / suite / smoke from `ci.yml`.

## What CodeQL **does** prove

Runs GitHub’s default CodeQL query suite for JavaScript/TypeScript and uploads SARIF to code scanning — useful for catching a class of injection, XSS, prototype-pollution, unsafe deserialization, and similar **static** patterns in the TS/JS sources CodeQL can see.

## What CodeQL **does not** prove

It does **not** prove the supply chain is secure, client saves are cheat-proof, runtime/boot correctness, or that Android/Capacitor/native paths are scanned. Green CodeQL ≠ no vulns; absence of alerts ≠ secure product. Does not replace `npm audit`, Dependabot, or human review.

## Risks

- First enablement may produce alert noise (false positives / intentional patterns); triage is human.
- SHA pins can rot without Dependabot merges; wrong SHA fails CodeQL immediately (fail-closed for the scanner workflow only).
- Weekly cron still consumes Actions minutes if the repo is idle.
- Advanced setup requires code scanning to be available on the repo plan; if upload is rejected, the analyze job fails until settings allow it.

## Rollback

Delete `.github/workflows/codeql.yml` (and this handoff / GROK pointer) via revert of this PR, or disable the workflow in Actions UI. No change to `ci.yml` / Pages.

## Acceptance / evidence

- Local: workflow YAML present; `ci.yml` unchanged; suite floor still ≥548; no Base44/Chronos/gameplay edits.
- CI: CodeQL workflow run URL(s) on the DRAFT PR; existing CI gates workflow still green on the tip if triggered.
- Tip / PR: filled at open time in GROK + below.

**Tip SHA:** PR [#50](https://github.com/nadavw9/lane-math/pull/50) HEAD (`ci/track-c2-codeql`) — trust `gh pr view 50 --json headRefOid`.
**DRAFT PR:** [#50](https://github.com/nadavw9/lane-math/pull/50) — **do not merge**.
