import type { AppUser, DirectionalInputModifierV1, DirectionalInputVersionV1 } from "./domain.ts";
import type { AppState } from "./store.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { evaluateD8Modifier, type D8ModifierInput } from "./d8-modifiers-v1.ts";
import { CIRCULATION_STATES, type CirculationState } from "./circulation-v1.ts";
import { resolveEvaluationArchitecture } from "./evaluation-architecture.ts";

export class DirectionalInputError extends Error {}
const validModifiers = ["CUT_OUT", "EXTENSION", "MARGA_VEDHA", "OPEN_SIDE", "CORNER"] as const;

function normalizedFindings(value: unknown): DirectionalInputModifierV1[] {
  if (!Array.isArray(value)) throw new DirectionalInputError("D8 modifier findings must be an array.");
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new DirectionalInputError("Each D8 modifier finding must be structured.");
    const item = raw as Record<string, unknown>;
    if (!validModifiers.includes(item.modifier as typeof validModifiers[number])) throw new DirectionalInputError("Unsupported D8 modifier type.");
    const result = evaluateD8Modifier(item as unknown as D8ModifierInput);
    return { ...item, modifier: result.modifier, result } as DirectionalInputModifierV1;
  });
}

export function createDirectionalInputDraft(input: { state: AppState; organisationId?: string; caseId: string; projectId: string; floorId: string; modifierFindings?: unknown; noConfirmedD8Modifiers?: boolean; circulationState: CirculationState; methodologyVersionId?: string; methodologyContentHash?: string; actor: AppUser; idempotencyKey: string; predecessorVersionId?: string; }) {
  const architecture = resolveEvaluationArchitecture({ state: input.state, caseId: input.caseId, floorId: input.floorId });
  if (architecture.caseVersion !== "V1" || architecture.floorVersion !== "V1") throw new DirectionalInputError("Directional V1 input requires a V1 case and floor.");
  if (!CIRCULATION_STATES.includes(input.circulationState)) throw new DirectionalInputError("Circulation state is not approved.");
  const findings = normalizedFindings(input.modifierFindings ?? []);
  if (findings.length === 0 && input.noConfirmedD8Modifiers !== true) throw new DirectionalInputError("Explicitly confirm that no D8 modifiers were found.");
  const existing = input.state.directionalInputVersions.find((item) => item.caseId === input.caseId && item.floorId === input.floorId && item.idempotencyKey === input.idempotencyKey);
  const requestHash = deterministicContentHash({ caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, findings, noConfirmedD8Modifiers: input.noConfirmedD8Modifiers === true, circulationState: input.circulationState, methodologyVersionId: input.methodologyVersionId ?? null, methodologyContentHash: input.methodologyContentHash ?? null });
  if (existing) { if (existing.requestHash !== requestHash) throw new DirectionalInputError("That idempotency key is already used for different directional inputs."); return existing; }
  if (input.state.directionalInputVersions.some((item) => item.caseId === input.caseId && item.floorId === input.floorId && item.status === "DRAFT")) throw new DirectionalInputError("Finalize the active directional input draft before creating another.");
  const now = new Date().toISOString();
  const record: DirectionalInputVersionV1 = { id: crypto.randomUUID(), organisationId: input.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1, caseId: input.caseId, projectId: input.projectId, floorId: input.floorId, architectureVersion: "V1", modifierFindings: findings, noConfirmedD8Modifiers: findings.length === 0, circulationState: input.circulationState, methodologyVersionId: input.methodologyVersionId, methodologyContentHash: input.methodologyContentHash, status: "DRAFT", predecessorVersionId: input.predecessorVersionId, idempotencyKey: input.idempotencyKey, requestHash, inputHash: deterministicContentHash({ findings, circulationState: input.circulationState }), createdAt: now, updatedAt: now };
  input.state.directionalInputVersions.unshift(record);
  return record;
}

export function finalizeDirectionalInput(input: { state: AppState; inputId: string; actor: AppUser; expectedVersion?: number; idempotencyKey: string }) {
  const record = input.state.directionalInputVersions.find((item) => item.id === input.inputId);
  if (!record) throw new DirectionalInputError("Directional input draft not found.");
  if (record.status !== "DRAFT") return record;
  if (record.recordVersion !== undefined && input.expectedVersion !== undefined && record.recordVersion !== input.expectedVersion) throw new DirectionalInputError("Directional input changed. Refresh and retry.");
  const now = new Date().toISOString();
  if (record.predecessorVersionId) { const predecessor = input.state.directionalInputVersions.find((item) => item.id === record.predecessorVersionId); if (predecessor) predecessor.status = "SUPERSEDED"; }
  record.status = "FINALIZED"; record.finalizedAt = now; record.finalizedByActorUserId = input.actor.id; record.updatedAt = now; record.updatedByActorUserId = input.actor.id; record.recordVersion = (record.recordVersion ?? 0) + 1; return record;
}

export function createDirectionalInputSuccessor(input: { state: AppState; predecessorId: string; modifierFindings?: unknown; noConfirmedD8Modifiers?: boolean; circulationState: CirculationState; methodologyVersionId?: string; methodologyContentHash?: string; actor: AppUser; idempotencyKey: string }) {
  const predecessor = input.state.directionalInputVersions.find((item) => item.id === input.predecessorId);
  if (!predecessor || predecessor.status !== "FINALIZED") throw new DirectionalInputError("Only a finalized directional input can have a successor.");
  return createDirectionalInputDraft({ ...input, state: input.state, organisationId: predecessor.organisationId, caseId: predecessor.caseId, projectId: predecessor.projectId, floorId: predecessor.floorId, predecessorVersionId: predecessor.id });
}
