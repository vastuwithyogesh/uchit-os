import type { AouReferenceRowRecord, AouVerdictReferenceSnapshot, AppUser } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import canonicalSource from "../data/aou-master.v1.json" with { type: "json" };

export const AOU_ADAPTER_VERSION = "aou-reference-adapter/v1";
export const AOU_SOURCE_VERSION = canonicalSource.sourceVersion;
export const AOU_WORKBOOK_CONTENT_HASH = canonicalSource.workbookContentHash;
export const AOU_SHEET_RANGE = `${canonicalSource.sheet}!${canonicalSource.range}`;
export const AOU_SHEET_RANGE_HASH = canonicalSource.rangeHash;
export const AOU_EXPLICIT_DIRECTION_GROUPS = canonicalSource.explicitDirectionGroups;
const AOU_CELL_COLUMNS = ["Element", "Attributes", "Directions", "Colours", "Shapes", "Metals", "Activities", "Utilites", "Objects"] as const;
const AOU_CELL_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;

export function getCanonicalAouSource() {
  return structuredClone(canonicalSource);
}

export function assertAouDirectionGroups() {
  const groups = Object.values(AOU_EXPLICIT_DIRECTION_GROUPS).flat();
  const expected = ["N", "NE", "NNW", "NNE", "NW", "E", "ENE", "ESE", "S", "SE", "SSE", "SSW", "SW", "W", "WNW", "WSW"];
  if (groups.length !== 16 || new Set(groups).size !== 16 || expected.some((direction) => !groups.includes(direction))) throw new Error("AOU explicit direction groups are not mutually exclusive and complete.");
  return true;
}

export type AouReadiness = { status: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT"; ready: boolean; reason: string; version?: AppState["aouMethodologyVersions"][number] };

function assertFounder(actor: AppUser, organisationId: string) {
  if (actor.organisationId !== organisationId || actor.role !== "SUPER_ADMIN" || actor.organisationCapability !== "organisation_owner") throw new Error("Only the Founder organisation owner may manage AOU methodology.");
}

function requiredText(value: unknown, label: string, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) throw new Error(`${label} must be safe non-blank text up to ${max} characters.`);
  return value.trim();
}

function optionalDisplay(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label, 4000);
}

