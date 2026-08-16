import type {
  AppUser, MasterAppendixRowRecord, PhysicalPlacementRecord, PlacementImplementationRowRecord, ReportPlacementPageRecord,
  SectionCAssetRecord, SectionCExtraPageRecord, SectionCIntegrityRunRecord, SectionCRenderManifest, SectionCWorkspaceRecord,
  StageBRemediationRecord
} from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { getAppState, type AppState } from "./store.ts";
import { liveReportPlacements, reportWideMasterNumber, resequenceReportPlacements, sortReportPlacements } from "./remediation-sequence.ts";
import { buildStageBRenderManifest, StageBError, stageBReportLineageId } from "./stage-b-remediation.ts";
import { sameStageBLineage, stageBChildMatchesRemediation, stageBRecordLineageFields, resolveStageBReportLineage } from "./stage-b-lineage.ts";

export const SECTION_C_FIRST_ORDINAL = 18;

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function owner(actor: AppUser) {
  if (!actor.organisationId) throw new StageBError("An active organisation is required.", 403);
  return actor.organisationId;
}

function safeText(value: unknown, label: string, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) {
    throw new StageBError(`${label} is required and must be safe text up to ${max} characters.`);
  }
  return value.trim();
}

function expected(record: { recordVersion?: number }, value: unknown, label: string) {
  if (!Number.isInteger(value) || Number(value) < 0) throw new StageBError(`The latest ${label} version is required.`, 428);
  if ((record.recordVersion ?? 0) !== Number(value)) throw new StageBError(`The ${label} changed. Refresh and try again.`, 409);
}

function normalized(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new StageBError(`${label} must be normalized between 0 and 1.`);
  return number;
}

function context(state: AppState, remediationIdValue: unknown, actor: AppUser) {
  const remediationId = safeText(remediationIdValue, "Remediation ID");
  const remediation = state.stageBRemediations.find((item) => item.id === remediationId && item.organisationId === owner(actor));
  const caseRecord = remediation ? state.vastuCases.find((item) => item.id === remediation.caseId && (!item.organisationId || item.organisationId === owner(actor))) : undefined;
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  const floor = project ? state.floorWorkspaces.find((item) => item.id === remediation?.floorId && item.caseId === caseRecord?.id && item.projectId === project.id) : undefined;
  const report = remediation?.reportSourceKind === "V1_COMBINED_EVALUATION_REPORT" ? state.combinedEvaluationReportSnapshots.find((item) => item.id === remediation.reportSourceId && item.caseId === caseRecord?.id && item.floorId === floor?.id && item.architectureVersion === "V1" && item.status === "FINALIZED") : floor ? state.reportVersions.find((item) => item.id === remediation?.reportId && item.caseId === caseRecord?.id && item.floorId === floor?.id) : undefined;
  if (!remediation || !caseRecord || !project || !floor || !report) throw new StageBError("Section C remediation, report, case, and floor scope do not match.", 404);
  const workspace = state.sectionCWorkspaces.find((item) => item.remediationId === remediation.id && item.organisationId === owner(actor));
  return { remediation, caseRecord, project, floor, report, workspace };
}

function requireWorkspace(state: AppState, remediationIdValue: unknown, actor: AppUser) {
  const scoped = context(state, remediationIdValue, actor);
  if (!scoped.workspace) throw new StageBError("Section C Extras workspace has not been created.", 404);
  return { ...scoped, workspace: scoped.workspace };
}

function addTimeline(state: AppState, remediation: StageBRemediationRecord, actor: AppUser, headline: string, details: string) {
  const caseRecord = state.vastuCases.find((item) => item.id === remediation.caseId);
  if (!caseRecord) return;
  state.timelineEvents.unshift({ id: id("timeline"), organisationId: caseRecord.organisationId ?? actor.organisationId, clientId: caseRecord.clientId,
    category: "Reports", headline, details, happenedAt: now(), actorRole: actor.role, actorId: actor.id, actorName: actor.fullName });
}

export function activeSectionCExtraPages(state: AppState, remediationId: string) {
  return state.sectionCExtraPages.filter((item) => item.remediationId === remediationId && item.status === "ACTIVE")
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
}

function pageRecord(state: AppState, extraPage: SectionCExtraPageRecord) {
  return state.reportPlacementPages.find((item) => item.id === extraPage.pageId && item.remediationId === extraPage.remediationId
    && item.caseId === extraPage.caseId && item.floorId === extraPage.floorId && (item.stageBLineage && extraPage.stageBLineage ? sameStageBLineage(item.stageBLineage, extraPage.stageBLineage) : item.reportId === extraPage.reportId)
    && item.section === "C" && item.pageType === "EXTRA");
}

function activePagePairs(state: AppState, remediationId: string) {
  return activeSectionCExtraPages(state, remediationId).map((extraPage) => ({ extraPage, page: pageRecord(state, extraPage) }))
    .filter((item): item is { extraPage: SectionCExtraPageRecord; page: ReportPlacementPageRecord } => Boolean(item.page));
}

function structureEditable(state: AppState, workspace: SectionCWorkspaceRecord) {
  if (workspace.state !== "EDITING") throw new StageBError("The final Section C Extras sequence is immutable.", 409);
  if (activePagePairs(state, workspace.remediationId).some((item) => item.page.state === "FINALISED")) {
    throw new StageBError("Extra page structure is locked after the first Extra page is finalised.", 409);
  }
}

