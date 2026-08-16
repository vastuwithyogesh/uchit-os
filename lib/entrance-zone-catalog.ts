import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

export const ENTRANCE_ZONE_RULE_PREFIX = "ENTRANCE_ZONE:";
export const ENTRANCE_ZONE_CODES = [
  "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8",
  "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8",
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
  "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"
] as const;
export const ENTRANCE_ZONE_CLASSIFICATIONS = ["GOOD", "BAD", "OK-OK"] as const;
export type EntranceZoneClassification = (typeof ENTRANCE_ZONE_CLASSIFICATIONS)[number];

export type ApprovedEntranceZone = {
  code: string;
  parentDirection?: "N" | "E" | "S" | "W";
  degreeStart?: number;
  degreeEnd?: number;
  sourceRuleId?: string;
  sourceWorkbookSheet?: string;
  sourceWorkbookRow?: string;
  /** Compatibility display field; equal to the approved rating, never raw interpretation text. */
  name: EntranceZoneClassification;
  classification: EntranceZoneClassification;
  ownerSourceText: string;
  ownerInterpretationHash: string;
  presentationText?: string;
  presentationTextStatus: "REVIEW_REQUIRED_COPY" | "APPROVED";
  order: number;
};

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
const safeCode = (value: unknown) => typeof value === "string" && /^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(value) ? value : undefined;
const safeOwnerSourceText = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 500 && !/[<>\u0000-\u001f\u007f]/.test(value) ? value : undefined;
const safePresentationText = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 500 && !/[<>\u0000-\u001f\u007f]/.test(value) ? value : undefined;

/**
 * Reads only the exact active/approved DIRECTION_32 catalog. The application
 * intentionally has no built-in zone labels: if all 32 approved records are
 * not present, Step 06 remains fail-closed instead of inventing methodology.
 */
export function getApprovedEntranceZoneCatalog(state: Pick<AppState, "methodologyVersions" | "methodologyRules">, organisationId?: string) {
  if (!organisationId) return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "An organisation-scoped 32-zone methodology is required.", zones: [] as ApprovedEntranceZone[] };
  const version = state.methodologyVersions.find((item) => item.organisationId === organisationId && item.module === "DIRECTION_32" && item.lifecycleStatus === "ACTIVE");
  if (!version) return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "No active approved DIRECTION_32 methodology version exists.", zones: [] as ApprovedEntranceZone[] };
  if (version.catalogScope !== "ENTRANCE" || version.catalogRecordCount !== 32 || !/^sha256:[a-f0-9]{64}$/.test(version.contentHash)) {
    return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "The active DIRECTION_32 version is not a valid 32-record entrance catalog.", zones: [] as ApprovedEntranceZone[], version };
  }
  const candidates = state.methodologyRules.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id && item.decisionStatus === "APPROVED" && item.ruleKey.startsWith(ENTRANCE_ZONE_RULE_PREFIX));
  const zones: ApprovedEntranceZone[] = [];
  for (const item of candidates) {
    const condition = record(item.conditionJson); const outcome = record(item.outcomeJson);
    const ruleCode = safeCode(item.ruleKey.slice(ENTRANCE_ZONE_RULE_PREFIX.length));
    const conditionCode = safeCode(condition?.entranceZoneCode);
    const classification = outcome?.entranceZoneClassification;
    const ownerSourceText = safeOwnerSourceText(item.ownerSourceText);
    const presentationTextStatus = item.presentationTextStatus;
    const presentationText = item.presentationText === undefined ? undefined : safePresentationText(item.presentationText);
    const order = outcome?.entranceZoneOrder;
    if (!ruleCode || ruleCode !== conditionCode || ruleCode !== ENTRANCE_ZONE_CODES[Number(order) - 1]
      || !ENTRANCE_ZONE_CLASSIFICATIONS.includes(classification as EntranceZoneClassification)
      || !ownerSourceText || !Number.isInteger(order) || Number(order) < 1 || Number(order) > 32
      || !["REVIEW_REQUIRED_COPY", "APPROVED"].includes(presentationTextStatus ?? "")
      || (presentationTextStatus === "APPROVED" && !presentationText)) {
      return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "The active DIRECTION_32 entrance catalog contains an invalid approved record.", zones: [] as ApprovedEntranceZone[], version };
    }
    zones.push({ code: ruleCode, name: classification as EntranceZoneClassification, classification: classification as EntranceZoneClassification, parentDirection: ruleCode[0] as "N" | "E" | "S" | "W", ownerSourceText,
      ownerInterpretationHash: deterministicContentHash(ownerSourceText), presentationText, presentationTextStatus: presentationTextStatus!, order: Number(order) });
  }
  const codes = new Set(zones.map((item) => item.code)); const orders = new Set(zones.map((item) => item.order));
  if (zones.length !== 32 || codes.size !== 32 || orders.size !== 32 || zones.some((item, index) => item.code !== ENTRANCE_ZONE_CODES[index])) {
    return { ready: false as const, status: "BLOCKED_METHOD_INPUT" as const, reason: "The active DIRECTION_32 methodology must contain exactly 32 unique approved entrance-zone records.", zones: [] as ApprovedEntranceZone[], version };
  }
  zones.sort((left, right) => left.order - right.order);
  return { ready: true as const, status: "APPROVED" as const, reason: "The active approved 32-zone catalog is available.", zones, version };
}
