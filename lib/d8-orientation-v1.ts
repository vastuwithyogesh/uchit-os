import { deterministicContentHash } from "./evaluation-provenance.ts";

export const D8_ORIENTATION_RULESET_VERSION = "d8-orientation-rules/v1" as const;
export type D8Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type D8BoundaryReviewCode = "D8_BOUNDARY_POLICY_REQUIRED";

export interface D8OrientationRule {
  readonly direction: D8Direction;
  readonly lowerExclusive: number;
  readonly upperExclusive: number;
  readonly workbookSheet: "D8 Orientation Rules";
  readonly workbookRow: number;
  readonly status: "LOCKED";
}

export const D8_ORIENTATION_RULES: readonly D8OrientationRule[] = Object.freeze([
  { direction: "N", lowerExclusive: 337.5, upperExclusive: 22.5, workbookSheet: "D8 Orientation Rules", workbookRow: 5, status: "LOCKED" },
  { direction: "NE", lowerExclusive: 22.5, upperExclusive: 67.5, workbookSheet: "D8 Orientation Rules", workbookRow: 6, status: "LOCKED" },
  { direction: "E", lowerExclusive: 67.5, upperExclusive: 112.5, workbookSheet: "D8 Orientation Rules", workbookRow: 7, status: "LOCKED" },
  { direction: "SE", lowerExclusive: 112.5, upperExclusive: 157.5, workbookSheet: "D8 Orientation Rules", workbookRow: 8, status: "LOCKED" },
  { direction: "S", lowerExclusive: 157.5, upperExclusive: 202.5, workbookSheet: "D8 Orientation Rules", workbookRow: 9, status: "LOCKED" },
  { direction: "SW", lowerExclusive: 202.5, upperExclusive: 247.5, workbookSheet: "D8 Orientation Rules", workbookRow: 10, status: "LOCKED" },
  { direction: "W", lowerExclusive: 247.5, upperExclusive: 292.5, workbookSheet: "D8 Orientation Rules", workbookRow: 11, status: "LOCKED" },
  { direction: "NW", lowerExclusive: 292.5, upperExclusive: 337.5, workbookSheet: "D8 Orientation Rules", workbookRow: 12, status: "LOCKED" },
]);

export const D8_ORIENTATION_CATALOG_HASH = deterministicContentHash(D8_ORIENTATION_RULES);

export class D8InputError extends Error { constructor(message: string) { super(message); this.name = "D8InputError"; } }

export type D8OrientationResult =
  | { readonly kind: "RESOLVED"; readonly normalizedDegree: number; readonly direction: D8Direction; readonly rule: D8OrientationRule; readonly rulesetVersion: typeof D8_ORIENTATION_RULESET_VERSION; readonly catalogHash: string }
  | { readonly kind: "REVIEW_REQUIRED"; readonly normalizedDegree: number; readonly boundaryDegree: number; readonly adjacentDirections: readonly [D8Direction, D8Direction]; readonly reviewCode: D8BoundaryReviewCode; readonly rulesetVersion: typeof D8_ORIENTATION_RULESET_VERSION; readonly catalogHash: string };

export function normalizeD8Degree(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new D8InputError("D8 degree must be a finite number.");
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

const boundaries = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5] as const;
const adjacent: Record<number, readonly [D8Direction, D8Direction]> = {
  22.5: ["N", "NE"], 67.5: ["NE", "E"], 112.5: ["E", "SE"], 157.5: ["SE", "S"],
  202.5: ["S", "SW"], 247.5: ["SW", "W"], 292.5: ["W", "NW"], 337.5: ["NW", "N"],
};

export function evaluateD8Orientation(degree: number): D8OrientationResult {
  const normalizedDegree = normalizeD8Degree(degree);
  const boundaryDegree = boundaries.find((boundary) => normalizedDegree === boundary);
  if (boundaryDegree !== undefined) return { kind: "REVIEW_REQUIRED", normalizedDegree, boundaryDegree, adjacentDirections: adjacent[boundaryDegree], reviewCode: "D8_BOUNDARY_POLICY_REQUIRED", rulesetVersion: D8_ORIENTATION_RULESET_VERSION, catalogHash: D8_ORIENTATION_CATALOG_HASH };
  const rule = normalizedDegree < 22.5 || normalizedDegree > 337.5 ? D8_ORIENTATION_RULES[0] : D8_ORIENTATION_RULES.find((entry) => normalizedDegree > entry.lowerExclusive && normalizedDegree < entry.upperExclusive)!;
  return { kind: "RESOLVED", normalizedDegree, direction: rule.direction, rule, rulesetVersion: D8_ORIENTATION_RULESET_VERSION, catalogHash: D8_ORIENTATION_CATALOG_HASH };
}
