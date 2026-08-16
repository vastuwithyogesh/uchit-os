import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { EvaluationRemedyTypeHandoffV1 } from "./evaluation-remedy-handoff-v1.ts";
import type { StageBInputV1Record } from "./domain.ts";

export const V1_STAGE_B_ADAPTER_VERSION = "evaluation-remedy-stage-b-adapter/v1" as const;
const REMEDY_FRAMING: Record<string, { remedyType: string; solutionFraming: string }> = { SUPPRESS: { remedyType: "TATTAV_BALANCER", solutionFraming: "Tattav Balancer" }, GROUND: { remedyType: "DISHA_BALANCER", solutionFraming: "Disha Balancer" }, UPLIFT: { remedyType: "TATTAV_ACTIVATION", solutionFraming: "Tattav Activation" }, PROMOTE: { remedyType: "DISHA_ACTIVATION", solutionFraming: "Disha Activation" }, BALANCE: { remedyType: "EQUALISER", solutionFraming: "Equaliser" } };
export interface V1StageBCompatibilityRecord { version: typeof V1_STAGE_B_ADAPTER_VERSION; organisationId: string; caseId: string; projectId: string; floorId: string; sourceHandoffId?: string; sourceHandoffHash: string; methodologyVersionId: string; methodologyContentHash: string; decisions: Array<{ element: string; verdict: string; remedyType: string; solutionFraming: string; statementId: string; statementContentHash: string }>; stageBReady: false; reason: "LEGACY_UTILITY_VERDICT_REQUIRED"; deterministicContentHash: string; }

export function translateEvaluationRemedyHandoffV1ToStageB(input: { handoff: EvaluationRemedyTypeHandoffV1; sourceHandoffId?: string }): V1StageBCompatibilityRecord {
  const handoff = input.handoff;
  if (handoff.decisions.length !== 5 || new Set(handoff.decisions.map((x) => x.element)).size !== 5) throw new Error("V1 Remedy Handoff must contain exactly five unique Element decisions.");
  const decisions = handoff.decisions.map((decision) => {
    const mapped = REMEDY_FRAMING[decision.verdict];
    if (!mapped || mapped.remedyType !== decision.remedyType) throw new Error(`V1 Remedy Type mapping is invalid for ${decision.element}.`);
    if (decision.correctionScope === "SPECIFIC_DIRECTION" && !decision.targetDirection) throw new Error(`SPECIFIC_DIRECTION_REQUIRED for ${decision.element}.`);
    return { element: decision.element, verdict: decision.verdict, correctionScope: decision.correctionScope, ...(decision.targetDirection ? { specificDirection: decision.targetDirection } : {}), remedyType: decision.remedyType, solutionFraming: mapped.solutionFraming, statementId: decision.statementId, statementContentHash: decision.statementContentHash };
  });
  const base = { version: V1_STAGE_B_ADAPTER_VERSION, organisationId: handoff.organisationId, caseId: handoff.caseId, projectId: handoff.projectId, floorId: handoff.floorId, ...(input.sourceHandoffId ? { sourceHandoffId: input.sourceHandoffId } : {}), sourceHandoffHash: handoff.deterministicContentHash, methodologyVersionId: handoff.methodologyVersionId, methodologyContentHash: handoff.methodologyContentHash, decisions, stageBReady: false as const, reason: "LEGACY_UTILITY_VERDICT_REQUIRED" as const };
  return { ...base, deterministicContentHash: deterministicContentHash(base) };
}

/** Readiness is promoted only after a persisted, finalized native V1 input exists. */
export function stageBReadinessForFinalizedInput(input: { handoff: EvaluationRemedyTypeHandoffV1; stageBInput?: StageBInputV1Record }) {
  const translated = translateEvaluationRemedyHandoffV1ToStageB({ handoff: input.handoff, sourceHandoffId: input.stageBInput?.sourceEvaluationRemedyHandoffId });
  if (!input.stageBInput || input.stageBInput.status !== "FINALIZED") return { ...translated, stageBReady: false as const, reason: "STAGE_B_INPUT_NOT_FINALIZED" as const };
  if (input.stageBInput.sourceEvaluationRemedyHandoffHash !== input.handoff.deterministicContentHash) return { ...translated, stageBReady: false as const, reason: "SOURCE_HANDOFF_INVALID" as const };
  return { ...translated, stageBReady: true as const, reason: undefined };
}
