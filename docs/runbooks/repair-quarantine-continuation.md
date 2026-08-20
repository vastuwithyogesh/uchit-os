# Repair, Quarantine and Continuation Runbook

## Purpose

Define how Uchit OS autonomous engineering handles failed review or verification without weakening governance, looping forever, or freezing unrelated work.

This runbook is contract-only during M0. No repair, quarantine or queue mutation is enabled yet.

## Repair cycle

A repair cycle may begin only for a failure that is safe to repair within the original approved Task Packet, risk class, acceptance criteria and branch.

The canonical repair budget is `dispatcher.maxRepairAttempts` and is currently 3. The counter never resets inside the same task lifecycle.

A repair must:
- stay on the same ticket and Task Packet;
- preserve or escalate risk, never downgrade it;
- stay inside the original write scope;
- preserve acceptance criteria;
- preserve or strengthen tests;
- record the exact failure evidence and resulting diff;
- return through independent review and verification.

Product ambiguity, methodology ambiguity, protected writes, R2/R3 escalation, security uncertainty, stale claim identity or forbidden-scope contact are not autonomous repair cases.

## Quarantine

A task is quarantined when its repair budget is exhausted or when evidence shows that autonomous repair is unsafe or ambiguous.

Quarantine preserves:
- branch and commit history;
- failure and review evidence;
- Engineering Ledger history;
- risk and provenance;
- the unresolved decision required to continue.

Quarantine releases the active execution slot and any expired claim. If no implementation is continuing, its conflict-domain lock is released so unrelated work can proceed.

A quarantined task cannot merge, deploy, silently return to READY, or be assigned a fresh agent without a new governed decision.

## Continuation

`BLOCKED`, `FAILED`, `APPROVAL_REQUIRED`, `PRODUCT_REVIEW` and `QUARANTINED` are local task conditions, not automatic global shutdown conditions.

The controller must continue selecting unrelated eligible R0/R1 work whenever:
- there is no global stop condition;
- dependencies are satisfied;
- conflict-domain locks are free;
- the Task Packet quality gate passed;
- concurrency capacity exists.

No eligible work is a valid healthy IDLE state.

## Global stop

New claims stop only for system-wide safety conditions such as:
- SEV0 security event;
- global integrity failure;
- repository-governance failure;
- required checks being unavailable or bypassed;
- explicit autonomy kill switch.

A global stop does not authorize bypassing, deleting evidence or silently reducing verification.

## Activation boundary

Before any of these behaviors can mutate GitHub state, repository readiness must be GO, `main` protection and required checks must be enforced, independent reviewer execution must be active, Codex execution identity must be configured, and the relevant M0 activation decision must be recorded.
