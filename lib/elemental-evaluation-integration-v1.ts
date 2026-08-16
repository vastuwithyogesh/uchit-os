import type { AppUser } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { evaluateAllElementalDirections, type ElementalEvaluationOutput, type ElementalElement } from "./elemental-evaluation-v1.ts";
import { getElementalStatement, type ElementalStatementSelection, buildElementalStatementRepository } from "./elemental-statement-repo-v1.ts";
import { ENERGY_BAR_DIRECTIONS } from "./energy-bar-state-v1.ts";
import { assertCanonicalElementalMethodology, ELEMENTAL_METHODOLOGY_CONTENT_HASH, ELEMENTAL_METHODOLOGY_IDENTITY, ELEMENTAL_METHODOLOGY_VERSION, isCanonicalElementalMethodology } from "./elemental-methodology-authority-v1.ts";

export const ELEMENTAL_EVALUATION_STATUSES = ["COMPLETE", "REVIEW_REQUIRED", "SUPERSEDED"] as const;
export type ElementalEvaluationStatus = (typeof ELEMENTAL_EVALUATION_STATUSES)[number];
export interface ElementalEvaluationSnapshotV1 {
  id: string; organisationId: string; caseId: string; projectId: string; floorId: string;
  siteEvidenceVersionId?: string; postSiteObservationVersionId?: string; energyBarEvidenceVersionId?: string; energyBarStateSetVersionId?: string;
  status: ElementalEvaluationStatus; predecessorId?: string; successorId?: string; supersededAt?: string; supersededByActorUserId?: string; elements: Array<ElementalEvaluationOutput & { statement: ElementalStatementSelection }>;
  naturalLight?: string; ventilation?: string; reviewReasons: string[]; methodologyVersionId: string; methodologyContentHash: string;
  deterministicInputHash: string; deterministicOutputHash: string; inputHash: string; outputHash: string; version: number; recordVersion: number;
  provenance: { algorithmVersion: "elemental-evaluation-integration/v1"; sourceEngine: "elemental-evaluation-v1"; methodologyVersionId: string; methodologyContentHash: string; sourceRuleIds: string[] };
  idempotencyKey: string; createdAt: string; createdByActorUserId: string; createdByActorName: string;
}
export class ElementalIntegrationError extends Error {}
const text = (v: unknown, label: string) => { if (typeof v !== "string" || !v.trim()) throw new ElementalIntegrationError(`${label} is required.`); return v.trim(); };
const lineage = (s: AppState, o: string, c: string, p: string, f: string) => { const cc=s.vastuCases.find(x=>x.id===c&&x.organisationId===o); const pp=s.projects.find(x=>x.id===p&&x.clientId===cc?.clientId&&x.activeCaseId===c); const ff=s.floorWorkspaces.find(x=>x.id===f&&x.projectId===p&&x.caseId===c); if(!cc||!pp||!ff)throw new ElementalIntegrationError("Organisation, case, project and floor lineage must match."); };
export function createElementalEvaluationSnapshot(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; methodologyVersionId: string; methodologyContentHash: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }): ElementalEvaluationSnapshotV1 {
  const o=text(input.organisationId,"Organisation ID"), c=text(input.caseId,"Case ID"), p=text(input.projectId,"Project ID"), f=text(input.floorId,"Floor ID"), methodologyVersionId=text(input.methodologyVersionId,"Methodology version ID"), methodologyContentHash=text(input.methodologyContentHash,"Methodology content hash"), key=text(input.idempotencyKey,"Idempotency key"); lineage(input.state,o,c,p,f);
  const evidence=input.state.siteEvaluationEvidenceVersions.find(x=>x.organisationId===o&&x.caseId===c&&x.projectId===p&&x.floorId===f&&x.status==="FINALIZED"); const post=input.state.postSiteElementalObservations.find(x=>x.organisationId===o&&x.caseId===c&&x.projectId===p&&x.floorId===f&&x.status==="FINALIZED"); const energyEvidence=input.state.energyBarEvidenceVersions.find(x=>x.organisationId===o&&x.caseId===c&&x.projectId===p&&x.floorId===f&&x.status==="FINALIZED"); const states=input.state.energyBarStateSetVersions.find(x=>x.organisationId===o&&x.caseId===c&&x.projectId===p&&x.floorId===f&&x.status==="FINALIZED");
  if(!evidence || !post || !energyEvidence || !states) throw new ElementalIntegrationError("Finalized Site, Post-Site, Energy Evidence and Energy State Set authorities are required before Elemental Evaluation.");
  const reasons:string[]=[]; if(!evidence)reasons.push("Finalized Site Evaluation Evidence is required."); if(!post)reasons.push("Finalized Post-Site Light/Ventilation observation is required."); if(!energyEvidence)reasons.push("Finalized Energy Bar evidence is required."); if(!states)reasons.push("Finalized complete Energy Bar state set is required.");
  let elements:Array<ElementalEvaluationOutput & { statement: ElementalStatementSelection }> = []; let status:ElementalEvaluationStatus = "REVIEW_REQUIRED";
  if(states){ if(states.directions.length!==16 || ENERGY_BAR_DIRECTIONS.some(d=>!states.directions.some(x=>x.direction===d))) reasons.push("Energy Bar state set must contain exactly one state for each required direction."); else { const repo=buildElementalStatementRepository({methodologyVersionId,methodologyContentHash}); const results=evaluateAllElementalDirections(states.directions); elements=results.map(result=>({...result,statement:getElementalStatement(repo,result.element as ElementalElement,result.verdict)})); if(!evidence||!post||!energyEvidence){} else status="COMPLETE"; } }
  const inputPayload={o,c,p,f,siteEvidenceVersionId:evidence?.id??null,postSiteObservationVersionId:post?.id??null,energyBarEvidenceVersionId:energyEvidence?.id??null,energyBarStateSetVersionId:states?.id??null,methodologyVersionId,methodologyContentHash,states:states?.directions??null}; const deterministicInputHash=deterministicContentHash(inputPayload); const deterministicOutputHash=deterministicContentHash({status,elements:elements.map(x=>({element:x.element,verdict:x.verdict,correctionScope:x.correctionScope,remedyType:x.remedyType,targetDirection:x.targetDirection??null,reasonCode:x.reasonCode,statementId:x.statement.statementId,statementHash:x.statement.contentHash})),naturalLight:post?.naturalLight??null,ventilation:post?.ventilation??null,reasons});
  const replay=input.state.elementalEvaluationSnapshots.find(x=>x.organisationId===o&&x.idempotencyKey===key); if(replay){if(replay.inputHash!==deterministicInputHash)throw new ElementalIntegrationError("Idempotency key is already used for different evaluation input.");return replay;}
  const prior=input.state.elementalEvaluationSnapshots.filter(x=>x.organisationId===o&&x.caseId===c&&x.projectId===p&&x.floorId===f).sort((a,b)=>b.version-a.version)[0]; if(prior && (input.expectedRecordVersion===undefined || prior.recordVersion!==input.expectedRecordVersion)) throw new ElementalIntegrationError("Elemental Evaluation changed. Refresh before retrying."); const record:ElementalEvaluationSnapshotV1={id:`elemental-evaluation-${crypto.randomUUID()}`,organisationId:o,caseId:c,projectId:p,floorId:f,siteEvidenceVersionId:evidence?.id,postSiteObservationVersionId:post?.id,energyBarEvidenceVersionId:energyEvidence?.id,energyBarStateSetVersionId:states?.id,status,elements,naturalLight:post?.naturalLight,ventilation:post?.ventilation,reviewReasons:reasons,methodologyVersionId,methodologyContentHash,deterministicInputHash,deterministicOutputHash,inputHash:deterministicInputHash,outputHash:deterministicOutputHash,provenance:{algorithmVersion:"elemental-evaluation-integration/v1",sourceEngine:"elemental-evaluation-v1",methodologyVersionId,methodologyContentHash,sourceRuleIds:elements.map(x=>x.reasonCode)},version:(prior?.version??0)+1,recordVersion:1,idempotencyKey:key,createdAt:new Date().toISOString(),createdByActorUserId:input.actor.id,createdByActorName:input.actor.fullName||input.actor.id}; input.state.elementalEvaluationSnapshots.unshift(record); return record;
}

