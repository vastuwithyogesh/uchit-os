# Uchit OS Stage B Vertical Slice — Integration Contract

**Status:** Proposed production-grade contract; design only

**Scope:** One case, one floor, one remedy placement, one implementation row and one appendix row

**Authorities:** Uchit OS architecture snapshot dated 13 August 2026 and Remedy & Report Engine PRD v5

**Non-goals:** Full Remedy & Report Engine, complete UI, external services, PDF delivery, repository administration, extras, furniture add-ons, appliances, colour frames, or multi-placement editing

## 1. Decision summary

Stage B is introduced as a floor-scoped remediation aggregate owned by an existing case/floor report. It reuses the existing organisation scope, report lifecycle, media versions, verdict snapshots, action gateway, concurrency controls, audit/timeline infrastructure, integrity service and protected-PDF pipeline.

All mutations are allowlisted actions submitted to `POST /api/actions`; no parallel mutation API is introduced. Reads should be projected through the existing bootstrap/report read path unless the source tree shows an established narrower read-query convention.

The proof slice succeeds when one approved remedy can be resolved from one immutable verdict snapshot, physically placed against one locked revised-layout version, assigned master number `1`, represented by exactly one implementation row and one appendix row, page-finalised, and validated as internally consistent.

## 2. Aggregate boundary and invariants

Aggregate key: `(organisationId, caseId, floorId, reportId)`.

Hard invariants:

1. The case, floor, report, layouts, verdict, remedy, placement, page and rows belong to the same organisation.
2. The report belongs to exactly one case and one floor.
3. Existing layout is reference-only; the final revised layout is the base for Stage B.
4. A selected revised layout must be an eligible candidate for the same case/floor and must reference an immutable media asset version.
5. A base-layout version is created from the selected revised-layout asset version. Draft placements may reference the selected version before hard lock. The base layout is hard-locked transactionally when the first downstream page is finalised.
6. Remedy eligibility is deterministically derived from a recorded verdict snapshot plus a recorded resolver/methodology version. Eligibility does not auto-select the remedy.
7. Every placement references its selected base-layout version and stores normalized coordinates in `[0,1]`. A finalised placement must reference the hard-locked base-layout version.
8. For this proof slice, the sole placement has master number `1`; numbering remains server-owned.
9. One physical placement maps one-to-one to one implementation row and one appendix row through the same `placementId`. `Implemented`, `Implementation Date` and `Alternative Needed` are blank client-facing form fields, not consultant workflow state.
10. Page finalisation is transactional with base-layout locking, resequencing, row projection and integrity validation.
11. A finalised page is read-only until explicitly reopened by an authorised actor. A protected or delivered report cannot be reopened through Stage B actions.
12. Delivered snapshots never dereference mutable repository metadata or a mutable media preference.

## 3. TypeScript contracts

Existing record names are referenced conceptually. Exact imports and identifier aliases must follow the source tree.

