import type { AppUser } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const NATURAL_LIGHT_STATES = ["BALANCED", "LOW_SUPPRESSED", "EXCESS_HARSH", "UNEVEN_FRAGMENTED"] as const;
export type NaturalLightState = (typeof NATURAL_LIGHT_STATES)[number];
export const VENTILATION_STATES = ["BALANCED", "LOW_STAGNANT", "BLOCKED_RESTRICTED", "OVERACTIVE_DRAFT_HEAVY", "FRAGMENTED_UNEVEN"] as const;
export type VentilationState = (typeof VENTILATION_STATES)[number];
export const POST_SITE_OBSERVATION_STATUSES = ["DRAFT", "FINALIZED", "SUPERSEDED"] as const;
export type PostSiteObservationStatus = (typeof POST_SITE_OBSERVATION_STATUSES)[number];
export const POST_SITE_METHODOLOGY_VERSION = "light-vent-v1" as const;
// Historical field name retained for lineage compatibility. This is an opaque
// canonical methodology content identifier, not a cryptographic SHA-256 digest.
export const POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER = "sha256:light-vent" as const;

export interface PostSiteElementalObservationRecord {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string;
  siteEvidenceVersionId: string;
  naturalLight: NaturalLightState; ventilation: VentilationState; methodologyVersionId: string; methodologyContentHash: string;
  sourceSheet: "Light Vent Rules"; status: PostSiteObservationStatus; version: number; predecessorId?: string; successorId?: string;
  recordVersion: number; idempotencyKey: string; requestHash: string; createdAt: string; createdByActorUserId: string; createdByActorName: string;
  finalizedAt?: string; finalizedByActorUserId?: string; finalizeIdempotencyKey?: string;
}

export class PostSiteObservationError extends Error {}
const text = (value: unknown, label: string) => { if (typeof value !== "string" || !value.trim()) throw new PostSiteObservationError(`${label} is required.`); return value.trim(); };
const now = () => new Date().toISOString(); const id = () => `post-site-observation-${crypto.randomUUID()}`;
function lineage(state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) { const item = state.vastuCases.find((candidate) => candidate.id === caseId && candidate.organisationId === organisationId); const project = state.projects.find((candidate) => candidate.id === projectId && candidate.clientId === item?.clientId && candidate.activeCaseId === caseId); const floor = state.floorWorkspaces.find((candidate) => candidate.id === floorId && candidate.projectId === projectId && candidate.caseId === caseId); if (!item || !project || !floor) throw new PostSiteObservationError("Organisation, case, project and floor lineage must match."); }
function light(value: unknown): NaturalLightState { if (!NATURAL_LIGHT_STATES.includes(value as NaturalLightState)) throw new PostSiteObservationError("Natural Light state is not supported."); return value as NaturalLightState; }
function ventilation(value: unknown): VentilationState { if (!VENTILATION_STATES.includes(value as VentilationState)) throw new PostSiteObservationError("Ventilation state is not supported."); return value as VentilationState; }
function methodology(version: string, contentIdentifier: string) { if (version !== POST_SITE_METHODOLOGY_VERSION || contentIdentifier !== POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER) throw new PostSiteObservationError("Post-Site methodology provenance must use the canonical Light Vent v1 identifier."); }
function currentFinalizedSite(state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) {
  const site = state.siteEvaluationEvidenceVersions
    .filter((record) => record.organisationId === organisationId && record.caseId === caseId && record.projectId === projectId && record.floorId === floorId && record.status === "FINALIZED")
    .sort((a, b) => b.version - a.version)[0];
  if (!site) throw new PostSiteObservationError("A current finalized V1 Site Evidence authority is required before Post-Site observations can be created.");
  return site;
}

