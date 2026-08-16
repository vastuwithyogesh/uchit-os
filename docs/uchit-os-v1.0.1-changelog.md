# UCHIT OS V1.0.1 internal changelog

## Founder UX

- Added a Founder Command Center landing surface instead of treating Step 01 as the application home.
- Added a truthful empty state with `Start New Client` routed to the existing Leads workflow.
- Added persistent role-aware global navigation and case/floor context on Founder workflow surfaces.
- Added server-derived current-work continuation, case selection, visible locked-step explanations, and workflow progress navigation.
- Preserved existing save controls inside each domain workspace so validation and concurrency remain server-owned.

## Performance

- Added client request single-flight coordination for session, bootstrap, branding, and Founder case reads.
- Added short-lived context-aware read reuse and successful-mutation invalidation.
- Added a fail-closed branded loading shell, Server-Timing diagnostics, and immutable caching for hashed static assets.

No domain methodology, workflow gate, persistence architecture, production data, or deployment configuration was changed.
