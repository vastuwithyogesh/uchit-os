import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { ElementalElement, ElementalRemedyType, ElementalVerdict, EnergyBarState } from "./elemental-evaluation-v1.ts";

export const ELEMENTAL_METHODOLOGY_IDENTITY = "UCHIT_OS_EVALUATION_METHODOLOGY_V1.1_ELEMENTAL" as const;
export const ELEMENTAL_METHODOLOGY_VERSION = "1.1" as const;

export const ELEMENTAL_ENERGY_STATES = ["ABOVE_RED", "WITHIN_BAND", "BELOW_BLUE"] as const satisfies readonly EnergyBarState[];
export const ELEMENTAL_DIRECTION_GROUPS = {
  WATER: ["NNW", "N", "NNE", "NE"],
  AIR: ["ENE", "E", "ESE"],
  FIRE: ["SE", "SSE", "S"],
  EARTH: ["SSW", "SW", "WSW"],
  SPACE: ["W", "WNW", "NW"]
} as const satisfies Record<ElementalElement, readonly string[]>;

export const ELEMENTAL_VERDICTS = ["SUPPRESS", "GROUND", "UPLIFT", "PROMOTE", "BALANCE"] as const satisfies readonly ElementalVerdict[];
export const ELEMENTAL_REMEDY_COMPATIBILITY = {
  SUPPRESS: "TATTAV_BALANCER",
  GROUND: "DISHA_BALANCER",
  UPLIFT: "TATTAV_ACTIVATION",
  PROMOTE: "DISHA_ACTIVATION",
  BALANCE: "EQUALISER"
} as const satisfies Record<ElementalVerdict, ElementalRemedyType>;

export const ELEMENTAL_PRECEDENCE_RULES = [
  { ruleId: "RULE_1_MIXED_HIGH_AND_LOW", condition: "aboveCount > 0 && belowCount > 0", verdict: "BALANCE", correctionScope: "WHOLE_ELEMENT", remedyType: "EQUALISER" },
  { ruleId: "RULE_2_MULTI_ABOVE", condition: "aboveCount >= 2", verdict: "SUPPRESS", correctionScope: "WHOLE_ELEMENT", remedyType: "TATTAV_BALANCER" },
  { ruleId: "RULE_3_SINGLE_ABOVE", condition: "aboveCount === 1", verdict: "GROUND", correctionScope: "SPECIFIC_DIRECTION", remedyType: "DISHA_BALANCER" },
  { ruleId: "RULE_4_MULTI_BELOW", condition: "belowCount >= 2", verdict: "UPLIFT", correctionScope: "WHOLE_ELEMENT", remedyType: "TATTAV_ACTIVATION" },
  { ruleId: "RULE_5_SINGLE_BELOW", condition: "belowCount === 1", verdict: "PROMOTE", correctionScope: "SPECIFIC_DIRECTION", remedyType: "DISHA_ACTIVATION" },
  { ruleId: "RULE_6_ALL_WITHIN", condition: "aboveCount === 0 && belowCount === 0", verdict: "BALANCE", correctionScope: "WHOLE_ELEMENT", remedyType: "EQUALISER" }
] as const;

export const ELEMENTAL_METHODOLOGY_PAYLOAD = {
  schema: "uchit-elemental-methodology/v1",
  identity: ELEMENTAL_METHODOLOGY_IDENTITY,
  version: ELEMENTAL_METHODOLOGY_VERSION,
  energyVocabulary: [...ELEMENTAL_ENERGY_STATES],
  boundarySemantics: { referenceBoundaryState: "WITHIN_BAND" },
  directionGroups: ELEMENTAL_DIRECTION_GROUPS,
  verdictVocabulary: [...ELEMENTAL_VERDICTS],
  precedenceRules: ELEMENTAL_PRECEDENCE_RULES,
  remedyCompatibility: ELEMENTAL_REMEDY_COMPATIBILITY,
  sourceEngine: "elemental-evaluation-v1"
} as const;

export const ELEMENTAL_METHODOLOGY_CONTENT_HASH = deterministicContentHash(ELEMENTAL_METHODOLOGY_PAYLOAD);

export function assertCanonicalElementalMethodology(methodologyVersionId?: string, methodologyContentHash?: string) {
  if (methodologyVersionId !== undefined && methodologyVersionId !== ELEMENTAL_METHODOLOGY_IDENTITY) throw new Error("Client methodology identity is not authoritative.");
  if (methodologyContentHash !== undefined && methodologyContentHash !== ELEMENTAL_METHODOLOGY_CONTENT_HASH) throw new Error("Client methodology content identity is not authoritative.");
  return { methodologyVersionId: ELEMENTAL_METHODOLOGY_IDENTITY, methodologyContentHash: ELEMENTAL_METHODOLOGY_CONTENT_HASH } as const;
}

export function isCanonicalElementalMethodology(methodologyVersionId: string, methodologyContentHash: string) {
  return methodologyVersionId === ELEMENTAL_METHODOLOGY_IDENTITY && methodologyContentHash === ELEMENTAL_METHODOLOGY_CONTENT_HASH;
}
