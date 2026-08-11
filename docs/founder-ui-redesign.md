# Founder Edition UI/UX redesign v2.0

The Founder shell now follows a one-task-at-a-time presentation without changing any action contract or server gate.

## Interaction contract

- Every priority route begins with a shared context, status, dominant next action and optional recovery action.
- Secondary tools are placed behind labelled disclosures where they are not the immediate next step.
- Technical provenance, IDs and histories remain in the existing component disclosures.
- Native links remain the navigation primitive; conflict and retry behavior stays in the owning client component.
- `44px` minimum controls, visible focus, semantic status tokens and reduced-motion support remain shared CSS guarantees.

## Founder route coverage

The shared `FounderRouteIntro` is used by Home, Workspace, CRM, Case Setup, Files, Spatial, Evaluation, Assessment, Site Analysis, Payments, Reports, Delivery, Operations, Methodology and System Check.

The visual pass is intentionally local-only until the planning task and owner approve publication. It does not alter methodology, report payloads/hashes, permissions, payment gates, audit behavior or client-delivery deferral.

## Verification

- `tests/founder-ui-redesign.test.mjs` checks route coverage, disclosure, semantic status tokens, native navigation, touch targets, focus and motion rules.
- Existing action, navigation, accessibility, production-first-use and operations contracts remain green.
- No migration or data change is required.