```ts
type Id = string
type ISODateTime = string
type NormalizedCoordinate = number // finite, inclusive 0..1

type RecordMeta = {
  id: Id
  organisationId: Id
  recordVersion: number
  createdAt: ISODateTime
  createdBy: Id
  updatedAt: ISODateTime
  updatedBy: Id
}

type StageBWorkflowState =
  | "NOT_STARTED"
  | "LAYOUT_SELECTED"
  | "EDITING"
  | "PAGE_FINALISED"
  | "REPORT_PROTECTED"
  | "DELIVERED"

type StageBRemedyType =
  | "DISHA_BALANCER"
  | "DISHA_ACTIVATION"
  | "TATTAV_BALANCER"
  | "TATTAV_ACTIVATION"
  | "EQUALISER"

type StageBRemediation = RecordMeta & {
  caseId: Id
  floorId: Id
  reportId: Id
  state: StageBWorkflowState
  existingLayoutAssetId: Id
  existingLayoutAssetVersionId: Id
  existingLayoutSnapshotId?: Id
  finalRevisedLayoutCandidateId?: Id
  finalRevisedLayoutAssetId?: Id
  finalRevisedLayoutAssetVersionId?: Id
  baseLayoutVersionId?: Id
  protectedReportVersionId?: Id
  deliveredAt?: ISODateTime
}

type RevisedLayoutCandidate = RecordMeta & {
  caseId: Id
  floorId: Id
  assetId: Id
  assetVersionId: Id
  source: "POST_SITE_FINDING" | "LAYOUT_REVIEW" | "UPSTREAM_REVISED_LAYOUT"
  sourceRecordId: Id
  status: "AVAILABLE" | "WITHDRAWN"
  label?: string
}

type RemediationBaseLayoutVersion = RecordMeta & {
  remediationId: Id
  caseId: Id
  floorId: Id
  candidateId: Id
  assetId: Id
  assetVersionId: Id
  assetContentHash: string
  snapshotId: Id
  versionNumber: number
  state: "SELECTED" | "LOCKED" | "SUPERSEDED"
  selectedAt: ISODateTime
  selectedBy: Id
  lockedAt?: ISODateTime
  lockedBy?: Id
}

type RemedyRepositoryRecord = RecordMeta & {
  name: string
  remedialType: StageBRemedyType
  elements: string[]
  directions: string[]
  attributePurpose: string
  internalApplicabilityNote?: string
  preferredAssetId: Id
  preferredAssetVersionId: Id
  status: "DRAFT" | "APPROVED" | "ARCHIVED"
  approvalTimestamp?: ISODateTime
  approvedBy?: Id
  replacedByRemedyId?: Id
  replacementEffectiveDate?: ISODateTime
}

type RemedyEligibilityResolution = RecordMeta & {
  remediationId: Id
  caseId: Id
  floorId: Id
  verdictSnapshotId: Id
  verdictContentHash: string
  resolverVersion: string
  remedialType: StageBRemedyType
  remedyId: Id
  remedyRecordVersion: number
  remedyAssetVersionId: Id
  eligibilityRuleIds: string[]
  explanationCodes: string[]
  resolvedAt: ISODateTime
  resolutionHash: string
  status: "ELIGIBLE" | "INVALIDATED"
  invalidatedAt?: ISODateTime
  invalidationReason?: string
}

type PlacementPageSection = "A" | "B" | "C"

type PlacementPageType =
  | "FURNITURE_ADDON"
  | "APPLIANCE"
  | StageBRemedyType
  | "EXTRA"

type ReportPlacementPage = RecordMeta & {
  remediationId: Id
  reportId: Id
  caseId: Id
  floorId: Id
  section: PlacementPageSection
  pageType: PlacementPageType
  ordinal: number
  state: "DRAFT" | "FINALISED"
  baseLayoutVersionId: Id
  finalisedAt?: ISODateTime
  finalisedBy?: Id
  finalisationHash?: string
}

type PhysicalPlacement = RecordMeta & {
  remediationId: Id
  caseId: Id
  floorId: Id
  reportId: Id
  pageId: Id
  baseLayoutVersionId: Id
  placementType: "FURNITURE_ADDON" | "APPLIANCE" | "REMEDY" | "EXTRA"
  eligibilityResolutionId?: Id
  remedyId?: Id
  masterNumber?: number
  anchorX: NormalizedCoordinate
  anchorY: NormalizedCoordinate
  anchorLocked: boolean
  calloutX: NormalizedCoordinate
  calloutY: NormalizedCoordinate
  calloutWidth: NormalizedCoordinate
  calloutHeight: NormalizedCoordinate
  imageAssetId: Id
  imageAssetVersionId: Id
  imageAssetSnapshotId: Id
  nameSnapshot: string
  attributePurposeSnapshot: string
  locationReference?: string
  showCircle: boolean
  showFrame: boolean
  showHighlight: boolean
  state: "ACTIVE" | "LOCKED"
  dependencyReviewState: "CURRENT" | "NEEDS_REVIEW"
}

type PlacementImplementationRow = RecordMeta & {
  remediationId: Id
  reportId: Id
  pageId: Id
  placementId: Id
  masterNumber: number
  imageAssetSnapshotId: Id
  itemNameSnapshot: string
  attributePurposeSnapshot: string
  locationReference?: string
}

type MasterAppendixRow = RecordMeta & {
  remediationId: Id
  reportId: Id
  caseId: Id
  floorId: Id
  placementId: Id
  sourcePageId: Id
  baseLayoutVersionId: Id
  masterNumber: number
  imageAssetSnapshotId: Id
  itemNameSnapshot: string
  attributePurposeSnapshot: string
  locationReference?: string
}

type ClientCompletionBlankFields = {
  implemented: null
  implementationDate: null
  alternativeNeeded: null
}

type ImplementationSheetRenderRow =
  PlacementImplementationRow & ClientCompletionBlankFields

type MasterAppendixRenderRow =
  MasterAppendixRow & ClientCompletionBlankFields

type StageBIntegrityIssueCode =
  | "MISSING_EXISTING_LAYOUT"
  | "MISSING_FINAL_REVISED_LAYOUT"
  | "BASE_LAYOUT_NOT_LOCKED"
  | "BASE_LAYOUT_VERSION_MISMATCH"
  | "VERDICT_NOT_RESOLVED"
  | "REMEDY_NOT_ELIGIBLE"
  | "ASSET_REFERENCE_INVALID"
  | "ASSET_SNAPSHOT_MISSING"
  | "PLACEMENT_NOT_LOCKED"
  | "COORDINATE_INVALID"
  | "CALLOUT_OFF_PAGE"
  | "MASTER_NUMBER_DUPLICATE"
  | "MASTER_SEQUENCE_GAP"
  | "IMPLEMENTATION_ROW_MISSING"
  | "IMPLEMENTATION_ROW_MISMATCH"
  | "APPENDIX_ROW_MISSING"
  | "APPENDIX_ROW_MISMATCH"
  | "CROSS_SCOPE_REFERENCE"
  | "REPORT_STATE_CONFLICT"

type StageBIntegrityRun = RecordMeta & {
  remediationId: Id
  reportId: Id
  scopeHash: string
  status: "PASS" | "FAIL"
  issues: Array<{
    code: StageBIntegrityIssueCode
    entityType: string
    entityId?: Id
    field?: string
  }>
  checkedAt: ISODateTime
  checkedBy: Id
}
```

