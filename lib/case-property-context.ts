import type { CasePropertyContextRecord, PropertyContext, PropertyContextProvenance, VastuCaseRecord } from "./domain";
import type { AppState } from "./store";

export class CasePropertyContextError extends Error {}
export class CasePropertyContextConflictError extends CasePropertyContextError {}

export interface EffectivePropertyContext {
  caseId: string;
  clientId: string;
  projectId?: string;
  propertyContext?: PropertyContext;
  provenance: PropertyContextProvenance;
  record?: CasePropertyContextRecord;
}

function required(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new CasePropertyContextError(`${label} is required.`);
  return value.trim();
}

function now() { return new Date().toISOString(); }

function caseFor(state: AppState, caseId: string, clientId: string) {
  const item = state.vastuCases.find((candidate) => candidate.id === caseId);
  if (!item) throw new CasePropertyContextError("Case not found.");
  if (item.clientId !== clientId) throw new CasePropertyContextError("Case does not belong to the supplied client.");
  return item;
}

function assertProject(state: AppState, item: VastuCaseRecord, projectId?: string) {
  if (!projectId) return;
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project || project.clientId !== item.clientId || project.activeCaseId !== item.id) {
    throw new CasePropertyContextError("Project does not belong to the supplied case.");
  }
}

/** Pure read-side resolver. Legacy fallback is deliberately never persisted. */
export function resolveEffectivePropertyContext(input: {
  state: AppState;
  caseId: string;
  clientId?: string;
}): EffectivePropertyContext {
  const caseId = required(input.caseId, "Case ID");
  const item = input.state.vastuCases.find((candidate) => candidate.id === caseId);
  if (!item) throw new CasePropertyContextError("Case not found.");
  if (input.clientId && item.clientId !== input.clientId) throw new CasePropertyContextError("Case does not belong to the supplied client.");
  const current = input.state.casePropertyContexts
    .filter((candidate) => candidate.caseId === caseId && candidate.clientId === item.clientId && candidate.status === "CURRENT")
    .sort((a, b) => b.version - a.version)[0];
  if (current) return { caseId, clientId: item.clientId, projectId: current.projectId, propertyContext: current.propertyContext, provenance: "CASE_SCOPED", record: current };

  const legacyProfiles = input.state.clientIntakeProfiles.filter((candidate) => candidate.clientId === item.clientId && candidate.propertyContext);
  const explicitLegacy = legacyProfiles.find((candidate) => {
    const candidateCaseId = (candidate as { caseId?: string }).caseId?.trim();
    if (candidateCaseId && candidateCaseId === caseId) return true;
    const candidateProjectId = (candidate as { projectId?: string }).projectId?.trim();
    if (!candidateProjectId) return false;
    const linkedProject = input.state.projects.find((candidateProject) => candidateProject.id === candidateProjectId && candidateProject.clientId === item.clientId && candidateProject.activeCaseId === caseId);
    return Boolean(linkedProject);
  });
  if (explicitLegacy) {
    const explicitProjectId = ((explicitLegacy as { projectId?: string }).projectId)?.trim();
    return { caseId, clientId: item.clientId, projectId: explicitProjectId, propertyContext: explicitLegacy.propertyContext, provenance: "LEGACY_CLIENT_FALLBACK" };
  }

  const singleCase = input.state.vastuCases.filter((candidate) => candidate.clientId === item.clientId);
  if (singleCase.length <= 1 && legacyProfiles.length > 0) {
    const legacy = legacyProfiles[0]?.propertyContext;
    return { caseId, clientId: item.clientId, propertyContext: legacy, provenance: "LEGACY_CLIENT_FALLBACK" };
  }
  if (legacyProfiles.length > 0) return { caseId, clientId: item.clientId, provenance: "AMBIGUOUS_LEGACY_CONTEXT" };
  return { caseId, clientId: item.clientId, provenance: "NO_PROPERTY_CONTEXT" };
}

export function saveCasePropertyContext(input: {
  state: AppState;
  clientId: string;
  caseId: string;
  projectId?: string;
  propertyContext: PropertyContext;
  actorId: string;
  organisationId?: string;
  idempotencyKey: string;
  expectedVersion?: number;
}): CasePropertyContextRecord {
  const clientId = required(input.clientId, "Client ID");
  const caseId = required(input.caseId, "Case ID");
  const idempotencyKey = required(input.idempotencyKey, "Idempotency key");
  const item = caseFor(input.state, caseId, clientId);
  assertProject(input.state, item, input.projectId);
  const current = input.state.casePropertyContexts
    .filter((candidate) => candidate.caseId === caseId && candidate.status === "CURRENT")
    .sort((a, b) => b.version - a.version)[0];
  if (current?.idempotencyKey === idempotencyKey) return current;
  if (current && input.expectedVersion !== current.version) throw new CasePropertyContextConflictError("Case property context changed. Refresh before saving.");
  const timestamp = now();
  if (current) { current.status = "SUPERSEDED"; current.supersededAt = timestamp; }
  const record: CasePropertyContextRecord = {
    id: crypto.randomUUID(), clientId, caseId, projectId: input.projectId,
    propertyContext: structuredClone(input.propertyContext), version: (current?.version ?? 0) + 1,
    idempotencyKey, createdAt: timestamp, updatedAt: timestamp, status: "CURRENT",
    organisationId: input.organisationId, createdByActorUserId: input.actorId, updatedByActorUserId: input.actorId, recordVersion: 1
  };
  input.state.casePropertyContexts.push(record);
  return record;
}
