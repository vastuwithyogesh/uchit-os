import type {
  AppUser, ColourFrameCompositionRecord, ExistingLayoutAnnotationRecord, ExistingLayoutAnnotationType,
  MasterAppendixRowRecord, PhysicalPlacementRecord, PlacementImplementationRowRecord, RemediationReportIntegrityRunRecord,
  ReportPlacementPageRecord, SectionAAssetRecord, SectionAAssetType, SectionAIntegrityRunRecord, SectionARenderManifest,
  SectionAVisualPageRecord, SectionAVisualPageType, SectionAWorkspaceRecord, StageBRemediationRecord
} from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { getAppState, type AppState } from "./store.ts";
import { completeRemediationReconciliation, liveReportPlacements, REPORT_WIDE_PLACEMENT_PAGES, reportWideMasterNumber, reportWidePlacementPages, resequenceReportPlacements, sortReportPlacements } from "./remediation-sequence.ts";
import { buildStageBRenderManifest, StageBError } from "./stage-b-remediation.ts";

export const SECTION_A_VISUAL_PAGES = [
  { pageType: "EXISTING_LAYOUT", ordinal: 1, label: "Existing Furniture Layout" },
  { pageType: "FINAL_REVISED_LAYOUT", ordinal: 2, label: "Recommended / Final Revised Furniture Layout" },
  { pageType: "COLOUR_FRAME", ordinal: 7, label: "Colour Chart / Wall Colour Reference" }
] as const satisfies ReadonlyArray<{ pageType: SectionAVisualPageType; ordinal: 1 | 2 | 7; label: string }>;

