export type Direction =
  | "N"
  | "NNE"
  | "NE"
  | "ENE"
  | "E"
  | "ESE"
  | "SE"
  | "SSE"
  | "S"
  | "SSW"
  | "SW"
  | "WSW"
  | "W"
  | "WNW"
  | "NW"
  | "NNW";

export type EnergyBarState = "ABOVE_RED" | "WITHIN_BAND" | "BELOW_BLUE";

export type ElementalElement = "WATER" | "AIR" | "FIRE" | "EARTH" | "SPACE";

export type ElementalVerdict = "SUPPRESS" | "GROUND" | "UPLIFT" | "PROMOTE" | "BALANCE";

import { ELEMENTAL_DIRECTION_GROUPS, ELEMENTAL_PRECEDENCE_RULES } from "./elemental-methodology-authority-v1.ts";

export type ElementalRemedyType = "TATTAV_BALANCER" | "DISHA_BALANCER" | "TATTAV_ACTIVATION" | "DISHA_ACTIVATION" | "EQUALISER";

export type CorrectionScope = "WHOLE_ELEMENT" | "SPECIFIC_DIRECTION";

export type ElementalReasonCode =
  | "RULE_1_MIXED_HIGH_AND_LOW"
  | "RULE_2_MULTI_ABOVE"
  | "RULE_3_SINGLE_ABOVE"
  | "RULE_4_MULTI_BELOW"
  | "RULE_5_SINGLE_BELOW"
  | "RULE_6_ALL_WITHIN";

export class ElementalEvaluationValidationError extends Error {
  readonly statusCode: 400 | 409;
  constructor(message: string, statusCode: 400 | 409 = 400) {
    super(message);
    this.name = "ElementalEvaluationValidationError";
    this.statusCode = statusCode;
  }
}

export interface DirectionState {
  direction: Direction;
  state: EnergyBarState;
}

export interface ElementalEvaluationInput {
  element: ElementalElement;
  directions: DirectionState[];
}

export interface ElementalEvaluationOutput {
  element: ElementalElement;
  verdict: ElementalVerdict;
  correctionScope: CorrectionScope;
  remedyType: ElementalRemedyType;
  targetDirection?: Direction;
  reasonCode: ElementalReasonCode;
}

export const ELEMENTAL_EVAL_DIRECTION_GROUPS: Record<ElementalElement, Direction[]> = Object.fromEntries(
  Object.entries(ELEMENTAL_DIRECTION_GROUPS).map(([element, directions]) => [element, [...directions] as Direction[]])
) as Record<ElementalElement, Direction[]>;

const ELEMENT_ORDER: ElementalElement[] = ["WATER", "AIR", "FIRE", "EARTH", "SPACE"];
const ORDERED_DIRECTIONS: Direction[] = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

const isDirection = (value: unknown): value is Direction => (ORDERED_DIRECTIONS as ReadonlyArray<string>).includes(String(value));

const isEnergyBarState = (value: unknown): value is EnergyBarState => {
  if (value !== "ABOVE_RED" && value !== "WITHIN_BAND" && value !== "BELOW_BLUE") return false;
  return true;
};

const toDirection = (value: unknown): Direction => {
  if (!isDirection(value)) throw new ElementalEvaluationValidationError(`Invalid direction: ${String(value)}.`);
  return value;
};

const toEnergyBarState = (value: unknown): EnergyBarState => {
  if (!isEnergyBarState(value)) throw new ElementalEvaluationValidationError(`Invalid energy bar state: ${String(value)}.`);
  return value;
};

const assertExactDirections = (element: ElementalElement, states: DirectionState[], requiredDirections: Direction[]): Map<Direction, EnergyBarState> => {
  if (!Array.isArray(states)) throw new ElementalEvaluationValidationError("Directions must be an array.");
  const seen = new Set<Direction>();
  const map = new Map<Direction, EnergyBarState>();
  for (const state of states) {
    if (!state || typeof state !== "object") throw new ElementalEvaluationValidationError("Each direction entry must be an object.");
    const direction = toDirection((state as { direction?: unknown }).direction);
    const barState = toEnergyBarState((state as { state?: unknown }).state);
    if (seen.has(direction)) throw new ElementalEvaluationValidationError(`Duplicate direction ${direction}.`);
    seen.add(direction);
    map.set(direction, barState);
  }
  const uniqueRequiredCount = requiredDirections.length;
  if (seen.size !== uniqueRequiredCount) {
    const missing = requiredDirections.filter((direction) => !map.has(direction));
    const extra = [...seen].filter((direction) => !requiredDirections.includes(direction));
    if (missing.length > 0) throw new ElementalEvaluationValidationError(`Missing required directions for ${element}: ${missing.join(", ")}.`);
    if (extra.length > 0) throw new ElementalEvaluationValidationError(`Extra directions for ${element}: ${extra.join(", ")}.`);
    throw new ElementalEvaluationValidationError(`Direction cardinality mismatch for ${element}.`);
  }
  for (const requiredDirection of requiredDirections) {
    if (!map.has(requiredDirection)) {
      throw new ElementalEvaluationValidationError(`Missing required direction ${requiredDirection} for ${element}.`);
    }
  }
  return map;
};

export function evaluateElementalDirection(input: ElementalEvaluationInput): ElementalEvaluationOutput {
  const element = input?.element;
  const requiredDirections = ELEMENTAL_EVAL_DIRECTION_GROUPS[element];
  if (!requiredDirections) throw new ElementalEvaluationValidationError(`Invalid element: ${String(element)}.`);
  const normalized = assertExactDirections(element, input.directions ?? [], requiredDirections);
  const aboveDirections = [...normalized.entries()].filter(([, state]) => state === "ABOVE_RED").map(([direction]) => direction);
  const belowDirections = [...normalized.entries()].filter(([, state]) => state === "BELOW_BLUE").map(([direction]) => direction);
  const aboveCount = aboveDirections.length;
  const belowCount = belowDirections.length;

  const rule = ELEMENTAL_PRECEDENCE_RULES.find((candidate) =>
    candidate.ruleId === "RULE_1_MIXED_HIGH_AND_LOW" ? aboveCount > 0 && belowCount > 0
      : candidate.ruleId === "RULE_2_MULTI_ABOVE" ? aboveCount >= 2
        : candidate.ruleId === "RULE_3_SINGLE_ABOVE" ? aboveCount === 1
          : candidate.ruleId === "RULE_4_MULTI_BELOW" ? belowCount >= 2
            : candidate.ruleId === "RULE_5_SINGLE_BELOW" ? belowCount === 1 : aboveCount === 0 && belowCount === 0
  )!;
  const targetDirection = rule.correctionScope === "SPECIFIC_DIRECTION" ? (aboveCount > 0 ? aboveDirections[0] : belowDirections[0]) : undefined;
  return { element, verdict: rule.verdict, correctionScope: rule.correctionScope, remedyType: rule.remedyType, ...(targetDirection ? { targetDirection } : {}), reasonCode: rule.ruleId } as ElementalEvaluationOutput;
}

export function evaluateAllElementalDirections(directions: DirectionState[]): ElementalEvaluationOutput[] {
  const normalized = assertExactDirections("WATER", directions, [...ORDERED_DIRECTIONS]);
  const allResults: ElementalEvaluationOutput[] = [];
  for (const element of ELEMENT_ORDER) {
    const elementDirections = ELEMENTAL_EVAL_DIRECTION_GROUPS[element].map((direction) => ({
      direction,
      state: normalized.get(direction)!
    }));
    allResults.push(evaluateElementalDirection({ element, directions: elementDirections }));
  }
  return allResults;
}
