# Founder-observed new-case rehearsal (prepare-only)

Status: **NO-GO until Yogesh is present and explicitly starts the rehearsal.**

This is a single synthetic, owner-observed rehearsal on the owner-only main staging site. It is not a fixture import, migration, client delivery, provider test, or production exercise. Stop immediately at any unexpected state; never bypass a server gate.

## Preconditions (read-only)

- Authenticated staging session resolves to Yogesh / `SUPER_ADMIN`; retry once if verification is still loading.
- `/diagnostics` is healthy and reports DB/R2 readiness without exposing secrets.
- Active Media Library assets are present and private: both brochure versions, the three qualification PDFs, the two approved logos, and the Founder signature. Verify checksums/roles/status only; do not re-upload.
- `PDF_OWNER_SECRET` and required runtime bindings are present by metadata/boolean checks only.
- Zoom readiness is inspected only. Do not create a meeting or call the provider during this rehearsal.
- Legal/statutory state remains versioned and fail-closed where applicable; no invoice is issued.

## Synthetic inputs

- Synthetic person: `QA Rehearsal Person` with a non-routable test email/phone and explicit `TEST_ONLY` label.
- One service: choose Existing Space **or** New Construction; do not select a second service unless the hybrid branch is intentionally tested in a separate rehearsal.
- One synthetic property, one floor, one protected plan, one full-colour manual utility sheet and one safe evidence image. Files must be disposable, non-personal and watermarked `TEST ONLY`.
- No real client CSV, approved source PDFs, production documents, contact details, payment proofs or private assets.

## Ordered operator script (one case)

1. **Leads:** create/import one synthetic lead through the canonical Uchit action. Confirm permanent Client ID, organisation scope, source provenance and audit event. Verify duplicate replay is idempotent.
2. **Qualification:** prepare the matching approved form/PDF links. Open only the synthetic secure flow; verify 14-day scope, save/resume, shared questions once, explicit service choice and no Case ID on submission. Submit once; replay must not duplicate projects.
3. **Prospective project:** confirm exactly one prospective project under the permanent Client ID. Do not infer fee, scope or deliverables from brochure text; verify the brochure version/checksum is pinned.
4. **Proposal:** inspect the six-step proposal shell and required legal/statutory blockers. Do not invent missing policy text, send a proposal, accept it, or generate an invoice unless the current approved configuration makes that state valid.
5. **Advance/case gate:** use a synthetic confirmed advance only if Yogesh explicitly authorises the rehearsal path; otherwise stop at the payment gate. Verify unconfirmed proof does not clear the gate. Confirm Case ID, project and one independent floor are created only after clearance or an explicit Founder exception.
6. **Founder steps 01–07:** case/project, floor, intake, direction, layout, gridding (32D/16D) and manual sheet. Upload only the synthetic files, verify exact floor/plan lineage, CAS/idempotency and replacement recovery.
7. **Founder steps 08–09:** run approved Utility/Shakti evaluation, then generate, human-verify and present the exact-floor Stage A verdict. Confirm Site remains unavailable before presentation.
8. **Founder steps 10–11:** record Site Analysis and separate Post-Site Findings/Layout Review. Verify post-site does not silently rerun Stage A.
9. **Founder step 12:** record a synthetic balance proof and confirm only through the canonical payment action. Verify P18 due date derives from the immutable confirmed-advance timestamp; no proof-only shortcut.
10. **Founder steps 13–16:** verify Stage B is `BLOCKED_METHOD_INPUT`; report assembly, Founder approval and protected PDF remain gated by the exact prerequisites, legal/statutory configuration, hashes and payment state.
11. **Founder step 17:** verify delivery history is visible only as internal history and client delivery remains disabled.
12. **Audit/recovery:** inspect timeline/audit lineage, stale-CAS handling, duplicate replay, cross-org/cross-client denial, mobile/keyboard states and explicit retry/reload guidance.
13. **Stop point:** do not send WhatsApp/email, open Gmail/default mail, call Zoom, issue receipts/invoices, publish a client link, or enable delivery.

## Expected statuses and negative checks

- Lead: canonical intake stage; duplicate identity is linked or `REVIEW_REQUIRED`, never merged silently.
- Qualification: submitted response is immutable; post-submit edit requires a successor response.
- Proposal: legal/template/statutory blockers remain visible and fail closed.
- Case: no Case ID before confirmed advance or explicit Yogesh exception.
- Stage A → Site → Post-Site → balance order is preserved.
- Stage B: `BLOCKED_METHOD_INPUT`; delivery: disabled.
- 409/428, expired/replayed token, wrong tenant/client, missing evidence, stale slot and provider-unready states preserve drafts and show recovery.

## Duration, cleanup and retention

- Budget: 45–60 minutes including read-only verification; stop sooner at any gate.
- No destructive cleanup is permitted. Mark every synthetic record/file `TEST_ONLY`; retain immutable audit/history under the permanent-retention policy and record the rehearsal disposition. Do not purge or reclassify existing comparison/staging data.

## Explicit boundaries

No real messages, no real client data, no real PDFs, no provider calls, no payment mutation, no invoice issuance, no migration, no Lovable sync, no production/comparison changes, no Stage B activation and no client delivery.
