# Lovable → Uchit activation checklist

This is a separate approval gate after the dormant adapter slice. It is not a
deployment instruction and it must not be treated as permission to connect
the Lovable database.

## Current state

- Adapter and D1 v9 schema definition are present in source only.
- Runtime activation is fail-closed; no Lovable event is persisted or sent.
- No backfill, webhook, polling cursor, outbox delivery, migration execution,
  or live data write has occurred.
- Client delivery remains disabled.

## Before a private synthetic staging rehearsal

1. Create separate preview, staging, published and production source bindings.
2. Set a different signing secret, source key, event ledger, outbox target and
   reconciliation cursor for each environment. Never reuse a binding.
3. Confirm a disposable D1/R2 backup and restore rehearsal with D1 v9 forward
   and rollback evidence; do not use production data.
4. Configure `LOVABLE_INTEGRATION_ENVIRONMENT` and
   `LOVABLE_INTEGRATION_SOURCE_KEY` only in the disposable target. Keep the
   activation flag off.
5. Send synthetic signed events only. Verify exact replay is a no-op,
   changed-body replay is rejected, cross-environment events are rejected,
   identity ambiguity enters Review Required, and no source actor becomes an
   Uchit owner.
6. Verify canonical projections contain only shared lead/pipeline fields and
   record/global revisions; no contact payload, payment, qualification,
   case, evaluation or report data is echoed back.
7. Verify lead activities/followups are labelled source history/candidates and
   never become Uchit audit events or authoritative due dates.

## Separate live-sync approval (not granted)

Yogesh/SUPER_ADMIN must explicitly approve, in order:

- D1 v9 migration execution on the intended environment.
- Source configuration and signed webhook activation for that environment.
- Reconciliation/backfill scope, retention/legal-hold handling and rollback.
- Outbox target and retry/dead-letter ownership.
- A live smoke test with a bounded synthetic event.

Until all approvals are recorded, `LOVABLE_INTEGRATION_ACTIVATION` must not be
set to `approved`. No staff or Admin integration controls are enabled.
