# Uchit OS Staging and Post-Deploy Smoke Runbook

## Status
CONTRACT-ONLY. No staging deployment, preview deployment, post-deploy smoke execution, production mutation, Codex dispatch, auto-merge or auto-deploy is enabled by this runbook.

## Objective
Before autonomous engineering can merge or deploy verified work, every candidate must be exercised in an isolated non-production environment using synthetic/seeded data and non-production bindings.

## Required staging sequence
1. Start from the PR's verified commit SHA.
2. Confirm Policy, Release, Repository Readiness, Reviewer/Dispatcher and Rollback gates are green.
3. Create or select an isolated preview environment for that PR only.
4. Use non-production D1/R2 bindings and synthetic/seeded data only.
5. Never copy production secrets or production client data into preview.
6. Run the required Golden Flow staging checks:
   - single-floor paid Case flow
   - multi-floor flow
   - INTERNAL_COMPLIMENTARY flow
   - negative security flow
7. Record environment identifier, candidate SHA, checks and results in the Engineering Ledger.
8. Destroy/archive the preview environment after the PR reaches a terminal state.

## Post-deploy smoke contract
After a future governed production deployment, record the deployed SHA and verify at minimum:
- application health is reachable;
- protected routes fail closed for unauthorised access;
- authorised Founder bootstrap succeeds;
- persistence/integrity signals show no severe regression;
- the release can be mapped to the prior known-good SHA for rollback.

## Failure behavior
A staging failure blocks merge eligibility and routes the task to repair or quarantine. A severe post-deploy production failure follows `docs/runbooks/release-rollback.md`: rollback first when safer, quarantine the failed SHA, create an incident record, then diagnose.

## Activation gate
Do not enable staging execution or post-deploy smoke execution until repository readiness is GO, `main` protection is active, independent reviewer execution is active, rollback is verified, and an isolated preview mechanism with non-production bindings has been implemented and tested.