export const SECTION_A_PLACEMENT_PAGES = [
  { pageType: "FURNITURE_ADDON", placementType: "FURNITURE_ADDON", ordinal: 3, label: "Furniture Add-ons" },
  { pageType: "APPLIANCE", placementType: "APPLIANCE", ordinal: 5, label: "Appliances" }
] as const;

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function owner(actor: AppUser) {
  if (!actor.organisationId) throw new StageBError("An active organisation is required.", 403);
  return actor.organisationId;
}
function safeText(value: unknown, label: string, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) throw new StageBError(`${label} is required and must be safe text up to ${max} characters.`);
  return value.trim();
}
function expected(record: { recordVersion?: number }, value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new StageBError(`The latest ${label} version is required.`, 428);
  if ((record.recordVersion ?? 0) !== Number(value)) throw new StageBError(`The ${label} changed. Refresh and try again.`, 409);
}
function normalized(value: unknown, label: string) {
  const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1) throw new StageBError(`${label} must be normalized between 0 and 1.`); return number;
}
function numberInRange(value: unknown, label: string, min: number, max: number) {
  const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new StageBError(`${label} must be between ${min} and ${max}.`); return number;
}
function context(state: AppState, remediationIdValue: unknown, actor: AppUser) {
  const remediationId = safeText(remediationIdValue, "Remediation ID");
  const remediation = state.stageBRemediations.find((item) => item.id === remediationId && item.organisationId === owner(actor));
  const caseRecord = remediation ? state.vastuCases.find((item) => item.id === remediation.caseId && (!item.organisationId || item.organisationId === owner(actor))) : undefined;
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === remediation?.floorId && item.caseId === caseRecord?.id && item.projectId === project.id) : undefined;
  const report = floor ? state.reportVersions.find((item) => item.id === remediation?.reportId && item.caseId === caseRecord?.id && item.floorId === floor.id) : undefined;
  if (!remediation || !caseRecord || !project || !floor || !report) throw new StageBError("Section A remediation, report, case, and floor scope do not match.", 404);
  const workspace = state.sectionAWorkspaces.find((item) => item.remediationId === remediation.id && item.organisationId === owner(actor));
  return { remediation, caseRecord, project, floor, report, workspace };
}
function requireWorkspace(state: AppState, remediationIdValue: unknown, actor: AppUser) {
  const scoped = context(state, remediationIdValue, actor); if (!scoped.workspace) throw new StageBError("Section A workspace has not been initialised.", 404); return { ...scoped, workspace: scoped.workspace };
}
function addTimeline(state: AppState, remediation: StageBRemediationRecord, actor: AppUser, headline: string, details: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === remediation.caseId); if (!caseRecord) return;
  state.timelineEvents.unshift({ id: id("timeline"), organisationId: caseRecord.organisationId ?? actor.organisationId, clientId: caseRecord.clientId,
    category: "Reports", headline, details, happenedAt: now(), actorRole: actor.role, actorId: actor.id, actorName: actor.fullName });
}
function visualPages(state: AppState, workspaceId: string) {
  return state.sectionAVisualPages.filter((item) => item.workspaceId === workspaceId).sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
}
function placementPages(state: AppState, remediationId: string) {
  return state.reportPlacementPages.filter((item) => item.remediationId === remediationId && item.section === "A" && SECTION_A_PLACEMENT_PAGES.some((configuration) => configuration.pageType === item.pageType && configuration.ordinal === item.ordinal))
    .sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
}
function liveAnnotations(state: AppState, workspaceId: string) { return state.existingLayoutAnnotations.filter((item) => item.workspaceId === workspaceId && item.state !== "DELETED"); }
function liveCompositions(state: AppState, workspaceId: string) { return state.colourFrameCompositions.filter((item) => item.workspaceId === workspaceId && item.state !== "DELETED"); }
function sectionAPlacements(state: AppState, remediationId: string) {
  const pageIds = new Set(placementPages(state, remediationId).map((item) => item.id));
  return sortReportPlacements(state, remediationId, liveReportPlacements(state, remediationId).filter((item) => pageIds.has(item.pageId)));
}
function projectionForPlacement(state: AppState, remediation: StageBRemediationRecord, page: ReportPlacementPageRecord, placement: PhysicalPlacementRecord, actor: AppUser) {
  let row = state.placementImplementationRows.find((item) => item.remediationId === remediation.id && item.placementId === placement.id);
  const rowValues = { reportId: remediation.reportId, pageId: page.id, masterNumber: placement.masterNumber!, imageAssetSnapshotId: placement.imageAssetSnapshotId,
    itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot, ...(placement.locationReference ? { locationReference: placement.locationReference } : {}) };
  if (row) { Object.assign(row, rowValues); row.updatedByActorUserId = actor.id; row.recordVersion = (row.recordVersion ?? 0) + 1; }
  else { row = { id: id("implementation-row"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    remediationId: remediation.id, placementId: placement.id, ...rowValues }; state.placementImplementationRows.unshift(row); }
  let appendix = state.masterAppendixRows.find((item) => item.remediationId === remediation.id && item.placementId === placement.id);
  const appendixValues = { reportId: remediation.reportId, caseId: remediation.caseId, floorId: remediation.floorId, sourcePageId: page.id,
    baseLayoutVersionId: placement.baseLayoutVersionId, masterNumber: placement.masterNumber!, imageAssetSnapshotId: placement.imageAssetSnapshotId,
    itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot, ...(placement.locationReference ? { locationReference: placement.locationReference } : {}) };
  if (appendix) { Object.assign(appendix, appendixValues); appendix.updatedByActorUserId = actor.id; appendix.recordVersion = (appendix.recordVersion ?? 0) + 1; }
  else { appendix = { id: id("appendix-row"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    remediationId: remediation.id, placementId: placement.id, ...appendixValues }; state.masterAppendixRows.unshift(appendix); }
  return { row, appendix };
}

export function initialiseSectionA(input: { remediationId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = context(state, input.remediationId, input.actor); const key = safeText(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, reportId: scoped.report.id });
  if (scoped.workspace) {
    if (scoped.workspace.idempotencyKey === key && scoped.workspace.requestHash !== requestHash) throw new StageBError("This Section A initialisation key was used with different inputs.", 409);
    return { workspace: scoped.workspace, visualPages: visualPages(state, scoped.workspace.id), placementPages: placementPages(state, scoped.remediation.id) };
  }
  if (scoped.remediation.state === "PAGE_FINALISED") throw new StageBError("A frozen historical remedy report cannot be expanded with a new Section A workspace.", 409);
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const workspace: SectionAWorkspaceRecord = { id: id("section-a"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    remediationId: scoped.remediation.id, projectId: scoped.project.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, reportId: scoped.report.id,
    state: "EDITING", idempotencyKey: key, requestHash, createdAt: now() };
  const visuals: SectionAVisualPageRecord[] = SECTION_A_VISUAL_PAGES.map((configuration) => ({ id: id("section-a-page"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, workspaceId: workspace.id, remediationId: scoped.remediation.id, reportId: scoped.report.id,
    caseId: scoped.caseRecord.id, floorId: scoped.floor.id, pageType: configuration.pageType, ordinal: configuration.ordinal, state: "DRAFT" }));
  const placements: ReportPlacementPageRecord[] = SECTION_A_PLACEMENT_PAGES.map((configuration) => ({ id: id("placement-page"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, remediationId: scoped.remediation.id, reportId: scoped.report.id, caseId: scoped.caseRecord.id,
    floorId: scoped.floor.id, section: "A", pageType: configuration.pageType, ordinal: configuration.ordinal, state: "DRAFT" }));
  state.sectionAWorkspaces.unshift(workspace); state.sectionAVisualPages.unshift(...visuals); state.reportPlacementPages.unshift(...placements);
  scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.remediation, input.actor, "Section A workspace opened", "Existing Layout, Final Revised Layout, Furniture Add-ons, Appliances and Colour Frame pages opened in locked report order.");
  return { workspace, visualPages: visuals, placementPages: placements };
}

function assetType(value: unknown): SectionAAssetType {
  const parsed = safeText(value, "Section A asset type") as SectionAAssetType;
  if (!(["FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME"] as const).includes(parsed)) throw new StageBError("Section A asset type is not supported."); return parsed;
}
export function registerSectionAAsset(input: { remediationId: unknown; assetType: unknown; name: unknown; attributePurpose: unknown; assetId: unknown; assetVersionId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const type = assetType(input.assetType);
  const assetId = safeText(input.assetId, "Asset ID"), assetVersionId = safeText(input.assetVersionId, "Asset version ID"), key = safeText(input.idempotencyKey, "Idempotency key");
  const media = state.mediaAssetVersions.find((item) => item.id === assetVersionId && item.assetId === assetId && (!item.organisationId || item.organisationId === owner(input.actor)) && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status));
  if (!media) throw new StageBError("Approved immutable media asset version was not found for this Section A item.", 404);
  const values = { assetType: type, name: safeText(input.name, "Item name"), attributePurpose: safeText(input.attributePurpose, "Purpose or attribute"), assetId, assetVersionId,
    assetSnapshotId: deterministicContentHash({ assetId, versionId: assetVersionId, checksumSha256: media.checksumSha256 }) };
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, ...values });
  const replay = state.sectionAAssets.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This Section A asset key was used with different inputs.", 409); return replay; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const record: SectionAAssetRecord = { id: id("section-a-asset"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    workspaceId: scoped.workspace.id, remediationId: scoped.remediation.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, ...values, status: "APPROVED", idempotencyKey: key, requestHash };
  state.sectionAAssets.unshift(record); scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; scoped.remediation.updatedByActorUserId = input.actor.id; return record;
}

function annotationType(value: unknown): ExistingLayoutAnnotationType {
  const parsed = safeText(value, "Annotation type") as ExistingLayoutAnnotationType;
  if (!(["CIRCLE", "ARROW", "HIGHLIGHT", "PEN", "TEXT"] as const).includes(parsed)) throw new StageBError("Annotation type is not supported."); return parsed;
}
function annotationPoints(value: unknown, type: ExistingLayoutAnnotationType) {
  if (!Array.isArray(value) || value.length > 100) throw new StageBError("Annotation points must be a bounded normalized point array.");
  const points = value.map((item, index) => ({ x: normalized((item as { x?: unknown })?.x, `Point ${index + 1} X`), y: normalized((item as { y?: unknown })?.y, `Point ${index + 1} Y`) }));
  const required = type === "TEXT" ? 1 : 2; if (points.length < required || (type === "ARROW" && points.length !== 2)) throw new StageBError(`${type} annotation geometry is incomplete.`); return points;
}
export function upsertExistingLayoutAnnotation(input: { remediationId: unknown; pageId: unknown; annotationId?: unknown; annotationType: unknown; points: unknown; text?: unknown; colour: unknown; strokeWidth: unknown; opacity: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const pageId = safeText(input.pageId, "Page ID");
  const page = state.sectionAVisualPages.find((item) => item.id === pageId && item.workspaceId === scoped.workspace.id && item.pageType === "EXISTING_LAYOUT" && item.state === "DRAFT");
  if (!page) throw new StageBError("Editable Existing Furniture Layout page was not found.", 404);
  const type = annotationType(input.annotationType), points = annotationPoints(input.points, type), key = safeText(input.idempotencyKey, "Idempotency key");
  const textSnapshot = type === "TEXT" ? safeText(input.text, "Annotation text", 500) : undefined;
  const colour = safeText(input.colour, "Annotation colour", 20); if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new StageBError("Annotation colour must be a six-digit HEX value.");
  const values = { annotationType: type, points, ...(textSnapshot ? { textSnapshot } : {}), colour, strokeWidth: numberInRange(input.strokeWidth, "Stroke width", .001, .05), opacity: numberInRange(input.opacity, "Opacity", .05, 1) };
  const requestHash = deterministicContentHash({ pageId, ...values }), replay = state.existingLayoutAnnotations.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This annotation key was used with different content.", 409); return replay; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const annotationId = input.annotationId === undefined ? undefined : safeText(input.annotationId, "Annotation ID");
  let annotation = annotationId ? state.existingLayoutAnnotations.find((item) => item.id === annotationId && item.workspaceId === scoped.workspace.id && item.pageId === page.id && item.state !== "DELETED") : undefined;
  if (annotationId && !annotation) throw new StageBError("Editable Existing Layout annotation was not found.", 404);
  const recordValues = { existingLayoutSnapshotId: scoped.remediation.existingLayoutSnapshotId, ...values, state: "ACTIVE" as const, idempotencyKey: key, requestHash, updatedByActorUserId: input.actor.id };
  if (annotation) { Object.assign(annotation, recordValues); annotation.recordVersion = (annotation.recordVersion ?? 0) + 1; }
  else { annotation = { id: id("existing-layout-annotation"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, recordVersion: 1,
    workspaceId: scoped.workspace.id, remediationId: scoped.remediation.id, reportId: scoped.report.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, pageId: page.id, ...recordValues }; state.existingLayoutAnnotations.unshift(annotation); }
  page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; return annotation;
}

export function deleteExistingLayoutAnnotation(input: { remediationId: unknown; pageId: unknown; annotationId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const pageId = safeText(input.pageId, "Page ID"), annotationId = safeText(input.annotationId, "Annotation ID");
  const page = state.sectionAVisualPages.find((item) => item.id === pageId && item.workspaceId === scoped.workspace.id && item.pageType === "EXISTING_LAYOUT" && item.state === "DRAFT");
  const annotation = state.existingLayoutAnnotations.find((item) => item.id === annotationId && item.workspaceId === scoped.workspace.id && item.pageId === page?.id);
  if (!page || !annotation) throw new StageBError("Existing Layout annotation was not found on this editable page.", 404);
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageId, annotationId });
  if (annotation.state === "DELETED") { if (annotation.deletionIdempotencyKey !== key || annotation.deletionRequestHash !== requestHash) throw new StageBError("This annotation was already deleted by another request.", 409); return { deletedAnnotationId: annotation.id }; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation"); annotation.state = "DELETED"; annotation.deletedAt = now(); annotation.deletedBy = input.actor.id;
  annotation.deletionIdempotencyKey = key; annotation.deletionRequestHash = requestHash; annotation.updatedByActorUserId = input.actor.id; annotation.recordVersion = (annotation.recordVersion ?? 0) + 1;
  page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; return { deletedAnnotationId: annotation.id };
}

function sectionAPlacementType(value: unknown) {
  const type = assetType(value); if (type === "COLOUR_FRAME") throw new StageBError("Colour Frames do not use physical placement records."); return type;
}
function baseLayout(state: AppState, remediation: StageBRemediationRecord, baseLayoutVersionIdValue: unknown) {
  const baseLayoutVersionId = safeText(baseLayoutVersionIdValue, "Base-layout version ID"); const base = state.remediationBaseLayoutVersions.find((item) => item.id === baseLayoutVersionId && item.id === remediation.baseLayoutVersionId
    && item.remediationId === remediation.id && item.caseId === remediation.caseId && item.floorId === remediation.floorId && ["SELECTED", "LOCKED"].includes(item.state));
  if (!base) throw new StageBError("Use the currently selected or first-page-locked Final Revised Layout.", 409); return base;
}
export function upsertSectionAPlacement(input: { remediationId: unknown; pageId: unknown; placementId?: unknown; sectionAAssetId: unknown; baseLayoutVersionId: unknown; placementType: unknown; anchorX: unknown; anchorY: unknown; calloutX: unknown; calloutY: unknown; calloutWidth: unknown; calloutHeight: unknown; locationReference?: unknown; showCircle: unknown; showFrame: unknown; showHighlight: unknown; completePlacement: unknown; reconcileInvalidationId?: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); if (scoped.remediation.state === "PAGE_FINALISED") throw new StageBError("The final physical placement sequence is frozen.", 409);
  const type = sectionAPlacementType(input.placementType), pageId = safeText(input.pageId, "Page ID"); const page = placementPages(state, scoped.remediation.id).find((item) => item.id === pageId && item.pageType === type && item.state === "DRAFT");
  if (!page) throw new StageBError("Editable category-matched Section A placement page was not found.", 404);
  const asset = state.sectionAAssets.find((item) => item.id === safeText(input.sectionAAssetId, "Section A asset ID") && item.workspaceId === scoped.workspace.id && item.assetType === type && item.status === "APPROVED");
  if (!asset) throw new StageBError("Approved Section A asset does not belong to this placement category and floor.", 404);
  const base = baseLayout(state, scoped.remediation, input.baseLayoutVersionId);
  const anchorX = normalized(input.anchorX, "Anchor X"), anchorY = normalized(input.anchorY, "Anchor Y"), calloutX = normalized(input.calloutX, "Callout X"), calloutY = normalized(input.calloutY, "Callout Y"), calloutWidth = normalized(input.calloutWidth, "Callout width"), calloutHeight = normalized(input.calloutHeight, "Callout height");
  if (calloutWidth <= 0 || calloutHeight <= 0 || calloutX + calloutWidth > 1 || calloutY + calloutHeight > 1) throw new StageBError("Callout must remain inside normalized printable bounds.");
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ pageId, assetId: asset.id, baseLayoutVersionId: base.id, anchorX, anchorY, calloutX, calloutY, calloutWidth, calloutHeight, locationReference: input.locationReference ?? null, completePlacement: Boolean(input.completePlacement) });
  const replay = state.physicalPlacements.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This placement key was used with different geometry.", 409); return replay; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation"); const placementId = input.placementId === undefined ? undefined : safeText(input.placementId, "Placement ID");
  let placement = placementId ? state.physicalPlacements.find((item) => item.id === placementId && item.remediationId === scoped.remediation.id && item.pageId === page.id && item.placementType === type && item.state !== "DELETED") : undefined;
  if (placementId && !placement) throw new StageBError("Editable Section A placement was not found on this page.", 404);
  if (placement?.dependencyReviewState === "NEEDS_REVIEW") {
    const invalidationId = safeText(input.reconcileInvalidationId, "Invalidation ID"); const resolved = completeRemediationReconciliation({ state, invalidationId, targetType: "SECTION_A_PLACEMENT", targetId: placement.id,
      sourceVersionId: placement.baseLayoutVersionId, replacementVersionId: base.id, actor: input.actor, reason: "Consultant explicitly reconciled the unchanged normalized Section A placement coordinates." });
    if (!resolved) throw new StageBError("Open placement regeneration record was not found.", 409); placement.dependencyReviewState = "CURRENT";
  }
  const values = { baseLayoutVersionId: base.id, anchorX, anchorY, anchorLocked: Boolean(input.completePlacement), calloutX, calloutY, calloutWidth, calloutHeight,
    imageAssetId: asset.assetId, imageAssetVersionId: asset.assetVersionId, imageAssetSnapshotId: asset.assetSnapshotId, nameSnapshot: asset.name, attributePurposeSnapshot: asset.attributePurpose,
    ...(typeof input.locationReference === "string" && input.locationReference.trim() ? { locationReference: input.locationReference.trim().slice(0, 300) } : {}), showCircle: Boolean(input.showCircle),
    showFrame: Boolean(input.showFrame), showHighlight: Boolean(input.showHighlight), state: Boolean(input.completePlacement) ? "LOCKED" as const : "ACTIVE" as const,
    dependencyReviewState: "CURRENT" as const, idempotencyKey: key, requestHash, updatedByActorUserId: input.actor.id };
  if (placement) { Object.assign(placement, values); placement.recordVersion = (placement.recordVersion ?? 0) + 1; }
  else { placement = { id: id("placement"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, recordVersion: 1, remediationId: scoped.remediation.id,
    caseId: scoped.caseRecord.id, floorId: scoped.floor.id, reportId: scoped.report.id, pageId: page.id, placementType: type, masterNumber: Math.max(0, ...liveReportPlacements(state, scoped.remediation.id).map((item) => item.masterNumber ?? 0)) + 1, ...values };
    state.physicalPlacements.unshift(placement); }
  page.baseLayoutVersionId = base.id; page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.state = "EDITING";
  scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; resequenceReportPlacements(state, scoped.remediation.id, input.actor); return placement;
}

export function deleteSectionAPlacement(input: { remediationId: unknown; pageId: unknown; placementId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const pageId = safeText(input.pageId, "Page ID"), placementId = safeText(input.placementId, "Placement ID");
  const page = placementPages(state, scoped.remediation.id).find((item) => item.id === pageId); const placement = state.physicalPlacements.find((item) => item.id === placementId && item.remediationId === scoped.remediation.id && item.pageId === page?.id && ["FURNITURE_ADDON", "APPLIANCE"].includes(item.placementType));
  if (!page || !placement) throw new StageBError("Saved Section A placement was not found on this page.", 404);
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageId, placementId });
  if (placement.state === "DELETED") { if (placement.deletionIdempotencyKey !== key || placement.deletionRequestHash !== requestHash) throw new StageBError("This placement was already deleted by another request.", 409); return { deletedPlacementId: placement.id, placements: sortReportPlacements(state, scoped.remediation.id) }; }
  if (page.state !== "DRAFT" || scoped.remediation.state === "PAGE_FINALISED") throw new StageBError("A finalised Section A placement cannot be deleted.", 409);
  expected(scoped.remediation, input.expectedRecordVersion, "remediation"); placement.state = "DELETED"; placement.deletedAt = now(); placement.deletedBy = input.actor.id; placement.deletionIdempotencyKey = key; placement.deletionRequestHash = requestHash;
  placement.updatedByActorUserId = input.actor.id; placement.recordVersion = (placement.recordVersion ?? 0) + 1; state.placementImplementationRows = state.placementImplementationRows.filter((item) => item.placementId !== placement.id);
  state.masterAppendixRows = state.masterAppendixRows.filter((item) => item.placementId !== placement.id); const placements = resequenceReportPlacements(state, scoped.remediation.id, input.actor);
  page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; addTimeline(state, scoped.remediation, input.actor, "Section A placement deleted", `${page.pageType} placement removed; report-wide master numbers were resequenced.`);
  return { deletedPlacementId: placement.id, placements };
}

export function upsertColourFrameComposition(input: { remediationId: unknown; pageId: unknown; compositionId?: unknown; sectionAAssetId: unknown; baseLayoutVersionId: unknown; x: unknown; y: unknown; width: unknown; height: unknown; rotationDegrees: unknown; opacityPreset: unknown; preserveAspectRatio: unknown; printFit: unknown; locked: unknown; reconcileInvalidationId?: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); if (scoped.remediation.state === "PAGE_FINALISED") throw new StageBError("The final report composition is frozen.", 409);
  const pageId = safeText(input.pageId, "Page ID"), page = state.sectionAVisualPages.find((item) => item.id === pageId && item.workspaceId === scoped.workspace.id && item.pageType === "COLOUR_FRAME" && item.state === "DRAFT");
  if (!page) throw new StageBError("Editable Colour Frame page was not found.", 404);
  const asset = state.sectionAAssets.find((item) => item.id === safeText(input.sectionAAssetId, "Section A asset ID") && item.workspaceId === scoped.workspace.id && item.assetType === "COLOUR_FRAME" && item.status === "APPROVED");
  if (!asset) throw new StageBError("Approved Colour Frame asset was not found in this floor.", 404); const base = baseLayout(state, scoped.remediation, input.baseLayoutVersionId);
  const x = normalized(input.x, "Frame X"), y = normalized(input.y, "Frame Y"), width = normalized(input.width, "Frame width"), height = normalized(input.height, "Frame height");
  if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw new StageBError("Colour Frame must remain within printable normalized bounds.");
  const opacityPreset = safeText(input.opacityPreset, "Opacity preset") as ColourFrameCompositionRecord["opacityPreset"];
  if (!(["LOW", "MEDIUM", "FULL"] as const).includes(opacityPreset)) throw new StageBError("Colour Frame opacity preset is invalid.");
  const rotationDegrees = numberInRange(input.rotationDegrees, "Rotation", -360, 360), key = safeText(input.idempotencyKey, "Idempotency key");
  const values = { x, y, width, height, rotationDegrees, opacityPreset, preserveAspectRatio: Boolean(input.preserveAspectRatio), printFit: Boolean(input.printFit), locked: Boolean(input.locked) };
  const requestHash = deterministicContentHash({ pageId, assetId: asset.id, baseLayoutVersionId: base.id, ...values });
  const replay = state.colourFrameCompositions.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This Colour Frame key was used with different composition data.", 409); return replay; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation"); const compositionId = input.compositionId === undefined ? undefined : safeText(input.compositionId, "Composition ID");
  let composition = compositionId ? state.colourFrameCompositions.find((item) => item.id === compositionId && item.workspaceId === scoped.workspace.id && item.pageId === page.id && item.state !== "DELETED") : undefined;
  if (compositionId && !composition) throw new StageBError("Editable Colour Frame composition was not found.", 404);
  if (composition?.dependencyReviewState === "NEEDS_REVIEW") {
    const invalidationId = safeText(input.reconcileInvalidationId, "Invalidation ID"), resolved = completeRemediationReconciliation({ state, invalidationId, targetType: "COLOUR_FRAME_COMPOSITION", targetId: composition.id,
      sourceVersionId: composition.baseLayoutVersionId, replacementVersionId: base.id, actor: input.actor, reason: "Consultant explicitly reconciled the Colour Frame composition to the selected Final Revised Layout." });
    if (!resolved) throw new StageBError("Open Colour Frame regeneration record was not found.", 409); composition.dependencyReviewState = "CURRENT";
  }
  const recordValues = { baseLayoutVersionId: base.id, sectionAAssetId: asset.id, assetId: asset.assetId, assetVersionId: asset.assetVersionId, assetSnapshotId: asset.assetSnapshotId,
    ...values, state: values.locked ? "LOCKED" as const : "ACTIVE" as const, dependencyReviewState: "CURRENT" as const, idempotencyKey: key, requestHash, updatedByActorUserId: input.actor.id };
  if (composition) { Object.assign(composition, recordValues); composition.recordVersion = (composition.recordVersion ?? 0) + 1; }
  else { composition = { id: id("colour-frame"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, recordVersion: 1, workspaceId: scoped.workspace.id,
    remediationId: scoped.remediation.id, reportId: scoped.report.id, caseId: scoped.caseRecord.id, floorId: scoped.floor.id, pageId: page.id, ...recordValues }; state.colourFrameCompositions.unshift(composition); }
  page.baseLayoutVersionId = base.id; page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; return composition;
}

export function deleteColourFrameComposition(input: { remediationId: unknown; pageId: unknown; compositionId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const pageId = safeText(input.pageId, "Page ID"), compositionId = safeText(input.compositionId, "Composition ID");
  const page = state.sectionAVisualPages.find((item) => item.id === pageId && item.workspaceId === scoped.workspace.id && item.pageType === "COLOUR_FRAME" && item.state === "DRAFT");
  const composition = state.colourFrameCompositions.find((item) => item.id === compositionId && item.workspaceId === scoped.workspace.id && item.pageId === page?.id);
  if (!page || !composition) throw new StageBError("Colour Frame composition was not found on this editable page.", 404);
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageId, compositionId });
  if (composition.state === "DELETED") { if (composition.deletionIdempotencyKey !== key || composition.deletionRequestHash !== requestHash) throw new StageBError("This Colour Frame was already deleted by another request.", 409); return { deletedCompositionId: composition.id }; }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation"); composition.state = "DELETED"; composition.deletedAt = now(); composition.deletedBy = input.actor.id;
  composition.deletionIdempotencyKey = key; composition.deletionRequestHash = requestHash; composition.updatedByActorUserId = input.actor.id; composition.recordVersion = (composition.recordVersion ?? 0) + 1;
  page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1; return { deletedCompositionId: composition.id };
}

