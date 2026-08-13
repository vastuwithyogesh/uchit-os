# Uchit OS — Current Architecture Snapshot

Snapshot date: 2026-08-13
Source inspected: local working tree at `7565904` plus the current uncommitted local audit fixes.
This document describes the implementation as found. It does not propose a redesign.

## Runtime and persistence

- Full-stack React 19 application built with vinext/Vite and TypeScript.
- Production-shaped persistence uses Cloudflare D1 plus private object storage bindings. Local demo and walkthrough modes use the in-memory application store and local protected-file adapter.
- `AppState` in `lib/store.ts` is the canonical aggregate used by the domain services, UI projections, deterministic fixtures and the persisted `app_state_snapshot` record.
- D1 migrations are additive and versioned in `db/migrations.ts`. The local source currently declares versions 1–16. Version 14 adds the Zoom host/OAuth lineage, version 15 adds append-only no-refund operational events, and version 16 pins the approved fixed Ludhiana/Cash Sale/CGST+SGST policy fields.
- Business mutations use server-derived actor and organisation context, expected record/global revisions, idempotency keys and immutable audit/timeline records. Protected file and final-PDF bytes are stored separately from the application snapshot.

## Implemented operator modules

- Founder overview and server-derived Continue routing.
- CRM leads table and lead profile drawer, canonical profile editing, pipeline navigation, manual WhatsApp/Gmail/default-email preparation and PREPARED/OPENED records.
- Safe lead CSV preview/import contract and source-profile preservation.
- Client and case pipeline, prospective projects, paid or authorised complimentary case handoff, floor workspaces and multi-case/multi-floor lineage.
- Persistent permission-aware case/floor context used by Founder routes; primary workspaces reject missing or mismatched explicit context. The selector uses a narrow server projection, My/All permitted/Needs action/Recent views, per-user remembered history and server revalidation.
- Founder sequential workflow Steps 01–17 with a shared scorecard, common context header and action footer.
- Client intake, protected project/floor file handling, plan/orientation/spatial evidence, manual utility sheet review and Founder approval.
- Utility/Shakti evaluation snapshots, Stage A report workflow, Site Analysis, Post-Site Findings, balance evidence, report assembly, Founder approval and protected PDF handling.
- Media Library data model, private asset ingestion lifecycle, secure grants and owner-only route/UI.
- Versioned qualification definitions/invitations/responses, prospective-project creation, Founder-assigned booking and public token routes.
- Commercial proposal domain and six-step editor, immutable approvals/artifacts/grants/responses, classification/GST/advance/balance policies and complimentary handoff.
- Statutory-document readiness domain, FY sequences, receipt-voucher/final-invoice task states, billing profiles, tax-policy snapshots and deterministic document renderer.
- Organisation foundation, memberships, access requests, workflow/approval policies, audit explorer, diagnostics, settings and integrity views.

## Intentionally pending or inactive

- Stage B remains `BLOCKED_METHOD_INPUT` in the Founder journey. No active approved methodology is inferred by the walkthrough or runtime UI.
- Client report delivery remains disabled by the Founder workflow policy.
- WhatsApp and email are manual compose surfaces only; provider-neutral automatic delivery remains dormant.
- Zoom Server-to-Server connector code and readiness checks exist, but live activation depends on configured secrets and a separately authorised bounded smoke.
- Lovable inbound/reconciliation/outbox contracts exist, but activation/backfill is dormant.
- Statutory correction/credit/debit-note exceptions remain accountant-policy gated. No normal refund/credit/voucher path exists.
- Real statutory issuance, real payment mutation, provider calls and production data operations are not active in the local walkthrough.

## D1 schema

The declared migration schema contains these table groups:

- Core state and identity: `schema_migrations`, `app_state_snapshot`, `organisations`, `organisation_memberships`, `workflow_policies`, `approval_policies`, `user_access_requests`, `ownership_transfer_requests`, `staff_role_assignments`, `staff_role_assignment_audit`.
- Audit and integration: `audit_events`, `external_sources`, `external_client_links`, `integration_events`, `integration_outbox`, `integration_conflicts`, `integration_cursors`, `optin_leads`, `inbound_optin_events`.
- Protected evidence and reports: `case_file_assets`, `final_pdf_artifacts`, `final_pdf_artifact_events`.
- CRM communications and qualification: `lead_profile_versions`, `communication_preparations`, `secure_access_grants`, `qualification_form_definitions`, `qualification_invitations`, `qualification_response_versions`, `prospective_projects`, `founder_review_bookings`, `zoom_meeting_bindings`, `founder_reminder_tasks`.
- Media Library: `media_assets`, `media_asset_versions`.
- Commercial proposal: `founder_proposal_template_versions`, `founder_proposal_versions`, `founder_proposal_approvals`, `founder_proposal_artifacts`, `founder_proposal_grants`, `founder_proposal_responses`, `founder_commercial_policy_versions`, `founder_commercial_audit_events`, `founder_commercial_policy_events`, `founder_commercial_payment_confirmations`, `founder_balance_deadlines`, `founder_commercial_invoices`.
- Statutory documents: `founder_statutory_policy_versions`, `founder_billing_profile_versions`, `founder_statutory_sequence_reservations`, `founder_statutory_documents`.

The richer case, floor, evaluation, Site, report and delivery records currently live inside the versioned `app_state_snapshot` aggregate; dedicated D1 tables above hold security-sensitive, independently queried or independently immutable records.

## HTTP API surface