export function createCanonicalElementalEvaluationSnapshot(input: { state: AppState; organisationId: string; caseId: string; projectId: string; floorId: string; actor: AppUser; idempotencyKey: string; expectedRecordVersion?: number; }): ElementalEvaluationSnapshotV1 {
  const authority = assertCanonicalElementalMethodology();
  return createElementalEvaluationSnapshot({ ...input, ...authority });
}

export function createElementalEvaluationSuccessor(input: { state: AppState; predecessorId: string; actor: AppUser; expectedRecordVersion: number; idempotencyKey: string; }): ElementalEvaluationSnapshotV1 {
  const predecessor = input.state.elementalEvaluationSnapshots.find((item) => item.id === input.predecessorId);
  if (!predecessor) throw new ElementalIntegrationError("Elemental Evaluation predecessor not found.");
  if (predecessor.status !== "COMPLETE") throw new ElementalIntegrationError("Only a COMPLETE Elemental Evaluation can be superseded.");
  if (isCanonicalElementalMethodology(predecessor.methodologyVersionId, predecessor.methodologyContentHash)) throw new ElementalIntegrationError("The current Elemental Evaluation already has canonical methodology provenance.");
  if (predecessor.recordVersion !== input.expectedRecordVersion) throw new ElementalIntegrationError("Elemental Evaluation changed. Refresh before retrying.");
  const replay = input.state.elementalEvaluationSnapshots.find((item) => item.organisationId === predecessor.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) return replay;
  const successor = createCanonicalElementalEvaluationSnapshot({ state: input.state, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, actor: input.actor, idempotencyKey: input.idempotencyKey, expectedRecordVersion: predecessor.recordVersion });
  if (successor.status !== "COMPLETE" || successor.elements.map((item) => item.verdict).join("|") !== predecessor.elements.map((item) => item.verdict).join("|")) throw new ElementalIntegrationError("Elemental Evaluation methodology successor changed the deterministic verdicts.");
  predecessor.status = "SUPERSEDED";
  predecessor.successorId = successor.id;
  predecessor.supersededAt = new Date().toISOString();
  predecessor.supersededByActorUserId = input.actor.id;
  return successor;
}

export function getCurrentElementalEvaluation(state: AppState, organisationId: string, caseId: string, projectId: string, floorId: string) {
  return state.elementalEvaluationSnapshots
    .filter((item) => item.organisationId === organisationId && item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "COMPLETE" && isCanonicalElementalMethodology(item.methodologyVersionId, item.methodologyContentHash))
    .sort((left, right) => right.version - left.version)[0];
}

export { ELEMENTAL_METHODOLOGY_CONTENT_HASH, ELEMENTAL_METHODOLOGY_IDENTITY, ELEMENTAL_METHODOLOGY_VERSION };
