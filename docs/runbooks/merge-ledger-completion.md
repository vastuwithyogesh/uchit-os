# Merge Readiness and Engineering Ledger Completion

This runbook defines the boundary between an approved pull request, a merged change, and a completed engineering task.

## Core rule

A merge is not completion.

The lifecycle is:

`... -> VERIFYING -> STAGING -> MERGE_READY -> MERGED -> outcome verification -> DONE`

No automation may collapse `MERGED` and `DONE` into the same state transition.

## MERGE_READY

A task may be classified `MERGE_READY` only when the current reviewed head SHA has all required evidence:

- valid Task Packet and current claim identity
- valid branch/worktree isolation and complete PR provenance
- diff risk recalculated without downgrade
- independent review approved
- Policy and Release gates passed
- required domain tests passed
- staging passed when required
- review threads resolved
- no failed required check
- reviewed head SHA still matches the merge candidate
- base freshness satisfies policy

R2 additionally requires a recorded owner approval and protected-decision reference. R3 cannot be merged autonomously.

## MERGED

After merge, record the merge SHA. Do not emit `DONE` from the merge event itself.

For a non-deploying change, completion requires evidence that the change has no production impact plus the required checks and review record.

For a deploying change, completion additionally requires the deployment release identifier, deployed SHA match, post-deploy smoke, health, authentication-boundary, Founder bootstrap, integrity verification, and a recorded production outcome.

## Failure after merge

A failed post-deploy verification blocks `DONE`.

When rollback is the safer recovery path, rollback takes priority over diagnosis. Preserve the failed release SHA, verification failures, rollback identifier, and outcome in the Engineering Ledger. A failed release must not be made invisible by rollback.

## Engineering Ledger completion

`DONE` is an append-only Ledger event. It requires traceable identities, Task Packet, risk, branch/base/head/merge SHAs, changed paths, selected/executed tests, test results, policy result, independent review, staging/release result, post-deploy result when applicable, and the production outcome.

Allowed completion outcomes are:

- `NO_PRODUCTION_IMPACT`
- `VERIFIED_HEALTHY`
- `ROLLED_BACK_VERIFIED`
- `QUARANTINED_AFTER_FAILURE`

Corrections never edit historical evidence; they create superseding Ledger entries.

## M0 status

All merge execution, auto-merge, post-merge continuation execution, Ledger writing/completion execution, Codex execution, reviewer execution, staging execution, rollback execution, and deployment remain disabled until the activation prerequisites are explicitly satisfied.