function pageFinalisationHash(state: AppState, scoped: ReturnType<typeof requireWorkspace>, page: SectionAVisualPageRecord | ReportPlacementPageRecord) {
  const base = state.remediationBaseLayoutVersions.find((item) => item.id === scoped.remediation.baseLayoutVersionId);
  if ("pageType" in page && page.pageType === "EXISTING_LAYOUT") return deterministicContentHash({ pageId: page.id, pageType: page.pageType, ordinal: page.ordinal,
    existingLayout: { assetId: scoped.remediation.existingLayoutAssetId, versionId: scoped.remediation.existingLayoutAssetVersionId, snapshotId: scoped.remediation.existingLayoutSnapshotId }, annotations: liveAnnotations(state, scoped.workspace.id).filter((item) => item.pageId === page.id) });
  if ("pageType" in page && page.pageType === "FINAL_REVISED_LAYOUT") return deterministicContentHash({ pageId: page.id, pageType: page.pageType, ordinal: page.ordinal, base });
  if ("pageType" in page && page.pageType === "COLOUR_FRAME") return deterministicContentHash({ pageId: page.id, pageType: page.pageType, ordinal: page.ordinal, base,
    compositions: liveCompositions(state, scoped.workspace.id).filter((item) => item.pageId === page.id) });
  const placements = sectionAPlacements(state, scoped.remediation.id).filter((item) => item.pageId === page.id), ids = new Set(placements.map((item) => item.id));
  const rows = state.placementImplementationRows.filter((item) => ids.has(item.placementId)); const appendix = state.masterAppendixRows.filter((item) => ids.has(item.placementId));
  return deterministicContentHash({ pageId: page.id, pageType: page.pageType, ordinal: page.ordinal, base, placements, implementationRows: rows, appendixRows: appendix });
}
function refreshSectionAFinalisationHashes(state: AppState, scoped: ReturnType<typeof requireWorkspace>, actor: AppUser) {
  for (const page of [...visualPages(state, scoped.workspace.id), ...placementPages(state, scoped.remediation.id)].filter((item) => item.state === "FINALISED")) {
    const hash = pageFinalisationHash(state, scoped, page); if (page.finalisationHash !== hash) { page.finalisationHash = hash; page.updatedByActorUserId = actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1; }
  }
}
function lockBase(base: ReturnType<typeof baseLayout>, actor: AppUser) {
  if (base.state === "SELECTED") { base.state = "LOCKED"; base.lockedAt = now(); base.lockedBy = actor.id; base.updatedByActorUserId = actor.id; base.recordVersion = (base.recordVersion ?? 0) + 1; }
}

