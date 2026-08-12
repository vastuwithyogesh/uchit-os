# Founder statutory documents v1.2

Status: implemented locally and fail-closed. D1 v13 is defined and rehearsed only; it has not been executed on a deployed database. No statutory document has been issued.

Proposal acceptance alone creates no statutory document. Exact acceptance plus a Founder-confirmed advance creates a GST Receipt Voucher task due within 60 minutes. It binds the accepted proposal/content hash, confirmed payment, immutable seven-day balance deadline, recipient billing version and commercial GST snapshot. A Proforma/payment summary is optional and uses its own independent number sequence.

The final Tax Invoice is created only for a fully confirmed paid engagement and requires an approved service-supply timestamp/timing policy. Missing `serviceSuppliedAt` at a statutory boundary is `REVIEW_REQUIRED`. `INTERNAL_COMPLIMENTARY` creates only an internal non-commercial record and cannot issue a Receipt Voucher or Tax Invoice.

The owner-approved identity records Uchit Vastu India, GSTIN `03AEVPH1562F1ZM`, the registered Ludhiana address, `info@uchitvastu.com`, `+91 91155 30756`, Yogesh K Hora / Proprietor, SAC `9983`, and “Professional Vastu Consultancy Services”. PAN, bank and UPI details are not projected.

The approved v1.3 service policy fixes place of supply to Ludhiana, Punjab, India. Once the versioned accountant approval is active, every client location—including outside India—uses CGST 9% + SGST 9%; IGST, export and zero-rating paths are unavailable for this service. Outside-India billing is labelled `Cash Sale`. Reverse charge is displayed exactly as “Tax payable under reverse charge: No”.

Recipient billing location, client location, property location and service location remain separate versioned values. Tax selection uses only the pinned `FIXED_LUDHIANA_PUNJAB` policy and never infers from those locations or Uchit’s organisation address. The legacy v13 `CLIENT_LOCATION_ONLY` column remains solely for backward-compatible lineage; v16 adds the superseding active policy, display, outside-India label and tax-treatment fields. Accountant activation must explicitly name each applicable Existing Space and/or New Construction service type; a policy approved for a different service remains unavailable.

The commercial refund policy is exactly `NO_REFUNDS`. There is no refund action or client promise in this module. P14 client-facing legal wording remains separately blocked until exact owner/legal copy is active. Normal Founder operations expose no credit-note or debit-note workflow; a legally required correction remains a fail-closed exception requiring a successor Yogesh/accountant-approved policy. Purchase-side debit notes and ordinary OPEX—including salary, tools/subscriptions and Meta advertising—remain outside the client invoice module.

Indian fiscal-year sequences are independent and reserved permanently: `UVI/{FY}/0001`, `UVI/RV/{FYCOMPACT}/001`, and `UVI/PI/{FYCOMPACT}/001`. Failed reservations are retained and never reused.

Issuance requires exact recipient billing data, confirmed payments, an active accountant-approved policy, and active Founder-approved private Media Library logo and signature-image versions. Each artifact pins both asset IDs/checksums. The deterministic PDF is written to private immutable storage; issued bytes and numbering cannot be edited. Corrections remain `BLOCKED_ACCOUNTANT_APPROVAL`.

The one-task readiness card exposes the next recovery action and no issue control while any accountant, billing, payment, asset or service-timing blocker remains.

## Operator readiness order

Use the readiness card in this order: **identity** → **recipient/billing** → **fixed Ludhiana place-of-supply policy** → **confirmed payment reconciliation** → **active Founder logo/signature assets** → **approved service-supply timing** → **issue or retry**. Each card is one task and shows one of `READY`, `REVIEW_REQUIRED`, `BLOCKED`, `OVERDUE` or `ISSUED` with the exact recovery action. `REVIEW_REQUIRED` and `BLOCKED` states have no issue button.

The receipt-voucher task is due within 60 minutes of the immutable confirmed-advance timestamp. The final Tax Invoice task is created only after confirmed full payment and remains fail-closed until the accountant-approved service-timing policy is active. Missing billing data, unresolved policy, unconfirmed payment, inactive assets or missing service timing must not be bypassed by retry. Retries are CAS/idempotent and cannot create a second number or artifact; issued bytes are immutable.

No real statutory document, payment mutation or client delivery is part of local/staging QA. Use synthetic fixtures only and keep private exception reasons, tokens, asset storage keys and signature bytes out of logs and client projections.

## Disposable migration readiness rehearsal

`scripts/rehearse-founder-statutory-v12.mjs` preserves the historical v1.1 rehearsal. It runs temporary SQLite v1→v12 and v9→v12 paths, then creates an in-memory synthetic accepted proposal, versioned billing profile, confirmed advance and confirmed balance. It verifies:

- proposal acceptance alone creates no statutory document;
- confirmed advance creates exactly one idempotent Receipt Voucher task with `dueAt = confirmedAt + 60 minutes`;
- the Receipt Voucher remains linked to the immutable seven-calendar-day balance deadline;
- confirmed full payment creates a separate Tax Invoice task in `REVIEW_REQUIRED`;
- no statutory policy is activated, no asset version is ingested, no sequence is reserved, no artifact bytes are generated, and no document is issued;
- the temporary SQLite workspace is removed and no deployed D1/R2 resource is touched.

`scripts/prepare-founder-statutory-v12-readiness.mjs` runs only from committed source. It archives exact tracked `HEAD` bytes and emits a checksum-pinned readiness manifest under `build/`. It does not deploy, migrate a hosted database, create an R2 object, connect a provider, activate issuance or enable delivery.

The historical v12 package remains checksum-pinned. `scripts/rehearse-founder-statutory-v13.mjs` applies the additive v13 policy fields only in a disposable SQLite workspace and verifies the exact v1.2 decisions without activating policy, assets or issuance.

Run the isolated issuance rehearsal only after Yogesh supplies the private active logo/signature versions and versioned accountant approvals for place of supply, service timing/statutory deadline, correction/credit-debit notes and overseas treatment. Until then the package decision is `NO_GO_PENDING_OWNER_AND_ACCOUNTANT_INPUTS`.