function lockedBase(state: AppState, remediation: StageBRemediationRecord) {
  const base = state.remediationBaseLayoutVersions.find((item) => item.id === remediation.baseLayoutVersionId && item.remediationId === remediation.id
    && item.projectId === remediation.projectId && item.caseId === remediation.caseId && item.floorId === remediation.floorId && item.state === "LOCKED");
  if (!base) throw new StageBError("Section C Extras require the already locked Final Revised Layout.", 409);
  return base;
}

function resequenceExtraPageStructure(state: AppState, remediationId: string, actor: AppUser) {
  const pairs = activePagePairs(state, remediationId);
  pairs.forEach(({ extraPage, page }, index) => {
    const ordinal = SECTION_C_FIRST_ORDINAL + index * 2;
    if (extraPage.orderIndex !== index) {
      extraPage.orderIndex = index; extraPage.updatedByActorUserId = actor.id; extraPage.recordVersion = (extraPage.recordVersion ?? 0) + 1;
    }
    if (page.ordinal !== ordinal) {
      page.ordinal = ordinal; page.updatedByActorUserId = actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1;
    }
  });
  resequenceReportPlacements(state, remediationId, actor);
  return pairs;
}

function sectionCPlacements(state: AppState, remediationId: string) {
  const pageIds = new Set(activePagePairs(state, remediationId).map((item) => item.page.id));
  return sortReportPlacements(state, remediationId, liveReportPlacements(state, remediationId).filter((item) => pageIds.has(item.pageId)));
}

