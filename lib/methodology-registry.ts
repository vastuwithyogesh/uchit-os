import { deterministicContentHash } from "@/lib/evaluation-provenance";
import { methodologyDecisionStatuses, methodologyModules, type AppUser, type MethodologyDecisionStatus, type MethodologyModule } from "@/lib/domain";
import { getAppState } from "@/lib/store";
import { appendFloorInvalidations } from "@/lib/founder-regeneration";
export { getActiveMethodologyVersion, getMethodologyReadiness } from "@/lib/methodology-readiness";

export class MethodologyRegistryError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 = 400) { super(message); this.name = "MethodologyRegistryError"; this.statusCode = statusCode; }
}

function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function text(value: unknown, label: string, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) throw new MethodologyRegistryError(`${label} is required and must be safe text up to ${max} characters.`);
  return value.trim();
}
function key(value: unknown) { return text(value, "Idempotency key", 160); }
function moduleValue(value: unknown) {
  if (typeof value !== "string" || !methodologyModules.includes(value as MethodologyModule)) throw new MethodologyRegistryError("Choose a supported methodology module.");
  return value as MethodologyModule;
}
function decision(value: unknown) {
  if (typeof value !== "string" || !methodologyDecisionStatuses.includes(value as MethodologyDecisionStatus)) throw new MethodologyRegistryError("Choose an approved methodology decision status.");
  return value as MethodologyDecisionStatus;
}
function structuredValue(value: unknown, label: string) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") throw new MethodologyRegistryError(`${label} must be explicit JSON data.`);
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 20_000 || /"(?:__proto__|prototype|constructor)"\s*:/.test(serialized)) throw new MethodologyRegistryError(`${label} is unsafe or exceeds 20 KB.`);
  return structuredClone(value);
}
function organisation(actor: AppUser) {
  if (!actor.organisationId) throw new MethodologyRegistryError("An active organisation is required.", 403);
  return actor.organisationId;
}
function assertOwner(actor: AppUser) {
  if (actor.role !== "SUPER_ADMIN" || actor.organisationCapability !== "organisation_owner") throw new MethodologyRegistryError("Only the organisation owner can approve methodology.", 403);
}
function assertExpected(version: { recordVersion?: number }, expected: unknown) {
  if (!Number.isInteger(expected) || Number(expected) < 0) throw new MethodologyRegistryError("The latest methodology version is required.", 428);
  if ((version.recordVersion ?? 0) !== expected) throw new MethodologyRegistryError("The methodology draft changed. Refresh before saving.", 409);
}