export function initializeCanonicalAouSource(input: { state: AppState; organisationId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: unknown; reason: unknown }) {
  assertFounder(input.actor, input.organisationId);
  assertAouDirectionGroups();
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 160);
  const retry = input.state.aouMethodologyVersions.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === idempotencyKey);
  if (retry) return { version: retry, rows: input.state.aouReferenceRows.filter((row) => row.methodologyVersionId === retry.id), replayed: true };
  const active = input.state.aouMethodologyVersions.find((item) => item.organisationId === input.organisationId && item.lifecycleStatus === "ACTIVE");
  if ((active?.recordVersion ?? 0) !== input.expectedRecordVersion) throw new Error("AOU methodology changed. Reload the current version before continuing.");
  if (active) throw new Error("A canonical AOU version is already active. Meaning changes require a new methodology-version workflow.");
  const reason = requiredText(input.reason, "AOU source activation reason", 500);
  const createdAt = new Date().toISOString();
  const versionId = crypto.randomUUID();
  const rows = canonicalSource.rows.map((sourceRow) => {
    const directionScope = AOU_EXPLICIT_DIRECTION_GROUPS[sourceRow.element as keyof typeof AOU_EXPLICIT_DIRECTION_GROUPS];
    if (!directionScope) throw new Error("AOU source element has no approved explicit direction group.");
    const sourceCells = { Element: sourceRow.element, ...structuredClone(sourceRow.cells) };
    const sourceCellReferences = Object.fromEntries(AOU_CELL_COLUMNS.map((column, index) => [column, `${canonicalSource.sheet}!${AOU_CELL_LETTERS[index]}${sourceRow.rowNumber}`])) as AouReferenceRowRecord["sourceCellReferences"];
    const contentHash = deterministicContentHash({ sourceVersion: AOU_SOURCE_VERSION, sheetRange: AOU_SHEET_RANGE, rowNumber: sourceRow.rowNumber, element: sourceRow.element, sourceCells, directionScope });
    return {
      id: crypto.randomUUID(), organisationId: input.organisationId, methodologyVersionId: versionId,
      rowKey: `${AOU_SOURCE_VERSION}:row-${sourceRow.rowNumber}`, sourceRowNumber: sourceRow.rowNumber,
      element: sourceRow.element, directionScope: [...directionScope], sourceCells, sourceCellReferences,
      attributes: sourceCells.Attributes, directions: sourceCells.Directions, colours: sourceCells.Colours,
      shapes: sourceCells.Shapes, metals: sourceCells.Metals, activities: sourceCells.Activities,
      utilities: sourceCells.Utilites, objects: sourceCells.Objects, status: "APPROVED" as const,
      sourceReference: `${AOU_SHEET_RANGE}:row-${sourceRow.rowNumber}`, contentHash,
      idempotencyKey: `${idempotencyKey}:row-${sourceRow.rowNumber}`, createdAt, createdByActorUserId: input.actor.id,
      approvedAt: createdAt, approvedByActorUserId: input.actor.id, recordVersion: 1
    };
  });
  const contentHash = deterministicContentHash({ sourceVersion: AOU_SOURCE_VERSION, workbookContentHash: AOU_WORKBOOK_CONTENT_HASH, sheetRange: AOU_SHEET_RANGE, rangeHash: AOU_SHEET_RANGE_HASH, rowHashes: rows.map((row) => row.contentHash) });
  const version = {
    id: versionId, organisationId: input.organisationId, version: 1, label: "Uchit AOU Master v1",
    lifecycleStatus: "ACTIVE" as const, sourceLabel: "Approved workbook aou!A1:I6",
    sourceWorkbookHash: AOU_WORKBOOK_CONTENT_HASH, sourceRangeHash: AOU_SHEET_RANGE_HASH,
    sourceSheetRange: AOU_SHEET_RANGE, contentHash, reason, idempotencyKey, createdAt,
    createdByActorUserId: input.actor.id, approvedAt: createdAt, approvedByActorUserId: input.actor.id, recordVersion: 1
  };
  input.state.aouMethodologyVersions.unshift(version);
  input.state.aouReferenceRows.unshift(...rows);
  return { version, rows, replayed: false };
}

export function saveAouDisplayDraft(input: { state: AppState; organisationId: string; actor: AppUser; rowId: unknown; fields: unknown; cleanupOnlyConfirmed: unknown; meaningChangeConfirmed?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: number }) {
  assertFounder(input.actor, input.organisationId);
  const rowId = requiredText(input.rowId, "AOU row ID", 160);
  const row = input.state.aouReferenceRows.find((item) => item.id === rowId && item.organisationId === input.organisationId && item.status === "APPROVED");
  if (!row) throw new Error("Approved AOU source row was not found in this organisation.");
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 160);
  if (row.displayCopy?.idempotencyKey === idempotencyKey) return { row, replayed: true };
  if ((row.recordVersion ?? 0) !== input.expectedRecordVersion) throw new Error("AOU row changed. Reload before saving display copy.");
  if (input.cleanupOnlyConfirmed !== true || input.meaningChangeConfirmed === true) throw new Error("Display copy may change spelling, punctuation, spacing and grammar only. Meaning changes require a new AOU methodology version.");
  if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) throw new Error("AOU display copy fields must be a structured object.");
  const fields = input.fields as Record<string, unknown>;
  const allowed = ["attributes", "directions", "colours", "shapes", "metals", "activities", "utilities", "objects"];
  if (Object.keys(fields).some((key) => !allowed.includes(key))) throw new Error("Unsupported AOU display copy field.");
  const reason = requiredText(input.reason, "Display copy reason", 500);
  const draftFields = Object.fromEntries(allowed.map((key) => [key, optionalDisplay(fields[key], key)]).filter(([, value]) => value !== undefined));
  const contentHash = deterministicContentHash({ rowContentHash: row.contentHash, draftFields, cleanupOnlyConfirmed: true });
  row.displayCopy = { version: (row.displayCopy?.version ?? 0) + 1, status: "DRAFT", ...draftFields, contentHash, reason, idempotencyKey, createdAt: new Date().toISOString(), createdByActorUserId: input.actor.id };
  row.recordVersion = (row.recordVersion ?? 0) + 1;
  row.updatedByActorUserId = input.actor.id;
  return { row, replayed: false };
}

