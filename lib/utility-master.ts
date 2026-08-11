import type { UtilityRule } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import workbookSource from "../data/utility-master.v1.json" with { type: "json" };

export const UTILITY_MASTER_SOURCE_VERSION = workbookSource.sourceVersion;
export const UTILITY_MASTER_WORKBOOK_HASH = workbookSource.workbookHash;
export const UTILITY_MASTER_ROW_COUNT = 737;
export const UTILITY_MASTER_UTILITY_COUNT = 46;
export const UTILITY_MASTER_ADAPTER_VERSION = "utility-master-adapter/v1";

export interface UtilityMasterRow {
  rowNumber: number;
  utilityName: string;
  directionCode: string;
  attributeText: string;
  outcome: "GOOD" | "BAD" | "OK-OK";
}

export interface UtilityMasterSource {
  sourceVersion: string;
  workbookHash: string;
  rows: UtilityMasterRow[];
}

const utilityMasterRows = (workbookSource.rows as UtilityMasterRow[]).map((row) => ({ ...row }));

if (utilityMasterRows.length !== UTILITY_MASTER_ROW_COUNT || new Set(utilityMasterRows.map((row) => row.utilityName)).size !== UTILITY_MASTER_UTILITY_COUNT) {
  throw new Error("UtilityMaster workbook source failed its approved row and utility-count contract.");
}

export function getUtilityMasterSource(): UtilityMasterSource {
  return { sourceVersion: UTILITY_MASTER_SOURCE_VERSION, workbookHash: UTILITY_MASTER_WORKBOOK_HASH, rows: utilityMasterRows.map((row) => ({ ...row })) };
}

const unresolvedDirectionCodes = new Set(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "BRAHMSTHAN", "ENW"]);
const blockedDuplicatePairs = new Set(["SERVANT ROOM\u0000SSE", "BAR\u0000SSE", "BOREWELL\u0000SSE"]);

export function resolveUtilityMasterRows(utilityNameValue: unknown, directionCodeValue: unknown) {
  const utilityName = typeof utilityNameValue === "string" ? utilityNameValue.trim() : "";
  const directionCode = typeof directionCodeValue === "string" ? directionCodeValue.trim() : "";
  if (!utilityName || !directionCode) return { status: "REVIEW_REQUIRED" as const, reason: "Utility name and direction code are required.", rows: [] as UtilityMasterRow[] };
  const rows = utilityMasterRows.filter((row) => row.utilityName === utilityName && row.directionCode === directionCode);
  if (!rows.length) return { status: "REVIEW_REQUIRED" as const, reason: "No approved UtilityMaster row exists for this utility and direction.", rows };
  if (blockedDuplicatePairs.has(`${utilityName}\u0000${directionCode}`) || rows.length > 1) {
    return { status: "BLOCKED_METHOD_INPUT" as const, reason: "The UtilityMaster contains conflicting or duplicate rows; owner resolution is required.", rows };
  }
  if (unresolvedDirectionCodes.has(directionCode)) {
    return { status: "REVIEW_REQUIRED" as const, reason: "This source direction code has unresolved semantic binding and cannot be automatically interpreted.", rows };
  }
  return { status: "APPROVED" as const, reason: "One exact approved UtilityMaster row matched.", rows };
}

export function utilityMasterRuleId(row: UtilityMasterRow) {
  return `utilitymaster-row-${row.rowNumber}-${deterministicContentHash({ attributeText: row.attributeText, directionCode: row.directionCode, outcome: row.outcome, utilityName: row.utilityName }).slice(7, 23)}`;
}