function projectionForPlacement(state: AppState, remediation: StageBRemediationRecord, page: ReportPlacementPageRecord, placement: PhysicalPlacementRecord, actor: AppUser) {
  let row = state.placementImplementationRows.find((item) => item.remediationId === remediation.id && item.placementId === placement.id);
  const rowValues = { ...stageBRecordLineageFields(state, remediation), pageId: page.id, masterNumber: placement.masterNumber!, imageAssetSnapshotId: placement.imageAssetSnapshotId,
    itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot,
    ...(placement.locationReference ? { locationReference: placement.locationReference } : {}) };
  if (row) { Object.assign(row, rowValues); row.updatedByActorUserId = actor.id; row.recordVersion = (row.recordVersion ?? 0) + 1; }
  else {
    row = { id: id("implementation-row"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
      remediationId: remediation.id, placementId: placement.id, ...rowValues };
    state.placementImplementationRows.unshift(row);
  }
  let appendix = state.masterAppendixRows.find((item) => item.remediationId === remediation.id && item.placementId === placement.id);
  const appendixValues = { ...stageBRecordLineageFields(state, remediation), caseId: remediation.caseId, floorId: remediation.floorId, sourcePageId: page.id,
    baseLayoutVersionId: placement.baseLayoutVersionId, masterNumber: placement.masterNumber!, imageAssetSnapshotId: placement.imageAssetSnapshotId,
    itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot,
    ...(placement.locationReference ? { locationReference: placement.locationReference } : {}) };
  if (appendix) { Object.assign(appendix, appendixValues); appendix.updatedByActorUserId = actor.id; appendix.recordVersion = (appendix.recordVersion ?? 0) + 1; }
  else {
    appendix = { id: id("appendix-row"), organisationId: remediation.organisationId, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
      remediationId: remediation.id, placementId: placement.id, ...appendixValues };
    state.masterAppendixRows.unshift(appendix);
  }
  return { row, appendix };
}

function pageFinalisationHash(state: AppState, remediation: StageBRemediationRecord, extraPage: SectionCExtraPageRecord, page: ReportPlacementPageRecord) {
  const placements = sectionCPlacements(state, remediation.id).filter((item) => item.pageId === page.id);
  const ids = new Set(placements.map((item) => item.id));
  const rows = state.placementImplementationRows.filter((item) => item.remediationId === remediation.id && ids.has(item.placementId))
    .sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const appendix = state.masterAppendixRows.filter((item) => item.remediationId === remediation.id && ids.has(item.placementId))
    .sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  return deterministicContentHash({ extraPageId: extraPage.id, pageId: page.id, title: extraPage.title, orderIndex: extraPage.orderIndex, ordinal: page.ordinal,
    baseLayoutVersionId: page.baseLayoutVersionId, placements, implementationRows: rows, appendixRows: appendix });
}

export function addSectionCExtraPage(input: { remediationId: unknown; title: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = context(state, input.remediationId, input.actor); const key = safeText(input.idempotencyKey, "Idempotency key");
  const title = safeText(input.title, "Extra page title", 120); const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, title });
  const replay = state.sectionCExtraPages.find((item) => item.remediationId === scoped.remediation.id && item.creationIdempotencyKey === key);
  if (replay) {
    if (replay.creationRequestHash !== requestHash) throw new StageBError("This Extra page key was used with different inputs.", 409);
    return { workspace: state.sectionCWorkspaces.find((item) => item.id === replay.workspaceId)!, extraPage: replay, page: pageRecord(state, replay)!, pages: activeSectionCExtraPages(state, scoped.remediation.id) };
  }
  lockedBase(state, scoped.remediation);
  const sectionAWorkspace = state.sectionAWorkspaces.find((item) => item.remediationId === scoped.remediation.id);
  if (!sectionAWorkspace || sectionAWorkspace.state !== "FINALISED") throw new StageBError("Section A must be integrity-finalised before Section C Extra pages are added.", 409);
  if (scoped.workspace) { structureEditable(state, scoped.workspace); expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace"); }
  else expected(scoped.remediation, input.expectedRecordVersion, "remediation");
  if (activeSectionCExtraPages(state, scoped.remediation.id).some((item) => item.title.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)) {
    throw new StageBError("An active Extra page already uses this title.", 409);
  }
  const workspace: SectionCWorkspaceRecord = scoped.workspace ?? { id: id("section-c"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, remediationId: scoped.remediation.id, projectId: scoped.project.id, caseId: scoped.caseRecord.id,
    floorId: scoped.floor.id, ...stageBRecordLineageFields(state, scoped.remediation), state: "EDITING", createdAt: now() };
  if (!scoped.workspace) state.sectionCWorkspaces.unshift(workspace);
  else { workspace.updatedByActorUserId = input.actor.id; workspace.recordVersion = (workspace.recordVersion ?? 0) + 1; }
  const orderIndex = activeSectionCExtraPages(state, scoped.remediation.id).length;
  const page: ReportPlacementPageRecord = { id: id("placement-page"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, remediationId: scoped.remediation.id, ...stageBRecordLineageFields(state, scoped.remediation), caseId: scoped.caseRecord.id,
    floorId: scoped.floor.id, section: "C", pageType: "EXTRA", ordinal: SECTION_C_FIRST_ORDINAL + orderIndex * 2, state: "DRAFT" };
  const extraPage: SectionCExtraPageRecord = { id: id("section-c-extra-page"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, workspaceId: workspace.id, remediationId: scoped.remediation.id, ...stageBRecordLineageFields(state, scoped.remediation),
    caseId: scoped.caseRecord.id, floorId: scoped.floor.id, pageId: page.id, title, orderIndex, status: "ACTIVE", createdAt: now(),
    creationIdempotencyKey: key, creationRequestHash: requestHash };
  state.reportPlacementPages.unshift(page); state.sectionCExtraPages.unshift(extraPage); resequenceExtraPageStructure(state, scoped.remediation.id, input.actor);
  addTimeline(state, scoped.remediation, input.actor, "Section C Extra page added", `${title} added after the fixed five-page Remedy sequence.`);
  return { workspace, extraPage, page, pages: activeSectionCExtraPages(state, scoped.remediation.id) };
}

export function renameSectionCExtraPage(input: { remediationId: unknown; extraPageId: unknown; title: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const extraPageId = safeText(input.extraPageId, "Extra page ID");
  const extraPage = state.sectionCExtraPages.find((item) => item.id === extraPageId && item.workspaceId === scoped.workspace.id);
  if (!extraPage) throw new StageBError("Extra page was not found in this Section C workspace.", 404);
  const title = safeText(input.title, "Extra page title", 120), key = safeText(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, extraPageId, title });
  if (extraPage.renameIdempotencyKey === key) {
    if (extraPage.renameRequestHash !== requestHash) throw new StageBError("This Extra page rename key was used with different inputs.", 409);
    return extraPage;
  }
  structureEditable(state, scoped.workspace); expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace");
  if (activeSectionCExtraPages(state, scoped.remediation.id).some((item) => item.id !== extraPage.id && item.title.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)) {
    throw new StageBError("An active Extra page already uses this title.", 409);
  }
  extraPage.title = title; extraPage.renameIdempotencyKey = key; extraPage.renameRequestHash = requestHash; extraPage.updatedByActorUserId = input.actor.id;
  extraPage.recordVersion = (extraPage.recordVersion ?? 0) + 1; scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.remediation, input.actor, "Section C Extra page renamed", `Extra page renamed to ${title}.`);
  return extraPage;
}

export function reorderSectionCExtraPages(input: { remediationId: unknown; extraPageIds: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const key = safeText(input.idempotencyKey, "Idempotency key");
  if (!Array.isArray(input.extraPageIds) || input.extraPageIds.some((item) => typeof item !== "string" || !item.trim())) throw new StageBError("Extra page order must be an array of page IDs.");
  const extraPageIds = input.extraPageIds.map((item) => String(item).trim()); const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, extraPageIds });
  if (scoped.workspace.reorderIdempotencyKey === key) {
    if (scoped.workspace.reorderRequestHash !== requestHash) throw new StageBError("This Extra page reorder key was used with different inputs.", 409);
    return activeSectionCExtraPages(state, scoped.remediation.id);
  }
  structureEditable(state, scoped.workspace); expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace");
  const active = activeSectionCExtraPages(state, scoped.remediation.id), activeIds = new Set(active.map((item) => item.id));
  if (extraPageIds.length !== active.length || new Set(extraPageIds).size !== extraPageIds.length || extraPageIds.some((item) => !activeIds.has(item))) {
    throw new StageBError("Reorder must contain every active Section C Extra page exactly once.");
  }
  extraPageIds.forEach((pageId, index) => { const page = active.find((item) => item.id === pageId)!; page.orderIndex = index; page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1; });
  scoped.workspace.reorderIdempotencyKey = key; scoped.workspace.reorderRequestHash = requestHash; scoped.workspace.updatedByActorUserId = input.actor.id;
  scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1; resequenceExtraPageStructure(state, scoped.remediation.id, input.actor);
  addTimeline(state, scoped.remediation, input.actor, "Section C Extra pages reordered", "Extra pages were reordered within Section C only; A and B order remained fixed.");
  return activeSectionCExtraPages(state, scoped.remediation.id);
}

export function retireSectionCExtraPage(input: { remediationId: unknown; extraPageId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const extraPageId = safeText(input.extraPageId, "Extra page ID");
  const extraPage = state.sectionCExtraPages.find((item) => item.id === extraPageId && item.workspaceId === scoped.workspace.id); const page = extraPage ? pageRecord(state, extraPage) : undefined;
  if (!extraPage || !page) throw new StageBError("Extra page was not found in this Section C workspace.", 404);
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, extraPageId });
  if (extraPage.status === "RETIRED") {
    if (extraPage.retirementIdempotencyKey !== key || extraPage.retirementRequestHash !== requestHash) throw new StageBError("This Extra page was already retired by another request.", 409);
    return { retiredExtraPageId: extraPage.id, pages: activeSectionCExtraPages(state, scoped.remediation.id), placements: sortReportPlacements(state, scoped.remediation.id) };
  }
  structureEditable(state, scoped.workspace); expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace");
  extraPage.status = "RETIRED"; extraPage.retiredAt = now(); extraPage.retiredBy = input.actor.id; extraPage.retirementIdempotencyKey = key;
  extraPage.retirementRequestHash = requestHash; extraPage.updatedByActorUserId = input.actor.id; extraPage.recordVersion = (extraPage.recordVersion ?? 0) + 1;
  for (const placement of state.physicalPlacements.filter((item) => item.pageId === page.id && item.state !== "DELETED")) {
    placement.state = "DELETED"; placement.deletedAt = now(); placement.deletedBy = input.actor.id; placement.deletionIdempotencyKey = `${key}:${placement.id}`;
    placement.deletionRequestHash = deterministicContentHash({ extraPageId, placementId: placement.id }); placement.updatedByActorUserId = input.actor.id;
    placement.recordVersion = (placement.recordVersion ?? 0) + 1;
    state.placementImplementationRows = state.placementImplementationRows.filter((item) => item.placementId !== placement.id);
    state.masterAppendixRows = state.masterAppendixRows.filter((item) => item.placementId !== placement.id);
  }
  scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
  resequenceExtraPageStructure(state, scoped.remediation.id, input.actor);
  addTimeline(state, scoped.remediation, input.actor, "Section C Extra page retired", `${extraPage.title} retired; its placements became tombstones and report-wide numbers were resequenced.`);
  return { retiredExtraPageId: extraPage.id, pages: activeSectionCExtraPages(state, scoped.remediation.id), placements: sortReportPlacements(state, scoped.remediation.id) };
}

export function registerSectionCAsset(input: { remediationId: unknown; extraPageId: unknown; name: unknown; attributePurpose: unknown; assetId: unknown; assetVersionId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const extraPageId = safeText(input.extraPageId, "Extra page ID");
  const extraPage = state.sectionCExtraPages.find((item) => item.id === extraPageId && item.workspaceId === scoped.workspace.id && item.status === "ACTIVE"); const page = extraPage ? pageRecord(state, extraPage) : undefined;
  if (!extraPage || !page || page.state !== "DRAFT" || scoped.workspace.state !== "EDITING") throw new StageBError("Editable Extra page was not found.", 404);
  const assetId = safeText(input.assetId, "Asset ID"), assetVersionId = safeText(input.assetVersionId, "Asset version ID"), key = safeText(input.idempotencyKey, "Idempotency key");
  const media = state.mediaAssetVersions.find((item) => item.id === assetVersionId && item.assetId === assetId && (!item.organisationId || item.organisationId === owner(input.actor)) && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status));
  if (!media) throw new StageBError("Approved immutable media asset version was not found for this Extra item.", 404);
  const values = { name: safeText(input.name, "Extra item name"), attributePurpose: safeText(input.attributePurpose, "Purpose or attribute"), assetId, assetVersionId,
    assetSnapshotId: deterministicContentHash({ assetId, versionId: assetVersionId, checksumSha256: media.checksumSha256 }) };
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, extraPageId, ...values });
  const replay = state.sectionCAssets.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This Extra asset key was used with different inputs.", 409); return replay; }
  expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace");
  if (state.sectionCAssets.some((item) => item.pageId === page.id && item.status === "APPROVED" && item.assetVersionId === assetVersionId && item.name.toLowerCase() === values.name.toLowerCase())) {
    throw new StageBError("This approved Extra asset is already registered on the page.", 409);
  }
  const record: SectionCAssetRecord = { id: id("section-c-asset"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id,
    updatedByActorUserId: input.actor.id, recordVersion: 1, workspaceId: scoped.workspace.id, remediationId: scoped.remediation.id, caseId: scoped.caseRecord.id,
    floorId: scoped.floor.id, pageId: page.id, ...values, status: "APPROVED", idempotencyKey: key, requestHash };
  state.sectionCAssets.unshift(record); scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
  return record;
}

