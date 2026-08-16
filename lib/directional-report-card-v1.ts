import type { DirectionalEvaluationResult, DirectionalReviewReasonCode, ZoningEvaluationRow } from "./directional-evaluation-v1.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const DIRECTIONAL_REPORT_CARD_VERSION = "directional-report-card/v1" as const;
export const DIRECTIONAL_REPORT_SECTION_ORDER = ["OPENING_OVERVIEW", "BUILDING_ORIENTATION", "SITE_ORIENTATION", "ZONING_SUMMARY", "ENTRANCE_AND_CIRCULATION"] as const;
export type DirectionalReportSectionId = (typeof DIRECTIONAL_REPORT_SECTION_ORDER)[number];
export type DirectionalReportCardStatus = "READY" | "REVIEW_REQUIRED";
export type DirectionalStatementGapCode = "APPROVED_DIRECTIONAL_STATEMENT_MISSING";

export interface DirectionalStatementSelection {
  readonly statementId: string;
  readonly sourceSheet: string;
  readonly sourceRowOrRuleId: string;
  readonly contentHash: string;
  readonly approvedText: string;
  readonly methodologyVersionId: string;
  readonly methodologyContentHash: string;
}

export interface DirectionalStatementGap {
  readonly code: DirectionalStatementGapCode;
  readonly section: DirectionalReportSectionId;
  readonly selectionKey: string;
}

export interface DirectionalReportCardInput {
  readonly evaluation: DirectionalEvaluationResult;
  readonly statements: Readonly<Record<string, DirectionalStatementSelection | undefined>>;
}

export interface DirectionalReportCardV1 {
  readonly version: typeof DIRECTIONAL_REPORT_CARD_VERSION;
  readonly status: DirectionalReportCardStatus;
  readonly lineage: Pick<DirectionalEvaluationResult, "organisationId" | "clientId" | "caseId" | "projectId" | "floorId">;
  readonly sections: readonly { id: DirectionalReportSectionId; order: number }[];
  readonly openingOverview: {
    readonly degree?: number;
    readonly direction?: string;
    readonly caseId: string;
    readonly projectId: string;
    readonly floorId: string;
    readonly mainEntrance?: { zoneCode: string; classification: string };
    readonly floorEntrance?: { zoneCode: string; classification: string };
    readonly modifierIds: readonly string[];
  };
  readonly buildingOrientation: { readonly orientation: DirectionalEvaluationResult["buildingOrientation"]; readonly statement?: DirectionalStatementSelection };
  readonly siteOrientation: readonly { readonly findingId: string; readonly modifier: string; readonly direction?: string; readonly statement?: DirectionalStatementSelection }[];
  readonly zoningSummary: readonly (ZoningEvaluationRow & { readonly statement?: DirectionalStatementSelection })[];
  readonly entranceAndCirculation: {
    readonly main?: DirectionalEvaluationResult["entrance"]["main"];
    readonly floor?: DirectionalEvaluationResult["entrance"]["floor"];
    readonly combined?: DirectionalEvaluationResult["entrance"]["combined"];
    readonly circulation?: DirectionalEvaluationResult["circulation"];
    readonly statements: Readonly<Record<string, DirectionalStatementSelection | undefined>>;
  };
  readonly statementSelections: readonly DirectionalStatementSelection[];
  readonly reviewReasons: readonly (DirectionalStatementGap | { readonly code: DirectionalReviewReasonCode; readonly detail: string; readonly sourceId?: string })[];
  readonly provenance: { readonly evaluationInputHash: string; readonly statementSelectionHash: string; readonly reportCardVersion: typeof DIRECTIONAL_REPORT_CARD_VERSION };
  readonly deterministicContentHash: string;
}

function selection(statements: DirectionalReportCardInput["statements"], key: string) {
  const candidate = statements[key];
  if (!candidate || !candidate.statementId || !candidate.sourceSheet || !candidate.sourceRowOrRuleId || !candidate.contentHash || !candidate.methodologyVersionId || !candidate.methodologyContentHash || !candidate.approvedText.trim()) return undefined;
  return candidate;
}

function modifierOrder(modifier: string) { return ["CUT_OUT", "EXTENSION", "MARGA_VEDHA", "OPEN_SIDE", "CORNER"].indexOf(modifier); }
function modifierSortKey(result: DirectionalEvaluationResult["siteOrientation"][number]["result"]) {
  return result.kind === "RESOLVED" ? String(result.direction ?? result.pattern ?? "") : "";
}
function addGap(gaps: DirectionalStatementGap[], section: DirectionalReportSectionId, key: string) { gaps.push({ code: "APPROVED_DIRECTIONAL_STATEMENT_MISSING", section, selectionKey: key }); }

