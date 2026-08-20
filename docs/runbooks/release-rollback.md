# Uchit OS Release Rollback Runbook

This runbook defines the required recovery order. It does not authorize production mutation by itself.

## Trigger
Use the rollback path for a severe post-deploy regression, critical Golden Flow failure, security regression, or release health failure when rollback is the safer recovery action.

## Required order
1. Identify the deployed release SHA/version and the previous known-good release.
2. Freeze further deployment of the failed SHA.
3. Roll back to the previous known-good release through the approved deployment adapter.
4. Run required production smoke/health verification.
5. Mark the failed release SHA as quarantined.
6. Create or update the incident ticket with evidence and impact.
7. Diagnose root cause after service safety is restored, where rollback is safe.
8. Add regression coverage before any repaired release is promoted again.

## Prohibitions
- Do not improvise destructive database reversal.
- Do not erase audit/history to recover a release.
- Do not expose or commit production secrets.
- Do not bypass authentication, authorization, payment, methodology, or approval gates as a recovery shortcut.
- Do not reactivate a failed SHA without full re-verification.

## Activation boundary
Automatic rollback remains disabled until repository readiness is GO, the deployment adapter is explicitly identified, a known-good release identifier can be resolved deterministically, smoke verification is active, and a rollback rehearsal has passed.