export function approveAouDisplayCopy(input: { state: AppState; organisationId: string; actor: AppUser; rowId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: number }) {
  assertFounder(input.actor, input.organisationId);
  const rowId = requiredText(input.rowId, "AOU row ID", 160);
  const row = input.state.aouReferenceRows.find((item) => item.id === rowId && item.organisationId === input.organisationId && item.status === "APPROVED");
  if (!row?.displayCopy) throw new Error("Save a Founder-reviewed AOU display draft before approval.");
  const idempotencyKey = requiredText(input.idempotencyKey, "Idempotency key", 160);
  if (row.displayCopy.status === "APPROVED" && row.displayCopy.approvalIdempotencyKey === idempotencyKey) return { row, replayed: true };
  if ((row.recordVersion ?? 0) !== input.expectedRecordVersion) throw new Error("AOU row changed. Reload before approval.");
  const approvalReason = requiredText(input.reason, "Display approval reason", 500);
  row.displayCopy = { ...row.displayCopy, status: "APPROVED", approvalIdempotencyKey: idempotencyKey, approvedAt: new Date().toISOString(), approvedByActorUserId: input.actor.id, approvalReason };
  row.recordVersion = (row.recordVersion ?? 0) + 1;
  row.updatedByActorUserId = input.actor.id;
  for (const report of input.state.reportVersions.filter((item) => item.organisationId === input.organisationId && item.status !== "RELEASED" && item.floorId && item.artifact?.aouReferenceSnapshot?.selectedRowIds.includes(row.id))) {
    const caseRecord = input.state.vastuCases.find((item) => item.id === report.caseId && item.organisationId === input.organisationId);
    if (!caseRecord?.projectId) continue;
    const alreadyInvalidated = input.state.dependencyInvalidations.some((item) => item.targetType === "DRAFT_REPORT" && item.targetId === report.id && item.sourceVersionId === row.methodologyVersionId && item.status !== "READY_FOR_REVIEW");
    if (!alreadyInvalidated) input.state.dependencyInvalidations.unshift({
      id: `invalidation_${crypto.randomUUID()}`, organisationId: input.organisationId, createdByActorUserId: input.actor.id,
      projectId: caseRecord.projectId, caseId: caseRecord.id, floorId: report.floorId!, targetType: "DRAFT_REPORT", targetId: report.id,
      causeType: "METHODOLOGY", sourceVersionId: row.methodologyVersionId, dependencyLinks: [row.methodologyVersionId, report.id],
      status: "NEEDS_REGENERATION", reason: "Approved AOU display copy changed; the dependent draft report needs regeneration.",
      createdAt: new Date().toISOString(), recordVersion: 0
    });
  }
  return { row, replayed: false };
}

function exactCanonicalRowsAreIntact(rows: AouReferenceRowRecord[]) {
  if (rows.length !== canonicalSource.rows.length) return false;
  return canonicalSource.rows.every((sourceRow) => {
    const row = rows.find((item) => item.sourceRowNumber === sourceRow.rowNumber && item.element === sourceRow.element);
    if (!row) return false;
    const expectedCells = { Element: sourceRow.element, ...sourceRow.cells };
    const expectedDirections = AOU_EXPLICIT_DIRECTION_GROUPS[sourceRow.element as keyof typeof AOU_EXPLICIT_DIRECTION_GROUPS];
    const expectedRefs = Object.fromEntries(AOU_CELL_COLUMNS.map((column, index) => [column, `${canonicalSource.sheet}!${AOU_CELL_LETTERS[index]}${sourceRow.rowNumber}`]));
    const expectedHash = deterministicContentHash({ sourceVersion: AOU_SOURCE_VERSION, sheetRange: AOU_SHEET_RANGE, rowNumber: sourceRow.rowNumber, element: sourceRow.element, sourceCells: expectedCells, directionScope: expectedDirections });
    return deterministicContentHash(row.sourceCells) === deterministicContentHash(expectedCells)
      && deterministicContentHash(row.sourceCellReferences) === deterministicContentHash(expectedRefs)
      && deterministicContentHash(row.directionScope) === deterministicContentHash(expectedDirections)
      && row.contentHash === expectedHash;
  });
}