export function createPostSiteObservationDraft(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; naturalLight: NaturalLightState; ventilation: VentilationState; methodologyVersionId: string; methodologyContentHash: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }): PostSiteElementalObservationRecord {
  const organisationId = text(input.organisationId, "Organisation ID"); const caseId = text(input.caseId, "Case ID"); const projectId = text(input.projectId, "Project ID"); const floorId = text(input.floorId, "Floor ID"); lineage(input.state, organisationId, caseId, projectId, floorId); const site = currentFinalizedSite(input.state, organisationId, caseId, projectId, floorId); const naturalLight = light(input.naturalLight); const ventilationState = ventilation(input.ventilation); const methodologyVersionId = text(input.methodologyVersionId, "Methodology version ID"); const methodologyContentHash = text(input.methodologyContentHash, "Methodology content hash"); methodology(methodologyVersionId, methodologyContentHash); const key = text(input.idempotencyKey, "Idempotency key"); const requestHash = deterministicContentHash({ organisationId, caseId, projectId, floorId, naturalLight, ventilation: ventilationState, methodologyVersionId, methodologyContentHash, siteEvidenceVersionId: site.id }); const replay = input.state.postSiteElementalObservations.find((record) => record.organisationId === organisationId && record.idempotencyKey === key); if (replay) { if (replay.requestHash !== requestHash) throw new PostSiteObservationError("Idempotency key is already used for different observations."); return replay; } const prior = input.state.postSiteElementalObservations.filter((record) => record.organisationId === organisationId && record.caseId === caseId && record.projectId === projectId && record.floorId === floorId).sort((a, b) => b.version - a.version)[0]; if (prior && input.expectedRecordVersion !== undefined && prior.recordVersion !== input.expectedRecordVersion) throw new Error("Entity changed. Refresh before retrying."); const createdAt = now(); const record: PostSiteElementalObservationRecord = { id: id(), organisationId, caseId, projectId, floorId, siteEvidenceVersionId: site.id, naturalLight, ventilation: ventilationState, methodologyVersionId, methodologyContentHash, sourceSheet: "Light Vent Rules", status: "DRAFT", version: (prior?.version ?? 0) + 1, ...(prior ? { predecessorId: prior.id } : {}), recordVersion: 1, idempotencyKey: key, requestHash, createdAt, createdByActorUserId: input.actor.id, createdByActorName: input.actor.fullName || input.actor.id }; input.state.postSiteElementalObservations.unshift(record); return record;
}
export function createPostSiteObservationSuccessor(input: { state: AppState; predecessorId: string; naturalLight: NaturalLightState; ventilation: VentilationState; methodologyVersionId: string; methodologyContentHash: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }) {
  const predecessor = input.state.postSiteElementalObservations.find((record) => record.id === text(input.predecessorId, "Predecessor ID"));
  if (!predecessor || predecessor.status !== "FINALIZED") throw new PostSiteObservationError("Only a finalized observation can have a successor.");
  if (input.expectedRecordVersion !== undefined && predecessor.recordVersion !== input.expectedRecordVersion) throw new PostSiteObservationError("Predecessor changed. Refresh before retrying.");
  if (input.state.postSiteElementalObservations.some((record) => record.predecessorId === predecessor.id && record.status === "DRAFT")) throw new PostSiteObservationError("An active successor draft already exists.");
  return createPostSiteObservationDraft({ state: input.state, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, naturalLight: input.naturalLight, ventilation: input.ventilation, methodologyVersionId: input.methodologyVersionId, methodologyContentHash: input.methodologyContentHash, actor: input.actor, idempotencyKey: input.idempotencyKey });
}

export function finalizePostSiteObservation(input: { state: AppState; recordId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: string; }) { const record = input.state.postSiteElementalObservations.find((candidate) => candidate.id === text(input.recordId, "Observation record ID")); if (!record) throw new PostSiteObservationError("Post-site observation not found."); if (record.status === "FINALIZED") { if (record.finalizeIdempotencyKey === input.idempotencyKey) return record; throw new PostSiteObservationError("Observation is already finalized."); } if (record.status !== "DRAFT") throw new PostSiteObservationError("Only a draft observation can be finalized."); if (record.recordVersion !== input.expectedRecordVersion) throw new PostSiteObservationError("Observation changed. Refresh before finalizing."); light(record.naturalLight); ventilation(record.ventilation); const predecessor = record.predecessorId ? input.state.postSiteElementalObservations.find((candidate) => candidate.id === record.predecessorId) : undefined; if (predecessor && predecessor.status !== "FINALIZED") throw new PostSiteObservationError("Predecessor must remain finalized before successor promotion."); const at = now(); record.status = "FINALIZED"; record.finalizedAt = at; record.finalizedByActorUserId = input.actor.id; record.finalizeIdempotencyKey = text(input.idempotencyKey, "Finalize idempotency key"); record.recordVersion += 1; if (predecessor) { predecessor.status = "SUPERSEDED"; predecessor.successorId = record.id; } return record; }
