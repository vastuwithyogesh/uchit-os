import type { AppUser } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const SITE_EVALUATION_MODES = ["PHYSICAL_VISIT", "LIVE_VIDEO", "CLIENT_SUPPLIED_VIDEO"] as const;
export type SiteEvaluationMode = (typeof SITE_EVALUATION_MODES)[number];
export const SITE_EVIDENCE_STATUSES = ["DRAFT", "FINALIZED", "SUPERSEDED"] as const;
export type SiteEvidenceStatus = (typeof SITE_EVIDENCE_STATUSES)[number];

export interface SiteEvaluationEvidenceVersionRecord {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string;
  mode: SiteEvaluationMode; evidenceRef: string; fileName?: string; artifactHash: string; fileSize?: number; evidenceDate?: string;
  status: SiteEvidenceStatus; version: number; predecessorId?: string; successorId?: string;
  recordVersion: number; idempotencyKey: string; requestHash: string; createdAt: string; createdByActorUserId: string; createdByActorName: string;
  finalizedAt?: string; finalizedByActorUserId?: string; finalizeIdempotencyKey?: string; finalizeRequestHash?: string;
}

export class SiteEvaluationEvidenceError extends Error {}
const requiredText = (value: unknown, label: string) => { if (typeof value !== "string" || !value.trim()) throw new SiteEvaluationEvidenceError(`${label} is required.`); return value.trim(); };
const now = () => new Date().toISOString();
const newId = () => `site-evidence-${crypto.randomUUID()}`;
const actorName = (actor: AppUser) => actor.fullName || actor.id;
function assertLineage(state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) {
  const item = state.vastuCases.find((candidate) => candidate.id === caseId && candidate.organisationId === organisationId);
  const project = state.projects.find((candidate) => candidate.id === projectId && candidate.clientId === item?.clientId && candidate.activeCaseId === caseId);
  const floor = state.floorWorkspaces.find((candidate) => candidate.id === floorId && candidate.projectId === projectId && candidate.caseId === caseId);
  if (!item || !project || !floor) throw new SiteEvaluationEvidenceError("Organisation, case, project and floor lineage must match.");
}
function validateMode(mode: unknown): SiteEvaluationMode { if (!SITE_EVALUATION_MODES.includes(mode as SiteEvaluationMode)) throw new SiteEvaluationEvidenceError("Site Evaluation mode is not supported."); return mode as SiteEvaluationMode; }
function validateArtifact(evidenceRef: unknown, artifactHash: unknown) { return { evidenceRef: requiredText(evidenceRef, "Evidence artifact reference"), artifactHash: requiredText(artifactHash, "Evidence artifact checksum") }; }

export function createSiteEvaluationEvidenceDraft(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; mode: SiteEvaluationMode; evidenceRef: string; artifactHash: string; fileName?: string; fileSize?: number; evidenceDate?: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }): SiteEvaluationEvidenceVersionRecord {
  const organisationId = requiredText(input.organisationId, "Organisation ID"); const caseId = requiredText(input.caseId, "Case ID"); const projectId = requiredText(input.projectId, "Project ID"); const floorId = requiredText(input.floorId, "Floor ID");
  assertLineage(input.state, organisationId, caseId, projectId, floorId); const mode = validateMode(input.mode); const artifact = validateArtifact(input.evidenceRef, input.artifactHash); const key = requiredText(input.idempotencyKey, "Idempotency key");
  if (input.fileSize !== undefined && (!Number.isInteger(input.fileSize) || input.fileSize < 1)) throw new SiteEvaluationEvidenceError("File size must be a positive integer.");
  const requestHash = deterministicContentHash({ organisationId, caseId, projectId, floorId, mode, ...artifact, fileName: input.fileName ?? null, fileSize: input.fileSize ?? null, evidenceDate: input.evidenceDate ?? null });
  const replay = input.state.siteEvaluationEvidenceVersions.find((record) => record.organisationId === organisationId && record.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new SiteEvaluationEvidenceError("Idempotency key is already used for different evidence."); return replay; }
  const prior = input.state.siteEvaluationEvidenceVersions.filter((record) => record.organisationId === organisationId && record.caseId === caseId && record.projectId === projectId && record.floorId === floorId).sort((a, b) => b.version - a.version)[0]; if (prior && input.expectedRecordVersion !== undefined && prior.recordVersion !== input.expectedRecordVersion) throw new Error("Entity changed. Refresh before retrying.");
  const createdAt = now(); const record: SiteEvaluationEvidenceVersionRecord = { id: newId(), organisationId, caseId, projectId, floorId, mode, ...artifact, ...(input.fileName ? { fileName: input.fileName } : {}), ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}), ...(input.evidenceDate ? { evidenceDate: input.evidenceDate } : {}), status: "DRAFT", version: (prior?.version ?? 0) + 1, ...(prior ? { predecessorId: prior.id } : {}), recordVersion: 1, idempotencyKey: key, requestHash, createdAt, createdByActorUserId: input.actor.id, createdByActorName: actorName(input.actor) };
  input.state.siteEvaluationEvidenceVersions.unshift(record); return record;
}