export function upsertSectionCPlacement(input: { remediationId: unknown; extraPageId: unknown; placementId?: unknown; sectionCAssetId: unknown; baseLayoutVersionId: unknown; placementType: unknown; anchorX: unknown; anchorY: unknown; calloutX: unknown; calloutY: unknown; calloutWidth: unknown; calloutHeight: unknown; locationReference?: unknown; showCircle: unknown; showFrame: unknown; showHighlight: unknown; completePlacement: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const extraPageId = safeText(input.extraPageId, "Extra page ID");
  const extraPage = state.sectionCExtraPages.find((item) => item.id === extraPageId && item.workspaceId === scoped.workspace.id && item.status === "ACTIVE"); const page = extraPage ? pageRecord(state, extraPage) : undefined;
  if (!extraPage || !page || page.state !== "DRAFT" || scoped.workspace.state !== "EDITING") throw new StageBError("Editable Extra placement page was not found.", 404);
  if (input.placementType !== "EXTRA") throw new StageBError("Only EXTRA placements belong to Section C Extra pages.");
  const base = lockedBase(state, scoped.remediation); if (safeText(input.baseLayoutVersionId, "Base-layout version ID") !== base.id) throw new StageBError("Use the locked Final Revised Layout for this Extra placement.", 409);
  const asset = state.sectionCAssets.find((item) => item.id === safeText(input.sectionCAssetId, "Section C asset ID") && item.workspaceId === scoped.workspace.id && item.pageId === page.id && item.status === "APPROVED");
  if (!asset) throw new StageBError("Approved Extra asset does not belong to this Extra page and floor.", 404);
  const anchorX = normalized(input.anchorX, "Anchor X"), anchorY = normalized(input.anchorY, "Anchor Y"), calloutX = normalized(input.calloutX, "Callout X"), calloutY = normalized(input.calloutY, "Callout Y");
  const calloutWidth = normalized(input.calloutWidth, "Callout width"), calloutHeight = normalized(input.calloutHeight, "Callout height");
  if (calloutWidth <= 0 || calloutHeight <= 0 || calloutX + calloutWidth > 1 || calloutY + calloutHeight > 1) throw new StageBError("Callout must remain inside normalized printable bounds.");
  const placementId = input.placementId === undefined ? undefined : safeText(input.placementId, "Placement ID"), key = safeText(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ extraPageId, placementId: placementId ?? null, assetId: asset.id, baseLayoutVersionId: base.id, anchorX, anchorY, calloutX, calloutY,
    calloutWidth, calloutHeight, locationReference: input.locationReference ?? null, completePlacement: Boolean(input.completePlacement) });
  const replay = state.physicalPlacements.find((item) => item.remediationId === scoped.remediation.id && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new StageBError("This Extra placement key was used with different geometry.", 409); return replay; }
  expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace");
  let placement = placementId ? state.physicalPlacements.find((item) => item.id === placementId && item.remediationId === scoped.remediation.id && item.pageId === page.id && item.placementType === "EXTRA" && item.state !== "DELETED") : undefined;
  if (placementId && !placement) throw new StageBError("Editable Extra placement was not found on this page.", 404);
  const values = { baseLayoutVersionId: base.id, anchorX, anchorY, anchorLocked: Boolean(input.completePlacement), calloutX, calloutY, calloutWidth, calloutHeight,
    imageAssetId: asset.assetId, imageAssetVersionId: asset.assetVersionId, imageAssetSnapshotId: asset.assetSnapshotId, nameSnapshot: asset.name,
    attributePurposeSnapshot: asset.attributePurpose, ...(typeof input.locationReference === "string" && input.locationReference.trim() ? { locationReference: input.locationReference.trim().slice(0, 300) } : {}),
    showCircle: Boolean(input.showCircle), showFrame: Boolean(input.showFrame), showHighlight: Boolean(input.showHighlight), state: Boolean(input.completePlacement) ? "LOCKED" as const : "ACTIVE" as const,
    dependencyReviewState: "CURRENT" as const, idempotencyKey: key, requestHash, updatedByActorUserId: input.actor.id };
  if (placement) { Object.assign(placement, values); placement.recordVersion = (placement.recordVersion ?? 0) + 1; }
  else {
    placement = { id: id("placement"), organisationId: owner(input.actor), createdByActorUserId: input.actor.id, recordVersion: 1, remediationId: scoped.remediation.id,
      caseId: scoped.caseRecord.id, floorId: scoped.floor.id, ...stageBRecordLineageFields(state, scoped.remediation), pageId: page.id, placementType: "EXTRA", masterNumber: Math.max(0, ...liveReportPlacements(state, scoped.remediation.id).map((item) => item.masterNumber ?? 0)) + 1, ...values };
    state.physicalPlacements.unshift(placement);
  }
  page.baseLayoutVersionId = base.id; page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1;
  scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1; resequenceReportPlacements(state, scoped.remediation.id, input.actor);
  return placement;
}

