# Mission Track C — Security/CI/Release Hardening ledger

**Base (post-C2):** `0fffa1c95abc304fa1d8bdcad4432f67341d158f`  
**End (C5 merge tip):** `e148eb7b567c2c157f3bef51b16701190de31804`  
**Invariant:** suite floor ≥548; Pages master-only; least privilege; SHA pins. Findings ≠ security proof.

| Slice | Status | PR | Merge SHA | Notes |
| --- | --- | --- | --- | --- |
| C0 | merged with C3 | [#51](https://github.com/nadavw9/lane-math/pull/51) | `70cf1dd` | GROK Current + this ledger |
| C3 | merged | [#51](https://github.com/nadavw9/lane-math/pull/51) | `70cf1dd` | Per-ref concurrency; master never canceled |
| C4 | merged | [#52](https://github.com/nadavw9/lane-math/pull/52) | `bbc31d5` | Native scan verified + fail-closed check; gitleaks deferred |
| C5 | merged | [#53](https://github.com/nadavw9/lane-math/pull/53) | `e148eb7` | Compact gates/deploy step summary |
| C6 | deferred | — | — | attest-build-provenance rejected; see C6 decision |

## C3 decision

Root cause: workflow `concurrency.group: pages` put every branch in one group → feature/Dependabot canceled master gates.  
Fix: `group: ci-${{ github.workflow }}-${{ github.ref }}`; `cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}` (cancel within feature refs; never cancel in-flight master deploy). Pages `if: github.ref == 'refs/heads/master'` and deploy permissions unchanged.

## C4 decision

GitHub repository API verified native secret scanning **enabled** and push protection **enabled**; alert API returned zero open alerts at check time (visibility, not proof). `tools/check-obvious-secrets.mjs` adds a dependency-free, fail-closed CI check for private-key PEM headers, GitHub access tokens, and AWS access-key IDs. It intentionally avoids generic/high-entropy matching, so public identifiers such as AdMob test IDs are not findings. Real-secret response is removal plus rotation/revocation. Green checks ≠ no secrets.

## C5 decision

Add one compact `GITHUB_STEP_SUMMARY` block after existing gates: tip SHA, ref/master-only deploy note, suite floor ≥548, harness-off (`dist-pages`) vs harness-on (`dist`) split, audit visibility, findings ≠ proof. No extra Action, no gameplay, no permission change.

## C6 decision (DEFER / reject)

`actions/attest-build-provenance` is **not** a low-noise fit for this Pages path.

- Pages already uses OIDC on the **deploy** job only (`id-token: write` + `pages: write`). Gates stay `contents: read`.
- Attestation would need `attestations: write` (and usually `id-token: write`) on the build/gates job — expanding least privilege for an artifact nobody in this product verifies (`gh attestation verify` is not the Pages consumer).
- Extra Action pin + unused SLSA metadata ≠ security proof and is noise vs C3/C4.
- Revisit only if a later track has a real attestation consumer (signed release/APK), which is out of this mission (no Android).

## Verification URLs

- C3 branch CI (deploy skipped): https://github.com/nadavw9/lane-math/actions/runs/35120416702
- C3 master CI (gates + deploy SUCCESS): https://github.com/nadavw9/lane-math/actions/runs/35121348753
- C4 branch CI (deploy skipped): https://github.com/nadavw9/lane-math/actions/runs/35121967263
- C4 master CI (gates + deploy SUCCESS): https://github.com/nadavw9/lane-math/actions/runs/35122646249
- C5 branch CI (deploy skipped): https://github.com/nadavw9/lane-math/actions/runs/35122725799
- C5 master CI (gates + deploy SUCCESS): https://github.com/nadavw9/lane-math/actions/runs/35123419717

## Deferred / rejected

- C4 full gitleaks Action: DEFER — native scanning + push protection enabled; narrow in-repo fail-closed check covers high-confidence forms without another third-party Action/noise.
- Optional native non-provider patterns + validity checks: remain **disabled** after PATCH (settings unchanged via API; not required for C4). Core secret scanning + push protection needed **no** Nadav toggle.
- C6 attest-build-provenance: DEFER/reject (see C6 decision).