function expectedVersionContentHash(rows: AouReferenceRowRecord[]) {
  const ordered = [...rows].sort((left, right) => left.sourceRowNumber - right.sourceRowNumber);
  return deterministicContentHash({ sourceVersion: AOU_SOURCE_VERSION, workbookContentHash: AOU_WORKBOOK_CONTENT_HASH,
    sheetRange: AOU_SHEET_RANGE, rangeHash: AOU_SHEET_RANGE_HASH, rowHashes: ordered.map((row) => row.contentHash) });
}

/** AOU stays blocked until the Methodology Owner activates the exact approved canonical source. */
export function getAouReadiness(state: AppState, organisationId: string): AouReadiness {
  const version = [...(state.aouMethodologyVersions ?? [])]
    .filter((item) => item.organisationId === organisationId && item.lifecycleStatus === "ACTIVE")
    .sort((left, right) => right.version - left.version)[0];
  if (!version) return { status: "BLOCKED_METHOD_INPUT", ready: false, reason: "No canonical approved AOU master/version has been supplied." };
  if (version.sourceWorkbookHash !== AOU_WORKBOOK_CONTENT_HASH || version.sourceRangeHash !== AOU_SHEET_RANGE_HASH || version.sourceSheetRange !== AOU_SHEET_RANGE) return { status: "BLOCKED_METHOD_INPUT", ready: false, reason: "The active AOU version does not match the approved workbook sheet/range hash.", version };
  const rows = (state.aouReferenceRows ?? []).filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  if (!rows.length) return { status: "BLOCKED_METHOD_INPUT", ready: false, reason: "The active AOU version has no approved reference rows." , version };
  if (!exactCanonicalRowsAreIntact(rows)) return { status: "BLOCKED_METHOD_INPUT", ready: false, reason: "The active AOU rows or cell provenance do not match the approved aou!A1:I6 source.", version };
  if (version.contentHash !== expectedVersionContentHash(rows)) return { status: "BLOCKED_METHOD_INPUT", ready: false, reason: "The active AOU methodology content hash does not match the approved source rows.", version };
  if (rows.some((item) => item.status === "REVIEW_REQUIRED" || item.status === "BLOCKED_METHOD_INPUT")) return { status: "REVIEW_REQUIRED", ready: false, reason: "The active AOU version contains unresolved rows.", version };
  if (rows.some((item) => item.status !== "APPROVED")) return { status: "REVIEW_REQUIRED", ready: false, reason: "The active AOU version contains non-approved rows.", version };
  return { status: "APPROVED", ready: true, reason: "AOU reference is approved and versioned.", version };
}

function safeRow(row: AouReferenceRowRecord) {
  const display = row.displayCopy?.status === "APPROVED" ? row.displayCopy : undefined;
  return {
    rowKey: row.rowKey, element: row.element, directionScope: row.directionScope,
    attributes: display?.attributes ?? row.sourceCells.Attributes, directions: display?.directions ?? row.sourceCells.Directions, colours: display?.colours ?? row.sourceCells.Colours,
    shapes: display?.shapes ?? row.sourceCells.Shapes, metals: display?.metals ?? row.sourceCells.Metals, activities: display?.activities ?? row.sourceCells.Activities,
    utilities: display?.utilities ?? row.sourceCells.Utilites, objects: display?.objects ?? row.sourceCells.Objects, sourceReference: row.sourceReference,
    contentHash: row.contentHash, copyLayer: display ? "APPROVED_DISPLAY" as const : "SOURCE" as const,
    displayCopyStatus: row.displayCopy?.status ?? "DRAFT", ...(row.displayCopy ? { displayCopyVersion: row.displayCopy.version } : {})
  } as const;
}

/**
 * Explicit selection only. No direction normalization or element inference is
 * performed; an unmapped row is rejected as methodology input required.
 */
