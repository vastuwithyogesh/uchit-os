# Founder pre-staging hardening runbook

Status: local/disposable verification only. This runbook does not authorize a migration, deployment, asset upload, provider connection, message, payment, invoice, or client delivery.

## Automated rehearsal

Run `pnpm test:founder-pre-staging`. The suite creates only temporary local SQLite files and an in-memory private-object store, then destroys both.

The SQLite rehearsal executes the actual statements declared in `db/migrations.ts` and verifies:

- clean v1 through v13 migration and repeated execution with exactly 13 markers;
- a populated synthetic v9 database upgraded through v10, v11, v12 and v13 without changing the snapshot, lead, or external-source records;
- required v12 tables, v13 owner-policy columns and indexes;
- unique organisation policy version, seven-calendar-day balance policy, and sixty-minute invoice SLA constraints;
- a deliberately interrupted v13 transaction leaves neither its marker nor partial policy columns, then succeeds by forward-fix;
- a v9 backup can be restored and upgraded, with `PRAGMA integrity_check` returning `ok`.

The private-object rehearsal uses synthetic bytes only. It verifies organisation/client-scoped keys, SHA-256 and byte identity, immutable new-version supersession, revocation, cross-scope denial, path-attack denial, orphan inventory/recovery, and final memory disposal. It has no D1, R2, network, or filesystem adapter.

## Disposable D1 backup and recovery procedure

1. Confirm the target is a newly created disposable database and record its resource identifier. Never infer a target from an environment variable.
2. Take a provider backup/export before applying migrations. Record its checksum and timestamp without including row payloads in logs.
3. Apply migrations through the normal authenticated migration path. Confirm markers 1–12 and the required tables/indexes.
4. Repeat the migration once; it must make no schema or data changes.
5. Compare synthetic row counts and snapshot hashes before and after.
6. On interruption, do not remove markers manually. Restore the disposable backup or apply a reviewed additive forward-fix, then repeat integrity and preservation checks.
7. Destroy the disposable database after evidence is captured.

No main-staging or production database is an acceptable rehearsal target.

## Private R2 inventory and recovery

Private object keys must be generated from allowlisted opaque scope segments and must not accept paths, URLs, `..`, control characters, or user filenames. Every version records organisation, client, category, version, size, and checksum. Replacement creates a new object; it never overwrites prior bytes.

Inventory compares private objects with current immutable metadata references:

- referenced active/superseded objects remain retained;
- revoked objects remain inaccessible through grants;
- unreferenced objects are marked orphaned and become unreadable;
- recovery requires exact organisation/client scope plus checksum verification;
- deletion is not automatic. Founder/legal retention policy remains permanent.

For a real isolated rehearsal, use only synthetic objects, capture counts/checksums, and destroy the bucket afterward. Never upload the five approved PDFs until a separate asset-ingestion approval.

## Combined workflow boundary

The synthetic contract runs lead/client identity through a submitted qualification, one prospective project, Founder-assigned Review Call, client confirmation, one idempotent fake Zoom binding, and reminder scheduling. It then reaches the first commercial drafting gate and stops because no active owner-approved service scope/deliverable template exists.

At that stop point there must be no proposal version, payment confirmation, invoice, Case ID, report, external message, or live provider call. Direct payment/case/report bypass remains rejected.

## Blocked policy matrix

| Dependency | Current state | Fail-closed effect | Yogesh action required |
|---|---|---|---|
| Existing Space master scope/deliverables | Deferred | Real proposal draft cannot start | Supply, name, approve, and activate an immutable template version |
| New Construction master scope/deliverables | Deferred | Real proposal draft cannot start | Supply, name, approve, and activate an immutable template version |
| P5 professional boundaries | Owner/legal input required | Review/approval/send blocked | Return approved exact text and activate its version |
| P13 acceptance declaration | Owner/legal input required | Review/approval/send/acceptance blocked | Return approved exact text/confirmation configuration and activate it |
| P14 cancellation/refund/delay policy | Owner/legal input required | Review/approval/send blocked | Return approved exact policy and activate it |
| Place-of-supply and service-timing policy | `REVIEW_REQUIRED_ACCOUNTANT` | Receipt Voucher/Tax Invoice issuance is unavailable; confirmed payment is preserved | Supply and activate an accountant-approved successor policy |
| Statutory logo and signature images | Not uploaded/active | Document readiness remains blocked | Upload privately, Founder-approve and activate exact Media Library versions |
| Statutory corrections/credit-debit policy | `BLOCKED_ACCOUNTANT_APPROVAL` | Issued bytes cannot be corrected in place | Supply accountant-approved correction policy |
| Five approved PDF bytes | Not ingested | New client-sendable asset grants unavailable | Owner-observed checksum validation and private ingestion approval |
| Zoom organisation connection | Not configured | Fake connector only; real meeting setup fails closed | Configure server-side OAuth/account and verify rotation without exposing secrets |
| Stage B remedial methodology | `BLOCKED_METHOD_INPUT` | No remedy logic or language | Supply and approve a separate remedial PRD/methodology |

## Zoom/provider readiness

- Create a server-side organisation connection; never store OAuth values in browser state or application logs.
- Verify owner-only configuration, token refresh/rotation, one unique meeting per booking idempotency key, reschedule retirement, and failure recovery.
- Readiness must expose booleans/status only, never access tokens, join links, or provider secrets.
- Use the fake connector until a separate real-provider activation approval.

WhatsApp and email remain manual compose. The only automated states are `PREPARED` and `OPENED`; the product must not claim sent, delivered, failed, or retried.

## Media Library activation

1. Confirm the local file is the owner-approved source and validate filename, byte size, page count, MIME type, and SHA-256.
2. Register immutable metadata and a private scoped object key as Yogesh only.
3. Upload bytes only after separate approval; confirm read-back checksum and direct-object denial.
4. Complete distinct Founder approval and activation transitions with CAS, idempotency, reason, and audit.
5. Confirm only `ACTIVE` plus `CLIENT_SENDABLE` versions can create a new grant.
6. Exercise expiry, rotation, revocation, supersession, and cross-client denial with synthetic links before real use.

## Statutory document activation

Do not issue a Receipt Voucher or Tax Invoice until the accountant approves place-of-supply and service-supply timing, and the owner activates private logo/signature assets. Confirm recipient billing fields, payment reconciliation, independent fiscal-year numbering, artifact retention, and one reservation/artifact per qualifying trigger. Never backdate. Tax Invoice correction/credit-debit behavior remains blocked pending accountant approval.

## UI/action audit

New controls must have a native link or real handler, a busy duplicate-submission guard, visible success/error state, and actionable reload/retry on 409/428/network failure. Public token forms preserve entered values on failure. Keyboard focus, reduced motion, minimum 44px targets, mobile sheet layout, and no horizontal page overflow are source-tested. No disabled UI is treated as the server gate.
