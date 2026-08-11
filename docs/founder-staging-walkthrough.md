# Founder Edition staging walkthrough

Status: **operator package ready; dry-run verified; live/staging writes not performed**

This checklist is for Yogesh's authenticated Founder/SUPER_ADMIN staging session. Use synthetic or owner-approved staging records only. Never paste client PII into screenshots, logs, fixtures or support messages. Every protected action must use the current organisation/case/floor scope, a stable idempotency key, the current record version and the current global revision.

## 0. Before opening the walkthrough

- Confirm `/api/session` shows the authenticated Founder actor, one active organisation, active workflow/approval policy versions, and `isFounderEdition: true`.
- Confirm `/api/bootstrap` is organisation-scoped and the diagnostics page reports storage/migration readiness without exposing secrets or records.
- Confirm client delivery is disabled. Do not enable it for this walkthrough.
- Keep the browser's network panel available for status codes, but redact request bodies and evidence values in any notes.
- Run the no-write verification first:

```text
pnpm test:founder-staging
```

The dry-run prints `writes:false`, `externalWrites:false`, `clientDeliveryEnabled:false`, exact floor IDs, expected concurrency tokens, safe steps, blocked actions and the recovery matrix. It mutates only an in-memory synthetic object and makes no route or storage call.

## 1. Advance confirmation — `/crm`

1. Create/review the proposal and confirm the policy snapshot (starting fee ₹51,000 onwards, minimum advance ₹11,000 unless the approved policy version says otherwise).
2. Upload/select immutable advance proof through the protected payment-proof surface.
3. Confirm `advance-proof-verify`, then confirm `advance-pay` with the exact reconciled amount.
4. Verify that no Vastu Case ID exists before confirmed advance and exactly one idempotent case becomes available afterward.

Expected UI states: empty client/proposal state, loading refresh, inline error with retry, permission denied for non-authorised roles, success/audit confirmation. Never proceed if the amount, proof, client or proposal scope is wrong.

## 2. Case, intake and floors — `/crm` and `/ops`

1. Complete the approved intake questionnaire for the permanent Client ID.
2. Create the case once; retain the permanent Client ID for later cases.
3. Configure service/stage and create the confirmed floor count.
4. Confirm each floor has its own workspace, plan selector, evidence selector and report lineage. Assignment is project-level only.

Do not send a client-supplied `organisationId`, owner, consultant or floor assignment. A 428 means reload tokens; a 409 means compare/reapply deliberately; neither is silently retried.

## 3. Two-floor protected upload protocol — `/files` and `/spatial`

For a two-floor pilot, prepare four different files before starting:

- `ground-plan.<approved extension>` — only the ground-floor plan.
- `first-plan.<approved extension>` — a different file for the first floor.
- `ground-manual-sheet.<approved extension>` — original full-colour hand-marked ground-floor utility sheet.
- `first-manual-sheet.<approved extension>` — a different original full-colour hand-marked first-floor utility sheet.

Upload each through `/api/case-files` while the exact floor is selected. Verify the returned metadata is scoped to the active case/revision/service/floor and does not expose object keys, private refs, checksum or uploader identity. Record the plan version and manual utility document separately for each floor. Never reuse one file merely by changing its filename.

## 4. Direction and orientation — `/spatial`

1. Upload and record the current Google Earth evidence at project scope.
2. Enter the exact measured degree and a reason of at least the server-required length.
3. Deliberately lock the orientation.
4. Verify that a changed orientation creates a new version and floor-scoped regeneration blockers; the old version remains historical.

No degree-to-direction boundary, geometric centre, sector label or computed adapter is inferred in this release.

## 5. Manual gridding evidence — `/spatial`

For each floor, separately record:

- Founder-confirmed marked 32-sector chakra evidence. The original overlay must visibly contain exactly 32 sectors; the system records the Founder confirmation and does not perform image recognition.
- Founder-confirmed marked 16-direction evidence belonging to the same floor and current plan. Computed 16D geometry remains deferred.
- Brahmasthan, Marmaa and energy graph sheets as manual evidence only where available.

Missing or false confirmation, wrong floor/plan, unverified evidence or a superseded plan blocks evaluation and creates no guessed finding.

## 6. Utility and Shakti — `/evaluation`

