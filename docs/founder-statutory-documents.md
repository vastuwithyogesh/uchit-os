# Founder statutory documents v1.1

Status: implemented locally and fail-closed. D1 v12 is defined and rehearsed only; it has not been executed on a deployed database. No statutory document has been issued.

Proposal acceptance alone creates no statutory document. Exact acceptance plus a Founder-confirmed advance creates a GST Receipt Voucher task due within 60 minutes. It binds the accepted proposal/content hash, confirmed payment, immutable seven-day balance deadline, recipient billing version and commercial GST snapshot. A Proforma/payment summary is optional and uses its own independent number sequence.

The final Tax Invoice is created only for a fully confirmed paid engagement and requires an approved service-supply timestamp/timing policy. Missing `serviceSuppliedAt` at a statutory boundary is `REVIEW_REQUIRED`. `INTERNAL_COMPLIMENTARY` creates only an internal non-commercial record and cannot issue a Receipt Voucher or Tax Invoice.

The owner-approved identity records Uchit Vastu India, GSTIN `03AEVPH1562F1ZM`, the registered Ludhiana address, `info@uchitvastu.com`, `+91 91155 30756`, Yogesh K Hora / Proprietor, SAC `9983`, and “Professional Vastu Consultancy Services”. PAN, bank and UPI details are not projected.

Place of supply is configured as client location but remains `REVIEW_REQUIRED_ACCOUNTANT` until a versioned accountant approval is supplied. Only an active approved version permits Punjab CGST 9% + SGST 9% or other-India IGST 18%. Overseas treatment remains Review Required. Reverse charge is displayed exactly as “Tax payable under reverse charge: No”.

Indian fiscal-year sequences are independent and reserved permanently: `UVI/{FY}/0001`, `UVI/RV/{FYCOMPACT}/001`, and `UVI/PI/{FYCOMPACT}/001`. Failed reservations are retained and never reused.

Issuance requires exact recipient billing data, confirmed payments, an active accountant-approved policy, and active Founder-approved private Media Library logo and signature-image versions. Each artifact pins both asset IDs/checksums. The deterministic PDF is written to private immutable storage; issued bytes and numbering cannot be edited. Corrections remain `BLOCKED_ACCOUNTANT_APPROVAL`.

The one-task readiness card exposes the next recovery action and no issue control while any accountant, billing, payment, asset, service-timing or overseas-treatment blocker remains.

## Disposable v12 readiness rehearsal

`scripts/rehearse-founder-statutory-v12.mjs` is the only currently authorised statutory rehearsal. It runs the existing temporary SQLite v1→v12 and v9→v12 paths, then creates an in-memory synthetic accepted proposal, versioned billing profile, confirmed advance and confirmed balance. It verifies:

- proposal acceptance alone creates no statutory document;
- confirmed advance creates exactly one idempotent Receipt Voucher task with `dueAt = confirmedAt + 60 minutes`;
- the Receipt Voucher remains linked to the immutable seven-calendar-day balance deadline;
- confirmed full payment creates a separate Tax Invoice task in `REVIEW_REQUIRED`;
- no statutory policy is activated, no asset version is ingested, no sequence is reserved, no artifact bytes are generated, and no document is issued;
- the temporary SQLite workspace is removed and no deployed D1/R2 resource is touched.

`scripts/prepare-founder-statutory-v12-readiness.mjs` runs only from committed source. It archives exact tracked `HEAD` bytes and emits a checksum-pinned readiness manifest under `build/`. It does not deploy, migrate a hosted database, create an R2 object, connect a provider, activate issuance or enable delivery.

Run the isolated issuance rehearsal only after Yogesh supplies the private active logo/signature versions and versioned accountant approvals for place of supply, service timing/statutory deadline, correction/credit-debit notes and overseas treatment. Until then the package decision is `NO_GO_PENDING_OWNER_AND_ACCOUNTANT_INPUTS`.
