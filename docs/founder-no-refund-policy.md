# Founder no-refund policy v1.2

Status: implemented and verified locally; no deployment or deployed migration.

The exact owner-approved client copy is stored as a versioned `CANCELLATION_REFUND_DELAY` policy. Activation is restricted to the configured Yogesh Founder identity, uses CAS and idempotency, supersedes the prior active policy without editing it, and records an immutable audit event. New proposal reviews pin the policy ID, version and content hash; existing proposal bindings are never rewritten.

There is no normal refund, credit, voucher, fee-offset, payment-reversal or deletion action. A client cancellation request, a client-dependency delay and an Uchit reschedule are separate append-only project events. They record the reason and required revised estimate or replacement slot while leaving project, payment, proposal, case and report state unchanged. Any legally required correction remains `REVIEW_REQUIRED_ACCOUNTANT`.

D1 v15 defines only the additive `founder_commercial_policy_events` ledger and its organisation/client/project index. It has not been executed on staging or production.

The current main staging deployment does not contain the local `/media-library` route. The next approved main-staging publication must include authenticated owner-only GET smoke checks for `/api/session`, `/diagnostics` and `/media-library`, including its no-write empty state. No asset ingestion is part of that smoke.
