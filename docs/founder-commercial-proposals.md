# Founder Commercial Proposals — local implementation contract

Status: implemented locally, not deployed. D1 v16 is defined but has not been executed in any environment.

## Founder flow

The commercial proposal workspace uses six exclusive pages: Client & Project; Requirements & Scope; Deliverables & Interactions; Timeline & Commercials; Policies & Next Steps; Preview, Review & Approve. Canonical CRM, qualification and prospective-project values are snapshotted instead of re-entered. Scope and deliverables come only from an explicitly activated service template; brochure wording is never parsed into commercial truth.

Money is stored as integer paise. The default reference fee is ₹51,000, the reference advance is ₹11,000 and the default GST rate is 18%, but the fee is not a hard minimum. Every deviation and non-standard classification uses private Founder-only reasons. Internal complimentary work requires zero fee, zero GST and zero total.

## Immutable lifecycle and fail-closed copy

The lifecycle is DRAFT → SUPER_ADMIN_REVIEWED → SUPER_ADMIN_APPROVED → SENT, followed by ACCEPTED, CHANGES_REQUESTED, DECLINED or EXPIRED. Review and approval are distinct records even when Yogesh performs both. Approved or sent content is never edited; a change creates a successor draft.

No P5 professional-boundary wording, P13 acceptance declaration or statutory invoice configuration is seeded. The separate review document is advisory and is not imported. P14 v1.2 is now the exact active Founder policy contract; proposal versions pin its policy ID, version and content hash. Review, approval, send and acceptance remain blocked until P5 and P13 also have explicit active owner-approved versions. Invoice issuance remains `REVIEW_REQUIRED` until statutory configuration is active.

The owner’s operational commercial policy is `NO_REFUNDS`; no refund, credit, voucher, fee-offset, payment-reversal or deletion workflow is exposed. Client cancellation, client-dependency delay and Uchit reschedule requests are append-only events that preserve payment and workflow state. Statutory correction remains a separately accountant-gated exception.

## P17 superseded statutory-document SLA

Acceptance alone and payment-proof upload alone create no statutory document. Exact Founder-confirmed advance starts a GST Receipt Voucher clock and persists `dueAt = confirmedAt + 60 minutes`. The final Tax Invoice is preferred after confirmed full payment and remains blocked without an accountant-approved service-supply timing policy and `serviceSuppliedAt`. Tests use synthetic policies/assets and an in-memory artifact store; no real document is issued.

## P18 balance deadline

The accepted commercial version owns one balance-deadline record. Exact confirmed advance persists `dueAt = advanceConfirmedAt + 7 × 24 hours` using the server timestamp. Only confirmed GST-inclusive payments reduce the balance. At the exact deadline an unpaid balance becomes `OVERDUE`. Only the configured Yogesh owner may extend or waive with CAS, idempotency, immutable prior/new values and a private reason. None of these states bypass case, evidence, methodology, evaluation, payment, report approval or delivery gates.

## Security and privacy

All Founder actions derive organisation, actor and Founder identity server-side and use allowlisted payloads, record/global CAS and idempotency. Client links use hashed, scoped, expiring tokens and private no-store responses. Client projections exclude reference prices, engagement classification and private exception reasons. Acceptance records exact version and artifact hashes and never creates a Case ID or payment confirmation.