export function finaliseSectionAPage(input: { remediationId: unknown; pageId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const pageId = safeText(input.pageId, "Page ID"), key = safeText(input.idempotencyKey, "Idempotency key");
  const visualPage = state.sectionAVisualPages.find((item) => item.id === pageId && item.workspaceId === scoped.workspace.id); const physicalPage = placementPages(state, scoped.remediation.id).find((item) => item.id === pageId);
  const page = visualPage ?? physicalPage; if (!page) throw new StageBError("Section A page was not found in this report and floor.", 404);
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageId: page.id });
  if (page.state === "FINALISED") {
    if (page.finalisationIdempotencyKey === key && page.finalisationRequestHash !== requestHash) throw new StageBError("This page finalisation key was used with different inputs.", 409);
    const sectionFinalised = [...visualPages(state, scoped.workspace.id), ...placementPages(state, scoped.remediation.id)].every((item) => item.state === "FINALISED");
    return { workspace: scoped.workspace, page, sectionFinalised, integrityRun: sectionFinalised ? state.sectionAIntegrityRuns.find((item) => item.workspaceId === scoped.workspace.id && item.status === "PASS") : undefined,
      manifest: sectionFinalised ? buildSectionARenderManifest(state, scoped.workspace.id) : undefined };
  }
  expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  const base = page.pageType === "EXISTING_LAYOUT" ? undefined : baseLayout(state, scoped.remediation, scoped.remediation.baseLayoutVersionId);
  if (physicalPage) {
    const placements = sectionAPlacements(state, scoped.remediation.id).filter((item) => item.pageId === physicalPage.id);
    if (placements.some((item) => item.placementType !== physicalPage.pageType || item.state !== "LOCKED" || !item.anchorLocked || item.dependencyReviewState !== "CURRENT" || item.baseLayoutVersionId !== base?.id)) throw new StageBError("Section A page finalisation requires completed, current, category-matched placements on the selected Final Revised Layout.", 409);
    lockBase(base!, input.actor); resequenceReportPlacements(state, scoped.remediation.id, input.actor); placements.forEach((placement) => projectionForPlacement(state, scoped.remediation, physicalPage, placement, input.actor)); physicalPage.baseLayoutVersionId = base!.id;
  } else if (visualPage?.pageType === "FINAL_REVISED_LAYOUT") visualPage.baseLayoutVersionId = base!.id;
  else if (visualPage?.pageType === "COLOUR_FRAME") {
    const compositions = liveCompositions(state, scoped.workspace.id).filter((item) => item.pageId === visualPage.id);
    if (compositions.some((item) => item.state !== "LOCKED" || !item.locked || !item.printFit || item.dependencyReviewState !== "CURRENT" || item.baseLayoutVersionId !== base?.id)) throw new StageBError("Colour Frame finalisation requires print-fit locked compositions on the selected Final Revised Layout.", 409);
    lockBase(base!, input.actor); visualPage.baseLayoutVersionId = base!.id;
  }
  page.state = "FINALISED"; page.finalisedAt = now(); page.finalisedBy = input.actor.id; page.finalisationIdempotencyKey = key; page.finalisationRequestHash = requestHash;
  page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1; scoped.remediation.updatedByActorUserId = input.actor.id; scoped.remediation.recordVersion = (scoped.remediation.recordVersion ?? 0) + 1;
  refreshSectionAFinalisationHashes(state, scoped, input.actor); const sectionFinalised = [...visualPages(state, scoped.workspace.id), ...placementPages(state, scoped.remediation.id)].every((item) => item.state === "FINALISED");
  let run: SectionAIntegrityRunRecord | undefined, manifest: SectionARenderManifest | undefined;
  if (sectionFinalised) { scoped.workspace.state = "FINALISED"; scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
    run = sectionAIntegrity(state, scoped, input.actor); if (run.status !== "PASS") throw new StageBError(`Section A integrity failed: ${run.issues.map((item) => item.code).join(", ")}`, 409); manifest = buildSectionARenderManifest(state, scoped.workspace.id); }
  addTimeline(state, scoped.remediation, input.actor, "Section A page finalised", `${page.pageType} finalised${sectionFinalised ? "; Section A integrity is PASS" : ""}.`);
  return { workspace: scoped.workspace, page, sectionFinalised, integrityRun: run, manifest };
}

