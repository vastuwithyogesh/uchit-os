# Lovable → Uchit integration contract (dormant)

This document records the approved contract boundary for the future Lovable integration. It is a design contract only: no Lovable connection, backfill, webhook activation or deployment is enabled by this file.

## Current-state authority

Uchit is the canonical current-state backend for clients and pipeline. Lovable is an origin/event source for opt-ins, contact/lead metadata, attribution and source-status events. Both panels must use the canonical Uchit read and transition APIs. Lovable-origin events cannot overwrite Uchit qualification, commercial, payment, case, evaluation, report, approval, methodology or audit decisions.

## Founder integration operations

- Founder Edition integration operations are Yogesh/SUPER_ADMIN-only: source configuration, delivery activation or pause, reconciliation, retry/dead-letter handling, conflict resolution and backfill.
- Lovable mutations use one server-side integration service identity. `sourceActorId` may be retained as source metadata for traceability, but it never becomes an Uchit actor, owner or assignee.
- Owner display is always derived from Uchit’s authenticated owner/policy context. No source-provided `assigned_to`, name or email can set or impersonate an Uchit owner.
- Founder Edition exposes no Admin, setter, consultant or staff integration controls. Team Edition structures remain dormant and configurable for a later approved phase.

## Separate-system transport boundary

- While Lovable and Uchit remain separate, Lovable sends only signed events to the Uchit service wrapper. Uchit validates the source binding, replay key, payload and concurrency tokens before invoking canonical mutations.
- Uchit publishes only signed canonical projections back to Lovable through the service wrapper. The projection contains shared lead/contact/pipeline state and revision metadata, never Uchit-only decisions, private storage references or secrets.
- Direct canonical API access is permitted only after both systems are co-hosted, Lovable direct database writes are removed, environment separation is verified and the change is explicitly approved.
- No live wrapper activation, outbound delivery or co-hosted access is enabled by this contract.

## Permanent retention and legal hold

- Clients, leads, cases, payments, reports, audit history, external source links, integration events and conflict history are retained permanently.
- No automatic deletion, expiry worker, cascade delete or hard-delete endpoint may be added for these records.
- A Lovable deletion signal is recorded as a source tombstone/revocation event. It does not delete or replace the Uchit Client ID and does not remove case, payment, evaluation or report history.
- Yogesh personally, as the organisation owner, is the sole legal-hold authority. Other `SUPER_ADMIN`-labelled accounts, Admins and staff must not create, clear or alter a legal hold. A legal hold must be append-only, organisation-scoped and audited with actor, reason, timestamp and affected entity scope.
- Privacy handling may redact restricted or public projections, search results and future exports where required. Internal immutable audit/hash records remain retained and must not contain raw payloads or secrets.
- Any future erasure or redaction action must be an explicit, authorised, versioned policy operation. It must never be inferred from `deleted_at`, a source merge, an integration retry or an untrusted client request.

## Retention-safe integration states

The integration ledger remains append-only. Events and conflicts may move through their defined review/delivery states, but historical rows are never removed. External links may move to `REVOKED`; this preserves the source relationship and its audit history. Outbox rows may move to `DEAD_LETTER`; they remain available for inspection and controlled retry.

## Privacy boundaries

Raw webhook bodies, secrets, source credentials, contact values and numerology-sensitive fields are not written to audit logs. Ledgers retain bounded metadata, source identifiers and hashes needed for replay, reconciliation and proof. Public or restricted projections must omit private source references and internal storage details.

## Initial source-history backfill

The first approved backfill includes Lovable `lead_activities` and `lead_followups`.

- `lead_activities` are imported as clearly labelled `sourceSystem=LOVABLE` history with the source record ID, source timestamp, activity type and bounded source content where privacy validation permits. They are not Uchit audit events, actor identity, qualification decisions or ownership evidence.
- `lead_followups` are imported as source-history records and next-action candidates. Their original title, notes, source ID and due timestamp remain source metadata; they do not set the canonical owner or due date. A Founder action must validate and accept any operational next action through the canonical `client-pipeline-transition` API.
- Both record types use source-record idempotency and preserve permanent retention. Replays do not duplicate history or candidates, and changed-body reuse of an event ID is rejected.
- Source history must be linked to the resolved permanent Client ID or remain `REVIEW_REQUIRED` when identity reconciliation is ambiguous. It must never create a case, payment, report, approval or methodology decision.

## Required negative paths

The implementation must fail closed when a caller attempts to hard-delete a retained record, clear a legal hold without Yogesh's personal authority, rewrite an audit event, use a source tombstone to replace a Client ID, or expose retained private values in a projection.

Integration remains disabled until the remaining contract decisions are approved and the adapter is implemented and tested.
