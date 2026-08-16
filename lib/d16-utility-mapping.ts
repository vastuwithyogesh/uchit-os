import type { AppState } from "./store.ts";
import type { D16UtilityMappingRowRecord, D16UtilityMappingVersionRecord, VastuCaseRecord } from "./domain.ts";
import { d16UtilityZones } from "./domain.ts";
import { DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID } from "./directional-statement-repo-v1.ts";
import { UTILITY_MASTER_ADAPTER_VERSION, UTILITY_MASTER_SOURCE_VERSION, UTILITY_MASTER_WORKBOOK_HASH } from "./utility-master.ts";

export class D16UtilityMappingError extends Error {}
export class D16UtilityMappingConflictError extends D16UtilityMappingError {}

const zoneSet = new Set<string>(d16UtilityZones);
const required = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new D16UtilityMappingError(`${label} is required.`);
  return value.trim();
};
const timestamp = () => new Date().toISOString();
const hash = (value: unknown) => JSON.stringify(value);
const canonicalProvenance = {
  methodologyVersionId: DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID,
  methodologyVersion: 1.1,
  methodologyContentHash: DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH,
  utilityMasterSourceVersion: UTILITY_MASTER_SOURCE_VERSION,
  utilityMasterWorkbookHash: UTILITY_MASTER_WORKBOOK_HASH,
  utilityMasterAdapterVersion: UTILITY_MASTER_ADAPTER_VERSION
} as const;

function hasCompleteProvenance(record: Pick<D16UtilityMappingVersionRecord, "methodologyVersionId" | "methodologyContentHash" | "utilityMasterSourceVersion" | "utilityMasterWorkbookHash" | "utilityMasterAdapterVersion">) {
  return Boolean(record.methodologyVersionId && record.methodologyContentHash && record.utilityMasterSourceVersion && record.utilityMasterWorkbookHash && record.utilityMasterAdapterVersion);
}

function assertOwnership(state: AppState, caseId: string, projectId: string, floorId: string) {
  const item = state.vastuCases.find((candidate) => candidate.id === caseId) as (VastuCaseRecord & { projectId?: string }) | undefined;
  const project = state.projects.find((candidate) => candidate.id === projectId);
  const floor = state.floorWorkspaces.find((candidate) => candidate.id === floorId);
  if (!item || !project || !floor) throw new D16UtilityMappingError("Case, project and floor are required.");
  if (project.clientId !== item.clientId || project.activeCaseId !== caseId) throw new D16UtilityMappingError("Project does not belong to case.");
  if (floor.projectId !== projectId || floor.caseId !== caseId) throw new D16UtilityMappingError("Floor does not belong to project and case.");
}

function validateRows(rows: D16UtilityMappingRowRecord[], allowEmpty = true) {
  if (!Array.isArray(rows)) throw new D16UtilityMappingError("Mapping rows are required.");
  if (!allowEmpty && rows.length === 0) throw new D16UtilityMappingError("A mapping cannot be finalized empty.");
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") throw new D16UtilityMappingError(`Mapping row ${index + 1} is malformed.`);
    const id = required(row.id, "Mapping row ID");
    if (ids.has(id)) throw new D16UtilityMappingError("Duplicate mapping-row ID.");
    ids.add(id);
    if (!Number.isInteger(row.serialNumber) || row.serialNumber < 1) throw new D16UtilityMappingError("Serial number is invalid.");
    required(row.utilityId, "Utility ID"); required(row.utilityName, "Utility name"); required(row.floorPlanLabel, "Floor Plan Label");
    if (!zoneSet.has(row.zone)) throw new D16UtilityMappingError(`Invalid D16 zone: ${String(row.zone)}.`);
  });
}

