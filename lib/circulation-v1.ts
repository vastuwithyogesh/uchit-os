import { deterministicContentHash } from "./evaluation-provenance.ts";

export const CIRCULATION_RULESET_VERSION = "circulation-rules/v1" as const;
export const CIRCULATION_STATES = ["CLEAR", "PARTIALLY_RESTRICTED", "BLOCKED", "OVERACTIVE", "FRAGMENTED"] as const;
export type CirculationState = (typeof CIRCULATION_STATES)[number];

export interface CirculationRule {
  readonly state: CirculationState;
  readonly ruleInputs: string;
  readonly interpretation: string;
  readonly assessment: string;
  readonly status: "LOCKED";
  readonly workbookSheet: "Circulation Rules";
  readonly workbookRow: number;
}

export const CIRCULATION_RULES: readonly CirculationRule[] = Object.freeze([
  { state: "CLEAR", ruleInputs: "Entrance path, passages, stairs and openings form a usable continuous movement path; no material blockage.", interpretation: "Solar/air movement and human Prana-path can distribute through the floor in a controlled way; Sattvik-Rajasik activity remains usable.", assessment: "Maintain.", status: "LOCKED", workbookSheet: "Circulation Rules", workbookRow: 5 },
  { state: "PARTIALLY_RESTRICTED", ruleInputs: "Movement exists but one or more local bottlenecks/obstructions reduce continuity.", interpretation: "Prakritik and Jaivik flow remain functional but lose efficiency in affected areas.", assessment: "Optimization required.", status: "LOCKED", workbookSheet: "Circulation Rules", workbookRow: 6 },
  { state: "BLOCKED", ruleInputs: "Primary movement path is materially obstructed or terminates into repeated dead zones.", interpretation: "Prakritik Urja may enter but cannot circulate effectively; Jaivik Urja becomes heavier/Tamasik in blocked pockets.", assessment: "Strong circulation correction required.", status: "LOCKED", workbookSheet: "Circulation Rules", workbookRow: 7 },
  { state: "OVERACTIVE", ruleInputs: "Highly exposed openings/road/wind corridor create uncontrolled movement through floor.", interpretation: "Prakritik movement becomes strongly Rajasik and difficult to contain.", assessment: "Moderation / grounding required.", status: "LOCKED", workbookSheet: "Circulation Rules", workbookRow: 8 },
  { state: "FRAGMENTED", ruleInputs: "Some paths are overactive while others are blocked/stagnant or circulation repeatedly diverts/zig-zags.", interpretation: "Rajasik and Tamasik pockets coexist, producing inconsistent Jaivik distribution.", assessment: "Rebalancing required.", status: "LOCKED", workbookSheet: "Circulation Rules", workbookRow: 9 },
]);

export const CIRCULATION_CATALOG_HASH = deterministicContentHash(CIRCULATION_RULES);

export interface CirculationResult {
  readonly state: CirculationState;
  readonly rule: CirculationRule;
  readonly rulesetVersion: typeof CIRCULATION_RULESET_VERSION;
  readonly catalogHash: string;
}

export function evaluateCirculation(state: CirculationState): CirculationResult {
  if (!CIRCULATION_STATES.includes(state)) throw new Error("Circulation state is not an approved locked value.");
  const rule = CIRCULATION_RULES.find((item) => item.state === state);
  if (!rule) throw new Error("Circulation rule is unavailable.");
  return { state, rule, rulesetVersion: CIRCULATION_RULESET_VERSION, catalogHash: CIRCULATION_CATALOG_HASH };
}
