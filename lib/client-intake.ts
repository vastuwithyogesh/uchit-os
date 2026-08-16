import type { ClientIntakeProfile } from "./domain.ts";
import type { PropertyContext } from "./domain.ts";
import type { AppState } from "./store.ts";

export type IntakeFieldKey = "challenge" | "outcome" | "service" | "propertyType" | "propertyStatus" | "cityCountry" | "floorCount" | "locationLink" | "latitude" | "longitude";
export type IntakeFieldErrors = Partial<Record<IntakeFieldKey, string>>;
export type IntakePrefillSource = "INTAKE" | "QUALIFICATION" | "PROPOSAL" | "CASE_SETUP" | "CLIENT_PROFILE";
export type ClientIntakePrefill = {
  values: {
    challenge?: string; outcome?: string; service?: string; propertyType?: string;
    propertyStatus?: string; cityCountry?: string; floorCount?: string;
    locationLink?: string; latitude?: string; longitude?: string; constraints?: string; urgency?: string;
  };
  provenance: Partial<Record<IntakeFieldKey | "constraints" | "urgency", IntakePrefillSource>>;
};
const propertyTypes = new Set(["Residential", "Commercial", "Factory", "Shop", "Hospital", "Hotel", "Temple"]);
const serviceTypes = new Set(["EXISTING_SPACE", "NEW_CONSTRUCTION"]);

/** Validates only values supplied by the user. Empty values remain valid draft state. */
export function validateClientIntake(input: Record<string, unknown>): IntakeFieldErrors {
  const errors: IntakeFieldErrors = {};
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  if (text("challenge") && text("challenge").length > 1000) errors.challenge = "Main challenge must be 1000 characters or fewer.";
  if (text("outcome") && text("outcome").length > 1000) errors.outcome = "Desired outcome must be 1000 characters or fewer.";
  if (text("service") && !serviceTypes.has(text("service"))) errors.service = "Choose Existing Space or New Construction.";
  if (text("propertyType") && !propertyTypes.has(text("propertyType"))) errors.propertyType = "Choose an approved property type.";
  if (text("propertyStatus") && text("propertyStatus").length > 240) errors.propertyStatus = "Property status must be 240 characters or fewer.";
  if (text("cityCountry") && text("cityCountry").length > 240) errors.cityCountry = "City and country must be 240 characters or fewer.";
  const floors = text("floorCount");
  if (floors && (!/^\d+$/.test(floors) || Number(floors) < 1 || Number(floors) > 200)) errors.floorCount = "Enter a whole number from 1 to 200, or leave this blank.";
  const locationLink = text("locationLink");
  if (locationLink) {
    try { const url = new URL(locationLink); if (url.protocol !== "https:" || !url.hostname || url.username || url.password || /^(localhost|127\.|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) errors.locationLink = "Enter a safe HTTPS map or location link."; }
    catch { errors.locationLink = "Enter a valid HTTPS map or location link."; }
  }
  const latitude = text("latitude"); const longitude = text("longitude");
  if (Boolean(latitude) !== Boolean(longitude)) { if (!latitude) errors.latitude = "Enter latitude with longitude."; if (!longitude) errors.longitude = "Enter longitude with latitude."; }
  if (latitude && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90)) errors.latitude = "Latitude must be between -90 and 90.";
  if (longitude && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180)) errors.longitude = "Longitude must be between -180 and 180.";
  return errors;
}

/** Fields needed to cross the existing intake/evaluation readiness gate. */
export function validateClientIntakeForEvaluation(input: Record<string, unknown>): IntakeFieldErrors {
  const errors = validateClientIntake(input);
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  if (!text("challenge")) errors.challenge = "Main challenge is required before running the evaluation.";
  if (!text("outcome")) errors.outcome = "Desired outcome is required before running the evaluation.";
  if (!text("service")) errors.service = "Service path is required before running the evaluation.";
  if (!text("propertyType")) errors.propertyType = "Property type is required before running the evaluation.";
  if (!text("propertyStatus")) errors.propertyStatus = "Property status is required before running the evaluation.";
  if (!text("cityCountry")) errors.cityCountry = "City and country are required before running the evaluation.";
  return errors;
}

export function getClientIntakeCompleteness(profile: ClientIntakeProfile | undefined, propertyContextOverride?: PropertyContext) {
  // Consent is retained only as source evidence; removed Founder consent
  // self-attestation never contributes to this completion result.
  const propertyContext = propertyContextOverride ?? profile?.propertyContext;
  const errors = validateClientIntakeForEvaluation({ challenge: profile?.needs?.mainChallenge, outcome: profile?.needs?.desiredOutcome, service: propertyContext?.serviceInterest, propertyType: propertyContext?.propertyType, propertyStatus: propertyContext?.propertyStatus, cityCountry: propertyContext?.cityCountry, floorCount: propertyContext?.floorCount?.toString(), locationLink: propertyContext?.locationLink, latitude: propertyContext?.latitude?.toString(), longitude: propertyContext?.longitude?.toString() });
  const checks = [
    { key: "context", complete: !errors.challenge && !errors.outcome },
    { key: "propertyProject", complete: !errors.service && !errors.propertyType && !errors.propertyStatus && !errors.cityCountry && !errors.floorCount && !errors.locationLink && !errors.latitude && !errors.longitude }
  ];
  return { completed: checks.filter((item) => item.complete).length, total: checks.length, complete: checks.every((item) => item.complete), checks };
}