export function deleteSectionCPlacement(input: { remediationId: unknown; extraPageId: unknown; placementId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const extraPageId = safeText(input.extraPageId, "Extra page ID");
  const extraPage = state.sectionCExtraPages.find((item) => item.id === extraPageId && item.workspaceId === scoped.workspace.id && item.status === "ACTIVE"); const page = extraPage ? pageRecord(state, extraPage) : undefined;
  const placementId = safeText(input.placementId, "Placement ID"); const placement = page ? state.physicalPlacements.find((item) => item.id === placementId && item.pageId === page.id && item.remediationId === scoped.remediation.id && item.placementType === "EXTRA") : undefined;
  if (!extraPage || !page || !placement) throw new StageBError("Saved Extra placement was not found on this page.", 404);
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, extraPageId, placementId });
  if (placement.state === "DELETED") {
    if (placement.deletionIdempotencyKey !== key || placement.deletionRequestHash !== requestHash) throw new StageBError("This Extra placement was already deleted by another request.", 409);
    return { deletedPlacementId: placement.id, placements: sortReportPlacements(state, scoped.remediation.id) };
  }
  if (page.state !== "DRAFT" || scoped.workspace.state !== "EDITING") throw new StageBError("A finalised Extra placement cannot be deleted.", 409);
  expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace"); placement.state = "DELETED"; placement.deletedAt = now(); placement.deletedBy = input.actor.id;
  placement.deletionIdempotencyKey = key; placement.deletionRequestHash = requestHash; placement.updatedByActorUserId = input.actor.id; placement.recordVersion = (placement.recordVersion ?? 0) + 1;
  state.placementImplementationRows = state.placementImplementationRows.filter((item) => item.placementId !== placement.id);
  state.masterAppendixRows = state.masterAppendixRows.filter((item) => item.placementId !== placement.id);
  const placements = resequenceReportPlacements(state, scoped.remediation.id, input.actor); page.recordVersion = (page.recordVersion ?? 0) + 1;
  scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.remediation, input.actor, "Section C Extra placement deleted", `${extraPage.title} placement removed; report-wide master numbers were resequenced.`);
  return { deletedPlacementId: placement.id, placements };
}