export async function selectAouSnapshot(input: {
  state: AppState; organisationId: string; actor: AppUser; methodologyVersionId: string;
  selectedRowIds: string[]; element: string; directionSet: string[];
}) : Promise<AouVerdictReferenceSnapshot> {
  if (input.actor.organisationId !== input.organisationId || input.actor.role !== "SUPER_ADMIN" || input.actor.organisationCapability !== "organisation_owner") throw new Error("Only the Founder organisation owner may select AOU framing references.");
  const version = input.state.aouMethodologyVersions.find((item) => item.id === input.methodologyVersionId && item.organisationId === input.organisationId && item.lifecycleStatus === "ACTIVE");
  if (!version) throw new Error("AOU selection is BLOCKED_METHOD_INPUT until an active canonical AOU version is approved.");
  const readiness = getAouReadiness(input.state, input.organisationId);
  if (!readiness.ready || readiness.version?.id !== version.id) throw new Error(`${readiness.status}: ${readiness.reason}`);
  if (!Array.isArray(input.selectedRowIds) || input.selectedRowIds.length === 0 || new Set(input.selectedRowIds).size !== input.selectedRowIds.length) throw new Error("AOU selection requires unique approved row IDs.");
  const rows = input.selectedRowIds.map((id) => input.state.aouReferenceRows.find((item) => item.id === id && item.organisationId === input.organisationId && item.methodologyVersionId === version.id));
  if (rows.some((row) => !row || row.status !== "APPROVED")) throw new Error("AOU selection requires approved rows from one exact active version.");
  const selected = rows as AouReferenceRowRecord[];
  const relevant = selected.filter((row) => row.element === input.element && (!row.directionScope?.length || row.directionScope.some((direction) => input.directionSet.includes(direction))));
  if (relevant.length !== selected.length) throw new Error("AOU row cannot be mapped unambiguously to the approved element and direction context.");
  const appendixRows = input.state.aouReferenceRows.filter((row) => row.organisationId === input.organisationId && row.methodologyVersionId === version.id && row.status === "APPROVED").sort((left, right) => left.rowKey.localeCompare(right.rowKey)).map(safeRow);
  const selectedRows = selected.sort((left, right) => left.rowKey.localeCompare(right.rowKey)).map(safeRow);
  const snapshotCore = { methodologyVersionId: version.id, methodologyVersionLabel: version.label, methodologyContentHash: version.contentHash,
    sourceVersion: AOU_SOURCE_VERSION, sourceWorkbookHash: version.sourceWorkbookHash!, sourceRangeHash: version.sourceRangeHash!,
    selectedRowIds: selected.map((row) => row.id), selectedRows, appendixRows };
  return { ...snapshotCore, snapshotHash: await deterministicContentHash(snapshotCore) };
}

export function selectAouSnapshotForVerdicts(input: {
  state: AppState; organisationId: string; actor: AppUser; methodologyVersionId: string;
  verdictContexts: Array<{ element: string; directionSet: string[] }>;
}): AouVerdictReferenceSnapshot {
  assertFounder(input.actor, input.organisationId);
  const readiness = getAouReadiness(input.state, input.organisationId);
  if (!readiness.ready || readiness.version?.id !== input.methodologyVersionId) throw new Error(`${readiness.status}: ${readiness.reason}`);
  if (!input.verdictContexts.length) throw new Error("REVIEW_REQUIRED: an approved element verdict is required before AOU selection.");
  const approvedRows = input.state.aouReferenceRows.filter((row) => row.organisationId === input.organisationId && row.methodologyVersionId === input.methodologyVersionId && row.status === "APPROVED");
  const selected = input.verdictContexts.map((context) => {
    const matches = approvedRows.filter((row) => row.element === context.element && row.directionScope?.some((direction) => context.directionSet.includes(direction)));
    if (matches.length !== 1) throw new Error(`REVIEW_REQUIRED: AOU mapping for ${context.element} is missing or ambiguous for the exact approved direction set.`);
    return matches[0];
  });
  const unique = [...new Map(selected.map((row) => [row.id, row])).values()].sort((left, right) => left.rowKey.localeCompare(right.rowKey));
  const selectedRows = unique.map(safeRow);
  const appendixRows = approvedRows.sort((left, right) => left.rowKey.localeCompare(right.rowKey)).map(safeRow);
  const snapshotCore = { methodologyVersionId: readiness.version.id, methodologyVersionLabel: readiness.version.label,
    methodologyContentHash: readiness.version.contentHash, sourceVersion: AOU_SOURCE_VERSION,
    sourceWorkbookHash: readiness.version.sourceWorkbookHash!, sourceRangeHash: readiness.version.sourceRangeHash!,
    selectedRowIds: unique.map((row) => row.id), selectedRows, appendixRows };
  return { ...snapshotCore, snapshotHash: deterministicContentHash(snapshotCore) };
}
