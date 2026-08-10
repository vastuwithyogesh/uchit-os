import type { AppState } from "@/lib/store";

const collectionKeys = [
  "clients",
  "pipelineTransitions",
  "commercialPolicyHistory",
  "clientIntakeProfiles",
  "leadQualifications",
  "commercialProposals",
  "reviewCallBookings",
  "payments",
  "advanceVerifications",
  "vastuCases",
  "floorWorkspaces",
  "reportVersions",
  "rectificationRequests",
  "assessmentObservations",
  "recommendations",
  "implementationTasks",
  "caseDocuments",
  "deliveryMilestones",
  "evaluationSnapshots",
  "mapping32D",
  "mapping16D",
  "utilityRules",
  "shaktiSnapshots",
  "timelineEvents",
  "optInLeads",
  "whatsappTemplates",
  "whatsappLogs"
] as const satisfies readonly (keyof AppState)[];

/** Missing legacy fields inherit seeds; explicitly persisted empty arrays stay empty. */
export function mergeAppState(base: AppState, snapshot: AppState): AppState {
  const merged = { ...base, ...snapshot } as AppState;
  const partialSnapshot = snapshot as Partial<AppState>;

  for (const key of collectionKeys) {
    if (!Array.isArray(partialSnapshot[key])) {
      (merged as unknown as Record<string, unknown>)[key] = base[key];
    }
  }
  if (!partialSnapshot.commercialPolicy || typeof partialSnapshot.commercialPolicy !== "object") merged.commercialPolicy = base.commercialPolicy;
  return merged;
}