`ReportPlacementPage` and `PhysicalPlacement` are reusable report substrates rather than Section B-only persistence types. This proof creates a Section B remedy page and requires `placementType="REMEDY"`; later Section A Furniture Add-ons/Appliances and Section C Extras can reuse the same records without a schema redesign. For non-remedy placements, remedy eligibility fields are absent and the relevant source-asset validation applies instead.

The three implementation-completion properties exist only in `ImplementationSheetRenderRow` and `MasterAppendixRenderRow`. They must not be persisted as Stage B row columns or stored as mutable workflow state. The renderers materialize them as blank cells (`null` in the canonical manifest projection) every time; no Stage B action can populate them.

`RemedyEligibilityResolution` is an immutable evidence record, not a mutable cache. Re-resolution creates a successor and invalidates the former record only while the page is editable.

## 4. State machine

```text
NOT_STARTED
  -> LAYOUT_SELECTED      select final revised layout
  -> EDITING              create/edit draft placement against selected base version
  -> PAGE_FINALISED       hard-lock base and placement, assign number, project rows, integrity PASS
  -> REPORT_PROTECTED     existing report approval/protected-PDF pipeline
  -> DELIVERED            existing delivery transition only; currently disabled
```

Permitted rollback:

- `LAYOUT_SELECTED -> LAYOUT_SELECTED`: select another candidate; old base version becomes `SUPERSEDED`.
- `EDITING -> LAYOUT_SELECTED`: only if no downstream page is finalised; placements are marked invalid/needs-review according to the existing invalidation convention. No coordinate auto-remap. The user must explicitly review, move, rebuild or reconfirm them against the new selected base version before finalisation.
- `PAGE_FINALISED -> EDITING`: explicit reopen action, only before report protection/delivery. It invalidates the finalisation hash and latest integrity PASS.
- `REPORT_PROTECTED` and `DELIVERED`: no Stage B rollback.

The state is server-derived from durable records where practical; a stored state field may be retained for indexed workflow queries but must be checked against invariants transactionally.

## 5. `/api/actions` envelope

All actions use the established gateway envelope. The exact existing field names must prevail, but the required semantics are:

```ts
type StageBActionRequest<TName extends string, TPayload> = {
  action: TName
  payload: TPayload
  expectedRevision: number
  idempotencyKey: string
}

type StageBActionResult<T> = {
  ok: true
  data: T
  revision: number
  replayed: boolean
}

type StageBActionError = {
  ok: false
  error: {
    code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "SCOPE_MISMATCH"
      | "VERSION_CONFLICT"
      | "REVISION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_STATE"
      | "VALIDATION_FAILED"
      | "INTEGRITY_FAILED"
    message: string
    issues?: Array<{ code: string; field?: string; entityId?: string }>
  }
  revision?: number
}
```

Actor and `organisationId` are resolved from the authenticated request and never accepted from client payloads. Every payload includes the aggregate identifiers needed for server-side scope checks and record-level `expectedRecordVersion` values for records it mutates.

## 6. Allowlisted actions

### `stage-b-remediation-initialise`

Creates or idempotently returns the floor/report Stage B aggregate and remedy page shell. The server resolves and binds the authoritative Existing Layout asset and immutable asset version from upstream evaluation/evidence lineage; the client cannot nominate either reference.

```ts
type Payload = {
  caseId: Id
  floorId: Id
  reportId: Id
}
type Result = {
  remediation: StageBRemediation
  page: ReportPlacementPage
}
```

