# Founder Edition product audit — 12 August 2026

## Executive summary

The product is safe to continue as an owner-only Founder pilot, but it is not yet ready for staff rollout or client delivery. The strongest part is the server-controlled operating model: permanent client identity, per-case and per-floor lineage, CAS/idempotency, immutable artifacts, payment/report gates and explicit fail-closed methodology, legal, statutory and provider states. The new primary information architecture is also materially clearer: Overview, Leads, Lead Pipeline, Clients & Cases, Evaluation and Reports, with `/ops` contained under More as a legacy technical console.

The main UX risk is consistency after the operator enters a step. The 17-step shell is focused, but several embedded legacy workspaces still expose more controls and technical language than a single current task needs. The Evaluation navigation is also a fixed `/founder/08` entry rather than a server-resolved case/floor continuation. Current staging does not include the local visual polish in this audit, so publication remains a separate review gate.

No staging business mutation, message send, file selection, migration, provider activation, invoice issue, client delivery or deployment was performed during this audit.

## Evidence and scope

- Source reviewed at the local branch based on `e0fa28b`, including all `app/**/page.tsx`, primary navigation/access rules, shared Founder flow, CRM table/drawer, communication sheet and action contracts.
- Authenticated staging reference reviewed read-only at `/founder/01`; session and primary navigation rendered correctly. A broader automated route sweep timed out at the browser boundary, so route composition and non-visible states were verified from source and automated contracts instead of being claimed as browser evidence.
- Local synthetic owner rendering used only non-production seed state and injected local request identity. No hosted data was used for the after image.
- Focused tests cover the sequential flow, communication compose behavior and the new polish contract. The complete release gate is the final verification authority.

## Target information architecture

| Workspace | Purpose | Primary outcome | Current assessment |
| --- | --- | --- | --- |
| Overview | Resume the one server-derived task | Continue current case/floor | Clear and appropriately minimal |
| Leads (`/crm`) | Find, inspect and safely update a lead | Continue the selected lead | Strong table/drawer model; communication and import are progressively disclosed |
| Lead Pipeline (`/lead-pipeline`) | Acquisition and qualification progression only | Confirm canonical transition | Correct separation and no optimistic commit |
| Clients & Cases (`/clients-cases`) | Select one active project/floor | Continue case | Correct identity model; continuation should remain server-resolved |
| Evaluation (`/founder/08`) | Execute one case/floor module | Save and continue | Fixed navigation target is weaker than a context-resolved continuation |
| Reports (`/reports`) | Review protected report/version history | Resolve exact release blocker | Correctly separate from lead pipeline |
| More | Media, diagnostics, integrations and legacy tools | Technical recovery/admin | Correct containment; `/ops` is no longer a primary journey dependency |

Public token routes for qualification, booking, proposals and protected media remain narrow, scoped and fail closed. Technical routes remain permission-controlled and outside the primary Founder path.

## Control and state audit

### CRM

- The lead table supports search/filter, loading, empty, no-match, offline/load failure and retry states.
- Row selection opens the shared profile drawer; private source details remain collapsed and the primary table excludes DOB/raw source payloads.
- Edit profile is allowlisted, reasoned, organisation-scoped and preserves 409/428 drafts with reload recovery.
- Call, WhatsApp and Email controls use visible labels and 44px targets. Missing recipient channels fail with actionable guidance.
- VSL, both brochures and qualification are one-at-a-time review-sheet actions. Manual communication records only `PREPARED` and `OPENED`; opening communication never advances pipeline, payment, case, evaluation or report state.
- Gmail and default-email compose paths are generated client-side from the approved preparation. Popup failure receives a same-tab/retry path; no delivery claim exists.
- Lead import validates before mutation, preserves permanent Client ID, routes ambiguous identity to review, and does not accept authoritative owner/payment/case/evaluation/report fields.

### Pipeline and case progression

- Lead moves are proposals followed by canonical server transition; invalid skips and terminal requirements remain server-controlled.
- Client/case cards are per project under permanent client identity; floor progress is not merged into one report.
- Founder steps preserve Back access, block gated future steps and expose one recovery link. Stage B remains `BLOCKED_METHOD_INPUT`; delivery remains disabled.
- `/ops` is labelled legacy and is absent from primary navigation and primary Founder CTAs. The primary journey therefore no longer depends on `/ops`.

### Qualification, booking and commercial

- Qualification tokens are version/client scoped, expiring and save/resume/final-submit aware; final responses are immutable and create prospective projects idempotently without Case IDs.
- Booking binds the exact response/project, absolute time and IANA zone; the 45-minute occupied window, 12-hour reschedule boundary and Zoom fail-closed states are contract-tested.
- Proposals use six exclusive steps and immutable version/hash binding. Legal versions, brochure assets and statutory policies remain independent approval gates.
- Payment proof is not confirmation. Only confirmed payments reduce the balance. Receipt-voucher/tax-document tasks remain separately gated, versioned and idempotent.

## Data, security and recovery

- Organisation, actor, client, project, case and floor ownership are server-derived on protected actions.
- Critical mutations use expected record/global revision and idempotency; changed-body replay and stale revision fail.
- Permanent retention and immutable audit/history are preserved; no normal refund/credit path exists.
- Tokens, source payloads, private reasons, Zoom join metadata and direct object URLs are excluded from normal client projections and logs by contract.
- Loading, empty, forbidden, conflict and retry behaviors exist on the critical CRM/Founder surfaces. Legacy technical consoles are less consistent and should not be promoted to the primary journey.