function answerText(answers: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = answers?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Resolve blank intake fields from the exact authorised Case -> Project -> Client lineage. */
export function resolveClientIntakePrefill(state: AppState, input: { caseId?: string; projectId?: string; clientId?: string }): ClientIntakePrefill {
  const selectedCase = input.caseId ? state.vastuCases.find((item) => item.id === input.caseId) : undefined;
  if (!selectedCase || (input.clientId && selectedCase.clientId !== input.clientId) || (input.projectId && selectedCase.projectId !== input.projectId)) return { values: {}, provenance: {} };
  const client = state.clients.find((item) => item.id === selectedCase.clientId);
  const profile = state.clientIntakeProfiles.find((item) => item.clientId === selectedCase.clientId);
  const prospective = state.prospectiveProjects.find((item) => item.caseId === selectedCase.id && item.clientId === selectedCase.clientId);
  const proposal = state.founderProposalVersions.filter((item) => item.prospectiveProjectId === prospective?.id && item.clientId === selectedCase.clientId && ["SUPER_ADMIN_APPROVED", "SENT", "ACCEPTED"].includes(item.status)).sort((a, b) => b.version - a.version)[0];
  const responseId = proposal?.content.requirements.qualificationResponseVersionId || prospective?.responseVersionId;
  const response = state.qualificationResponseVersions.find((item) => item.id === responseId && item.clientId === selectedCase.clientId && item.status === "SUBMITTED");
  const lead = state.optInLeads.find((item) => item.convertedClientId === selectedCase.clientId || item.uniqueClientId === selectedCase.clientId);
  const values: ClientIntakePrefill["values"] = {};
  const provenance: ClientIntakePrefill["provenance"] = {};
  const set = (key: keyof ClientIntakePrefill["values"], candidates: Array<[string | undefined, IntakePrefillSource]>) => {
    const match = candidates.find(([value]) => typeof value === "string" && value.trim());
    if (match) { values[key] = match[0]!.trim(); provenance[key] = match[1]; }
  };
  const answers = response?.answers;
  set("challenge", [[profile?.needs?.mainChallenge, "INTAKE"], [answerText(answers, "mainChallenge", "mainConcern", "concern"), "QUALIFICATION"]]);
  set("outcome", [[profile?.needs?.desiredOutcome, "INTAKE"], [answerText(answers, "desiredOutcome"), "QUALIFICATION"]]);
  set("urgency", [[profile?.needs?.urgency, "INTAKE"], [answerText(answers, "urgency"), "QUALIFICATION"]]);
  set("service", [[profile?.propertyContext?.serviceInterest, "INTAKE"], [proposal?.serviceType, "PROPOSAL"], [prospective?.serviceType, "CASE_SETUP"], [selectedCase.serviceType, "CASE_SETUP"]]);
  set("propertyType", [[profile?.propertyContext?.propertyType, "INTAKE"], [proposal?.content.clientProject.propertyType, "PROPOSAL"], [prospective?.propertyType, "CASE_SETUP"]]);
  set("propertyStatus", [[profile?.propertyContext?.propertyStatus, "INTAKE"], [answerText(answers, "propertyStatus", "projectStage", "propertyStage"), "QUALIFICATION"]]);
  set("cityCountry", [[profile?.propertyContext?.cityCountry, "INTAKE"], [answerText(answers, "cityCountry"), "QUALIFICATION"], [[client?.city, lead?.country].filter(Boolean).join(", ") || undefined, "CLIENT_PROFILE"]]);
  set("floorCount", [[profile?.propertyContext?.floorCount?.toString(), "INTAKE"], [proposal?.content.clientProject.knownFloorCount?.toString(), "PROPOSAL"], [prospective?.floorCount?.toString(), "CASE_SETUP"]]);
  set("locationLink", [[profile?.propertyContext?.locationLink, "INTAKE"], [answerText(answers, "locationLink", "mapLink"), "QUALIFICATION"]]);
  set("latitude", [[profile?.propertyContext?.latitude?.toString(), "INTAKE"], [answerText(answers, "latitude"), "QUALIFICATION"]]);
  set("longitude", [[profile?.propertyContext?.longitude?.toString(), "INTAKE"], [answerText(answers, "longitude"), "QUALIFICATION"]]);
  set("constraints", [[profile?.propertyContext?.constraints, "INTAKE"], [answerText(answers, "constraints"), "QUALIFICATION"]]);
  return { values, provenance };
}