Preconditions: existing case/floor/report relationship; post-site/layout-review prerequisite met; exactly one authoritative Existing Layout asset version can be derived from the applicable upstream evaluation/evidence lineage; report not protected/delivered. Missing or ambiguous lineage fails closed with no aggregate created.

### `stage-b-final-layout-select`

Selects one revised-layout candidate and creates a new `SELECTED` base-layout version with an immutable asset snapshot.

```ts
type Payload = {
  remediationId: Id
  candidateId: Id
  expectedRemediationVersion: number
}
type Result = {
  remediation: StageBRemediation
  baseLayout: RemediationBaseLayoutVersion
  invalidatedPlacementIds: Id[]
}
```

Selection is rejected after any downstream page finalisation. Before finalisation, changing selection never remaps coordinates. Existing placements become `NEEDS_REVIEW` under the source tree's dependency-invalidation mechanism and cannot be finalised until rebuilt, moved or explicitly reconfirmed through the placement action against the new selected base version.

### `stage-b-remedy-resolve`

Runs the approved, versioned resolver against an existing immutable verdict snapshot and stores the eligibility evidence. It does not select or place a remedy.

```ts
type Payload = {
  remediationId: Id
  verdictSnapshotId: Id
  remedialType: StageBRemedyType
  resolverVersion: string
  expectedRemediationVersion: number
}
type Result = {
  verdictSnapshotId: Id
  resolverVersion: string
  eligible: RemedyEligibilityResolution[]
}
```

For the proof fixture, exactly one remedy is eligible. Production semantics remain `0...N`. Only `APPROVED`, effective, non-archived remedies with resolvable approved asset versions may be returned. The result order is stable but is not a recommendation ranking.

### `stage-b-remedy-placement-upsert`

Creates the one proof placement or updates it while the page is draft. The server copies immutable remedy and asset snapshots and verifies eligibility.

```ts
type Payload = {
  remediationId: Id
  pageId: Id
  placementId?: Id
  eligibilityResolutionId: Id
  baseLayoutVersionId: Id
  anchorX: number
  anchorY: number
  calloutX: number
  calloutY: number
  calloutWidth: number
  calloutHeight: number
  locationReference?: string
  showCircle: boolean
  showFrame: boolean
  showHighlight: boolean
  completePlacement: boolean
  expectedPageVersion: number
  expectedPlacementVersion?: number
}
type Result = {
  placement: PhysicalPlacement
  provisionalMasterNumber: 1
}
```

Coordinates must be finite and normalized. `calloutWidth` and `calloutHeight` must be greater than zero, and `calloutX + calloutWidth <= 1`, `calloutY + calloutHeight <= 1`. A draft placement may be created or completed against the currently selected base-layout version before hard lock. Changing that selection marks affected placements for review; they cannot finalise until explicitly reconciled to the new version. Finalisation hard-locks the anchor and base layout. Client-supplied names, asset IDs, remedy metadata and master numbers are forbidden.

There is no Stage B implementation-tracking mutation in this proof slice. `Implemented`, `Implementation Date` and `Alternative Needed` render as blank client-facing fields in the generated implementation sheet and appendix. `locationReference` remains placement/report content and may be supplied through the placement action.

### `stage-b-page-finalise`

Finalises the one remedy page in one transaction.

```ts
type Payload = {
  remediationId: Id
  pageId: Id
  expectedRemediationVersion: number
  expectedPageVersion: number
}
type Result = {
  remediation: StageBRemediation
  page: ReportPlacementPage
  baseLayout: RemediationBaseLayoutVersion
  placement: PhysicalPlacement
  implementationRow: PlacementImplementationRow
  appendixRow: MasterAppendixRow
  integrityRun: StageBIntegrityRun & { status: "PASS" }
}
```

Transaction steps: verify gates and scope; reject stale-base or `NEEDS_REVIEW` placements; hard-lock the currently selected base if this is the first downstream page finalisation; verify one eligible completed placement and lock its anchor; assign/resequence master number `1`; upsert implementation and appendix projections with blank client completion fields; snapshot/hash the page; run integrity; persist `FINALISED` only on PASS; append audit/timeline records; advance global revision. Any failure rolls back the full transaction.

### `stage-b-page-reopen`

Reopens a finalised page before report protection/delivery.

```ts
type Payload = {
  remediationId: Id
  pageId: Id
  reason: string
  expectedRemediationVersion: number
  expectedPageVersion: number
}
type Result = {
  remediation: StageBRemediation
  page: ReportPlacementPage
  invalidatedIntegrityRunId: Id
}
```

