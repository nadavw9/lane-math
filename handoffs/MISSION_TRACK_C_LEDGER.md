# Mission Track C — Security/CI/Release Hardening ledger

**Base (post-C2):** `0fffa1c95abc304fa1d8bdcad4432f67341d158f`  
**End:** _(fill on mission close)_  
**Invariant:** suite floor ≥548; Pages master-only; least privilege; SHA pins. Findings ≠ security proof.

| Slice | Status | PR | Merge SHA | Notes |
| --- | --- | --- | --- | --- |
| C0 | merged with C3 | [#51](https://github.com/nadavw9/lane-math/pull/51) | `70cf1dd` | GROK Current + this ledger |
| C3 | merged | [#51](https://github.com/nadavw9/lane-math/pull/51) | `70cf1dd` | Per-ref concurrency; master never canceled |
| C4 | in progress | — | — | Native scanning verified; narrow in-repo check |
| C5 | pending | — | — | Deploy evidence summary (light) or defer |
| C6 | pending | — | — | Provenance/attest assess-first; default DEFER |

## C3 decision

Root cause: workflow `concurrency.group: pages` put every branch in one group → feature/Dependabot canceled master gates.  
Fix: `group: ci-${{ github.workflow }}-${{ github.ref }}`; `cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}` (cancel within feature refs; never cancel in-flight master deploy). Pages `if: github.ref == 'refs/heads/master'` and deploy permissions unchanged.

## Verification URLs

- C3 branch CI (deploy skipped): https://github.com/nadavw9/lane-math/actions/runs/35120416702
- C3 master CI (gates + deploy SUCCESS): https://github.com/nadavw9/lane-math/actions/runs/35121348753

## Deferred / rejected

- C4 full gitleaks Action: DEFER — native scanning + push protection are enabled; narrow in-repo fail-closed check covers independent high-confidence forms without another third-party Action/noise.
- Optional native non-provider patterns + validity checks remain disabled: PATCH was accepted but settings stayed disabled (feature unavailable/not applicable via this repository API); not required for C4. No Nadav toggle is needed for core secret scanning/push protection.


## C4 decision

GitHub repository API verified native secret scanning **enabled** and push protection **enabled**; alert API returned zero open alerts at check time (visibility, not proof). `tools/check-obvious-secrets.mjs` adds a dependency-free, fail-closed CI check for private-key PEM headers, GitHub access tokens, and AWS access-key IDs. It intentionally avoids generic/high-entropy matching, so public identifiers such as AdMob test IDs are not findings. Real-secret response is removal plus rotation/revocation; bypassing a true positive is not policy.