export function finaliseSectionCPage(input: { remediationId: unknown; extraPageId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const extraPageId = safeText(input.extraPageId, "Extra page ID");
  const extraPage = state.sectionCExtraPages.find((item) => item.id === extraPageId && item.workspaceId === scoped.workspace.id && item.status === "ACTIVE"); const page = extraPage ? pageRecord(state, extraPage) : undefined;
  if (!extraPage || !page) throw new StageBError("Extra page was not found in this Section C workspace.", 404);
  const key = safeText(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, extraPageId });
  if (page.state === "FINALISED") {
    if (page.finalisationIdempotencyKey === key && page.finalisationRequestHash !== requestHash) throw new StageBError("This Extra page finalisation key was used with different inputs.", 409);
    const placements = sectionCPlacements(state, scoped.remediation.id).filter((item) => item.pageId === page.id), ids = new Set(placements.map((item) => item.id));
    return { workspace: scoped.workspace, extraPage, page, placements, implementationRows: state.placementImplementationRows.filter((item) => ids.has(item.placementId)), appendixRows: state.masterAppendixRows.filter((item) => ids.has(item.placementId)) };
  }
  if (scoped.remediation.state !== "PAGE_FINALISED") throw new StageBError("The frozen five-page Remedy sequence must finalise before an Extra page can finalise.", 409);
  if (scoped.workspace.state !== "EDITING") throw new StageBError("The final Section C Extras sequence is immutable.", 409);
  expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace"); buildStageBRenderManifest(state, scoped.remediation.id);
  const preceding = activeSectionCExtraPages(state, scoped.remediation.id).filter((item) => item.orderIndex < extraPage.orderIndex);
  if (preceding.some((item) => pageRecord(state, item)?.state !== "FINALISED")) throw new StageBError("Extra pages must finalise in Section C report order.", 409);
  const base = lockedBase(state, scoped.remediation), placements = sectionCPlacements(state, scoped.remediation.id).filter((item) => item.pageId === page.id);
  if (placements.some((item) => item.placementType !== "EXTRA" || item.eligibilityResolutionId || item.remedyId || item.state !== "LOCKED" || !item.anchorLocked
    || item.dependencyReviewState !== "CURRENT" || item.baseLayoutVersionId !== base.id)) throw new StageBError("Extra page finalisation requires completed, current EXTRA placements on the locked Final Revised Layout.", 409);
  resequenceReportPlacements(state, scoped.remediation.id, input.actor); const projections = placements.map((placement) => projectionForPlacement(state, scoped.remediation, page, placement, input.actor));
  page.baseLayoutVersionId = base.id; page.state = "FINALISED"; page.finalisedAt = now(); page.finalisedBy = input.actor.id; page.finalisationIdempotencyKey = key;
  page.finalisationRequestHash = requestHash; page.updatedByActorUserId = input.actor.id; page.recordVersion = (page.recordVersion ?? 0) + 1;
  page.finalisationHash = pageFinalisationHash(state, scoped.remediation, extraPage, page); scoped.workspace.updatedByActorUserId = input.actor.id;
  scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
  addTimeline(state, scoped.remediation, input.actor, "Section C Extra page finalised", `${extraPage.title} finalised with ${placements.length} placement${placements.length === 1 ? "" : "s"}.`);
  return { workspace: scoped.workspace, extraPage, page, placements, implementationRows: projections.map((item) => item.row), appendixRows: projections.map((item) => item.appendix) };
}

function sectionCIntegritySnapshot(state: AppState, scoped: ReturnType<typeof requireWorkspace>) {
  const pairs = activePagePairs(state, scoped.remediation.id), placements = sectionCPlacements(state, scoped.remediation.id), ids = new Set(placements.map((item) => item.id));
  const rows = state.placementImplementationRows.filter((item) => item.remediationId === scoped.remediation.id && ids.has(item.placementId)).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const appendix = state.masterAppendixRows.filter((item) => item.remediationId === scoped.remediation.id && ids.has(item.placementId)).sort((a, b) => a.masterNumber - b.masterNumber || a.id.localeCompare(b.id));
  const assets = state.sectionCAssets.filter((item) => item.workspaceId === scoped.workspace.id).sort((a, b) => a.id.localeCompare(b.id)); const base = lockedBase(state, scoped.remediation);
  const retiredPages = state.sectionCExtraPages.filter((item) => item.workspaceId === scoped.workspace.id && item.status === "RETIRED").sort((a, b) => a.id.localeCompare(b.id));
  const retiredPageIds = new Set(retiredPages.map((item) => item.pageId));
  const liveRetiredPlacements = state.physicalPlacements.filter((item) => item.remediationId === scoped.remediation.id && retiredPageIds.has(item.pageId) && item.state !== "DELETED");
  return { workspace: scoped.workspace, remediationScope: { id: scoped.remediation.id, organisationId: scoped.remediation.organisationId, projectId: scoped.remediation.projectId,
    caseId: scoped.remediation.caseId, floorId: scoped.remediation.floorId, ...stageBRecordLineageFields(state, scoped.remediation), baseLayoutVersionId: scoped.remediation.baseLayoutVersionId },
    pages: pairs.map(({ extraPage, page }) => ({ extraPage, page })), retiredPages, liveRetiredPlacements, placements, rows, appendix, assets, base };
}