export function getUtilityMasterMethodologyBinding(state: { methodologyVersions: Array<{ organisationId?: string; module: string; lifecycleStatus: string; executionAdapterVersion?: string; sourceAssetVersion?: string; sourceAssetHash?: string; contentHash: string; id: string; label: string }> ; methodologyRules: Array<{ organisationId?: string; methodologyVersionId: string; decisionStatus: string }>; methodologyGoldenFixtures: Array<{ organisationId?: string; methodologyVersionId: string; decisionStatus: string }> }, organisationId: string) {
  const version = state.methodologyVersions.find((item) => item.organisationId === organisationId && item.module === "UTILITY" && item.lifecycleStatus === "ACTIVE");
  if (!version) return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "No active approved Utility methodology version exists." };
  const rules = state.methodologyRules.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  const fixtures = state.methodologyGoldenFixtures.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  if (!rules.length || rules.some((item) => item.decisionStatus !== "APPROVED") || !fixtures.length || fixtures.some((item) => item.decisionStatus !== "APPROVED")) {
    return { ready: false as const, status: "REVIEW_REQUIRED" as const, reason: "Utility methodology rules and golden fixtures are not all approved.", version };
  }
  if (version.executionAdapterVersion !== UTILITY_MASTER_ADAPTER_VERSION || version.sourceAssetVersion !== UTILITY_MASTER_SOURCE_VERSION || version.sourceAssetHash !== UTILITY_MASTER_WORKBOOK_HASH) {
    return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "The active Utility methodology is not bound to the approved UtilityMaster workbook hash, source version, and adapter.", version };
  }
  return { ready: true as const, status: "APPROVED" as const, reason: "Approved UtilityMaster binding is active.", version, rules, fixtures };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  if (inQuotes) {
    throw new Error("Utility CSV contains an unterminated quoted field.");
  }
  return values;
}

const REQUIRED_HEADERS = ["tabName", "zoneCode", "description", "verdict", "confidence"];
const VALID_VERDICTS = new Set<UtilityRule["verdict"]>(["GOOD", "BAD", "OK-OK"]);

export function parseUtilityRulesCsv(csvText: string): UtilityRule[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Utility CSV must contain a header and at least one rule row.");
  }
  const [header, ...rows] = lines;
  const headers = parseCsvLine(header);
  if (headers.length !== REQUIRED_HEADERS.length || headers.some((value, index) => value !== REQUIRED_HEADERS[index])) {
    throw new Error(`Utility CSV header must be exactly: ${REQUIRED_HEADERS.join(",")}.`);
  }

  const seenZones = new Set<string>();
  return rows.map((row, index) => {
    const columns = parseCsvLine(row);
    const sourceCsvRow = index + 2;
    if (columns.length !== REQUIRED_HEADERS.length) {
      throw new Error(`Utility CSV row ${sourceCsvRow} must contain exactly ${REQUIRED_HEADERS.length} columns.`);
    }
    const [tabName, zoneCode, description, verdict, confidenceText] = columns;
    if (!tabName || !zoneCode || !description) {
      throw new Error(`Utility CSV row ${sourceCsvRow} has a blank required field.`);
    }
    if (!VALID_VERDICTS.has(verdict as UtilityRule["verdict"])) {
      throw new Error(`Utility CSV row ${sourceCsvRow} has invalid verdict "${verdict}".`);
    }
    const confidence = Number(confidenceText);
    if (confidenceText === "" || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      throw new Error(`Utility CSV row ${sourceCsvRow} confidence must be a finite number from 0 to 100.`);
    }
    const zoneIdentity = `${tabName}\u0000${zoneCode}`;
    if (seenZones.has(zoneIdentity)) {
      throw new Error(`Utility CSV row ${sourceCsvRow} duplicates zone "${zoneCode}" in tab "${tabName}".`);
    }
    seenZones.add(zoneIdentity);
    const rowHash = deterministicContentHash({ confidence, description, tabName, verdict, zoneCode }).slice(7, 23);

    return {
      id: `rule_csv_${rowHash}`,
      tabName,
      zoneCode,
      description,
      verdict: verdict as UtilityRule["verdict"],
      confidence,
      sourceCsvRow
    };
  });
}

export function groupUtilityRulesByVerdict(rules: UtilityRule[]) {
  return rules.reduce<Record<UtilityRule["verdict"], UtilityRule[]>>(
    (groups, rule) => {
      groups[rule.verdict].push(rule);
      return groups;
    },
    { GOOD: [], BAD: [], "OK-OK": [] }
  );
}