## UX/accessibility findings

1. **High — fixed Evaluation navigation.** The sidebar points to `/founder/08`; it should resolve the selected case/floor and first actionable step server-side. Acceptance: navigation never opens the wrong floor or a gated future step and retains explicit case/floor context.
2. **High — embedded workspace density.** The outer step is focused, but several existing consoles still contain secondary forms and metadata. Acceptance: each of 17 routes exposes one primary form/action, with secondary tools under Details or More options, without changing action payloads.
3. **High — visual consistency is local only.** The calm semantic status panel, editorial hierarchy, button ordering and drawer/sheet treatment have not been published. Acceptance: owner-reviewed desktop/mobile screenshots plus authenticated staging smoke before publication.
4. **Medium — route-level state consistency.** Some older technical pages use bespoke loading/error copy and button patterns. Acceptance: shared loading, empty, forbidden, conflict and retry primitives across every primary route.
5. **Medium — context switching.** Case/floor context is compact inside the flow but not a single persistent selector across all primary workspaces. Acceptance: server-authoritative selector that cannot merge floor lineage and restores last valid context.
6. **Medium — accessibility evidence.** Source contracts cover 44px targets, focus and reduced motion, but a complete automated WCAG/keyboard browser pass is still needed on an authenticated safe dataset. Acceptance: no keyboard trap, visible focus, correct dialog focus return, zero horizontal overflow at 390px and AA text/control contrast.
7. **Later — staff readiness.** Role scaffolding exists, but Founder-only owner actions intentionally block staff operations. Acceptance: a separately approved module/capability matrix, assignment model and least-privilege staff pilot; no reuse of source actors as Uchit owners.

## Prioritized backlog

| Priority | Recommendation | User value | Effort | Risk |
| --- | --- | --- | --- | --- |
| Critical | Keep client delivery, Stage B, provider and statutory issue actions fail closed until their independent readiness gates pass | Prevents irreversible or misleading output | Low | High if weakened |
| High | Replace fixed Evaluation nav with server-derived Continue case/floor | Removes wrong-step and wrong-floor dead ends | Medium | Medium |
| High | Complete component-level simplification for all 17 embedded step workspaces | Makes the sequential promise true end to end | High | Medium |
| High | Publish the local polish only after owner visual review and authenticated no-write staging smoke | Consistent production-grade experience | Low | Low |
| High | Create a safe, privacy-cleared synthetic visual-QA dataset/environment | Enables repeatable screenshots and interaction QA without client data | Medium | Low |
| Later | Add a Founder command/search palette for client, case and floor navigation | Faster operation at scale | Medium | Medium |
| Later | Add operational SLA/task inbox for reminders, overdue balances, statutory readiness and conflicts | Reduces missed follow-up | Medium | Medium |
| Later | Design Team Edition capability grants, queues and ownership transitions | Enables staff without weakening Founder authority | High | High |

## Owner decisions required

1. Approve or reject publication of this local visual-polish slice after reviewing the before/after evidence.
2. Approve a server-resolved Evaluation/Continue destination to replace the fixed `/founder/08` navigation entry.
3. Approve creation of a fresh, isolated synthetic visual-QA environment; do not reuse any database containing unknown/pre-existing leads.
4. Decide whether the next UX slice should simplify all 17 embedded workspaces or prioritize only the highest-frequency steps (CRM, evidence/orientation, evaluation, Stage A, balance/report).
5. Keep staff rollout deferred until a module-level permission and operating-queue contract is approved.

## Follow-up implementation checkpoint

The approved local follow-up addresses the first two high-priority navigation/composition findings without changing server actions or workflow gates:

- Evaluation now uses `/founder/continue`, a server route that builds the authoritative scorecard and redirects to the current case/floor's first actionable module with its exact context query. The legacy `/founder/08` route remains available for direct historical links, but it is no longer the primary navigation target.
- The Site Analysis console renders only the Site editor when the Founder step requests `focus="site"`; the Post-Site Findings editor is rendered only for `focus="post-site"`. The combined view remains available only to the legacy all-tools route.

Focused navigation/flow contracts and the complete release suite passed after this change. Publication is intentionally not included in this local follow-up.

The subsequent local slice (`de676dd`) reduces Evaluation density: operational counts and release/payment context are progressive disclosures, Utility save remains the dominant action and Shakti remains secondary. The synthetic-only visual-QA manifest is generated by `pnpm.cmd prepare:founder-visual-qa`; it contains no client data, file upload steps or mutation instructions.

The next local slice keeps the manual-sheet route focused: when `focus="manual-sheet"`, the other-file checklist and version history are disclosures, while the selected floor evidence form remains the primary working surface. This preserves protected upload, review, verification, CAS and idempotency behavior.

The next local slice keeps the balance-payment route focused: `/founder/12` continues to expose the exact proof upload and `balance-proof-verify` action as the primary task, while payment status metrics and receipt history/gate rationale move behind progressive Details disclosures. No payment confirmation, report release, invoice issuance or other gate behavior changed. The synthetic visual-QA manifest now includes `/founder/12` at desktop and mobile viewports.

The following local slice keeps protected report work focused: `/founder/15` and `/founder/16` retain one review/approval or PDF action, while released export/print controls are behind a `Released artifact actions` disclosure. Report IDs, hashes, approval evidence, payment gates and client-delivery deferral remain unchanged. Synthetic visual QA now covers the approval and protected-PDF steps as well as the balance step.
