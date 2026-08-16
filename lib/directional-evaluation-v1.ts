import type { D16UtilityMappingVersionRecord, EntranceZoneVersionRecord } from "./domain.ts";
import { combineEntranceClassifications, type CombinedEntranceAssessment, type EntranceClassification } from "./entrance-combined.ts";
import { getUtilityMasterSource, resolveUtilityMasterRows, utilityMasterRuleId, UTILITY_MASTER_ADAPTER_VERSION, UTILITY_MASTER_SOURCE_VERSION, UTILITY_MASTER_WORKBOOK_HASH } from "./utility-master.ts";
import type { D8ModifierResult } from "./d8-modifiers-v1.ts";
import type { D8OrientationResult } from "./d8-orientation-v1.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { evaluateCirculation, type CirculationResult, type CirculationState } from "./circulation-v1.ts";

export const DIRECTIONAL_EVALUATION_VERSION = "directional-evaluation/v1" as const;
export type DirectionalEvaluationStatus = "COMPLETE" | "REVIEW_REQUIRED";
export type DirectionalReviewReasonCode =
  | "D8_BOUNDARY_POLICY_REQUIRED" | "D8_INPUT_LINEAGE_MISMATCH" | "D8_INPUT_NOT_AUTHORITATIVE"
  | "D16_NOT_AUTHORITATIVE" | "D16_INPUT_LINEAGE_MISMATCH" | "D16_METHODOLOGY_PROVENANCE_REQUIRED"
  | "D32_NOT_AUTHORITATIVE" | "D32_INPUT_LINEAGE_MISMATCH" | "D32_METHODOLOGY_PROVENANCE_REQUIRED"
  | "UTILITY_RULE_UNRESOLVED" | "UTILITY_RULE_BLOCKED_METHOD_INPUT" | "CIRCULATION_INPUT_REQUIRED";

export interface DirectionalLineage { organisationId?: string; clientId?: string; caseId: string; projectId: string; floorId: string; }
export interface AuthoritativeD8Orientation extends DirectionalLineage { orientationVersionId: string; status: "LOCKED"; result: D8OrientationResult; }
export interface AuthoritativeD8Modifier extends DirectionalLineage { findingId: string; result: D8ModifierResult; }
export interface AuthoritativeD16Mapping { mapping: D16UtilityMappingVersionRecord; }
export interface AuthoritativeD32Entrance { record: Pick<EntranceZoneVersionRecord, "id" | "organisationId" | "caseId" | "projectId" | "floorId" | "scope" | "status" | "zoneCode" | "classificationSnapshot" | "methodologyVersionId" | "methodologyContentHash" | "catalogVersionId" | "catalogContentHash" | "ownerInterpretationHash">; }

export interface DirectionalEvaluationInput extends DirectionalLineage {
  orientation: AuthoritativeD8Orientation;
  modifiers?: readonly AuthoritativeD8Modifier[];
  d16: AuthoritativeD16Mapping;
  mainEntrance?: AuthoritativeD32Entrance;
  floorEntrance?: AuthoritativeD32Entrance;
  circulation: CirculationState;
}

export interface ZoningEvaluationRow {
  mappingRowId: string; serialNo: number; utilityId: string; utilityName: string; floorPlanLabel: string; d16Zone: string;
  attribute?: string; sourceRating?: "GOOD" | "BAD" | "OK-OK"; clientEvaluationStatus?: "AUSPICIOUS" | "DOSH_TREATMENT_REQUIRED";
  directionalStatus?: "AUSPICIOUS" | "DOSH_TREATMENT_REQUIRED";
  provenance?: { sourceVersion: string; workbookHash: string; adapterVersion: string; sourceRowNumber: number };
  ruleId?: string; resolutionStatus: "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT"; reviewReason?: string;
}
export interface DirectionalEntranceResult { main?: { zoneCode: string; classification: EntranceClassification; provenance: EntranceProvenance }; floor?: { zoneCode: string; classification: EntranceClassification; provenance: EntranceProvenance }; combined?: CombinedEntranceAssessment; }
export interface EntranceProvenance { recordId: string; methodologyVersionId: string; methodologyContentHash: string; catalogVersionId: string; catalogContentHash: string; ownerInterpretationHash: string; }
export interface DirectionalEvaluationResult {
  evaluationVersion: typeof DIRECTIONAL_EVALUATION_VERSION;
  organisationId?: string; clientId?: string; caseId: string; projectId: string; floorId: string;
  status: DirectionalEvaluationStatus; reviewReasons: readonly { code: DirectionalReviewReasonCode; detail: string; sourceId?: string }[];
  buildingOrientation?: { result: D8OrientationResult; orientationVersionId: string };
  siteOrientation: readonly { findingId: string; result: D8ModifierResult }[];
  zoning: readonly ZoningEvaluationRow[];
  entrance: DirectionalEntranceResult;
  circulation?: CirculationResult;
  provenance: { inputHash: string; utilityMaster: { sourceVersion: string; workbookHash: string; adapterVersion: string }; rulesetVersion: typeof DIRECTIONAL_EVALUATION_VERSION };
}

