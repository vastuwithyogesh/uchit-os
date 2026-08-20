# Codex Dispatch and Independent Review Runbook

## Status

M0 contract-only. No Codex execution, reviewer execution, claim mutation, branch creation, provenance writing, auto-merge, staging execution, or deployment is enabled by this document.

## Dispatch Preconditions

A future dispatch controller may create a Codex run only when all of the following are true:

1. Repository Readiness is GO.
2. `main` protections and required checks are enforced by GitHub.
3. A governed ticket is already `READY`.
4. A complete Task Packet passed its quality gate.
5. The task holds a current, unexpired claim lease.
6. The isolated branch/worktree identity matches the claim.
7. Risk is R0 or R1. R2 requires the protected owner path and cannot use the autonomous envelope. R3 is prohibited.
8. Conflict domains are free.
9. The dispatch envelope includes exact read/write/protected/forbidden scope, acceptance criteria, tests, stop conditions, authority references and a governance snapshot.
10. Codex execution credentials are configured through an approved external secret mechanism and are never committed to the repository.

## Implementer Boundary

The Codex implementer receives the Task Packet and dispatch envelope, implements only inside the allowed scope, runs the required implementation-side tests, records provenance, opens a PR and stops. It cannot approve or merge its own PR, alter ticket risk downward, invent methodology/product truth, weaken tests, bypass protected writes, or deploy production.

## Mandatory Stop Conditions

The implementer stops and escalates when product/methodology authority is ambiguous, risk rises to R2/R3, required writes exceed scope, protected writes lack approval, forbidden paths are needed, the claim is stale/lost, branch identity drifts, required verification is unavailable, or a security/authorization invariant is uncertain.

## Independent Review

Review execution must use an identity distinct from the implementer. The reviewer receives the PR diff plus Task Packet, claim/provenance, test results, risk classification and governance snapshot. It may return only:

- `APPROVE`
- `REQUEST_CHANGES`
- `ESCALATE_RISK`
- `PRODUCT_AMBIGUITY`

The reviewer cannot modify the implementation as part of review, approve its own work, downgrade risk, weaken tests, or invent product/methodology truth.

## Review Decision Rules

`APPROVE` requires satisfied acceptance criteria, scope discipline, adequate passing tests, preserved architecture/security/authorization boundaries, no unapproved protected writes, and no methodology/financial/commercial drift.

`REQUEST_CHANGES` is required for incomplete acceptance, weak/missing tests, scope expansion, architecture/security regression, or provenance mismatch.

`ESCALATE_RISK` is required if the diff touches undeclared protected domains, affects auth/payments/methodology/database/secrets/deployment/AI permissions, or the original risk appears understated.

`PRODUCT_AMBIGUITY` is required if approved sources do not resolve legacy/V1 authority or methodology/product behavior.

## Activation Rule

These contracts may move from contract-only to executable only after repository protection is live, Codex credentials are configured safely, an independent reviewer provider and identity are configured, reviewer output is exposed as a required GitHub check, rollback and staging/smoke gates are active, and the owner explicitly approves the R2 activation change.
