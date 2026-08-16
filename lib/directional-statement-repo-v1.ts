import type { DirectionalEvaluationResult } from "./directional-evaluation-v1.ts";
import type { DirectionalStatementSelection } from "./directional-report-card-v1.ts";
import { CIRCULATION_RULES } from "./circulation-v1.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { FINAL_DIRECTIONAL_STATEMENTS_V1 } from "./directional-final-statements-v1.ts";

export const DIRECTIONAL_STATEMENT_REPOSITORY_VERSION = "directional-statement-repo/v1.1" as const;
export const DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID = "UCHIT_OS_EVALUATION_METHODOLOGY_V1.1_DIRECTIONAL_STATEMENTS" as const;
export const DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH = "sha256:af249aab142821894a07a42e95747109e333ca8638667bb5f80de0750eb773b5" as const;
export type DirectionalStatementApprovalStatus = "APPROVED_CLIENT_TEXT" | "INTERNAL_SOURCE_ONLY" | "MISSING";
export interface DirectionalStatementSourceRowV1 { readonly statementId: string; readonly family: string; readonly condition: string; readonly sourceSheet: string; readonly sourceRow: number | string; readonly approvedText: string; }
export interface DirectionalStatementEntryV1 extends DirectionalStatementSelection { section: string; conditionKey: string; sourceRuleId?: string; approvalStatus: DirectionalStatementApprovalStatus; }

function missing(key: string, sheet: string): DirectionalStatementEntryV1 {
  return { statementId: `MISSING:${key}`, section: key.split(":")[0], conditionKey: key, sourceSheet: sheet, sourceRowOrRuleId: "UNAVAILABLE", contentHash: deterministicContentHash({ key, sheet, status: "MISSING" }), approvedText: "", methodologyVersionId: "", methodologyContentHash: "", approvalStatus: "MISSING" };
}
function approved(key: string, sheet: string, row: number | string, text: string, methodologyVersionId: string, methodologyContentHash: string, sourceRuleId?: string, statementId?: string): DirectionalStatementEntryV1 {
  const base = { statementId: statementId ?? `DIR-${key.replaceAll(":", "-")}`, section: key.split(":")[0], conditionKey: key, sourceSheet: sheet, sourceRowOrRuleId: String(row), sourceRuleId, approvedText: text, methodologyVersionId, methodologyContentHash, approvalStatus: "APPROVED_CLIENT_TEXT" as const };
  return { ...base, contentHash: deterministicContentHash(base) };
}

function finalConditionKey(row: DirectionalStatementSourceRowV1): string {
  if (row.statementId.startsWith("DIR-BO-")) return `BUILDING_ORIENTATION:${row.condition}`;
  if (row.statementId.startsWith("DIR-CUT-")) return `SITE_ORIENTATION:CUT_OUT:${row.condition}`;
  if (row.statementId.startsWith("DIR-EXT-")) return `SITE_ORIENTATION:EXTENSION:${row.condition}`;
  if (row.statementId.startsWith("DIR-MV-")) return `SITE_ORIENTATION:MARGA_VEDHA:${row.condition}`;
  if (row.statementId.startsWith("DIR-OPEN-")) {
    if (row.condition === "4-side open") return "SITE_ORIENTATION:OPEN_SIDE:N+E+S+W";
    return `SITE_ORIENTATION:OPEN_SIDE:${row.condition.replaceAll(" open", "").replaceAll(" closed", "").replaceAll(" ", "").replace(";", "|")}`;
  }
  if (row.statementId === "DIR-CORNER") return "SITE_ORIENTATION:CORNER";
  if (row.statementId.startsWith("DIR-ENT-")) {
    const [, , main, floor] = row.statementId.split("-");
    const normalize = (value: string) => value === "OKOK" ? "OK-OK" : value;
    return `ENTRANCE_COMBINED:${normalize(main)}:${normalize(floor)}`;
  }
  throw new Error(`Unsupported final directional statement ${row.statementId}`);
}

function fromFinal(row: DirectionalStatementSourceRowV1, input: { methodologyVersionId: string; methodologyContentHash: string }): DirectionalStatementEntryV1 {
  const key = finalConditionKey(row);
  return approved(key, row.sourceSheet, row.sourceRow, row.approvedText, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, row.statementId, row.statementId);
}

export function buildDirectionalStatementCatalog(input: { methodologyVersionId: string; methodologyContentHash: string }): DirectionalStatementEntryV1[] {
  const entries = FINAL_DIRECTIONAL_STATEMENTS_V1.map((row) => fromFinal(row, input));
  for (const state of ["CLEAR", "PARTIALLY_RESTRICTED", "BLOCKED", "OVERACTIVE", "FRAGMENTED"] as const) {
    const rule = CIRCULATION_RULES.find((item) => item.state === state)!;
    entries.push(approved(`CIRCULATION:${state}`, "Circulation Rules", rule.workbookRow, `${rule.interpretation} ${rule.assessment}`, DIRECTIONAL_METHODOLOGY_V1_1_VERSION_ID, DIRECTIONAL_METHODOLOGY_V1_1_CONTENT_HASH, `CIRCULATION_${state}`));
  }
  return entries;
}

export function resolveDirectionalStatements(evaluation: DirectionalEvaluationResult, input: { methodologyVersionId: string; methodologyContentHash: string }): Readonly<Record<string, DirectionalStatementSelection | undefined>> {
  const catalog = buildDirectionalStatementCatalog(input);
  const result: Record<string, DirectionalStatementSelection | undefined> = {};
  for (const entry of catalog) result[entry.conditionKey] = entry;
  const buildingDirection = evaluation.buildingOrientation?.result.kind === "RESOLVED" ? evaluation.buildingOrientation.result.direction : undefined;
  if (buildingDirection) result.BUILDING_ORIENTATION = result[`BUILDING_ORIENTATION:${buildingDirection}`];
  for (const item of evaluation.siteOrientation ?? []) {
    const suffix = item.result.kind === "RESOLVED" ? (item.result.modifier === "OPEN_SIDE" ? item.result.pattern?.replaceAll(" ", "") : item.result.modifier === "CORNER" ? undefined : item.result.direction) : undefined;
    const key = suffix ? `SITE_ORIENTATION:${item.result.modifier}:${suffix}` : item.result.modifier === "CORNER" ? "SITE_ORIENTATION:CORNER" : undefined;
    if (key) result[`SITE_ORIENTATION:${item.findingId}`] = result[key];
  }
  for (const row of evaluation.zoning ?? []) if (row.resolutionStatus === "APPROVED" && row.attribute && row.provenance) result[`ZONING:${row.mappingRowId}`] = approved(`ZONING:${row.mappingRowId}`, "Utility Master", row.provenance.sourceRowNumber, row.attribute, input.methodologyVersionId, input.methodologyContentHash, row.ruleId);
  if (evaluation.circulation) result.CIRCULATION = result[`CIRCULATION:${evaluation.circulation.state}`];
  return result;
}

export function getDirectionalStatementEntry(key: string, input: { methodologyVersionId: string; methodologyContentHash: string }) { return buildDirectionalStatementCatalog(input).find((entry) => entry.conditionKey === key); }