function sameLineage(expected: DirectionalLineage, actual: Partial<DirectionalLineage>) {
  return (!expected.organisationId || !actual.organisationId || expected.organisationId === actual.organisationId)
    && (!expected.clientId || !actual.clientId || expected.clientId === actual.clientId)
    && expected.caseId === actual.caseId && expected.projectId === actual.projectId
    && (actual.floorId === undefined || expected.floorId === actual.floorId);
}
function review(reasons: { code: DirectionalReviewReasonCode; detail: string; sourceId?: string }[], code: DirectionalReviewReasonCode, detail: string, sourceId?: string) { reasons.push({ code, detail, ...(sourceId ? { sourceId } : {}) }); }
function entranceProvenance(record: AuthoritativeD32Entrance["record"]): EntranceProvenance { return { recordId: record.id, methodologyVersionId: record.methodologyVersionId, methodologyContentHash: record.methodologyContentHash, catalogVersionId: record.catalogVersionId, catalogContentHash: record.catalogContentHash, ownerInterpretationHash: record.ownerInterpretationHash }; }
function validD32(record: AuthoritativeD32Entrance["record"], expected: DirectionalLineage, scope: "PROPERTY_MAIN_GATE" | "FLOOR_PRIMARY_ENTRANCE", reasons: { code: DirectionalReviewReasonCode; detail: string; sourceId?: string }[]) {
  if (!sameLineage(expected, record) || (scope === "FLOOR_PRIMARY_ENTRANCE" && record.floorId !== expected.floorId) || (scope === "PROPERTY_MAIN_GATE" && record.floorId !== undefined)) review(reasons, "D32_INPUT_LINEAGE_MISMATCH", "D32 entrance does not belong to the evaluated case, project and floor/property scope.", record.id);
  if (record.status !== "CURRENT" && record.status !== "FINALIZED") review(reasons, "D32_NOT_AUTHORITATIVE", "Only CURRENT legacy or FINALIZED D32 entrance records are authoritative.", record.id);
  if (!record.methodologyVersionId || !record.methodologyContentHash || !record.catalogVersionId || !record.catalogContentHash) review(reasons, "D32_METHODOLOGY_PROVENANCE_REQUIRED", "D32 entrance methodology and catalog provenance is incomplete.", record.id);
  return { zoneCode: record.zoneCode, classification: record.classificationSnapshot, provenance: entranceProvenance(record) };
}