function sectionAIntegritySnapshot(state: AppState, scoped: ReturnType<typeof requireWorkspace>) {
  const visuals = visualPages(state, scoped.workspace.id), pages = placementPages(state, scoped.remediation.id), placements = sectionAPlacements(state, scoped.remediation.id), placementIds = new Set(placements.map((item) => item.id));
  const rows = state.placementImplementationRows.filter((item) => item.remediationId === scoped.remediation.id && placementIds.has(item.placementId)).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const appendix = state.masterAppendixRows.filter((item) => item.remediationId === scoped.remediation.id && placementIds.has(item.placementId)).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const annotations = liveAnnotations(state, scoped.workspace.id), compositions = liveCompositions(state, scoped.workspace.id), base = state.remediationBaseLayoutVersions.find((item) => item.id === scoped.remediation.baseLayoutVersionId);
  const remediationScope = { id: scoped.remediation.id, organisationId: scoped.remediation.organisationId, projectId: scoped.remediation.projectId,
    caseId: scoped.remediation.caseId, floorId: scoped.remediation.floorId, reportId: scoped.remediation.reportId,
    existingLayoutAssetId: scoped.remediation.existingLayoutAssetId, existingLayoutAssetVersionId: scoped.remediation.existingLayoutAssetVersionId,
    existingLayoutSnapshotId: scoped.remediation.existingLayoutSnapshotId, baseLayoutVersionId: scoped.remediation.baseLayoutVersionId };
  return { workspace: scoped.workspace, remediationScope, visuals, pages, placements, rows, appendix, annotations, compositions, base };
}
function sectionAIntegrity(state: AppState, scoped: ReturnType<typeof requireWorkspace>, actor: AppUser) {
  const issues: SectionAIntegrityRunRecord["issues"] = [], snapshot = sectionAIntegritySnapshot(state, scoped); const { visuals, pages, placements, rows, appendix, annotations, compositions, base } = snapshot;
  for (const configuration of SECTION_A_VISUAL_PAGES) if (visuals.filter((page) => page.pageType === configuration.pageType && page.ordinal === configuration.ordinal).length !== 1) issues.push({ code: "SECTION_A_VISUAL_PAGE_ORDER_INVALID", entityType: "PAGE", field: configuration.pageType });
  for (const configuration of SECTION_A_PLACEMENT_PAGES) if (pages.filter((page) => page.pageType === configuration.pageType && page.ordinal === configuration.ordinal && page.section === "A").length !== 1) issues.push({ code: "SECTION_A_PLACEMENT_PAGE_ORDER_INVALID", entityType: "PAGE", field: configuration.pageType });
  for (const page of [...visuals, ...pages]) {
    if (page.reportId !== scoped.report.id || page.caseId !== scoped.caseRecord.id || page.floorId !== scoped.floor.id) issues.push({ code: "SECTION_A_PAGE_SCOPE_MISMATCH", entityType: "PAGE", entityId: page.id });
    if (page.state !== "FINALISED") issues.push({ code: "SECTION_A_PAGE_NOT_FINALISED", entityType: "PAGE", entityId: page.id });
    if (!page.finalisationHash || page.finalisationHash !== pageFinalisationHash(state, scoped, page)) issues.push({ code: "SECTION_A_FINALISATION_HASH_MISMATCH", entityType: "PAGE", entityId: page.id });
  }
  if (!base || base.state !== "LOCKED" || base.remediationId !== scoped.remediation.id || base.caseId !== scoped.caseRecord.id || base.floorId !== scoped.floor.id) issues.push({ code: "BASE_LAYOUT_NOT_LOCKED", entityType: "BASE_LAYOUT", entityId: base?.id });
  const existingPage = visuals.find((item) => item.pageType === "EXISTING_LAYOUT"), colourPage = visuals.find((item) => item.pageType === "COLOUR_FRAME");
  for (const annotation of annotations) {
    if (!existingPage || annotation.pageId !== existingPage.id || annotation.existingLayoutSnapshotId !== scoped.remediation.existingLayoutSnapshotId || annotation.reportId !== scoped.report.id || annotation.caseId !== scoped.caseRecord.id || annotation.floorId !== scoped.floor.id) issues.push({ code: "ANNOTATION_SCOPE_MISMATCH", entityType: "ANNOTATION", entityId: annotation.id });
    if (!annotation.points.length || annotation.points.some((point) => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) issues.push({ code: "ANNOTATION_COORDINATE_INVALID", entityType: "ANNOTATION", entityId: annotation.id });
  }
  if (placements.map((item) => item.masterNumber).some((number, index) => number !== index + 1)) issues.push({ code: "SECTION_A_MASTER_SEQUENCE_INVALID", entityType: "PLACEMENT" });
  for (const placement of placements) {
    const page = pages.find((item) => item.id === placement.pageId), asset = state.sectionAAssets.find((item) => item.workspaceId === scoped.workspace.id && item.assetType === placement.placementType && item.assetId === placement.imageAssetId && item.assetVersionId === placement.imageAssetVersionId && item.assetSnapshotId === placement.imageAssetSnapshotId && item.status === "APPROVED");
    if (!page || page.pageType !== placement.placementType || placement.eligibilityResolutionId || placement.remedyId) issues.push({ code: "SECTION_A_CATEGORY_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (!asset) issues.push({ code: "SECTION_A_ASSET_SNAPSHOT_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.reportId !== scoped.report.id || placement.caseId !== scoped.caseRecord.id || placement.floorId !== scoped.floor.id || placement.baseLayoutVersionId !== base?.id) issues.push({ code: "SECTION_A_PLACEMENT_SCOPE_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.state !== "LOCKED" || !placement.anchorLocked || placement.dependencyReviewState !== "CURRENT") issues.push({ code: "SECTION_A_PLACEMENT_NOT_LOCKED", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.masterNumber !== reportWideMasterNumber(state, scoped.remediation.id, placement.id)) issues.push({ code: "SECTION_A_MASTER_SEQUENCE_INVALID", entityType: "PLACEMENT", entityId: placement.id });
    const placementRows = rows.filter((item) => item.placementId === placement.id), placementAppendix = appendix.filter((item) => item.placementId === placement.id);
    if (placementRows.length !== 1 || placementRows[0]?.pageId !== placement.pageId || placementRows[0]?.masterNumber !== placement.masterNumber) issues.push({ code: "SECTION_A_IMPLEMENTATION_ROW_MISMATCH", entityType: "IMPLEMENTATION_ROW", entityId: placement.id });
    if (placementAppendix.length !== 1 || placementAppendix[0]?.sourcePageId !== placement.pageId || placementAppendix[0]?.masterNumber !== placement.masterNumber) issues.push({ code: "SECTION_A_APPENDIX_ROW_MISMATCH", entityType: "APPENDIX_ROW", entityId: placement.id });
  }
  if (rows.length !== placements.length || appendix.length !== placements.length) issues.push({ code: "SECTION_A_PROJECTION_COUNT_MISMATCH", entityType: "PROJECTION" });
  for (const composition of compositions) {
    if (!colourPage || composition.pageId !== colourPage.id || composition.reportId !== scoped.report.id || composition.caseId !== scoped.caseRecord.id || composition.floorId !== scoped.floor.id || composition.baseLayoutVersionId !== base?.id) issues.push({ code: "COLOUR_FRAME_SCOPE_MISMATCH", entityType: "COLOUR_FRAME", entityId: composition.id });
    if (composition.state !== "LOCKED" || !composition.locked || !composition.printFit || composition.dependencyReviewState !== "CURRENT" || composition.x < 0 || composition.y < 0 || composition.width <= 0 || composition.height <= 0 || composition.x + composition.width > 1 || composition.y + composition.height > 1) issues.push({ code: "COLOUR_FRAME_COMPOSITION_INVALID", entityType: "COLOUR_FRAME", entityId: composition.id });
  }
  if (colourPage && state.physicalPlacements.some((item) => item.pageId === colourPage.id && item.state !== "DELETED")) issues.push({ code: "COLOUR_FRAME_NUMBERING_LEAKAGE", entityType: "COLOUR_FRAME" });
  const scopeHash = deterministicContentHash(snapshot), status = issues.length ? "FAIL" as const : "PASS" as const;
  const replay = state.sectionAIntegrityRuns.find((item) => item.workspaceId === scoped.workspace.id && item.scopeHash === scopeHash && item.status === status && deterministicContentHash(item.issues) === deterministicContentHash(issues));
  if (replay) return replay;
  const run: SectionAIntegrityRunRecord = { id: id("section-a-integrity"), organisationId: scoped.remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    workspaceId: scoped.workspace.id, remediationId: scoped.remediation.id, reportId: scoped.report.id, scopeHash, status, issues, checkedAt: now(), checkedBy: actor.id };
  state.sectionAIntegrityRuns.unshift(run); return run;
}

export function validateSectionAIntegrity(input: { remediationId: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); expected(scoped.remediation, input.expectedRecordVersion, "remediation"); return sectionAIntegrity(state, scoped, input.actor);
}

export function buildSectionARenderManifest(state: AppState, workspaceId: string): SectionARenderManifest {
  const workspace = state.sectionAWorkspaces.find((item) => item.id === workspaceId); if (!workspace) throw new StageBError("Section A workspace was not found.", 404);
  const remediation = state.stageBRemediations.find((item) => item.id === workspace.remediationId); if (!remediation) throw new StageBError("Section A remediation was not found.", 404);
  const scoped = { ...context(state, remediation.id, { id: workspace.updatedByActorUserId ?? workspace.createdByActorUserId ?? "system", fullName: "System", role: "ADMIN", organisationId: workspace.organisationId } as AppUser), workspace };
  const snapshot = sectionAIntegritySnapshot(state, scoped), scopeHash = deterministicContentHash(snapshot), run = state.sectionAIntegrityRuns.find((item) => item.workspaceId === workspace.id && item.scopeHash === scopeHash && item.status === "PASS");
  if (workspace.state !== "FINALISED" || !run) throw new StageBError("Finalised Section A render evidence is incomplete.", 409);
  const existingPage = snapshot.visuals.find((item) => item.pageType === "EXISTING_LAYOUT")!, finalPage = snapshot.visuals.find((item) => item.pageType === "FINAL_REVISED_LAYOUT")!, colourPage = snapshot.visuals.find((item) => item.pageType === "COLOUR_FRAME")!;
  return { schemaVersion: "section-a-render-manifest/v1", organisationId: remediation.organisationId!, caseId: remediation.caseId, floorId: remediation.floorId, reportId: remediation.reportId,
    existingLayoutPage: { pageId: existingPage.id, ordinal: 1, finalisationHash: existingPage.finalisationHash!, assetId: remediation.existingLayoutAssetId, versionId: remediation.existingLayoutAssetVersionId,
      snapshotId: remediation.existingLayoutSnapshotId, annotations: structuredClone(snapshot.annotations.filter((item) => item.pageId === existingPage.id)) },
    finalRevisedLayoutPage: { pageId: finalPage.id, ordinal: 2, finalisationHash: finalPage.finalisationHash!, baseLayoutVersionId: snapshot.base!.id, snapshotId: snapshot.base!.snapshotId, contentHash: snapshot.base!.assetContentHash },
    placementPages: snapshot.pages.map((page) => { const placements = snapshot.placements.filter((item) => item.pageId === page.id), ids = new Set(placements.map((item) => item.id)); return { pageId: page.id,
      pageType: page.pageType as "FURNITURE_ADDON" | "APPLIANCE", ordinal: page.ordinal as 3 | 5, finalisationHash: page.finalisationHash!, placements: structuredClone(placements),
      implementationRows: snapshot.rows.filter((item) => ids.has(item.placementId)).map((item) => ({ ...structuredClone(item), implemented: null, implementationDate: null, alternativeNeeded: null })) }; }),
    colourFramePage: { pageId: colourPage.id, ordinal: 7, finalisationHash: colourPage.finalisationHash!, compositions: structuredClone(snapshot.compositions.filter((item) => item.pageId === colourPage.id)) },
    appendixRows: snapshot.appendix.map((item) => ({ ...structuredClone(item), implemented: null, implementationDate: null, alternativeNeeded: null })),
    integrityRunId: run.id, integrityScopeHash: run.scopeHash, integrityStatus: "PASS" };
}

function reportIntegritySnapshot(state: AppState, remediation: StageBRemediationRecord) {
  const workspace = state.sectionAWorkspaces.find((item) => item.remediationId === remediation.id), pages = reportWidePlacementPages(state, remediation.id), placements = sortReportPlacements(state, remediation.id);
  const allLivePlacements = state.physicalPlacements.filter((item) => item.remediationId === remediation.id && item.state !== "DELETED");
  const rows = state.placementImplementationRows.filter((item) => item.remediationId === remediation.id).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const appendix = state.masterAppendixRows.filter((item) => item.remediationId === remediation.id).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  return { remediation, workspace, pages, placements, allLivePlacements, rows, appendix };
}
export function validateRemediationReportIntegrity(input: { remediationId: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor), snapshot = reportIntegritySnapshot(state, scoped.remediation);
  const issues: RemediationReportIntegrityRunRecord["issues"] = [];
  if (scoped.workspace.state !== "FINALISED") issues.push({ code: "SECTION_A_NOT_FINALISED", entityType: "SECTION_A", entityId: scoped.workspace.id });
  try { buildSectionARenderManifest(state, scoped.workspace.id); } catch { issues.push({ code: "SECTION_A_MANIFEST_INVALID", entityType: "SECTION_A", entityId: scoped.workspace.id }); }
  try { buildStageBRenderManifest(state, scoped.remediation.id); } catch { issues.push({ code: "STAGE_B_MANIFEST_INVALID", entityType: "STAGE_B", entityId: scoped.remediation.id }); }
  for (const configuration of REPORT_WIDE_PLACEMENT_PAGES) {
    if (snapshot.pages.filter((page) => page.section === configuration.section && page.pageType === configuration.pageType && page.ordinal === configuration.ordinal).length !== 1) {
      issues.push({ code: "REPORT_PAGE_ORDER_INVALID", entityType: "PAGE", field: `${configuration.section}:${configuration.pageType}` });
    }
  }
  const numbers = snapshot.placements.map((item) => item.masterNumber);
  if (new Set(numbers).size !== numbers.length) issues.push({ code: "REPORT_MASTER_SEQUENCE_DUPLICATE", entityType: "PLACEMENT" });
  if (numbers.some((number, index) => number !== index + 1)) issues.push({ code: "REPORT_MASTER_SEQUENCE_GAP", entityType: "PLACEMENT" });
  const lockedBase = state.remediationBaseLayoutVersions.find((item) => item.id === scoped.remediation.baseLayoutVersionId && item.remediationId === scoped.remediation.id && item.state === "LOCKED");
  for (const placement of snapshot.allLivePlacements) {
    const page = snapshot.pages.find((item) => item.id === placement.pageId), expectedType = page?.section === "A" ? page.pageType : "REMEDY";
    if (!page || placement.placementType !== expectedType || placement.reportId !== scoped.report.id || placement.caseId !== scoped.caseRecord.id || placement.floorId !== scoped.floor.id
      || !lockedBase || placement.baseLayoutVersionId !== lockedBase.id) issues.push({ code: "REPORT_PLACEMENT_SCOPE_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (snapshot.rows.filter((item) => item.placementId === placement.id).length !== 1) issues.push({ code: "REPORT_IMPLEMENTATION_ROW_MISMATCH", entityType: "IMPLEMENTATION_ROW", entityId: placement.id });
    if (snapshot.appendix.filter((item) => item.placementId === placement.id).length !== 1) issues.push({ code: "REPORT_APPENDIX_ROW_MISMATCH", entityType: "APPENDIX_ROW", entityId: placement.id });
  }
  if (snapshot.placements.length !== snapshot.allLivePlacements.length || snapshot.rows.length !== snapshot.allLivePlacements.length || snapshot.appendix.length !== snapshot.allLivePlacements.length
    || snapshot.rows.some((row) => !snapshot.allLivePlacements.some((placement) => placement.id === row.placementId))
    || snapshot.appendix.some((row) => !snapshot.allLivePlacements.some((placement) => placement.id === row.placementId))) issues.push({ code: "REPORT_PROJECTION_COUNT_MISMATCH", entityType: "PROJECTION" });
  const scopeHash = deterministicContentHash(snapshot), status = issues.length ? "FAIL" as const : "PASS" as const;
  const replay = state.remediationReportIntegrityRuns.find((item) => item.remediationId === scoped.remediation.id && item.scopeHash === scopeHash && item.status === status && deterministicContentHash(item.issues) === deterministicContentHash(issues));
  if (replay) return replay;
  const run: RemediationReportIntegrityRunRecord = { id: id("remediation-report-integrity"), organisationId: scoped.remediation.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    remediationId: scoped.remediation.id, reportId: scoped.report.id, scopeHash, status, issues, checkedAt: now(), checkedBy: input.actor.id };
  state.remediationReportIntegrityRuns.unshift(run); return run;
}