function sectionCIntegrity(state: AppState, scoped: ReturnType<typeof requireWorkspace>, actor: AppUser) {
  const snapshot = sectionCIntegritySnapshot(state, scoped), issues: SectionCIntegrityRunRecord["issues"] = [];
  const { pages, placements, rows, appendix, assets, base } = snapshot;
  if (scoped.workspace.state !== "FINALISED") issues.push({ code: "SECTION_C_NOT_FINALISED", entityType: "SECTION_C", entityId: scoped.workspace.id });
  if (scoped.remediation.state !== "PAGE_FINALISED") issues.push({ code: "STAGE_B_NOT_FINALISED", entityType: "STAGE_B", entityId: scoped.remediation.id });
  const names = pages.map((item) => item.extraPage.title.toLowerCase()); if (new Set(names).size !== names.length) issues.push({ code: "SECTION_C_DUPLICATE_PAGE_TITLE", entityType: "PAGE" });
  pages.forEach(({ extraPage, page }, index) => {
    if (extraPage.orderIndex !== index || page.ordinal !== SECTION_C_FIRST_ORDINAL + index * 2 || page.section !== "C" || page.pageType !== "EXTRA") issues.push({ code: "SECTION_C_PAGE_ORDER_INVALID", entityType: "PAGE", entityId: page.id });
    if (!stageBChildMatchesRemediation(state, scoped.remediation, extraPage) || extraPage.caseId !== scoped.caseRecord.id || extraPage.floorId !== scoped.floor.id || !stageBChildMatchesRemediation(state, scoped.remediation, page) || page.caseId !== scoped.caseRecord.id || page.floorId !== scoped.floor.id) issues.push({ code: "SECTION_C_PAGE_SCOPE_MISMATCH", entityType: "PAGE", entityId: page.id });
    if (page.state !== "FINALISED") issues.push({ code: "SECTION_C_PAGE_NOT_FINALISED", entityType: "PAGE", entityId: page.id });
    if (!page.finalisationHash || page.finalisationHash !== pageFinalisationHash(state, scoped.remediation, extraPage, page)) issues.push({ code: "SECTION_C_FINALISATION_HASH_MISMATCH", entityType: "PAGE", entityId: page.id });
  });
  if (!base || base.state !== "LOCKED") issues.push({ code: "BASE_LAYOUT_NOT_LOCKED", entityType: "BASE_LAYOUT", entityId: base?.id });
  for (const placement of placements) {
    const pair = pages.find((item) => item.page.id === placement.pageId), asset = assets.find((item) => item.pageId === placement.pageId && item.assetId === placement.imageAssetId
      && item.assetVersionId === placement.imageAssetVersionId && item.assetSnapshotId === placement.imageAssetSnapshotId && item.status === "APPROVED");
    if (!pair || placement.placementType !== "EXTRA" || placement.eligibilityResolutionId || placement.remedyId) issues.push({ code: "SECTION_C_CATEGORY_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (!asset) issues.push({ code: "SECTION_C_ASSET_SNAPSHOT_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (!stageBChildMatchesRemediation(state, scoped.remediation, placement) || placement.caseId !== scoped.caseRecord.id || placement.floorId !== scoped.floor.id || placement.baseLayoutVersionId !== base.id) issues.push({ code: "SECTION_C_PLACEMENT_SCOPE_MISMATCH", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.state !== "LOCKED" || !placement.anchorLocked || placement.dependencyReviewState !== "CURRENT") issues.push({ code: "SECTION_C_PLACEMENT_NOT_LOCKED", entityType: "PLACEMENT", entityId: placement.id });
    if (placement.masterNumber !== reportWideMasterNumber(state, scoped.remediation.id, placement.id)) issues.push({ code: "SECTION_C_MASTER_SEQUENCE_INVALID", entityType: "PLACEMENT", entityId: placement.id });
    const placementRows = rows.filter((item) => item.placementId === placement.id), placementAppendix = appendix.filter((item) => item.placementId === placement.id);
    if (placementRows.length !== 1 || placementRows[0]?.pageId !== placement.pageId || placementRows[0]?.masterNumber !== placement.masterNumber) issues.push({ code: "SECTION_C_IMPLEMENTATION_ROW_MISMATCH", entityType: "IMPLEMENTATION_ROW", entityId: placement.id });
    if (placementAppendix.length !== 1 || placementAppendix[0]?.sourcePageId !== placement.pageId || placementAppendix[0]?.masterNumber !== placement.masterNumber) issues.push({ code: "SECTION_C_APPENDIX_ROW_MISMATCH", entityType: "APPENDIX_ROW", entityId: placement.id });
  }
  if (rows.length !== placements.length || appendix.length !== placements.length) issues.push({ code: "SECTION_C_PROJECTION_COUNT_MISMATCH", entityType: "PROJECTION" });
  if (snapshot.liveRetiredPlacements.length) issues.push({ code: "SECTION_C_RETIRED_PAGE_LEAKAGE", entityType: "PLACEMENT" });
  const scopeHash = deterministicContentHash(snapshot), status = issues.length ? "FAIL" as const : "PASS" as const;
  const replay = state.sectionCIntegrityRuns.find((item) => item.workspaceId === scoped.workspace.id && item.scopeHash === scopeHash && item.status === status && deterministicContentHash(item.issues) === deterministicContentHash(issues));
  if (replay) return replay;
  const run: SectionCIntegrityRunRecord = { id: id("section-c-integrity"), organisationId: scoped.remediation.organisationId, createdByActorUserId: actor.id,
    updatedByActorUserId: actor.id, recordVersion: 1, workspaceId: scoped.workspace.id, remediationId: scoped.remediation.id, ...stageBRecordLineageFields(state, scoped.remediation),
    scopeHash, status, issues, checkedAt: now(), checkedBy: actor.id };
  state.sectionCIntegrityRuns.unshift(run); return run;
}

export function finaliseSectionCSequence(input: { remediationId: unknown; expectedRecordVersion: unknown; idempotencyKey: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); const key = safeText(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ remediationId: scoped.remediation.id, pageIds: activeSectionCExtraPages(state, scoped.remediation.id).map((item) => item.id) });
  if (scoped.workspace.state === "FINALISED") {
    if (scoped.workspace.finalisationIdempotencyKey === key && scoped.workspace.finalisationRequestHash !== requestHash) throw new StageBError("This Section C finalisation key was used with different inputs.", 409);
    return { workspace: scoped.workspace, integrityRun: state.sectionCIntegrityRuns.find((item) => item.workspaceId === scoped.workspace.id && item.status === "PASS"), manifest: buildSectionCRenderManifest(state, scoped.workspace.id) };
  }
  if (scoped.remediation.state !== "PAGE_FINALISED") throw new StageBError("The frozen five-page Remedy sequence must finalise before Section C can freeze.", 409);
  expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace"); const pairs = activePagePairs(state, scoped.remediation.id);
  if (pairs.some((item) => item.page.state !== "FINALISED")) throw new StageBError("Every active Extra page must finalise before the Section C sequence freezes.", 409);
  resequenceReportPlacements(state, scoped.remediation.id, input.actor); scoped.workspace.state = "FINALISED"; scoped.workspace.finalisedAt = now(); scoped.workspace.finalisedBy = input.actor.id;
  scoped.workspace.finalisationIdempotencyKey = key; scoped.workspace.finalisationRequestHash = requestHash; scoped.workspace.finalisationHash = deterministicContentHash({ remediationId: scoped.remediation.id,
    baseLayoutVersionId: scoped.remediation.baseLayoutVersionId, pages: pairs.map((item) => ({ id: item.extraPage.id, title: item.extraPage.title, orderIndex: item.extraPage.orderIndex, ordinal: item.page.ordinal, finalisationHash: item.page.finalisationHash })) });
  scoped.workspace.updatedByActorUserId = input.actor.id; scoped.workspace.recordVersion = (scoped.workspace.recordVersion ?? 0) + 1;
  const run = sectionCIntegrity(state, scoped, input.actor); if (run.status !== "PASS") throw new StageBError(`Section C integrity failed: ${run.issues.map((item) => item.code).join(", ")}`, 409);
  const manifest = buildSectionCRenderManifest(state, scoped.workspace.id); addTimeline(state, scoped.remediation, input.actor, "Section C Extras sequence finalised", `${pairs.length} Extra page${pairs.length === 1 ? "" : "s"} frozen with integrity PASS.`);
  return { workspace: scoped.workspace, integrityRun: run, manifest };
}

export function validateSectionCIntegrity(input: { remediationId: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const scoped = requireWorkspace(state, input.remediationId, input.actor); expected(scoped.workspace, input.expectedRecordVersion, "Section C workspace");
  return sectionCIntegrity(state, scoped, input.actor);
}

export function buildSectionCRenderManifest(state: AppState, workspaceId: string): SectionCRenderManifest {
  const workspace = state.sectionCWorkspaces.find((item) => item.id === workspaceId); if (!workspace) throw new StageBError("Section C workspace was not found.", 404);
  const remediation = state.stageBRemediations.find((item) => item.id === workspace.remediationId); if (!remediation) throw new StageBError("Section C remediation was not found.", 404);
  const actor = { id: workspace.updatedByActorUserId ?? workspace.createdByActorUserId ?? "system", fullName: "System", role: "ADMIN", organisationId: workspace.organisationId } as AppUser;
  const scoped = requireWorkspace(state, remediation.id, actor), snapshot = sectionCIntegritySnapshot(state, scoped), scopeHash = deterministicContentHash(snapshot);
  const run = state.sectionCIntegrityRuns.find((item) => item.workspaceId === workspace.id && item.scopeHash === scopeHash && item.status === "PASS");
  if (workspace.state !== "FINALISED" || !run) throw new StageBError("Finalised Section C render evidence is incomplete.", 409);
  const pages = snapshot.pages.map(({ extraPage, page }) => {
    const placements = snapshot.placements.filter((item) => item.pageId === page.id), ids = new Set(placements.map((item) => item.id));
    return { extraPageId: extraPage.id, pageId: page.id, title: extraPage.title, orderIndex: extraPage.orderIndex, ordinal: page.ordinal, finalisationHash: page.finalisationHash!,
      placements: structuredClone(placements), implementationRows: snapshot.rows.filter((item) => ids.has(item.placementId)).map((item) => ({ ...structuredClone(item), implemented: null, implementationDate: null, alternativeNeeded: null })) };
  });
  return { schemaVersion: "section-c-render-manifest/v1", organisationId: remediation.organisationId!, caseId: remediation.caseId, floorId: remediation.floorId,
    ...stageBRecordLineageFields(state, remediation), baseLayout: { versionId: snapshot.base.id, snapshotId: snapshot.base.snapshotId, contentHash: snapshot.base.assetContentHash }, pages,
    appendixRows: snapshot.appendix.map((item) => ({ ...structuredClone(item), implemented: null, implementationDate: null, alternativeNeeded: null })),
    integrityRunId: run.id, integrityScopeHash: run.scopeHash, integrityStatus: "PASS" };
}
