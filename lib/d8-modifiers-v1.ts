import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { D8Direction } from "./d8-orientation-v1.ts";

export const D8_MODIFIER_RULESET_VERSION = "d8-site-modifiers/v1" as const;
export type D8ModifierId = "CUT_OUT" | "EXTENSION" | "MARGA_VEDHA" | "OPEN_SIDE" | "CORNER";
export type D8ModifierReviewCode = "D8_MODIFIER_INPUT_REQUIRED" | "D8_OPEN_SIDE_PATTERN_REQUIRED";
export interface D8DirectionalModifierRule { readonly direction: D8Direction; readonly modifier: "CUT_OUT" | "EXTENSION" | "MARGA_VEDHA"; readonly workbookSheet: string; readonly workbookRow: number; readonly status: "LOCKED"; readonly interpretation: string; }

const directions: readonly D8Direction[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function directionalRules(modifier: "CUT_OUT" | "EXTENSION" | "MARGA_VEDHA", sheet: string): readonly D8DirectionalModifierRule[] {
  return Object.freeze(directions.map((direction, index) => ({ direction, modifier, workbookSheet: sheet, workbookRow: index + 5, status: "LOCKED" as const, interpretation: modifier === "CUT_OUT" ? "Loss of directional mass; not a controlled opening." : modifier === "EXTENSION" ? "Amplifies the character of its direction; not the opposite of a cut-out." : "Road-pressure interpretation with directness, setback, alignment and buffer considered." })));
}
export const D8_CUTOUT_RULES = directionalRules("CUT_OUT", "D8 Cutout Rules");
export const D8_EXTENSION_RULES = directionalRules("EXTENSION", "D8 Extension Rules");
export const D8_MARGA_VEDHA_RULES = directionalRules("MARGA_VEDHA", "Marga Vedha Rules");
export const D8_OPEN_SIDE_PATTERNS = Object.freeze(["N+E", "E+S", "S+W", "W+N", "N+S", "E+W", "N+E+W|S", "N+E+S|W", "E+S+W|N", "S+W+N|E", "N+E+S+W"] as const);
export const D8_MODIFIER_CATALOG_HASH = deterministicContentHash({ cutout: D8_CUTOUT_RULES, extension: D8_EXTENSION_RULES, margaVedha: D8_MARGA_VEDHA_RULES, openSide: D8_OPEN_SIDE_PATTERNS });

export interface D8ModifierInput { readonly modifier: D8ModifierId; readonly direction?: D8Direction; readonly confirmed?: boolean; readonly openSidePattern?: string; readonly cornerImpact?: boolean; }
export type D8ModifierResult = { readonly kind: "RESOLVED"; readonly modifier: D8ModifierId; readonly direction?: D8Direction; readonly pattern?: string; readonly rule?: D8DirectionalModifierRule; readonly rulesetVersion: typeof D8_MODIFIER_RULESET_VERSION; readonly catalogHash: string } | { readonly kind: "REVIEW_REQUIRED"; readonly modifier: D8ModifierId; readonly reviewCode: D8ModifierReviewCode; readonly rulesetVersion: typeof D8_MODIFIER_RULESET_VERSION; readonly catalogHash: string };

export function evaluateD8Modifier(input: D8ModifierInput): D8ModifierResult {
  const base = { rulesetVersion: D8_MODIFIER_RULESET_VERSION, catalogHash: D8_MODIFIER_CATALOG_HASH } as const;
  if ((input.modifier === "CUT_OUT" || input.modifier === "EXTENSION" || input.modifier === "MARGA_VEDHA") && (!input.direction || input.confirmed !== true)) return { kind: "REVIEW_REQUIRED", modifier: input.modifier, reviewCode: "D8_MODIFIER_INPUT_REQUIRED", ...base };
  if (input.modifier === "OPEN_SIDE" && (!input.openSidePattern || !(D8_OPEN_SIDE_PATTERNS as readonly string[]).includes(input.openSidePattern))) return { kind: "REVIEW_REQUIRED", modifier: input.modifier, reviewCode: "D8_OPEN_SIDE_PATTERN_REQUIRED", ...base };
  if (input.modifier === "CORNER" && input.cornerImpact !== true) return { kind: "REVIEW_REQUIRED", modifier: input.modifier, reviewCode: "D8_MODIFIER_INPUT_REQUIRED", ...base };
  const rules = input.modifier === "CUT_OUT" ? D8_CUTOUT_RULES : input.modifier === "EXTENSION" ? D8_EXTENSION_RULES : input.modifier === "MARGA_VEDHA" ? D8_MARGA_VEDHA_RULES : undefined;
  return { kind: "RESOLVED", modifier: input.modifier, direction: input.direction, pattern: input.openSidePattern, rule: rules?.find((rule) => rule.direction === input.direction), ...base };
}