export function assembleDirectionalReportCard(input: DirectionalReportCardInput): DirectionalReportCardV1 {
  const evaluation = input.evaluation;
  const gaps: DirectionalStatementGap[] = [];
  const sections = DIRECTIONAL_REPORT_SECTION_ORDER.map((id, index) => ({ id, order: index + 1 }));
  const buildingStatement = selection(input.statements, "BUILDING_ORIENTATION");
  if (evaluation.status === "COMPLETE" && !buildingStatement) addGap(gaps, "BUILDING_ORIENTATION", "BUILDING_ORIENTATION");
  const sortedModifiers = [...evaluation.siteOrientation].sort((left, right) => {
    const modifierDelta = modifierOrder(left.result.modifier) - modifierOrder(right.result.modifier);
    return modifierDelta || modifierSortKey(left.result).localeCompare(modifierSortKey(right.result)) || left.findingId.localeCompare(right.findingId);
  });
  const siteOrientation = sortedModifiers.map((item) => {
    const key = `SITE_ORIENTATION:${item.findingId}`;
    const itemStatement = selection(input.statements, key);
    if (evaluation.status === "COMPLETE" && !itemStatement) addGap(gaps, "SITE_ORIENTATION", key);
    return { findingId: item.findingId, modifier: item.result.modifier, direction: item.result.kind === "RESOLVED" ? item.result.direction : undefined, statement: itemStatement };
  });
  const zoningSummary = [...evaluation.zoning].sort((left, right) => left.serialNo - right.serialNo || left.mappingRowId.localeCompare(right.mappingRowId)).map((row) => {
    const key = `ZONING:${row.mappingRowId}`;
    const rowStatement = selection(input.statements, key);
    if (evaluation.status === "COMPLETE" && row.resolutionStatus === "APPROVED" && !row.attribute && !rowStatement) addGap(gaps, "ZONING_SUMMARY", key);
    return { ...row, statement: rowStatement };
  });
  const entranceStatements: Record<string, DirectionalStatementSelection | undefined> = {};
  if (evaluation.entrance.main) entranceStatements.main = selection(input.statements, "ENTRANCE_MAIN");
  if (evaluation.entrance.floor) entranceStatements.floor = selection(input.statements, "ENTRANCE_FLOOR");
  if (evaluation.entrance.combined) { const combinedKey = `ENTRANCE_COMBINED:${evaluation.entrance.combined.main}:${evaluation.entrance.combined.floor}`; entranceStatements.combined = selection(input.statements, combinedKey) ?? selection(input.statements, "ENTRANCE_COMBINED"); if (evaluation.status === "COMPLETE" && !entranceStatements.combined) addGap(gaps, "ENTRANCE_AND_CIRCULATION", combinedKey); }
  if (evaluation.circulation) { entranceStatements.circulation = selection(input.statements, `CIRCULATION:${evaluation.circulation.state}`) ?? selection(input.statements, "CIRCULATION"); if (evaluation.status === "COMPLETE" && !entranceStatements.circulation) addGap(gaps, "ENTRANCE_AND_CIRCULATION", `CIRCULATION:${evaluation.circulation.state}`); }
  const allSelections = Object.values(input.statements).filter((item): item is DirectionalStatementSelection => Boolean(selection(input.statements, Object.keys(input.statements).find((key) => input.statements[key] === item) ?? ""))).sort((a, b) => a.statementId.localeCompare(b.statementId));
  const reviewReasons = [...evaluation.reviewReasons, ...gaps];
  const payload = { version: DIRECTIONAL_REPORT_CARD_VERSION, lineage: { organisationId: evaluation.organisationId, clientId: evaluation.clientId, caseId: evaluation.caseId, projectId: evaluation.projectId, floorId: evaluation.floorId }, sections, openingOverview: { degree: evaluation.buildingOrientation?.result.kind === "RESOLVED" ? evaluation.buildingOrientation.result.normalizedDegree : undefined, direction: evaluation.buildingOrientation?.result.kind === "RESOLVED" ? evaluation.buildingOrientation.result.direction : undefined, caseId: evaluation.caseId, projectId: evaluation.projectId, floorId: evaluation.floorId, mainEntrance: evaluation.entrance.main && { zoneCode: evaluation.entrance.main.zoneCode, classification: evaluation.entrance.main.classification }, floorEntrance: evaluation.entrance.floor && { zoneCode: evaluation.entrance.floor.zoneCode, classification: evaluation.entrance.floor.classification }, modifierIds: sortedModifiers.map((item) => item.findingId) }, buildingOrientation: { orientation: evaluation.buildingOrientation, statement: buildingStatement }, siteOrientation, zoningSummary, entranceAndCirculation: { main: evaluation.entrance.main, floor: evaluation.entrance.floor, combined: evaluation.entrance.combined, circulation: evaluation.circulation, statements: entranceStatements }, statementSelections: allSelections, reviewReasons, provenance: { evaluationInputHash: evaluation.provenance.inputHash, statementSelectionHash: deterministicContentHash(allSelections), reportCardVersion: DIRECTIONAL_REPORT_CARD_VERSION } };
  const deterministicContentHashValue = deterministicContentHash(payload);
  return { ...payload, status: reviewReasons.length ? "REVIEW_REQUIRED" : "READY", deterministicContentHash: deterministicContentHashValue };
}
