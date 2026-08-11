import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { UtilityGraphVerdict, UtilityVerdictStatus } from "./domain.ts";

export const UTILITY_VERDICT_ALGORITHM_VERSION = "utility-verdict-framing/v1";

export class UtilityVerdictValidationError extends Error {
  readonly statusCode: 400 | 409;
  constructor(message: string, statusCode: 400 | 409 = 400) { super(message); this.name = "UtilityVerdictValidationError"; this.statusCode = statusCode; }
}

export interface UtilityGraphInput {
  element: string;
  directionSet: string[];
  bars: Array<{ directionCode: string; value: number }>;
  lines: { extension: number; balance: number; exhaustion: number };
}

export interface UtilityGraphResult {
  status: UtilityVerdictStatus;
  verdict?: UtilityGraphVerdict;
  solutionFraming?: "Disha Balancer" | "Tattva Balancer" | "Disha Activation" | "Tattva Activation" | "Equaliser";
  triggeredDirections: string[];
  matchedConditions: UtilityGraphVerdict[];
  explanation: string;
  inputHash: string;
  outputHash: string;
  algorithmVersion: string;
  frozenInput: UtilityGraphInput;
}

const safeText = (value: unknown, label: string, max = 120) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) throw new UtilityVerdictValidationError(`${label} is required and must be safe text up to ${max} characters.`);
  return value.trim();
};

const finite = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new UtilityVerdictValidationError(`${label} must be a finite number.`);
  return value;
};

const framing: Record<UtilityGraphVerdict, UtilityGraphResult["solutionFraming"]> = {
  SUPPRESS: "Disha Balancer",
  GROUND: "Tattva Balancer",
  UPLIFT: "Disha Activation",
  PROMOTE: "Tattva Activation",
  BALANCE: "Equaliser"
};

/**
 * Applies only the approved comparative conditions. The more-specific UPLIFT
 * and PROMOTE conditions take precedence over the broad GROUND condition;
 * every matched condition is still retained for an auditable explanation.
 */
export function calculateUtilityGraphVerdict(input: UtilityGraphInput): UtilityGraphResult {
  const element = safeText(input.element, "Element", 80);
  if (!Array.isArray(input.directionSet) || input.directionSet.length === 0 || input.directionSet.length > 64) throw new UtilityVerdictValidationError("Direction set must contain 1 to 64 source direction codes.");
  const directionSet = input.directionSet.map((item) => safeText(item, "Direction code", 40));
  if (new Set(directionSet).size !== directionSet.length) throw new UtilityVerdictValidationError("Direction set must not contain duplicates.");
  if (!Array.isArray(input.bars) || input.bars.length !== directionSet.length) throw new UtilityVerdictValidationError("Each direction must have exactly one bar value.");
  const bars = input.bars.map((bar) => ({ directionCode: safeText(bar?.directionCode, "Bar direction", 40), value: finite(bar?.value, "Bar value") }));
  if (new Set(bars.map((bar) => bar.directionCode)).size !== bars.length || bars.some((bar) => !directionSet.includes(bar.directionCode)) || directionSet.some((code) => !bars.some((bar) => bar.directionCode === code))) throw new UtilityVerdictValidationError("Bar directions must match the exact declared direction set.");
  const lines = { extension: finite(input.lines?.extension, "Extension line"), balance: finite(input.lines?.balance, "Balance line"), exhaustion: finite(input.lines?.exhaustion, "Exhaustion line") };
  if (!(lines.extension >= lines.balance && lines.balance >= lines.exhaustion)) {
    const frozenInput = { element, directionSet, bars, lines };
    const inputHash = deterministicContentHash(frozenInput);
    return { status: "BLOCKED_METHOD_INPUT", triggeredDirections: [], matchedConditions: [], explanation: "Graph line order is contradictory. The approved red/balance/blue line relationship must be resolved by the methodology owner.", inputHash, outputHash: deterministicContentHash({ inputHash, status: "BLOCKED_METHOD_INPUT" }), algorithmVersion: UTILITY_VERDICT_ALGORITHM_VERSION, frozenInput };
  }

  const aboveExtension = bars.filter((bar) => bar.value > lines.extension).map((bar) => bar.directionCode);
  const belowExtension = bars.filter((bar) => bar.value < lines.extension).map((bar) => bar.directionCode);
  const belowExhaustion = bars.filter((bar) => bar.value < lines.exhaustion).map((bar) => bar.directionCode);
  const reachesExhaustion = bars.filter((bar) => bar.value === lines.exhaustion).map((bar) => bar.directionCode);
  const betweenLines = bars.filter((bar) => bar.value >= lines.exhaustion && bar.value <= lines.extension).map((bar) => bar.directionCode);
  const matchedConditions: UtilityGraphVerdict[] = [];
  if (aboveExtension.length > 1) matchedConditions.push("SUPPRESS");
  if (belowExtension.length > 0) matchedConditions.push("GROUND");
  if (belowExhaustion.length > 1) matchedConditions.push("UPLIFT");
  if (reachesExhaustion.length > 0) matchedConditions.push("PROMOTE");
  if (betweenLines.length > bars.length / 2) matchedConditions.push("BALANCE");
  const precedence: UtilityGraphVerdict[] = ["SUPPRESS", "UPLIFT", "PROMOTE", "GROUND", "BALANCE"];
  const verdict = precedence.find((item) => matchedConditions.includes(item));
  const triggeredDirections = verdict === "SUPPRESS" ? aboveExtension : verdict === "UPLIFT" ? belowExhaustion : verdict === "PROMOTE" ? reachesExhaustion : verdict === "GROUND" ? belowExtension : betweenLines;
  const status: UtilityVerdictStatus = verdict ? "APPROVED" : "REVIEW_REQUIRED";
  const explanation = verdict
    ? `${verdict} selected for ${element}. Triggered directions: ${triggeredDirections.join(", ") || "none"}. Matched conditions: ${matchedConditions.join(", ")}.`
    : `No approved graph condition could be selected for ${element}. Review the exact frozen bar and line values.`;
  const frozenInput = { element, directionSet, bars, lines };
  const inputHash = deterministicContentHash(frozenInput);
  const outputHash = deterministicContentHash({ algorithmVersion: UTILITY_VERDICT_ALGORITHM_VERSION, explanation, inputHash, matchedConditions, status, triggeredDirections, verdict });
  return { status, ...(verdict ? { verdict, solutionFraming: framing[verdict] } : {}), triggeredDirections, matchedConditions, explanation, inputHash, outputHash, algorithmVersion: UTILITY_VERDICT_ALGORITHM_VERSION, frozenInput };
}