Reopen keeps snapshots and numbering as draft projections, clears the finalisation hash, and requires a non-empty audit reason. It does not unlock or change the base layout; changing the base requires the broader remediation-reopen workflow, outside this proof slice.

### `stage-b-integrity-validate`

Runs the same server-side validator used by page finalisation and the protected-PDF gate.

```ts
type Payload = {
  remediationId: Id
  reportId: Id
  expectedRemediationVersion: number
}
type Result = { integrityRun: StageBIntegrityRun }
```

This is a protected mutation because it persists signed/hashed validation evidence and an audit record. Read-only diagnostics may project the last run through existing integrity endpoints.

## 7. Persistence and migration additions

Additive tables (names should be adapted to repository conventions):

1. `stage_b_remediations`
2. `stage_b_revised_layout_candidates` only if upstream plan/media linkage cannot represent candidate eligibility
3. `stage_b_base_layout_versions`
4. `remedy_repository_records`
5. `remedy_eligibility_resolutions`
6. `report_placement_pages` only if existing report-page/version records cannot carry the reusable Section A/B/C placement-page fields
7. `physical_placements`
8. `placement_implementation_rows` containing placement-derived report content only, not mutable client-completion fields
9. `master_appendix_rows` containing placement-derived report content only, not mutable client-completion fields
10. `stage_b_integrity_runs` plus either a JSON issue payload or child issue table, following existing persistence conventions

Required constraints/indexes:

- Unique remediation aggregate: `(organisation_id, case_id, floor_id, report_id)`.
- Unique candidate identity per floor and asset version.
- Unique base-layout version number per remediation.
- At most one `LOCKED` base layout per remediation, enforced by transaction if D1 partial-index support/conventions are unsuitable.
- Remedy status/type indexes and effective-date lookup index.
- Unique eligibility evidence: `(remediation_id, verdict_snapshot_id, resolver_version, remedial_type, remedy_id, remedy_record_version)`.
- Unique placement identity and index `(remediation_id, page_id)`.
- Unique `(report_id, master_number)` for non-null master numbers.
- Unique implementation row by `placement_id`.
- Unique appendix row by `placement_id` and by `(report_id, master_number)`.
- Foreign keys or equivalent application-enforced references for organisation, case, floor, report, page, asset versions, verdict snapshots and placement.
- Check constraints where supported for normalized coordinates and positive dimensions; duplicate checks remain in domain validation.
- `record_version`, timestamps and actor IDs on mutable business rows.

Migration must be additive and initially dormant. No existing Stage A/report rows are backfilled into Stage B. A remediation aggregate is created only by the initialise action. Forward-fix rollback is: disable Stage B action allowlist and retain dormant additive records; no destructive down migration is required in production.

## 8. Dependency and invalidation rules

| Dependency change | Allowed when | Required effect |
|---|---|---|
| Existing-layout upstream reference changes | Before Stage B initialisation only | Initialisation binds the evidence asset version; later changes do not mutate the Stage B snapshot. |
| Revised-layout candidate changes | Before any downstream page finalisation | Create new selected base version; supersede the old selection; mark placements bound to the old base invalid/needs-review; never remap coordinates. |
| Base layout hard-lock | Transactionally at first downstream page finalisation | Selection becomes immutable inside this slice; all finalised placements must reference this exact locked version. |
| Verdict snapshot superseded | While page draft | Existing resolution becomes invalidated; placement cannot finalise until re-resolved/reconfirmed. |
| Resolver/methodology version changes | Future resolution or reopened draft | Existing finalised/protected records remain unchanged; new resolution evidence is required for editable work. |
| Remedy repository metadata/asset changes | Any time | Existing placements retain snapshots; draft eligibility may be re-resolved if policy requires; protected/delivered output never changes. |
| Remedy archived/replaced | Before placement finalisation | New resolution excludes it according to effective date; existing finalised placement remains reproducible. |
| Placement changes | Draft only | Regenerate implementation and appendix projections; resequence server-side. |
| Page reopened | Before report protection | Invalidate finalisation hash and integrity PASS; preserve audit trail. |
| Report protected/delivered | Existing pipeline transition | Freeze all Stage B references and snapshots; reject every Stage B write. |

Invalidation must use the existing dependency-invalidation convention if available. It must be explicit, auditable and fail closed at finalisation.

## 9. Provisional role/capability matrix

This matrix expresses least-privilege intent only and is explicitly source-tree-dependent. It does **not** define new permanent capability identifiers. Implementation must first inspect and reuse the existing role, capability, assignment-scope and report-approval conventions; any genuinely missing capability requires a separate reviewed architecture decision.