- Run only approved UtilityMaster rows with the active workbook hash/version.
- Leave unknown, conflicting or unsupported rows in `REVIEW_REQUIRED`/`BLOCKED_METHOD_INPUT`.
- Review the frozen Shakti graph one element at a time, with source methodology/version trace.
- AOU is a separate framing reference and cannot alter Utility outcomes or Shakti values.

No generic remedies, priorities, sequencing or remedial language are produced.

## 7. Stage A — `/reports`

1. Generate the internal watermarked preview for one exact floor/report version.
2. Confirm the exact version was presented using `stage-a-present`.
3. Verify preview HTML/PDF download, export and print attempts return server denial.
4. Use the floor queues to resolve every `REVIEW_REQUIRED`, `BLOCKED_METHOD_INPUT`, missing evidence or `NEEDS_REGENERATION` item. Acknowledgement alone never clears a blocker.

## 8. Site Analysis — `/site`

Only after the exact Stage A verdict is generated and presented:

1. Record a video analysis or physical visit with site, entrance, surroundings, light, ventilation, airflow, neighbouring effects and relevant observations.
2. Attach protected evidence as required and save the draft.
3. Record Founder review and Founder approval.
4. Create and approve the linked Post-Site Findings/Layout Review.

This module stores human observations only. It does not redesign the layout or rerun an evaluation.

## 9. Balance clearance — `/crm`

After verdict presentation, record and verify the remaining balance payment proof. The official report remains locked until full balance confirmation and Founder approval.

## 10. Founder approval and protected PDF — `/reports`

1. Prepare the exact one-floor official report only after current plan/evidence/orientation/evaluations, Site/Post-Site approval and all release blockers are clear.
2. Record `FOUNDER_REVIEWED`, then `FOUNDER_APPROVED`, each with reason/comment and immutable audit.
3. Generate and verify the encrypted PDF. Confirm the original full-colour manual sheet is embedded at the required report position and checksum-linked.
4. Release only the exact approved report version. Verify authenticated export/print succeeds only after `RELEASED`; editing, copying and page extraction remain disabled.
5. Any later approved change creates a new report version and PDF; the released artifact never changes.

## 11. Floor delivery history — `/delivery`

Review the released artifact, release actor/time, and internal delivery history for each floor. A partial release or internal milestone never closes the overall project while another floor is incomplete. Public/client delivery and client portal access remain disabled.

## Safe versus blocked actions

Safe to exercise manually with synthetic/approved staging data: authenticated session/bootstrap reads; protected case-file upload/list/download within exact scope; CRM proposal/intake/advance actions; case/floor setup; plan/evidence/orientation actions; approved Utility/Shakti snapshots; Stage A preview/presentation; Site/Post-Site records; balance verification; Founder report checkpoints; authenticated final PDF export/print after release; internal delivery-history review.

Remain blocked: client portal/public delivery; preview export/print/download; direct object URLs; computed 32D/16D geometry or degree-boundary classification; unapproved Site/Environment scoring; unknown/contradictory methodology; Stage B remedies; Lovable sync/import/webhooks; in-place released report/evidence mutation.

## Recovery matrix

| Condition | Expected response | Operator recovery |
|---|---:|---|
| Missing evidence/file | 409 | Upload/select the exact protected file and retry as a new valid operation. |
| Missing concurrency token | 428 | Reload session/bootstrap and send both current tokens. |
| Stale record/global version | 409 | Reload, compare the latest case/floor, and deliberately reapply the draft. |
| Cross-floor/case/plan/org reference | 404 | Return to the exact active floor and select scoped evidence/version. |
| Payment pending | 409 | Complete immutable proof verification; report gates remain closed. |
| Founder review/approval pending | 409 | Use the next checkpoint on the exact report version. |
| Methodology Review Required/Blocked | 409 | Resolve only through an approved methodology binding; never guess. |
| Needs Regeneration | 409 | Require replacement, bind regenerated version, then verify Ready for Review. |
| Unauthorised/inactive membership | 403 | Sign in as the active Founder-authorized actor; do not retry silently. |
| Durable storage unavailable | 503 | Stop the pilot and resume only after storage readiness is restored. |

## Owner inputs still required

- Two real, independent staging plan files and two real, independent full-colour manual sheets for the controlled upload pilot.
- Approval to perform those staging writes; this package itself performs none.
- Stage B remedial PRD and approved remedy methodology before any remedy implementation.
- Future decision only if floor-specific orientation versions are required; current orientation is project/case scoped.
