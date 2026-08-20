# Uchit OS Release Policy

A release candidate must satisfy all required gates for its risk class: independent review, CI, risk evaluation, staging verification, required Golden flows, migration safety and rollback readiness.

## Production
- main must always represent a verified production-capable state.
- no direct agent push to main.
- prefer squash merge: one ticket -> one auditable main commit.
- production deployment runs smoke/health verification.
- severe post-deploy failure triggers rollback to the previous known-good release before further diagnosis when safe.
- failed release SHA is quarantined until repaired and reverified.
