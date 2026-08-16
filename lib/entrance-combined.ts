export const ENTRANCE_CLASSIFICATIONS = ["GOOD", "OK-OK", "BAD"] as const;
export type EntranceClassification = (typeof ENTRANCE_CLASSIFICATIONS)[number];

export const COMBINED_ENTRANCE_STATUSES = [
  "STRONG_POSITIVE",
  "POSITIVE_WITH_MINOR_FLOOR_CAUTION",
  "POSITIVE_PROPERTY_ENTRY_FLOOR_LEVEL_DEFECT",
  "MODERATE_WITH_SUPPORTIVE_FLOOR_MODIFIER",
  "MIXED_NEUTRAL",
  "PROPERTY_CAUTION_WITH_FLOOR_DEFECT",
  "PRIMARY_PROPERTY_DEFECT_WITH_FLOOR_SUPPORT",
  "PRIMARY_DEFECT_WITH_LIMITED_FLOOR_MODERATION",
  "HIGH_PRIORITY_ENTRANCE_DEFECT"
] as const;
export type CombinedEntranceStatus = (typeof COMBINED_ENTRANCE_STATUSES)[number];

export type CombinedEntranceAssessment = {
  main: EntranceClassification;
  floor: EntranceClassification;
  status: CombinedEntranceStatus;
};

const STATUS: Record<EntranceClassification, Record<EntranceClassification, CombinedEntranceStatus>> = {
  GOOD: { GOOD: "STRONG_POSITIVE", "OK-OK": "POSITIVE_WITH_MINOR_FLOOR_CAUTION", BAD: "POSITIVE_PROPERTY_ENTRY_FLOOR_LEVEL_DEFECT" },
  "OK-OK": { GOOD: "MODERATE_WITH_SUPPORTIVE_FLOOR_MODIFIER", "OK-OK": "MIXED_NEUTRAL", BAD: "PROPERTY_CAUTION_WITH_FLOOR_DEFECT" },
  BAD: { GOOD: "PRIMARY_PROPERTY_DEFECT_WITH_FLOOR_SUPPORT", "OK-OK": "PRIMARY_DEFECT_WITH_LIMITED_FLOOR_MODERATION", BAD: "HIGH_PRIORITY_ENTRANCE_DEFECT" }
};

export function combineEntranceClassifications(main: EntranceClassification, floor: EntranceClassification): CombinedEntranceAssessment {
  return { main, floor, status: STATUS[main][floor] };
}