export function createMethodologyVersion(input: { module: unknown; label: unknown; sourceLabel: unknown; sourceAssetVersion?: unknown; sourceAssetHash?: unknown; executionAdapterVersion?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertOwner(input.actor);
  const state = getAppState(); const organisationId = organisation(input.actor); const module = moduleValue(input.module); const stableKey = key(input.idempotencyKey);
  const retry = state.methodologyVersions.find((item) => item.organisationId === organisationId && item.idempotencyKey === stableKey);
  if (retry) return retry;
  const latest = state.methodologyVersions.filter((item) => item.organisationId === organisationId && item.module === module).sort((a, b) => b.version - a.version)[0];
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new MethodologyRegistryError("The latest methodology version is required.", 428);
  if ((latest?.recordVersion ?? 0) !== input.expectedRecordVersion) throw new MethodologyRegistryError("The methodology register changed. Refresh before creating a version.", 409);
  if (state.methodologyVersions.some((item) => item.organisationId === organisationId && item.module === module && item.lifecycleStatus === "DRAFT")) throw new MethodologyRegistryError("Complete or retire the existing draft before opening another version.", 409);
  const record = { id: id("methodology"), organisationId, module, version: (latest?.version ?? 0) + 1, label: text(input.label, "Version label", 120),
    lifecycleStatus: "DRAFT" as const, sourceLabel: text(input.sourceLabel, "Source label", 300),
    ...(input.sourceAssetVersion === undefined ? {} : { sourceAssetVersion: text(input.sourceAssetVersion, "Source asset version", 160) }),
    ...(input.sourceAssetHash === undefined ? {} : { sourceAssetHash: text(input.sourceAssetHash, "Source asset hash", 128) }),
    ...(input.executionAdapterVersion === undefined ? {} : { executionAdapterVersion: text(input.executionAdapterVersion, "Execution adapter version", 160) }), contentHash: "PENDING",
    reason: text(input.reason, "Reason", 500), idempotencyKey: stableKey, createdAt: now(), createdByActorUserId: input.actor.id, recordVersion: 0 };
  state.methodologyVersions.unshift(record); return record;
}

function draftContext(actor: AppUser, versionIdValue: unknown) {
  assertOwner(actor); const state = getAppState(); const organisationId = organisation(actor); const versionId = text(versionIdValue, "Methodology version ID", 160);
  const version = state.methodologyVersions.find((item) => item.id === versionId && item.organisationId === organisationId);
  if (!version) throw new MethodologyRegistryError("Methodology version not found.", 404);
  if (version.lifecycleStatus !== "DRAFT") throw new MethodologyRegistryError("Published methodology is immutable. Create a new version for changes.", 409);
  return { state, organisationId, version };
}

export function upsertMethodologyRule(input: { methodologyVersionId: unknown; recordId?: unknown; ruleKey: unknown; sourceReference: unknown; decisionStatus: unknown; conditionJson: unknown; outcomeJson: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const { state, organisationId, version } = draftContext(input.actor, input.methodologyVersionId); const stableKey = key(input.idempotencyKey);
  const retry = state.methodologyRules.find((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id && item.idempotencyKey === stableKey);
  if (retry) return retry;
  assertExpected(version, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : text(input.recordId, "Rule record ID", 160);
  const existing = recordId ? state.methodologyRules.find((item) => item.id === recordId && item.organisationId === organisationId && item.methodologyVersionId === version.id) : undefined;
  if (recordId && !existing) throw new MethodologyRegistryError("Methodology rule not found.", 404);
  const ruleKey = text(input.ruleKey, "Rule key", 120);
  if (state.methodologyRules.some((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id && item.id !== existing?.id && item.ruleKey === ruleKey)) throw new MethodologyRegistryError("Rule key already exists in this methodology version.", 409);
  const payload = { ruleKey, sourceReference: text(input.sourceReference, "Source reference", 300), decisionStatus: decision(input.decisionStatus),
    conditionJson: structuredValue(input.conditionJson, "Rule condition"), outcomeJson: structuredValue(input.outcomeJson, "Rule outcome") };
  const record = { id: existing?.id ?? id("methodology-rule"), organisationId, methodologyVersionId: version.id, ...payload,
    contentHash: deterministicContentHash(payload), idempotencyKey: stableKey, createdAt: existing?.createdAt ?? now(), createdByActorUserId: existing?.createdByActorUserId ?? input.actor.id,
    recordVersion: (existing?.recordVersion ?? 0) + 1 };
  if (existing) Object.assign(existing, record); else state.methodologyRules.unshift(record);
  version.recordVersion = (version.recordVersion ?? 0) + 1; return record;
}

export function upsertMethodologyFixture(input: { methodologyVersionId: unknown; recordId?: unknown; fixtureKey: unknown; inputJson: unknown; expectedOutputJson: unknown; decisionStatus: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const { state, organisationId, version } = draftContext(input.actor, input.methodologyVersionId); const stableKey = key(input.idempotencyKey);
  const retry = state.methodologyGoldenFixtures.find((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id && item.idempotencyKey === stableKey);
  if (retry) return retry;
  assertExpected(version, input.expectedRecordVersion);
  const recordId = input.recordId === undefined ? undefined : text(input.recordId, "Fixture record ID", 160);
  const existing = recordId ? state.methodologyGoldenFixtures.find((item) => item.id === recordId && item.organisationId === organisationId && item.methodologyVersionId === version.id) : undefined;
  if (recordId && !existing) throw new MethodologyRegistryError("Golden fixture not found.", 404);
  const fixtureKey = text(input.fixtureKey, "Fixture key", 120);
  if (state.methodologyGoldenFixtures.some((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id && item.id !== existing?.id && item.fixtureKey === fixtureKey)) throw new MethodologyRegistryError("Fixture key already exists in this methodology version.", 409);
  const fixtureStatus = decision(input.decisionStatus);
  if (!["APPROVED", "REVIEW_REQUIRED", "BLOCKED_METHOD_INPUT"].includes(fixtureStatus)) throw new MethodologyRegistryError("Golden fixture status must be Approved, Review Required, or Blocked — Methodology Input Required.");
  const payload = { fixtureKey, inputJson: structuredValue(input.inputJson, "Fixture input"), expectedOutputJson: structuredValue(input.expectedOutputJson, "Expected output"), decisionStatus: fixtureStatus };
  const record = { id: existing?.id ?? id("methodology-fixture"), organisationId, methodologyVersionId: version.id, ...payload,
    decisionStatus: fixtureStatus as "APPROVED" | "REVIEW_REQUIRED" | "BLOCKED_METHOD_INPUT", contentHash: deterministicContentHash(payload), idempotencyKey: stableKey,
    createdAt: existing?.createdAt ?? now(), createdByActorUserId: existing?.createdByActorUserId ?? input.actor.id, recordVersion: (existing?.recordVersion ?? 0) + 1 };
  if (existing) Object.assign(existing, record); else state.methodologyGoldenFixtures.unshift(record);
  version.recordVersion = (version.recordVersion ?? 0) + 1; return record;
}

export function publishMethodologyVersion(input: { methodologyVersionId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertOwner(input.actor); const state = getAppState(); const organisationId = organisation(input.actor); const versionId = text(input.methodologyVersionId, "Methodology version ID", 160); const stableKey = key(input.idempotencyKey);
  const version = state.methodologyVersions.find((item) => item.id === versionId && item.organisationId === organisationId);
  if (!version) throw new MethodologyRegistryError("Methodology version not found.", 404);
  if (version.lifecycleStatus === "ACTIVE" && version.idempotencyKey === stableKey) return version;
  if (version.lifecycleStatus !== "DRAFT") throw new MethodologyRegistryError("Published methodology is immutable. Create a new version for changes.", 409);
  assertExpected(version, input.expectedRecordVersion);
  if (version.module === "STAGE_B_REMEDIAL") throw new MethodologyRegistryError("Stage B remains Blocked — Methodology Input Required until Yogesh supplies and approves the remedial PRD.", 409);
  const rules = state.methodologyRules.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  const fixtures = state.methodologyGoldenFixtures.filter((item) => item.organisationId === organisationId && item.methodologyVersionId === version.id);
  if (!rules.length || rules.some((item) => item.decisionStatus !== "APPROVED")) throw new MethodologyRegistryError("Every rule must be Approved before publication.", 409);
  if (!fixtures.length || fixtures.some((item) => item.decisionStatus !== "APPROVED")) throw new MethodologyRegistryError("At least one approved golden fixture is required and none may be unresolved.", 409);
  const content = { module: version.module, version: version.version, rules: rules.map(({ ruleKey, sourceReference, decisionStatus, conditionJson, outcomeJson, contentHash }) => ({ ruleKey, sourceReference, decisionStatus, conditionJson, outcomeJson, contentHash })).sort((a, b) => a.ruleKey.localeCompare(b.ruleKey)), fixtures: fixtures.map(({ fixtureKey, inputJson, expectedOutputJson, contentHash }) => ({ fixtureKey, inputJson, expectedOutputJson, contentHash })).sort((a, b) => a.fixtureKey.localeCompare(b.fixtureKey)) };
  const latestActiveId = state.methodologyVersions.find((item) => item.organisationId === organisationId && item.module === version.module && item.lifecycleStatus === "ACTIVE")?.id;
  for (const current of state.methodologyVersions.filter((item) => item.organisationId === organisationId && item.module === version.module && item.lifecycleStatus === "ACTIVE")) current.lifecycleStatus = "RETIRED";
  version.lifecycleStatus = "ACTIVE"; version.contentHash = deterministicContentHash(content); version.approvedAt = now(); version.approvedByActorUserId = input.actor.id;
  version.reason = text(input.reason, "Publication reason", 500); version.idempotencyKey = stableKey; version.recordVersion = (version.recordVersion ?? 0) + 1;
  const targetTypes = version.module === "DIRECTION_32" ? ["OPENING_MAPPING"] as const
    : version.module === "DIRECTION_16" ? ["SPACE_MAPPING"] as const
      : version.module === "UTILITY" ? ["UTILITY_EVALUATION", "UTILITY_VERDICT"] as const
        : version.module === "SHAKTI_ELEMENT" ? ["SHAKTI_EVALUATION"] as const
          : version.module === "SITE_ENVIRONMENT" ? ["FINDING"] as const : [];
  if (targetTypes.length && latestActiveId) {
    for (const project of state.projects.filter((item) => item.organisationId === organisationId && state.vastuCases.find((caseRecord) => caseRecord.id === item.activeCaseId)?.status !== "VERDICT_RELEASED")) {
      for (const floor of state.floorWorkspaces.filter((item) => item.projectId === project.id && item.caseId === project.activeCaseId)) {
        appendFloorInvalidations({ projectId: project.id, caseId: project.activeCaseId, floorId: floor.id, causeType: "METHODOLOGY",
          sourceVersionId: version.id, reason: `${version.module.replaceAll("_", " ")} methodology changed; affected floor outputs require a new version.`, actor: input.actor,
          targetTypes: [...targetTypes] });
      }
    }
  }
  return version;
}
