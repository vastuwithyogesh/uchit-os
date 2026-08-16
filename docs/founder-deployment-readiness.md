# Founder Edition deployment-readiness package (NO-GO until owner approval)

This package prepares a staged release; it does not deploy, mutate live/staging data, activate external notification providers, or set secrets. The current product is an internal Founder Edition plus controlled VASTU_REMEDY_REPORT delivery V1. Founder proposal/statutory client delivery, Lovable sync, external messaging, and combined multi-floor delivery remain disabled.

## Current evidence

- Source-controlled CI gate: `.github/workflows/release-gate.yml` runs frozen-install, `pnpm test:release` on Node 22.
- Local source gate: main tests plus Founder pilot, walkthrough, persistence, payment migration, evaluation, release-data, TypeScript and production build.
- D1 migration manifest currently ends at version **16** (`db/migrations.ts`). Remedy, repository, branding, image, and delivery domain state remains inside the existing AppState snapshot architecture.
- Protected final PDF storage is represented by `final_pdf_artifacts` and `final_pdf_artifact_events` in migration 8; case-file storage is private and immutable.
- Offline backup tooling is `pnpm backup:state`; it excludes R2 bytes and secrets. R2 inventory/versioned-copy evidence is a separate owner-controlled prerequisite.
- Runtime secrets/bindings are server-only: `DB`, `R2`, `PDF_OWNER_SECRET`, and (when the deferred inbound integration is explicitly enabled) `OPTIN_WEBHOOK_SECRET` (`lib/runtime-env.ts`). Never echo or commit values.

## Preflight checklist (staging only)

1. Verify the target is the intended staging project and record opaque D1/R2 resource identifiers in the change ticket, not in the repository.
2. Run the safe diagnostics/readiness check; confirm `DB`, `R2`, and `PDF_OWNER_SECRET` are configured without displaying values. Missing owner secret is an immediate stop before any PDF release attempt.
3. Apply/rehearse ordered migrations through v16 on a disposable clone. Confirm repeatability, `schema_migrations` markers, `app_state_snapshot.revision`, private case-file scope indexes and final-PDF tables.
4. Create an offline state backup with `pnpm backup:state -- --mode export --environment staging ...`; independently inventory/version the R2 objects. Do not treat the state backup as an R2 byte backup.
5. Confirm demo mode is disabled at the edge for any shared environment, non-delivered and wrong-client report access fails closed, delivered access resolves only the exact pinned protected artifact, and no public object URL is reachable.
6. Run `pnpm test:release`, TypeScript and production build from the reviewed checkout. A wrapper failure caused by package-registry/network policy is not a substitute for the direct local gate; record both outcomes.

## Founder smoke matrix

| Journey | Expected result | Stop condition |
|---|---|---|
| Session/bootstrap/diagnostics | Authenticated, organisation-scoped, metadata-only response | Anonymous, revoked or cross-org data appears |
| Opt-in → proposal → advance | One permanent client, snapshotted terms, confirmed advance | Case ID appears before confirmed advance or duplicate audit |
| Case → two floors | Separate floor workspaces and revisions | Same plan/evidence checksum reused across floors |
| Plan/evidence/orientation | Private immutable assets, deliberate lock, exact scope | Missing colour/manual sheet, stale plan or cross-floor bind accepted |
| Utility/Shakti/Stage A | Deterministic approved-version output or explicit blocked status | Guessed rule, unknown utility auto-evaluated, missing trace |
| Site/Post-Site | Verdict-linked human observations and approval | Site score or automatic rerun appears |
| Balance/report | Full balance + Founder review/approval before release | Preview downloadable, report release bypasses any gate |
| PDF | Generated → verified → released; permissions allow authorised print only | Hash mismatch, object URL, editing/copying/page extraction allowed |
| Delivery history | VASTU_REMEDY_REPORT delivery pins one exact protected floor artifact; client view/download/acknowledgement is append-only | Non-delivered, cross-client, cross-org, latest-report fallback, or public object access succeeds |

## Staged deployment and rollback plan (not executed)

1. Owner approves a staging change window, RPO/RTO, release owner and rollback approver.
2. Rehearse v1→v16 on a disposable clone; capture markers, revision, backup hash, R2 inventory hash and smoke results.
3. Build/publish only the reviewed commit to the private staging target; run the smoke matrix with synthetic fixtures.
4. If a gate fails, stop traffic to the candidate, preserve logs/backup/clone, and choose an additive forward-fix or owner-approved restore. Never drop tables, rewrite released artifacts or run an unreviewed production command.
5. Post-check only after a successful candidate: verify private/no-store/nosniff PDF responses, report hash stability, append-only delivery/access audit, exact client ownership, and diagnostics redaction.
6. Production promotion is a separate explicit approval and is not part of this task.

## Explicit NO-GO conditions

- Any failing test, type check, build, migration rehearsal or PDF permission/hash check.
- Missing `DB`, `R2`, `PDF_OWNER_SECRET`, unverified private-storage policy, or missing backup/R2 recovery evidence.
- Any visible control without a real handler/native target, unresolved no-op, silent error, missing draft preservation or server gate.
- Missing/contradictory methodology, manual evidence, orientation lock, report lineage, Founder approval or full balance.
- Preview export/print/download or direct object URL succeeds.
- A client can access a non-delivered or non-owned artifact, a delivery resolves a newer artifact, an unsupported delivery family/channel is enabled, or demo headers are trusted at the edge.
- Any live fixture insertion, Lovable integration, invented site/geometry/remedial logic, or released artifact mutation.

## Owner inputs still required

- Approve the exact staging resource identifiers, RPO/RTO, release owner and rollback approver.
- Confirm staging `PDF_OWNER_SECRET` readiness through the safe check only.
- Supply two genuinely distinct plan files and two genuinely distinct full-colour manual sheets for the controlled two-floor rehearsal.
- Approve external notification providers, Founder proposal/statutory delivery, and production promotion separately.