| Operation | Required authority concept | SUPER_ADMIN | ADMIN | SETTER | CONSULTANT | CLIENT |
|---|---|---:|---:|---:|---:|---:|
| View Stage B aggregate/assets | Existing case/report view authority | Provisional Yes | Provisional Yes | Assigned scope, if existing policy permits | Assigned scope | No |
| Initialise Stage B | Existing case/report manage authority | Provisional Yes | Provisional Yes | No | Assigned scope, provisional | No |
| Select final revised layout | Existing layout/report edit authority | Provisional Yes | Provisional Yes | No | Assigned scope, provisional | No |
| Resolve eligible remedies | Existing evaluation/report edit authority | Provisional Yes | Provisional Yes | No | Assigned scope, provisional | No |
| Create/edit placement | Existing report-content edit authority | Provisional Yes | Provisional Yes | No | Assigned scope, provisional | No |
| Finalise page and transactionally lock base | Existing report finalise authority | Provisional Yes | Provisional Yes | No | Only if current report policy permits | No |
| Reopen finalised page | Existing report reopen/administrative authority | Provisional Yes | Provisional Yes | No | No by default | No |
| Run integrity validation | Existing integrity/report validation authority | Provisional Yes | Provisional Yes | No | Assigned scope, provisional | No |
| Approve repository remedy | Existing repository approval authority | Provisional Yes | Subject to existing approval policy | No | No | No |
| Protect/approve report | Existing report approval authority | Existing policy | Existing policy | No | Existing policy | No |

No action accepts an actor, organisation or capability assertion from the client. Assignment scope, case/floor ownership, commercial gates and report state are rechecked server-side on every mutation.

Two-person approval is not invented for page finalisation. If existing report policy requires separate preparer/reviewer, the Stage B page author must not satisfy the later report approval as the second approver.

## 10. Audit and timeline events

Each successful non-replayed mutation writes one immutable audit event. Idempotent replay returns the original result without duplicating audit/timeline events.

Minimum event types:

- `STAGE_B_INITIALISED`
- `STAGE_B_FINAL_LAYOUT_SELECTED`
- `STAGE_B_BASE_LAYOUT_LOCKED`
- `STAGE_B_REMEDIES_RESOLVED`
- `STAGE_B_PLACEMENT_CREATED`
- `STAGE_B_PLACEMENT_UPDATED`
- `STAGE_B_PAGE_FINALISED`
- `STAGE_B_PAGE_REOPENED`
- `STAGE_B_INTEGRITY_PASSED`
- `STAGE_B_INTEGRITY_FAILED`

Timeline events should record client-safe operational facts only. Audit detail may include record IDs, versions, hashes, reason codes and actor; it must not duplicate client PII, raw verdict payloads, private asset URLs or secrets.

## 11. Report integration mapping

| Stage B record | Existing pipeline integration |
|---|---|
| `StageBRemediation` | Child aggregate of the existing floor-scoped report record/version. |
| Existing layout reference | Reuse upstream evidence/media asset version; snapshot into report artifact manifest. |
| Locked base layout | Add immutable layout snapshot/hash to the report version manifest. |
| Verdict and resolver evidence | Add verdict snapshot ID/hash and methodology/resolver version to report provenance. |
| Finalised Stage B page | Add Section B page content manifest to report assembly in locked PRD order. |
| Implementation row | Render immediately after its visual placement page. |
| Appendix row | Feed Section D Master Implementation Index projection. |
| Placement/master number | Feed Section D Master Numbered Layout and integrity checks. |
| Integrity PASS | Mandatory prerequisite for existing Founder report approval and protected-PDF creation. |
| Finalisation hash | Included in the existing report version/artifact content hash. |

The proof slice may render only the selected remedy page, its implementation sheet and one-row appendix in test fixtures, but its ordering identifiers must match the full PRD order. The existing protected-PDF service remains the sole artifact boundary. Stage B must provide a deterministic render manifest; it must not independently generate or deliver a PDF.

Suggested deterministic render manifest:

```ts
type StageBRenderManifest = {
  schemaVersion: "stage-b-render-manifest/v1"
  organisationId: Id
  caseId: Id
  floorId: Id
  reportId: Id
  reportVersionId: Id
  existingLayout: { snapshotId: Id; contentHash: string }
  baseLayout: { versionId: Id; snapshotId: Id; contentHash: string }
  provenance: {
    verdictSnapshotId: Id
    verdictContentHash: string
    resolverVersion: string
    eligibilityResolutionHash: string
  }
  pages: Array<{
    pageId: Id
    ordinal: number
    finalisationHash: string
    placements: PhysicalPlacement[]
    implementationRows: ImplementationSheetRenderRow[]
  }>
  appendixRows: MasterAppendixRenderRow[]
  integrityRunId: Id
  integrityScopeHash: string
}
```