export function evaluateDirectionalEvaluation(input: DirectionalEvaluationInput): DirectionalEvaluationResult {
  const reasons: { code: DirectionalReviewReasonCode; detail: string; sourceId?: string }[] = [];
  if (!input.circulation) review(reasons, "CIRCULATION_INPUT_REQUIRED", "A consultant-entered circulation state is required.");
  if (!sameLineage(input, input.orientation)) review(reasons, "D8_INPUT_LINEAGE_MISMATCH", "D8 orientation does not belong to the evaluated lineage.", input.orientation.orientationVersionId);
  if (input.orientation.status !== "LOCKED") review(reasons, "D8_INPUT_NOT_AUTHORITATIVE", "Only a locked D8 orientation may be evaluated.", input.orientation.orientationVersionId);
  if (input.orientation.result.kind === "REVIEW_REQUIRED") review(reasons, "D8_BOUNDARY_POLICY_REQUIRED", "D8 exact-boundary policy is unresolved; no direction was inferred.", input.orientation.orientationVersionId);
  const mapping = input.d16.mapping;
  if (mapping.status !== "FINALIZED") review(reasons, "D16_NOT_AUTHORITATIVE", "Only a FINALIZED D16 mapping may be evaluated.", mapping.id);
  if (!sameLineage(input, mapping)) review(reasons, "D16_INPUT_LINEAGE_MISMATCH", "D16 mapping does not belong to the evaluated lineage.", mapping.id);
  if (!mapping.methodologyVersionId || !mapping.methodologyContentHash) review(reasons, "D16_METHODOLOGY_PROVENANCE_REQUIRED", "D16 methodology provenance is incomplete.", mapping.id);
  const zoning = mapping.rows.map((row): ZoningEvaluationRow => {
    const resolved = resolveUtilityMasterRows(row.utilityName, row.zone);
    const source = resolved.rows[0];
    if (resolved.status === "APPROVED" && source) { const clientEvaluationStatus = source.outcome === "GOOD" ? "AUSPICIOUS" : "DOSH_TREATMENT_REQUIRED"; return { mappingRowId: row.id, serialNo: row.serialNumber, utilityId: row.utilityId, utilityName: row.utilityName, floorPlanLabel: row.floorPlanLabel, d16Zone: row.zone, attribute: source.attributeText, sourceRating: source.outcome, clientEvaluationStatus, directionalStatus: clientEvaluationStatus, ruleId: utilityMasterRuleId(source), provenance: { sourceVersion: UTILITY_MASTER_SOURCE_VERSION, workbookHash: UTILITY_MASTER_WORKBOOK_HASH, adapterVersion: UTILITY_MASTER_ADAPTER_VERSION, sourceRowNumber: source.rowNumber }, resolutionStatus: "APPROVED" }; }
    const code = resolved.status === "BLOCKED_METHOD_INPUT" ? "UTILITY_RULE_BLOCKED_METHOD_INPUT" : "UTILITY_RULE_UNRESOLVED";
    review(reasons, code, resolved.reason, row.id);
    return { mappingRowId: row.id, serialNo: row.serialNumber, utilityId: row.utilityId, utilityName: row.utilityName, floorPlanLabel: row.floorPlanLabel, d16Zone: row.zone, resolutionStatus: resolved.status === "BLOCKED_METHOD_INPUT" ? "BLOCKED_METHOD_INPUT" : "REVIEW_REQUIRED", reviewReason: resolved.reason };
  });
  const siteOrientation = (input.modifiers ?? []).map((item) => { if (!sameLineage(input, item)) review(reasons, "D8_INPUT_LINEAGE_MISMATCH", "D8 modifier does not belong to the evaluated lineage.", item.findingId); if (item.result.kind === "REVIEW_REQUIRED") review(reasons, "D8_INPUT_NOT_AUTHORITATIVE", "A confirmed D8 modifier is unresolved.", item.findingId); return { findingId: item.findingId, result: item.result }; });
  const entrance: DirectionalEntranceResult = {};
  if (input.mainEntrance) entrance.main = validD32(input.mainEntrance.record, input, "PROPERTY_MAIN_GATE", reasons);
  if (input.floorEntrance) entrance.floor = validD32(input.floorEntrance.record, input, "FLOOR_PRIMARY_ENTRANCE", reasons);
  if (entrance.main && entrance.floor) entrance.combined = combineEntranceClassifications(entrance.main.classification, entrance.floor.classification);
  const circulation = input.circulation ? evaluateCirculation(input.circulation) : undefined;
  const inputHash = deterministicContentHash({ input, zoning });
  return { evaluationVersion: DIRECTIONAL_EVALUATION_VERSION, organisationId: input.organisationId, clientId: input.clientId, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, status: reasons.length ? "REVIEW_REQUIRED" : "COMPLETE", reviewReasons: reasons, buildingOrientation: { result: input.orientation.result, orientationVersionId: input.orientation.orientationVersionId }, siteOrientation, zoning, entrance, circulation, provenance: { inputHash, utilityMaster: { sourceVersion: UTILITY_MASTER_SOURCE_VERSION, workbookHash: UTILITY_MASTER_WORKBOOK_HASH, adapterVersion: UTILITY_MASTER_ADAPTER_VERSION }, rulesetVersion: DIRECTIONAL_EVALUATION_VERSION } };
}
