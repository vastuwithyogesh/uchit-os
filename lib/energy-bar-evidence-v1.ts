import type { AppUser } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const ENERGY_BAR_EVIDENCE_STATUSES = ["DRAFT", "FINALIZED", "SUPERSEDED"] as const;
export type EnergyBarEvidenceStatus = (typeof ENERGY_BAR_EVIDENCE_STATUSES)[number];
export interface EnergyBarEvidenceVersionRecord {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string;
  evidenceRef: string; artifactHash: string; fileName?: string; fileSize?: number;
  status: EnergyBarEvidenceStatus; version: number; predecessorId?: string; successorId?: string;
  recordVersion: number; idempotencyKey: string; requestHash: string; createdAt: string;
  createdByActorUserId: string; createdByActorName: string; finalizedAt?: string;
  finalizedByActorUserId?: string; finalizeIdempotencyKey?: string; finalizeRequestHash?: string;
}
export class EnergyBarEvidenceError extends Error {}
const text = (v: unknown, label: string) => { if (typeof v !== "string" || !v.trim()) throw new EnergyBarEvidenceError(`${label} is required.`); return v.trim(); };
const lineage = (state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) => {
  const c = state.vastuCases.find(x => x.id === caseId && x.organisationId === organisationId);
  const p = state.projects.find(x => x.id === projectId && x.clientId === c?.clientId && x.activeCaseId === caseId);
  const f = state.floorWorkspaces.find(x => x.id === floorId && x.projectId === projectId && x.caseId === caseId);
  if (!c || !p || !f) throw new EnergyBarEvidenceError("Organisation, case, project and floor lineage must match.");
};
export function createEnergyBarEvidenceDraft(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; evidenceRef: string; artifactHash: string; fileName?: string; fileSize?: number; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }): EnergyBarEvidenceVersionRecord {
  const { state } = input; const organisationId = text(input.organisationId, "Organisation ID"); const caseId = text(input.caseId, "Case ID"); const projectId = text(input.projectId, "Project ID"); const floorId = text(input.floorId, "Floor ID"); lineage(state, organisationId, caseId, projectId, floorId);
  const postSite = state.postSiteElementalObservations.find((record) => record.organisationId === organisationId && record.caseId === caseId && record.projectId === projectId && record.floorId === floorId && record.status === "FINALIZED");
  if (!postSite) throw new EnergyBarEvidenceError("A finalized same-floor Post-Site observation is required before Energy Bar evidence.");
  const evidenceRef = text(input.evidenceRef, "Evidence reference"); const artifactHash = text(input.artifactHash, "Evidence checksum"); const key = text(input.idempotencyKey, "Idempotency key");
  if (input.fileSize !== undefined && (!Number.isInteger(input.fileSize) || input.fileSize < 1)) throw new EnergyBarEvidenceError("File size must be a positive integer.");
  const requestHash = deterministicContentHash({ organisationId, caseId, projectId, floorId, evidenceRef, artifactHash, fileName: input.fileName ?? null, fileSize: input.fileSize ?? null });
  const replay = state.energyBarEvidenceVersions.find(x => x.organisationId === organisationId && x.idempotencyKey === key); if (replay) { if (replay.requestHash !== requestHash) throw new EnergyBarEvidenceError("Idempotency key is already used for different evidence."); return replay; }
  const prior = state.energyBarEvidenceVersions.filter(x => x.organisationId === organisationId && x.caseId === caseId && x.projectId === projectId && x.floorId === floorId).sort((a, b) => b.version - a.version)[0]; if (!prior && input.expectedRecordVersion !== postSite.recordVersion) throw new Error("Post-Site observation changed. Refresh before retrying."); if (prior && input.expectedRecordVersion !== undefined && prior.recordVersion !== input.expectedRecordVersion) throw new Error("Entity changed. Refresh before retrying.");
  const record: EnergyBarEvidenceVersionRecord = { id: `energy-evidence-${crypto.randomUUID()}`, organisationId, caseId, projectId, floorId, evidenceRef, artifactHash, ...(input.fileName ? { fileName: input.fileName } : {}), ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}), status: "DRAFT", version: (prior?.version ?? 0) + 1, ...(prior ? { predecessorId: prior.id } : {}), recordVersion: 1, idempotencyKey: key, requestHash, createdAt: new Date().toISOString(), createdByActorUserId: input.actor.id, createdByActorName: input.actor.fullName || input.actor.id };
  state.energyBarEvidenceVersions.unshift(record); return record;
}
export function createEnergyBarEvidenceSuccessor(input: { state: AppState; predecessorId: string; evidenceRef: string; artifactHash: string; fileName?: string; fileSize?: number; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }) {
  const predecessor = input.state.energyBarEvidenceVersions.find((record) => record.id === text(input.predecessorId, "Predecessor ID"));
  if (!predecessor || predecessor.status !== "FINALIZED") throw new EnergyBarEvidenceError("Only a finalized evidence version can have a successor.");
  if (input.expectedRecordVersion !== undefined && predecessor.recordVersion !== input.expectedRecordVersion) throw new EnergyBarEvidenceError("Predecessor changed. Refresh before retrying.");
  if (input.state.energyBarEvidenceVersions.some((record) => record.predecessorId === predecessor.id && record.status === "DRAFT")) throw new EnergyBarEvidenceError("An active successor draft already exists.");
  return createEnergyBarEvidenceDraft({ state: input.state, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, evidenceRef: input.evidenceRef, artifactHash: input.artifactHash, fileName: input.fileName, fileSize: input.fileSize, actor: input.actor, idempotencyKey: input.idempotencyKey });
}

export function finalizeEnergyBarEvidence(input: { state: AppState; recordId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: string; }) {
  const record = input.state.energyBarEvidenceVersions.find(x => x.id === text(input.recordId, "Evidence record ID")); if (!record) throw new EnergyBarEvidenceError("Energy Bar evidence record not found."); if (record.status === "FINALIZED") { if (record.finalizeIdempotencyKey === input.idempotencyKey) return record; throw new EnergyBarEvidenceError("Evidence is already finalized."); } if (record.status !== "DRAFT") throw new EnergyBarEvidenceError("Only a draft evidence record can be finalized."); if (record.recordVersion !== input.expectedRecordVersion) throw new EnergyBarEvidenceError("Evidence record changed. Refresh before finalizing.");
  const predecessor = record.predecessorId ? input.state.energyBarEvidenceVersions.find(x => x.id === record.predecessorId) : undefined; if (predecessor && predecessor.status !== "FINALIZED") throw new EnergyBarEvidenceError("Predecessor must remain finalized before successor promotion."); record.status = "FINALIZED"; record.finalizedAt = new Date().toISOString(); record.finalizedByActorUserId = input.actor.id; record.finalizeIdempotencyKey = text(input.idempotencyKey, "Finalize idempotency key"); record.finalizeRequestHash = deterministicContentHash({ recordId: record.id, expectedRecordVersion: input.expectedRecordVersion }); record.recordVersion += 1; if (predecessor) { predecessor.status = "SUPERSEDED"; predecessor.successorId = record.id; } return record;
}
export const getCurrentEnergyBarEvidence = (state: AppState, caseId: string, projectId: string, floorId: string) => state.energyBarEvidenceVersions.filter(x => x.caseId === caseId && x.projectId === projectId && x.floorId === floorId && x.status === "FINALIZED").sort((a, b) => b.version - a.version)[0];
