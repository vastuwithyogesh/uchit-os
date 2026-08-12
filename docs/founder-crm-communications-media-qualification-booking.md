# Founder CRM communications, media, qualification and booking

Directive: `FE-CRM-COMMS-MEDIA-QUAL-BOOKING/v1.0`.

This local-only slice adds the protected contracts for Founder lead-profile edits, manual communication preparation, immutable organisation media, secure qualification forms, prospective projects, Founder-assigned Review Calls, fake Zoom setup and manual reminder tasks.

## Operator flow

1. Open a lead in `/crm`. The profile is read-only until **Edit profile** is selected. Only the canonical name, email, phone/WhatsApp, city, country, IANA time zone and primary service interest can change. A private reason is mandatory.
2. Use **Send VSL**, the adjacent Existing Space/New Construction brochure choices, or **Send qualification form**. Both WhatsApp and email are reviewed in one sheet. Uchit records only `PREPARED` and `OPENED`; Yogesh sends manually from his logged-in apps.
3. Register exact approved PDFs in `/media-library`. The local build validates approved SHA-256, byte size and page count without uploading bytes. A separately authorised deployment must ingest immutable bytes before an asset can become `ACTIVE` and client-sendable.
4. A secure form invitation lasts 14 days and supports save/resume. Final submit freezes its response. Explicit Residential and Commercial selection creates two independent prospective projects under the same permanent Client ID. It creates no Case ID.
5. Yogesh assigns a 30-minute Review Call. A hidden 15-minute buffer is included in overlap checks. Client responses are limited to confirm or request another time; the latter closes exactly 12 hours before the call.
6. Founder reschedule/cancel preserves the previous booking, retires its Zoom binding, cancels pending reminders and creates a separately idempotent successor assignment.
7. The Zoom adapter fails closed until an organisation connection is configured. The fake connector verifies success, failure and idempotent retry locally. Reminder tasks at 24 hours and 2 hours prepare manual channel drafts and never auto-send.

## Manual email recovery (Founder Edition)

Email is deliberately manual. After **Prepare WhatsApp & email** succeeds, the drawer exposes **Open Gmail draft** and **Use default email app**. Both actions use the same approved template version, recipient, secure-link grant and rendered content; opening a compose surface records `OPENED` only. It never claims `SENT`, `DELIVERED`, `FAILED` or `RETRY`.

If the Gmail draft does not open, allow pop-ups for the staging origin and use **Retry opening Gmail draft**. If the in-app browser cannot open Gmail, use the default email-app fallback (`mailto:`) and review the prefilled recipient, subject and body before sending manually. A missing recipient, inactive asset/form, expired grant or missing template keeps the action blocked with an actionable recovery message. No token or raw contact is written to logs.

## Safety boundary

- Proposed D1 migration: v10, additive definition only. It was not executed.
- The five approved PDFs are not copied, modified, bundled or uploaded.
- Direct private object URLs, raw tokens, raw contacts/answers and Zoom join metadata are excluded from public projections and audit headlines.
- Protected mutations bind both the idempotency key and request hash; a changed-body replay fails closed rather than returning the earlier result.
- Lovable sync, client delivery, Stage B remedies and the commercial proposal editor remain disabled/out of scope.
- Production and staging are unchanged.

## Activation blockers

- Ingest and activate the five exact approved PDF byte versions in a separately authorised private R2 environment.
- Configure a server-side Zoom organisation OAuth connection and encrypted credential storage; no manual-link fallback is approved.
- Execute D1 v10 only after a separate migration rehearsal and owner approval.

## QA boundary

Read-only QA may prepare a draft and verify the two compose controls, keyboard focus, disabled/missing-recipient state and popup-blocked retry. Do not send a real message during QA. Communication-driven pipeline, payment, case, report and methodology state never changes.