export function createSiteEvaluationEvidenceSuccessor(input: { state: AppState; predecessorId: string; mode: SiteEvaluationMode; evidenceRef: string; artifactHash: string; fileName?: string; fileSize?: number; evidenceDate?: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }) {
  const predecessor = input.state.siteEvaluationEvidenceVersions.find((record) => record.id === requiredText(input.predecessorId, "Predecessor ID"));
  if (!predecessor || predecessor.status !== "FINALIZED") throw new SiteEvaluationEvidenceError("Only a finalized evidence version can have a successor.");
  if (input.expectedRecordVersion !== undefined && predecessor.recordVersion !== input.expectedRecordVersion) throw new SiteEvaluationEvidenceError("Predecessor changed. Refresh before retrying.");
  if (input.state.siteEvaluationEvidenceVersions.some((record) => record.predecessorId === predecessor.id && record.status === "DRAFT")) throw new SiteEvaluationEvidenceError("An active successor draft already exists.");
  return createSiteEvaluationEvidenceDraft({ state: input.state, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, mode: input.mode, evidenceRef: input.evidenceRef, artifactHash: input.artifactHash, fileName: input.fileName, fileSize: input.fileSize, evidenceDate: input.evidenceDate, actor: input.actor, idempotencyKey: input.idempotencyKey });
}

export function finalizeSiteEvaluationEvidence(input: { state: AppState; recordId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: string; }): SiteEvaluationEvidenceVersionRecord {
  const record = input.state.siteEvaluationEvidenceVersions.find((candidate) => candidate.id === requiredText(input.recordId, "Evidence record ID"));
  if (!record) throw new SiteEvaluationEvidenceError("Site Evaluation evidence record not found.");
  if (record.status === "FINALIZED") { if (record.finalizeIdempotencyKey === input.idempotencyKey || !input.idempotencyKey) return record; throw new SiteEvaluationEvidenceError("Evidence is already finalized."); }
  if (record.status !== "DRAFT") throw new SiteEvaluationEvidenceError("Only a draft evidence record can be finalized.");
  if (record.recordVersion !== input.expectedRecordVersion) throw new SiteEvaluationEvidenceError("Evidence record changed. Refresh before finalizing.");
  validateMode(record.mode); validateArtifact(record.evidenceRef, record.artifactHash);
  const finalizeRequestHash = deterministicContentHash({ recordId: record.id, expectedRecordVersion: input.expectedRecordVersion }); const predecessor = record.predecessorId ? input.state.siteEvaluationEvidenceVersions.find((candidate) => candidate.id === record.predecessorId) : undefined; const finalizedAt = now();
  record.status = "FINALIZED"; record.finalizedAt = finalizedAt; record.finalizedByActorUserId = input.actor.id; record.finalizeIdempotencyKey = requiredText(input.idempotencyKey, "Finalize idempotency key"); record.finalizeRequestHash = finalizeRequestHash; record.recordVersion += 1;
  if (predecessor) { if (predecessor.status !== "FINALIZED") { record.status = "DRAFT"; delete record.finalizedAt; delete record.finalizedByActorUserId; delete record.finalizeIdempotencyKey; delete record.finalizeRequestHash; record.recordVersion -= 1; throw new SiteEvaluationEvidenceError("Predecessor must remain finalized before successor promotion."); } predecessor.status = "SUPERSEDED"; predecessor.successorId = record.id; }
  return record;
}

export function getCurrentSiteEvaluationEvidence(state: AppState, caseId: string, projectId: string, floorId: string) {
  return state.siteEvaluationEvidenceVersions.filter((record) => record.caseId === caseId && record.projectId === projectId && record.floorId === floorId && record.status === "FINALIZED").sort((a, b) => b.version - a.version)[0];
}