- Session and state: `/api/session`, `/api/bootstrap`, `/api/state`, `/api/diagnostics`, `/api/integrity`, `/api/timeline`, `/api/audit`, `/api/migrations/status`.
- Canonical mutations: `/api/actions` dispatches allowlisted domain actions and enforces actor, organisation, CAS, idempotency and rollback-on-failure contracts.
- Files and artifacts: `/api/case-files`, `/api/case-files/[assetId]`, `/api/payment-proofs`, `/api/payment-proofs/files/[fileName]`, `/api/chart-assets`, `/api/reports/[reportId]/pdf`, `/api/reports/[reportId]/print`.
- CRM and ingestion: `/api/optin-leads`, `/api/optin-leads/events`, `/api/integrations/lovable/events`, `/api/integrations/lovable/reconcile`.
- Founder foundation and configuration: `/api/foundation/access`, `/api/foundation/policy`, `/api/staff-roles`, `/api/settings`, `/api/settings/test`, `/api/utility/master`, `/api/media-library`.
- Founder navigation: `/api/founder/cases` returns only permission-scoped selector projections; `/founder/continue` requires explicit Case/Floor context and resolves the first actionable step server-side.
- Narrow public-token APIs: `/api/public/media/[token]`, `/api/public/qualification/[token]`, `/api/public/booking/[token]`, `/api/public/proposals/[token]`, `/api/public/proposals/[token]/pdf`.
- Client-safe APIs: `/api/client/portal`, `/api/client/reports/[reportId]`.
- `/api/seed` is guarded for explicit local demo/walkthrough use and constructs disposable canonical synthetic state.

## UI structure and reusable components

- `AppShell`, session provider, sidebar/mobile navigation and access guards supply the shared authenticated shell.
- `FounderFlowHome`, `FounderFlowPage`, `FounderStepWorkspace`, `FounderStepCard` and the scorecard/flow helpers supply the sequential 17-step experience.
- `FounderCaseSelector` supplies explicit authorised case/floor context; workspaces receive exact case/floor IDs instead of selecting the first record.
- Primary workspaces are reusable focused components: `FounderCaseSetupStep`, `ClientIntakeForm`, `SpatialWorkspace`, `FilesDrawingsConsole`, `EvaluationConsole`, `SiteAnalysisConsole`, `PaymentProofConsole`, `FounderReportStep` and the report/delivery consoles.
- Shared helpers cover request headers, session recovery, field formatting, server error recovery, protected uploads, action headers, deterministic hashing, owner/organisation scope and immutable audit construction.
- The local walkthrough adapter is server-only. It builds JSON-safe projections and canonical synthetic state; client bundles are guarded from importing `tests/fixtures`, Node crypto, filesystem or server-only fixture builders.
- The disposable local role switch writes a Strict local-demo-only role cookie and sends the matching demo request header through the normal actor resolver. Hosted identity behavior is not changed by that harness.

## Report pipeline

1. Exact case, project, floor, plan, orientation, marked evidence, manual utility sheet and evaluation lineage is resolved.
2. `report-artifacts.ts` composes a client-safe deterministic report payload and hashes the source snapshot.
3. Stage A checkpoints record Founder review, approval and release lineage; regeneration blockers fail closed when upstream evidence changes.
4. `report-html.ts` renders the versioned report HTML and approved evidence composition.
5. `final-pdf.server.ts` generates, verifies and stores the protected PDF artifact with source hash, artifact hash, renderer/page configuration and embedded evidence checksums.
6. Print/export routes recheck role, payment, approval, integrity and artifact gates. Client delivery is a separate disabled gate.

## Integration points

- Cloudflare D1: migration registry, application snapshot, organisation/audit, integration, communications, Media Library, proposal and statutory records.
- Private object storage: protected case evidence, Media Library versions, proposal/statutory artifacts and protected final reports; public object URLs are not part of the contract.
- Manual WhatsApp: click-to-WhatsApp prefilled compose.
- Manual email: Gmail compose URL and `mailto:` fallback.
- Zoom: Server-to-Server OAuth connector interface bound to `iyogesh2020@gmail.com`; dormant until explicit activation/smoke authority.
- Lovable: signed inbound event, reconcile and provider-neutral outbox contracts; dormant.
- Public client access: unguessable hashed, scoped and expiring media/qualification/booking/proposal tokens with narrow projections.

## Current local verification state

- Latest focused regression command: 46 tests passing across case projection, Founder flow, case selector, public-token failure, payment/report containment, Open new case, exact-context intake and the pre-staging UI audit.
- Observed browser checks cover Lead/Profile/Open Case, explicit case/floor selection, Steps 01–17 route rendering, Step 03 validation, Step 04 upload/record/lock/regeneration, the intentional Stage B block, CRM/pipeline responsive targets, role denial/recovery and guarded public-token failures.
- Desktop and 390×844 mobile route sweeps showed no horizontal overflow or application console error on the audited routes. The browser-control backend did not provide reliable OS-level Tab traversal, so keyboard runtime evidence is limited to focus/error interactions plus source/accessibility contracts.
- `pnpm test:release` is green on the latest inspected shared tree. Its main suite reports 540 tests and the command also runs the focused Founder, security, migration, persistence, integration, report and UI suites, `tsc --noEmit`, and a successful vinext production build.
- The Stage B client refactor now delegates placement collision behavior and implementation-sheet rendering to `components/remediation-workspace-primitives.tsx`; stale duplicate code and stale source-contract locations were mechanically reconciled. Focused Stage B geometry, containment, concurrency, report-manifest and UI contracts pass. This does not make Stage B active: the Founder walkthrough remains `BLOCKED_METHOD_INPUT`, and no remedy methodology was added or inferred.
- Stable local browser handoff: `http://localhost:3020/founder/01?caseId=b297c02c-8e1b-4fa3-81f2-652f2a2786c2&floorId=6da4c48d-9e69-428e-a477-db43de4ad173`. It opens the disposable TEST_ONLY complimentary case at Step 01 with exact Case/Floor context and no browser console error.