Before protected-PDF creation, rebuild the manifest from durable records, rerun integrity, compare the scope hash with the finalised page hash inputs, and fail closed on mismatch.

## 12. Immutable delivery and snapshot rules

Snapshot at selection:

- final revised-layout exact asset version, bytes/content hash and immutable snapshot reference;
- existing-layout exact evidence asset version if not already frozen upstream.

Snapshot at placement creation/replace:

- remedy ID and record version;
- preferred image asset ID/version and immutable image snapshot;
- remedy name and attribute/purpose;
- eligibility resolution and resolver/verdict provenance.

Snapshot at page finalisation:

- normalized geometry and display flags;
- locked anchor state;
- master number;
- implementation and appendix projections;
- deterministic page content hash and integrity scope hash.

Snapshot at report protection/delivery through the existing pipeline:

- complete Stage B render manifest;
- exact base/existing layout snapshots;
- exact placement image snapshots and text;
- page order, implementation row and appendix row;
- artifact hash and protected storage reference.

Repository archive/replacement, preferred-asset changes, metadata edits, resolver updates and upstream layout changes never rewrite snapshots. Mutable IDs remain provenance links only. Rendering protected/delivered reports uses snapshots exclusively and fails closed if any required snapshot cannot be read or hash-verified.

## 13. Integrity validator

Validation is deterministic and side-effect-free before its result record/audit event is persisted. It must verify:

1. Organisation/case/floor/report scope consistency across every record.
2. Existing and revised layout asset versions and snapshots exist and hash-verify.
3. Exactly one locked base-layout version is active.
4. Verdict snapshot, resolver version and eligibility evidence resolve and hash-verify.
5. The placement uses the same base version, page and eligible remedy.
6. Anchor/callout values are finite, normalized and print-safe; dimensions are positive and remain on page.
7. Placement is `CURRENT`, and the placement and anchor are locked at finalisation.
8. Master numbers are unique and contiguous from `1`; this slice expects `[1]`.
9. Exactly one implementation row and appendix row exist for the placement.
10. Placement, implementation and appendix rows agree on placement ID, master number, image snapshot, name, purpose and location reference; all three client-completion fields remain blank in both render projections.
11. Page/report state permits finalisation/protection.
12. Recomputed finalisation and integrity scope hashes equal stored values when validating an already-finalised page.

Integrity failures expose stable issue codes and safe recovery hints; raw private data and asset URLs are excluded.

## 14. Required tests

### Domain/unit

- Coordinate acceptance at `0` and `1` boundaries and rejection of NaN, Infinity, negative, oversized and off-page callouts.
- State-transition table, including all forbidden transitions.
- Draft placement against a selected, not-yet-locked base version.
- Base-layout selection change marks affected placements `NEEDS_REVIEW`; no coordinate remapping; explicit reconciliation is required.
- First downstream page finalisation hard-locks the selected base version in the same transaction.
- Deterministic resolver fixture: one immutable verdict yields one eligible approved remedy under one resolver version; `0...N` behavior is retained.
- Draft/archived/not-yet-effective/replaced remedy exclusion.
- Repository metadata/asset changes do not mutate placement snapshots.
- Master numbering assigns `1`, rejects client override and resequences deterministically.
- Implementation and appendix projection equality.
- Deterministic finalisation/render/integrity hashes.

### Action/integration

- Every action: unauthenticated, forbidden role, wrong organisation, wrong case/floor/report scope, stale record version, stale global revision and malformed payload.
- Idempotent replay returns the original result and creates no duplicate row/event; same key with changed body conflicts.
- Initialisation accepts only case/floor/report identifiers and server-derives exactly one valid upstream Existing Layout asset version; missing, ambiguous or cross-scope lineage fails closed.
- Final-layout selection rejects non-candidate and cross-floor assets.
- Selection change invalidates old-base placements and never remaps them.
- Resolve action proves verdict and remedy provenance.
- Placement creation snapshots server-owned remedy metadata/assets and rejects client-owned master/name/asset fields.
- Placement finalisation rejects `NEEDS_REVIEW` and stale-base placements.
- No allowlisted Stage B action accepts `implemented`, `implementationDate` or `alternativeNeeded` as mutable workflow input.
- Finalise transaction rolls back all records when integrity fails.
- Concurrent finalisation produces one success, one conflict, one master number and no duplicate rows/events.
- Reopen allowed before protection and rejected after protection/delivery.
- Audit and timeline events are exactly-once and contain no private URLs/PII payloads.

