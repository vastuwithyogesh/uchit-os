# Uchit OS Claim, Isolation and PR Provenance Runbook

This runbook defines the intended lifecycle after a deterministic READY selector identifies an eligible ticket. It is a contract only. Claim, branch/worktree creation, provenance writing and Codex dispatch remain disabled until autonomy activation prerequisites are satisfied.

## 1. Claim

A claim may be attempted only for a ticket already in `READY` with a valid Task Packet, completed dependencies, autonomous risk class R0/R1, and no active conflict-domain lock.

The claim must use compare-and-swap semantics against the expected ticket version and expected `READY` state. A stale version, second active lease, protected R2 ticket, R3 ticket, unresolved owner decision, quarantine, or active conflict domain rejects the claim.

The canonical lease duration comes from `.uchit/dispatcher.json`. Claim ownership expires with the lease and must never be inferred from an abandoned branch or agent process.

## 2. Isolation

After a valid claim, create exactly one implementation branch and one isolated worktree for that ticket. The branch must start from the claim's verified `main` SHA and follow:

`agent/UCHIT-<ticket-number>-<short-slug>`

A worktree must not share uncommitted state with another active task. Branches/worktrees cannot be silently reassigned between tickets. Active tasks in the same conflict domain must not proceed concurrently.

## 3. Implementation boundary

The implementer receives only the repository, governance files, Task Packet, claim identity, allowed READ/WRITE scope, acceptance criteria, required tests and protected-domain rules. The implementer cannot change risk downward, widen scope, bypass a gate, push to `main`, approve its own work, or merge its own PR.

## 4. Pull request provenance

The PR must bind the code change back to the exact ticket, Task Packet, claim, implementer, base SHA and reviewed head SHA. Changed paths, acceptance criteria, selected/executed tests, protected domains and unresolved questions must be visible.

Before review, the PR must prove Task Packet readiness, write-scope compliance, forbidden-path compliance, diff-based risk recalculation and that the implementer stopped at the PR boundary.

Before merge, independent review, Policy Gate, Release Gate, required domain verification, staging when applicable and owner approval for R2 must be recorded. Failed checks are evidence and must never be omitted.

## 5. Engineering Ledger

Claim, branch/worktree identity, PR provenance, review decisions, verification results and final production outcome are append-only Engineering Ledger events. Corrections supersede prior entries rather than erasing history. Secrets are never Ledger content.

## Current M0 state

- READY selection: dry-run only
- claim execution: disabled
- lease mutation: disabled
- branch/worktree creation: disabled
- PR provenance writing: disabled
- Engineering Ledger writing: disabled
- Codex dispatch: disabled
- repair execution: disabled
- auto-merge: disabled
- auto-deploy: disabled

GitHub `main` protection remains an external activation prerequisite and must report GO before autonomous execution is enabled.
