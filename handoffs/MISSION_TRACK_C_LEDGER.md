# Mission Track C — Security/CI/Release Hardening ledger

**Base (post-C2):** `0fffa1c95abc304fa1d8bdcad4432f67341d158f`  
**End:** _(fill on mission close)_  
**Invariant:** suite floor ≥548; Pages master-only; least privilege; SHA pins. Findings ≠ security proof.

| Slice | Status | PR | Merge SHA | Notes |
| --- | --- | --- | --- | --- |
| C0 | in progress | — | — | GROK Current + this ledger |
| C3 | in progress | — | — | CI concurrency per-ref (was shared `pages`) |
| C4 | pending | — | — | Secret detection (native → optional script → gitleaks defer) |
| C5 | pending | — | — | Deploy evidence summary (light) or defer |
| C6 | pending | — | — | Provenance/attest assess-first; default DEFER |

## C3 decision

Root cause: workflow `concurrency.group: pages` put every branch in one group → feature/Dependabot canceled master gates.  
Fix: `group: ci-${{ github.workflow }}-${{ github.ref }}`; `cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}` (cancel within feature refs; never cancel in-flight master deploy). Pages `if: github.ref == 'refs/heads/master'` and deploy permissions unchanged.

## Verification URLs

_(fill per merged slice)_

## Deferred / rejected

_(fill as slices close)_