export function createD16UtilityMappingDraft(input: {
  state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string;
  rows?: D16UtilityMappingRowRecord[]; methodologyVersionId?: string; methodologyVersion?: number;
  methodologyContentHash?: string; utilityMasterSourceVersion?: string; utilityMasterWorkbookHash?: string; utilityMasterAdapterVersion?: string;
  provenanceRecoveryMode?: "POST_HOC_SOURCE_CERTIFICATION"; provenanceRecoveryOfVersionId?: string;
  externalD16EvidenceVersionId?: string; actorUserId: string; idempotencyKey: string;
}): D16UtilityMappingVersionRecord {
  const organisationId = required(input.organisationId, "Organisation ID");
  const caseId = required(input.caseId, "Case ID"); const projectId = required(input.projectId, "Project ID"); const floorId = required(input.floorId, "Floor ID");
  const idempotencyKey = required(input.idempotencyKey, "Idempotency key"); required(input.actorUserId, "Actor");
  assertOwnership(input.state, caseId, projectId, floorId); const rows = structuredClone(input.rows ?? []); validateRows(rows);
  const existing = input.state.d16UtilityMappingVersions.find((record) => record.organisationId === organisationId && record.floorId === floorId && record.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const prior = input.state.d16UtilityMappingVersions.filter((record) => record.organisationId === organisationId && record.floorId === floorId).sort((a, b) => b.version - a.version)[0];
  const now = timestamp(); const record: D16UtilityMappingVersionRecord = {
    id: crypto.randomUUID(), organisationId, caseId, projectId, floorId, version: (prior?.version ?? 0) + 1,
    status: "DRAFT", rows, methodologyVersionId: input.methodologyVersionId ?? canonicalProvenance.methodologyVersionId, methodologyVersion: input.methodologyVersion ?? canonicalProvenance.methodologyVersion,
    methodologyContentHash: input.methodologyContentHash ?? canonicalProvenance.methodologyContentHash,
    utilityMasterSourceVersion: input.utilityMasterSourceVersion ?? canonicalProvenance.utilityMasterSourceVersion,
    utilityMasterWorkbookHash: input.utilityMasterWorkbookHash ?? canonicalProvenance.utilityMasterWorkbookHash,
    utilityMasterAdapterVersion: input.utilityMasterAdapterVersion ?? canonicalProvenance.utilityMasterAdapterVersion,
    provenanceRecoveryMode: input.provenanceRecoveryMode, provenanceRecoveryOfVersionId: input.provenanceRecoveryOfVersionId,
    externalD16EvidenceVersionId: input.externalD16EvidenceVersionId,
    idempotencyKey, requestHash: hash(rows), createdAt: now, updatedAt: now, createdByActorUserId: input.actorUserId, recordVersion: 1
  };
  input.state.d16UtilityMappingVersions.push(record); return record;
}

export function finalizeD16UtilityMapping(input: { state: AppState; mappingId: string; actorUserId: string; expectedVersion?: number; idempotencyKey: string }): D16UtilityMappingVersionRecord {
  const record = input.state.d16UtilityMappingVersions.find((candidate) => candidate.id === required(input.mappingId, "Mapping ID"));
  if (!record) throw new D16UtilityMappingError("Mapping not found.");
  if (record.status === "FINALIZED") return record;
  if (record.status !== "DRAFT") throw new D16UtilityMappingError("Only a draft mapping can be finalized.");
  if (input.expectedVersion !== undefined && input.expectedVersion !== record.recordVersion) throw new D16UtilityMappingConflictError("Mapping changed. Refresh before finalizing.");

  validateRows(record.rows, false);
  if (!hasCompleteProvenance(record)) throw new D16UtilityMappingError("Methodology provenance is incomplete.");
  const predecessor = record.predecessorVersionId
    ? input.state.d16UtilityMappingVersions.find((candidate) => candidate.id === record.predecessorVersionId)
    : undefined;
  if (predecessor && predecessor.status !== "FINALIZED") {
    throw new D16UtilityMappingConflictError("Cannot finalize before predecessor is authoritative-finalized.");
  }

  const finalizedAt = timestamp();
  record.status = "FINALIZED";
  record.finalizedAt = finalizedAt;
  record.finalizedByActorUserId = required(input.actorUserId, "Actor");
  record.updatedAt = finalizedAt;
  if (record.provenanceRecoveryMode) {
    record.provenanceCertifiedAt = finalizedAt;
    record.provenanceCertifiedByActorUserId = record.finalizedByActorUserId;
  }
  record.recordVersion = (record.recordVersion ?? 1) + 1;
  if (predecessor) {
    predecessor.status = "SUPERSEDED";
    predecessor.updatedAt = finalizedAt;
    predecessor.successorVersionId = record.id;
  }

  return record;
}

export function createD16UtilityMappingSuccessor(input: { state: AppState; predecessorId: string; rows: D16UtilityMappingRowRecord[]; actorUserId: string; idempotencyKey: string }): D16UtilityMappingVersionRecord {
  const predecessor = input.state.d16UtilityMappingVersions.find((candidate) => candidate.id === input.predecessorId);
  if (!predecessor) throw new D16UtilityMappingError("Predecessor mapping not found.");
  if (predecessor.status !== "FINALIZED") throw new D16UtilityMappingError("Only a finalized mapping can have a successor.");
  const activeDraft = input.state.d16UtilityMappingVersions.find(
    (candidate) => candidate.predecessorVersionId === predecessor.id && candidate.status === "DRAFT"
  );
  if (activeDraft) throw new D16UtilityMappingConflictError("Existing uncontrolled draft successor already present.");
  const successor = createD16UtilityMappingDraft({ state: input.state, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, rows: input.rows, methodologyVersionId: predecessor.methodologyVersionId, methodologyVersion: predecessor.methodologyVersion, methodologyContentHash: predecessor.methodologyContentHash, utilityMasterSourceVersion: predecessor.utilityMasterSourceVersion, utilityMasterWorkbookHash: predecessor.utilityMasterWorkbookHash, utilityMasterAdapterVersion: predecessor.utilityMasterAdapterVersion, provenanceRecoveryMode: hasCompleteProvenance(predecessor) ? undefined : "POST_HOC_SOURCE_CERTIFICATION", provenanceRecoveryOfVersionId: hasCompleteProvenance(predecessor) ? undefined : predecessor.id, externalD16EvidenceVersionId: predecessor.externalD16EvidenceVersionId, actorUserId: input.actorUserId, idempotencyKey: input.idempotencyKey });
  successor.predecessorVersionId = predecessor.id;
  predecessor.successorVersionId = successor.id;
  predecessor.updatedAt = timestamp();
  return successor;
}

export function getD16UtilityMapping(input: { state: AppState; mappingId?: string; caseId: string; projectId: string; floorId: string }) {
  const caseScoped = input.state.d16UtilityMappingVersions.filter(
    (candidate) => candidate.caseId === input.caseId && candidate.projectId === input.projectId && candidate.floorId === input.floorId
  );
  if (!caseScoped.length) throw new D16UtilityMappingError("Mapping not found.");
  if (input.mappingId) {
    const record = caseScoped.find((candidate) => candidate.id === input.mappingId);
    if (!record) throw new D16UtilityMappingError("Mapping is outside the requested floor scope.");
    return record;
  }
  const finalized = caseScoped.filter((candidate) => candidate.status === "FINALIZED").sort((a, b) => b.version - a.version)[0];
  if (!finalized) throw new D16UtilityMappingError("No finalized mapping found.");
  return finalized;
}
