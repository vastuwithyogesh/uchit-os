# Uchit OS Autonomous Task Lifecycle

This runbook defines the governed task lifecycle. It does not enable autonomous execution.

## Canonical lifecycle

BACKLOG -> READY -> CLAIMED -> BUILDING -> REVIEW -> VERIFYING -> STAGING -> MERGE_READY -> MERGED -> DEPLOY_VERIFY -> DONE

Alternate states:
- BLOCKED
- FAILED
- REPAIRING
- APPROVAL_REQUIRED
- QUARANTINED
- PRODUCT_REVIEW

## READY quality gate
A ticket may be READY only when:
- the problem is concrete;
- the desired outcome is testable;
- acceptance criteria are explicit;
- dependencies are explicit and satisfied when required;
- risk is assigned;
- READ / WRITE / PROTECTED WRITE / FORBIDDEN scopes are bounded;
- required tests are defined;
- no product or methodology ambiguity remains;
- no unapproved product expansion is hidden in the ticket.

The READY selector cannot promote a ticket into READY. It only chooses among tickets already governed into READY.

## Deterministic selection
The selector considers only eligible READY work and applies, in order:
1. priority;
2. severity score;
3. dependency-unlock score;
4. creation time;
5. ticket ID.

R2 work is protected and is not autonomously selected. R3 work is prohibited. Active conflict domains and concurrency limits may make IDLE the correct result.

## Task Packet
Before implementation, a Task Packet must bind:
- ticket and purpose;
- authority references;
- risk and priority;
- dependencies and conflict domains;
- READ / WRITE / PROTECTED WRITE / FORBIDDEN scopes;
- acceptance criteria;
- required tests;
- definition of done.

## Engineering Ledger
Every autonomous lifecycle must eventually be reconstructable from durable GitHub evidence. The ledger records identity, risk, state transitions, branch/SHAs, changed paths, tests, reviewer decisions, staging/release evidence, approvals, merge/deployment outcomes, rollback and quarantine events.

Ledger history is append-only. Corrections supersede previous entries; they do not erase history. Secrets must never be written to the ledger.

## Current M0 status
- Engineering Ledger writer: CONTRACT_ONLY
- Task Packet generator: DISABLED
- READY selector: DRY_RUN_ONLY
- task claim: DISABLED
- Codex dispatch: DISABLED
- automated repair: DISABLED
- auto-merge: DISABLED
- auto-deploy: DISABLED

These controls may activate only after repository protection, independent reviewer execution, staging execution, rollback verification and the applicable autonomy approval gates are satisfied.
