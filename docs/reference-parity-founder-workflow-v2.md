# Reference-Parity CRM + True Founder Workflow v2

## Outcome

The primary Founder journey no longer depends on the legacy operations console. The compact application shell exposes Overview, Leads, Lead Pipeline, Clients & Cases, Evaluation and Reports. `/ops` remains under **More → Technical tools** only so existing backend actions remain available for backward compatibility.

## CRM parity

- `/crm` opens directly to a full-width lead table with compact search, canonical stage, source and received-date filters.
- A row opens the same fixed right-side lead drawer used by the Kanban. Mobile uses a full-screen sheet.
- Contact values are masked in the table. Source record IDs, raw payloads, audit internals and sensitive fields are excluded from the primary surface.
- The sticky drawer footer has one authoritative **Save & continue** action. Call, WhatsApp and email links appear only when valid contact data exists.
- `/lead-pipeline` presents five visual groups while retaining every canonical server stage. Drag/drop proposes a move; it does not mutate the card. The Founder must select an allowed canonical next stage and required follow-up data before the existing transition action runs.
- Lovable activation remains dormant. Source history is labelled separately and never becomes Uchit audit history.

## Client and case board

`/clients-cases` creates one card for each case/project under the permanent Client ID. It shows floor-level progress, payment and report gates, and resolves **Continue case** from the exact case and selected floor. Partial floor completion does not complete the project and reports remain one floor per report.

## Canonical post-advance sequence

1. Case/project creation
2. Floor setup
3. Intake complete
4. Direction verification
5. Layout preparation
6. Gridding and manual 32D/16D evidence
7. Manual utility mapping and approved full-colour sheet
8. Rule-based Utility/Shakti evaluation
9. Stage A verdict generation, human verification and presentation
10. Site Analysis linked to the exact presented Stage A version
11. Post-Site Findings and Layout Review
12. Full balance clearance
13. Stage B/remedy reservation — `BLOCKED_METHOD_INPUT`
14. One-floor report assembly
15. Founder review and approval
16. Protected PDF generation, verification and release
17. Delivery history — client delivery remains disabled

This order preserves FE-SITE-01 v1.1. Site Analysis is not represented as available until the exact-floor Stage A verdict has been generated, human-verified and presented. Post-Site work remains separate and never silently reruns Stage A.

## Safety boundaries

- Existing action payloads, server permissions, idempotency, record/global concurrency, audit, payment gates and report hashes are unchanged.
- The scorecard passes exact client, case and floor context to each editing component.
- Methodology blockers remain blockers. No geometry, direction boundaries, Site verdicts or remedy logic were added.
- Client delivery, Lovable live sync, backfill and D1 v9 execution remain disabled.
- No schema migration is required for this UI slice.

## Verification

`tests/reference-parity-founder-workflow.test.mjs` covers shell containment, above-fold table composition, shared drawer, safe Kanban confirmation, exact case/floor binding, one-step composition, payment/report protections and responsive/accessibility contracts. Existing CRM, Founder flow, pilot, multi-floor, PDF, payment and security suites remain part of the full release gate.
