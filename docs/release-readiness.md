# Release readiness

This document records the source-controlled release gates. It does not certify live infrastructure, rotate credentials, inspect production data, or authorize deployment.

## Current release scope

The current launch target is an internal staff pilot for SUPER_ADMIN, ADMIN and CONSULTANT users. Client accounts, client-portal acceptance, outbound client messages and external integrations are deferred. This narrower scope does not weaken authentication, payment, evidence, report approval or data-protection controls.

## Automated gates

| Gate | Evidence | Release rule |
|---|---|---|
| Authentication and authorization | Route inventory plus role/action contract tests | Every API route must remain in the explicit access-policy manifest; anonymous access fails closed. |
| Client isolation | Client ownership and released-report tests | Client identity must resolve to exactly one owned client; internal records and other clients remain inaccessible. |
| Critical workflow | Lead, payment, case, protected files, evaluation, assessment, reports, release, and delivery contracts | Server prerequisites, immutable evidence, concurrency, and approval gates must all pass. |
| Concurrency and retries | Optimistic record/global revisions, rollback, idempotency, scoped upload deduplication | Missing versions return 428; stale versions return 409; failed persistence restores memory and private objects are compensated. |
| Protected uploads | MIME, magic bytes, size, polyglot, UUID, exact scope, private R2, redacted metadata tests | D1 and R2 are mandatory; bytes and storage keys never enter client/report projections. |
| Report integrity | V1 compatibility and deterministic V2 canonical-hash tests | Historical V1 remains unchanged; client-safe frozen V2 inputs must match their SHA-256 artifact. |
| Persistence | Ordered D1 migration manifest and legacy merge tests | All migrations are ordered, unique, and applied before release. |
| Secrets and packaging | Tracked-file secret scan, local-settings ignore/example, Sites allowlist contract | Local credentials, environment files, generated archives, and private data must not be packaged. |
| Production safety | Demo-elevation and health-response contracts | Demo role switching is impossible in production; health responses expose readiness only, not PII, secrets, or raw provider errors. |
| Build quality | `pnpm test:release` in CI | Tests, persistence suites, TypeScript, and production build must all pass from a clean checkout. |

## NO-GO until production authority verifies

- D1 binding exists in the production environment and migrations 1–4 have completed successfully.
- Private R2 binding exists, public bucket access is disabled, lifecycle/retention policy is approved, and upload/download smoke tests pass using non-sensitive fixtures.
- At least two administrator assignments exist and two-person report approval/release is exercised with separate production identities.
- Production environment has `UCHIT_VASTU_DEMO_MODE` absent or false and no demo headers are trusted at the edge.
- All credentials that may ever have existed in `data/local-settings.json` are rotated by an authorized owner. This change removes the file from current tracking but does not rewrite Git history or rotate secrets.
- Production backup, restore, incident response, monitoring, alerting, data-retention, privacy, and legal/commercial sign-off are evidenced.
- A controlled staff rehearsal completes lead → case → protected upload → evaluation → assessment → immutable report → two-person release → post-delivery follow-up without using live client data.

Any unresolved item above is a release blocker. Deployment requires explicit production authority after these checks are evidenced.