### Persistence/migration

- Additive migration applies from the latest verified schema and reapplies safely according to repository migration convention.
- Unique, foreign-key/application constraints and indexes behave under realistic D1 transactions.
- No backfill changes existing Stage A/report artifacts.
- Forward-fix disablement leaves current report flow operational.

### Report/integrity

- Golden fixture produces one visual placement, one implementation row, master number `1` and one appendix row; the three client implementation fields render blank.
- Preview render manifest equals protected-PDF input manifest byte-for-byte after canonical serialization.
- Missing/broken asset snapshot, mismatched base version, numbering gap, duplicate row and cross-floor reference each fail closed with the expected issue code.
- Protected-PDF gate rejects absent/stale/failed integrity evidence.
- Existing Stage A bytes and hashes remain unchanged.

### Security/role regression

- Provisional role/authority behavior is reconciled to and tested through the source tree's existing capability conventions before implementation.
- CLIENT cannot read private repository data or invoke any Stage B mutation.
- SETTER cannot select layouts or finalise unless explicitly permitted by established source-tree policy.
- Assignment scope cannot be bypassed by guessing IDs.

### Critical-path acceptance fixture

Given one valid case/floor/report, one existing layout, two revised candidates, one verdict snapshot and one approved eligible remedy: initialise; select candidate A; create a draft remedy placement; select candidate B; assert the placement is `NEEDS_REVIEW` with unchanged coordinates; explicitly reconcile it to candidate B; resolve or confirm eligibility; complete the placement; finalise the page, transactionally hard-locking candidate B; validate; assemble the render manifest. Assert state `PAGE_FINALISED`, master sequence `[1]`, one matching implementation row, one matching appendix row with blank client implementation fields, integrity `PASS`, complete provenance and no external calls/client delivery.

## 15. Explicit source-tree blockers

The following cannot be resolved from the architecture snapshot and PRD alone and must be reconciled against the actual source tree before implementation:

1. Exact existing TypeScript names, ID brands, action envelope, error envelope and allowlist registration mechanism.
2. Exact role/capability identifiers, Founder-role mapping, assignment-scope rules and report preparer/approver separation.
3. Exact case/floor/report relationships and whether a report version or report aggregate is the correct Stage B parent.
4. Existing D1 schema, latest migration number after the recorded v14 work, SQL conventions, transaction boundaries and foreign-key behavior.
5. The exact upstream evidence-lineage rule that identifies one authoritative Existing Layout asset version, and whether revised layouts already have a canonical plan/version/candidate record suitable for reuse.
6. Which existing evaluation/verdict snapshot is the authoritative structured input and its schema/hash/version fields.
7. The approved Stage B remedy resolver/methodology rules. The PRD defines selection behavior but not the domain rule mapping from verdict fields to remedy metadata.
8. Whether existing recommendation/implementation-task records can safely back the implementation row without semantic conflict.
9. Existing media asset/version/snapshot record names, immutable-byte guarantees, content-hash algorithm and protected-object retrieval contract.
10. Existing report-page, report-version, approval, release and protected-PDF state names and their legal transitions.
11. Existing dependency-invalidation types and whether they support `Needs Review` without adding another state.
12. Canonical hashing/serialization utilities needed for eligibility, page, manifest and integrity hashes.
13. Existing audit/timeline event schemas and which Stage B events are client-visible.
14. Existing bootstrap/read projection pattern for loading candidates, repositories, placement state and integrity results.
15. Existing render technology, coordinate origin, printable bounds, page dimensions, font embedding and preview/PDF parity mechanism.
16. Whether D1 supports/enforces the proposed checks/indexes in the deployed adapter or requires transaction-level enforcement.
17. Exact commercial/payment gate at Stage B entry versus report protection; the snapshot places full balance clearance before Stage B, but source policy must be authoritative.
18. Whether client delivery has any latent state transitions that must reject Stage B writes even while delivery remains disabled.
19. Repository approval policy, including whether two-person approval is already mandatory.
20. Current tests, fixture builders, persistence adapters and release commands required to integrate this slice without duplicating infrastructure.

These blockers prevent file-level implementation and final schema/API naming, but they do not change the aggregate, invariants or transaction boundaries proposed here.

## 16. Release boundary for the proof slice

The slice is ready to merge only when its schema, action handlers and report-manifest adapter pass the tests above against the actual source tree. It is not authority to activate Stage B for production users, generate a client-facing final remedy report, enable client delivery, upload live repository assets, execute hosted migrations, or call external services.
