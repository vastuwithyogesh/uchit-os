# M0 Activation Readiness and Buttery-Smooth Certification

## Purpose
This runbook defines the final M0 decision boundary. It separates a safe control plane from permission to execute, and separates permission to run a controlled pilot from final Buttery-Smooth certification.

## Stage 1 — Control-plane contract complete
The repository must contain the governed contracts for policy, task packets, selection, claims, isolation, provenance, Codex dispatch, independent review, repair, quarantine, continuation, staging, rollback, merge readiness, post-merge verification and Engineering Ledger completion.

This stage does **not** authorize execution.

## Stage 2 — Activation Ready
Activation readiness is R2 and requires explicit owner approval. Before controlled execution can turn on, all of the following must be independently verifiable:

- repository is private;
- `main` is protected;
- direct pushes, force pushes and branch deletion are blocked;
- every required status-check context is enforced on `main`;
- Codex credential binding is configured and verified without exposing credentials;
- independent reviewer provider and reviewer identity are configured and distinct from the implementer;
- claim mutation and isolated branch/worktree adapters are verified;
- provenance and Engineering Ledger writers are verified;
- bounded repair, quarantine and continuation adapters are verified;
- isolated staging with non-production bindings is verified;
- Golden Flow staging harness is verified;
- rollback adapter and rollback rehearsal are verified;
- post-deploy smoke verification is verified;
- merge/post-merge completion adapter is verified.

Activation must be atomic. A failed prerequisite cannot be waived. R3 remains forbidden. R2 remains owner-gated. Auto-deploy remains off during the M0 controlled pilot.

## Stage 3 — Controlled pilot
The controlled pilot consists of **10 real Uchit R0/R1 tickets**. Each ticket must traverse the governed lifecycle from READY through claim, isolated implementation, independent review, verification, staging when required, merge readiness, merge, outcome verification and DONE.

A merge is never evidence of completion by itself.

## Stage 4 — Buttery-Smooth Certification
Final certification requires machine-readable evidence at:

`.uchit/evidence/m0-pilot-certification.json`

The evidence must prove at least 10 unique real Uchit tickets completed correctly and include per-ticket evidence for Ledger completion, independent review, required checks and verified DONE state.

The zero-tolerance metrics must all equal zero:

- owner prompt copying;
- owner manual task assignment;
- owner manual test execution;
- direct-main changes;
- unreviewed merges;
- skipped required failures;
- governance bypasses;
- silent risk downgrades;
- autonomous R2 transitions;
- autonomous R3 execution;
- production regressions attributable to autonomous merge.

The evidence must also prove that blocked work does not stall unrelated work, repair is bounded, exhausted repair quarantines, quarantine preserves evidence, healthy IDLE works, rollback is available for deploying changes, and the Engineering Ledger is fully traceable.

Final certification requires an explicit owner certification approval reference. The implementer cannot self-certify.

## Current expected state
Until all activation prerequisites are verified, the certification gate must report **Activation readiness: NO-GO** while still passing as an informational diagnostic because execution is disabled.

If autonomous execution is enabled while readiness is NO-GO, the gate must fail CI.
