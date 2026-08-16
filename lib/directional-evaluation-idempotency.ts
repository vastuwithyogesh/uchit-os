import { deterministicContentHash } from "./evaluation-provenance.ts";

export interface DirectionalEvaluationIdempotencyInput {
  caseId: string; projectId: string; floorId: string; inputId: string; inputVersion: number; d8Id: string; d16Id: string;
}

/** Stable, bounded, non-PII identity for one logical V1 evaluation source set. */
export function buildDirectionalEvaluationIdempotencyKey(input: DirectionalEvaluationIdempotencyInput) {
  return `directional-evaluation-v1:${deterministicContentHash(input)}`;
}
