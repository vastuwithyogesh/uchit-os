import type {
  AppUser, CaseUsedRemedyRecord, ContextualRepositoryCategory, ContextualRepositoryRecord,
  RemedyRepositoryRecord, RepositoryAuditEventRecord, RepositoryCategory, RepositoryImportRowRecord,
  RepositoryLifecycleStatus, StageBRemedyType
} from "./domain.ts";
import { contextualRepositoryCategories } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { registerSectionAAsset } from "./section-a-remediation.ts";
import { registerSectionCAsset } from "./section-c-extras.ts";
import type { AppState } from "./store.ts";
import { getAppState } from "./store.ts";

const REMEDY_CATEGORIES = ["DISHA_BALANCER", "DISHA_ACTIVATION", "TATTAV_BALANCER", "TATTAV_ACTIVATION", "EQUALISER"] as const;
export const PERMANENT_REPOSITORY_CATEGORIES = [...contextualRepositoryCategories, ...REMEDY_CATEGORIES] as const;
export const REPOSITORY_CATEGORIES = [...PERMANENT_REPOSITORY_CATEGORIES, "CASE_USED_REMEDY"] as const;
export const REPOSITORY_ELEMENTS = ["Earth", "Water", "Fire", "Air", "Space"] as const;
export const REPOSITORY_DIRECTIONS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"] as const;
export type PermanentRepositoryCategory = (typeof PERMANENT_REPOSITORY_CATEGORIES)[number];
export type DuplicatePolicy = "USE_EXISTING" | "MERGE_DETAILS" | "CREATE_ANYWAY";

type PermanentRecord = RemedyRepositoryRecord | ContextualRepositoryRecord;
type LocatedPermanent = { kind: "REMEDY"; category: StageBRemedyType; record: RemedyRepositoryRecord }
  | { kind: "CONTEXTUAL"; category: ContextualRepositoryCategory; record: ContextualRepositoryRecord };

export class RepositoryAdminError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 = 400) { super(message); this.name = "RepositoryAdminError"; this.statusCode = statusCode; }
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function organisation(actor: AppUser) {
  if (!actor.organisationId) throw new RepositoryAdminError("An active organisation is required.", 403);
  return actor.organisationId;
}
function assertAdmin(actor: AppUser) {
  if (!(["ADMIN", "SUPER_ADMIN"] as const).includes(actor.role as "ADMIN" | "SUPER_ADMIN")) throw new RepositoryAdminError("Repository Administration requires an existing Admin or Super-Admin role.", 403);
}
function text(value: unknown, label: string, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f<>]/.test(value)) throw new RepositoryAdminError(`${label} is required and must be safe text up to ${max} characters.`);
  if (/^[=+@-]/.test(value.trim())) throw new RepositoryAdminError(`${label} cannot begin with a spreadsheet formula marker.`);
  return value.trim();
}
function optionalText(value: unknown, label: string, max = 300) { return value === undefined || value === null || value === "" ? undefined : text(value, label, max); }
function list(value: unknown, label: string, allowed?: readonly string[]) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split("|") : [];
  const normalized = [...new Set(items.filter((item) => typeof item === "string" && item.trim()).map((item) => text(item, label, 80)))];
  if (normalized.length > 32) throw new RepositoryAdminError(`${label} supports at most 32 values.`);
  if (allowed && normalized.some((item) => !allowed.includes(item))) throw new RepositoryAdminError(`${label} contains a value outside the controlled vocabulary.`);
  return normalized;
}
function category(value: unknown): PermanentRepositoryCategory {
  const parsed = text(value, "Repository category", 40) as PermanentRepositoryCategory;
  if (!PERMANENT_REPOSITORY_CATEGORIES.includes(parsed)) throw new RepositoryAdminError("Repository category is not supported.");
  return parsed;
}
function expected(record: { recordVersion?: number }, supplied: unknown, label = "repository record") {
  if (!Number.isInteger(supplied) || Number(supplied) < 0) throw new RepositoryAdminError(`The latest ${label} version is required.`, 428);
  if ((record.recordVersion ?? 0) !== Number(supplied)) throw new RepositoryAdminError(`The ${label} changed. Refresh and try again.`, 409);
}
function asset(state: AppState, assetIdValue: unknown, versionIdValue: unknown, actor: AppUser) {
  const assetId = text(assetIdValue, "Media asset ID"), versionId = text(versionIdValue, "Media asset version ID");
  const version = state.mediaAssetVersions.find((item) => item.id === versionId && item.assetId === assetId
    && (!item.organisationId || item.organisationId === organisation(actor)) && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status));
  if (!version) throw new RepositoryAdminError("An approved immutable media asset version is required.", 404);
  return version;
}
function locate(state: AppState, recordId: string, actor: AppUser): LocatedPermanent | undefined {
  const org = organisation(actor);
  const remedy = state.remedyRepositoryRecords.find((item) => item.id === recordId && item.organisationId === org);
  if (remedy) return { kind: "REMEDY", category: remedy.remedialType, record: remedy };
  const contextual = state.contextualRepositoryRecords.find((item) => item.id === recordId && item.organisationId === org);
  return contextual ? { kind: "CONTEXTUAL", category: contextual.category, record: contextual } : undefined;
}
function allPermanent(state: AppState, actor: AppUser): LocatedPermanent[] {
  const org = organisation(actor);
  return [
    ...state.remedyRepositoryRecords.filter((item) => item.organisationId === org).map((record) => ({ kind: "REMEDY" as const, category: record.remedialType, record })),
    ...state.contextualRepositoryRecords.filter((item) => item.organisationId === org).map((record) => ({ kind: "CONTEXTUAL" as const, category: record.category, record }))
  ];
}
const normalizedName = (value: string) => value.trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
function duplicate(state: AppState, actor: AppUser, categoryValue: PermanentRepositoryCategory, name: string, exceptId?: string) {
  return allPermanent(state, actor).find((item) => item.record.id !== exceptId && item.category === categoryValue && normalizedName(item.record.name) === normalizedName(name));
}
function audit(state: AppState, actor: AppUser, located: { category: RepositoryCategory; record: { id: string } }, action: string, reason: string, key: string, requestHash: string, before?: unknown, after?: unknown) {
  const event: RepositoryAuditEventRecord = { id: id("repository-audit"), organisationId: organisation(actor), createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    recordId: located.record.id, category: located.category, action, actorId: actor.id, actorRole: actor.role, reason, ...(before === undefined ? {} : { beforeHash: deterministicContentHash(before) }),
    ...(after === undefined ? {} : { afterHash: deterministicContentHash(after) }), happenedAt: now(), idempotencyKey: key, requestHash };
  state.repositoryAuditEvents.unshift(event); return event;
}
function auditReplay(state: AppState, actor: AppUser, key: string, requestHash: string) {
  const replay = state.repositoryAuditEvents.find((item) => item.organisationId === organisation(actor) && item.idempotencyKey === key);
  if (replay && replay.requestHash !== requestHash) throw new RepositoryAdminError("This idempotency key was already used with different repository inputs.", 409);
  return replay;
}
function createRecord(state: AppState, actor: AppUser, input: { category: PermanentRepositoryCategory; name: string; attributePurpose: string; assetId: string; assetVersionId: string; elements: string[]; directions: string[]; tags: string[]; duplicateOfRecordId?: string; sourceCaseUsed?: CaseUsedRemedyRecord; idempotencyKey: string; requestHash: string }) {
  const common = { id: id("repository"), organisationId: organisation(actor), createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    name: input.name, attributePurpose: input.attributePurpose, preferredAssetId: input.assetId, preferredAssetVersionId: input.assetVersionId,
    status: "DRAFT" as const, tags: input.tags, createdAt: now(), updatedAt: now(), ...(input.duplicateOfRecordId ? { duplicateOfRecordId: input.duplicateOfRecordId } : {}),
    idempotencyKey: input.idempotencyKey, requestHash: input.requestHash };
  if ((REMEDY_CATEGORIES as readonly string[]).includes(input.category)) {
    const record: RemedyRepositoryRecord = { ...common, remedialType: input.category as StageBRemedyType, elements: input.elements, directions: input.directions,
      ...(input.sourceCaseUsed ? { sourceCaseUsedRemedyId: input.sourceCaseUsed.id, sourceCaseId: input.sourceCaseUsed.caseId, sourceFloorId: input.sourceCaseUsed.floorId } : {}) };
    state.remedyRepositoryRecords.unshift(record); return { kind: "REMEDY" as const, category: record.remedialType, record };
  }
  if (input.elements.length || input.directions.length) throw new RepositoryAdminError("Element and direction applicability belongs only to the five Remedy libraries.");
  const record: ContextualRepositoryRecord = { ...common, category: input.category as ContextualRepositoryCategory };
  state.contextualRepositoryRecords.unshift(record); return { kind: "CONTEXTUAL" as const, category: record.category, record };
}

export function createRepositoryRecord(input: { category: unknown; name: unknown; attributePurpose: unknown; assetId: unknown; assetVersionId: unknown; elements?: unknown; directions?: unknown; tags?: unknown; duplicatePolicy?: unknown; reason?: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const parsedCategory = category(input.category); const name = text(input.name, "Name");
  const purpose = text(input.attributePurpose, "Purpose or attribute"); const media = asset(state, input.assetId, input.assetVersionId, input.actor);
  const elements = list(input.elements, "Element", REPOSITORY_ELEMENTS), directions = list(input.directions, "Direction", REPOSITORY_DIRECTIONS), tags = list(input.tags, "Tag");
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) !== 0) throw new RepositoryAdminError("New repository records require expectedRecordVersion 0.", 428);
  const policy = (input.duplicatePolicy ?? "USE_EXISTING") as DuplicatePolicy; if (!(["USE_EXISTING", "MERGE_DETAILS", "CREATE_ANYWAY"] as const).includes(policy)) throw new RepositoryAdminError("Choose a supported duplicate decision.");
  const reason = optionalText(input.reason, "Reason", 500) ?? "Repository Draft created."; const key = text(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ category: parsedCategory, name, purpose, assetId: media.assetId, assetVersionId: media.id, elements, directions, tags, policy });
  const replay = auditReplay(state, input.actor, key, requestHash); if (replay) return { record: locate(state, replay.recordId, input.actor)?.record, duplicateDecision: "REPLAY" as const };
  const existing = duplicate(state, input.actor, parsedCategory, name);
  if (existing && policy === "USE_EXISTING") { audit(state, input.actor, existing, "DUPLICATE_USE_EXISTING", reason, key, requestHash, existing.record, existing.record); return { record: existing.record, duplicateDecision: "USE_EXISTING" as const }; }
  if (existing && policy === "MERGE_DETAILS") {
    if (existing.record.status !== "DRAFT") throw new RepositoryAdminError("Merge Details is allowed only into an existing Draft; choose Use Existing or Create Anyway.", 409);
    const before = structuredClone(existing.record); existing.record.attributePurpose = purpose; existing.record.preferredAssetId = media.assetId; existing.record.preferredAssetVersionId = media.id;
    existing.record.tags = [...new Set([...(existing.record.tags ?? []), ...tags])]; if (existing.kind === "REMEDY") { existing.record.elements = [...new Set([...existing.record.elements, ...elements])]; existing.record.directions = [...new Set([...existing.record.directions, ...directions])]; }
    existing.record.updatedAt = now(); existing.record.updatedByActorUserId = input.actor.id; existing.record.recordVersion = (existing.record.recordVersion ?? 0) + 1;
    audit(state, input.actor, existing, "DUPLICATE_MERGE_DETAILS", reason, key, requestHash, before, existing.record); return { record: existing.record, duplicateDecision: "MERGE_DETAILS" as const };
  }
  const created = createRecord(state, input.actor, { category: parsedCategory, name, attributePurpose: purpose, assetId: media.assetId, assetVersionId: media.id, elements, directions, tags,
    ...(existing ? { duplicateOfRecordId: existing.record.id } : {}), idempotencyKey: key, requestHash });
  audit(state, input.actor, created, existing ? "DUPLICATE_CREATE_ANYWAY" : "CREATE_DRAFT", reason, key, requestHash, undefined, created.record);
  return { record: created.record, duplicateDecision: existing ? "CREATE_ANYWAY" as const : "NONE" as const };
}

export function updateRepositoryRecord(input: { recordId: unknown; name?: unknown; attributePurpose?: unknown; elements?: unknown; directions?: unknown; tags?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const recordId = text(input.recordId, "Repository record ID"); const located = locate(state, recordId, input.actor);
  if (!located) throw new RepositoryAdminError("Repository record was not found.", 404); const reason = text(input.reason, "Reason", 500); const key = text(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ recordId, name: input.name ?? null, purpose: input.attributePurpose ?? null, elements: input.elements ?? null, directions: input.directions ?? null, tags: input.tags ?? null });
  if (auditReplay(state, input.actor, key, requestHash)) return located.record; expected(located.record, input.expectedRecordVersion); if (located.record.status !== "DRAFT") throw new RepositoryAdminError("Only Draft repository metadata is editable; use preferred-asset replacement for future approved use.", 409);
  const before = structuredClone(located.record); const name = input.name === undefined ? located.record.name : text(input.name, "Name"); const foundDuplicate = duplicate(state, input.actor, located.category, name, located.record.id);
  if (foundDuplicate) throw new RepositoryAdminError("A record with this category and name already exists. Use the explicit duplicate workflow.", 409);
  located.record.name = name; if (input.attributePurpose !== undefined) located.record.attributePurpose = text(input.attributePurpose, "Purpose or attribute");
  if (input.tags !== undefined) located.record.tags = list(input.tags, "Tag");
  if (located.kind === "REMEDY") { if (input.elements !== undefined) located.record.elements = list(input.elements, "Element", REPOSITORY_ELEMENTS); if (input.directions !== undefined) located.record.directions = list(input.directions, "Direction", REPOSITORY_DIRECTIONS); }
  else if (input.elements !== undefined || input.directions !== undefined) throw new RepositoryAdminError("Element and direction applicability belongs only to Remedy libraries.");
  located.record.updatedAt = now(); located.record.updatedByActorUserId = input.actor.id; located.record.recordVersion = (located.record.recordVersion ?? 0) + 1;
  audit(state, input.actor, located, "UPDATE_DRAFT", reason, key, requestHash, before, located.record); return located.record;
}

function transition(input: { recordId: unknown; target: RepositoryLifecycleStatus; replacementRecordId?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const recordId = text(input.recordId, "Repository record ID"); const located = locate(state, recordId, input.actor);
  if (!located) throw new RepositoryAdminError("Repository record was not found.", 404); const reason = text(input.reason, "Reason", 500); const key = text(input.idempotencyKey, "Idempotency key");
  const replacementId = optionalText(input.replacementRecordId, "Replacement record ID"); const requestHash = deterministicContentHash({ recordId, target: input.target, replacementId: replacementId ?? null });
  if (auditReplay(state, input.actor, key, requestHash)) return located.record; expected(located.record, input.expectedRecordVersion);
  const before = structuredClone(located.record);
  if (input.target === "APPROVED") {
    if (located.record.status !== "DRAFT") throw new RepositoryAdminError("Only a Draft can be approved.", 409); asset(state, located.record.preferredAssetId, located.record.preferredAssetVersionId, input.actor);
    located.record.status = "APPROVED"; located.record.approvalTimestamp = now(); located.record.approvedBy = input.actor.id;
  } else if (input.target === "ARCHIVED") {
    if (located.record.status === "ARCHIVED") throw new RepositoryAdminError("Repository record is already archived.", 409);
    if (replacementId) { const replacement = locate(state, replacementId, input.actor); if (!replacement || replacement.category !== located.category || replacement.record.status !== "APPROVED") throw new RepositoryAdminError("Replacement must be an approved record in the same category.", 409); located.record.replacementRecordId = replacement.record.id; }
    located.record.status = "ARCHIVED"; located.record.archivedAt = now(); located.record.archivedBy = input.actor.id;
  } else {
    if (located.record.status !== "ARCHIVED") throw new RepositoryAdminError("Only an archived record can be reactivated.", 409);
    located.record.status = "DRAFT"; delete located.record.archivedAt; delete located.record.archivedBy; delete located.record.approvalTimestamp; delete located.record.approvedBy;
  }
  located.record.updatedAt = now(); located.record.updatedByActorUserId = input.actor.id; located.record.recordVersion = (located.record.recordVersion ?? 0) + 1;
  audit(state, input.actor, located, input.target === "APPROVED" ? "APPROVE" : input.target === "ARCHIVED" ? "ARCHIVE" : "REACTIVATE_TO_DRAFT", reason, key, requestHash, before, located.record); return located.record;
}

export const approveRepositoryRecord = (input: Omit<Parameters<typeof transition>[0], "target" | "replacementRecordId">) => transition({ ...input, target: "APPROVED" });
export const archiveRepositoryRecord = (input: Omit<Parameters<typeof transition>[0], "target">) => transition({ ...input, target: "ARCHIVED" });
export const reactivateRepositoryRecord = (input: Omit<Parameters<typeof transition>[0], "target" | "replacementRecordId">) => transition({ ...input, target: "DRAFT" });

export function bulkTransitionRepositoryRecords(input: { records: unknown; target: unknown; reason: unknown; idempotencyKey: unknown; actor: AppUser }) {
  assertAdmin(input.actor); if (!Array.isArray(input.records) || !input.records.length || input.records.length > 25) throw new RepositoryAdminError("Select between 1 and 25 records for a conservative bulk action.");
  const target = text(input.target, "Bulk target", 20); if (!(["APPROVED", "ARCHIVED"] as const).includes(target as "APPROVED" | "ARCHIVED")) throw new RepositoryAdminError("Bulk actions support only Approve or Archive.");
  const reason = text(input.reason, "Reason", 500), key = text(input.idempotencyKey, "Idempotency key"); const seen = new Set<string>(); const results: PermanentRecord[] = [];
  for (const [index, raw] of input.records.entries()) {
    if (!raw || typeof raw !== "object") throw new RepositoryAdminError("Every bulk row requires a record ID and expected version.");
    const recordId = text((raw as { recordId?: unknown }).recordId, "Repository record ID"); if (seen.has(recordId)) throw new RepositoryAdminError("Bulk selection cannot contain duplicate records."); seen.add(recordId);
    const expectedRecordVersion = (raw as { expectedRecordVersion?: unknown }).expectedRecordVersion;
    results.push(target === "APPROVED"
      ? approveRepositoryRecord({ recordId, reason, idempotencyKey: `${key}:${index}:${recordId}`, expectedRecordVersion, actor: input.actor })
      : archiveRepositoryRecord({ recordId, reason, idempotencyKey: `${key}:${index}:${recordId}`, expectedRecordVersion, actor: input.actor }));
  }
  return { target, count: results.length, records: results };
}

export function setRepositoryPreferredAsset(input: { recordId: unknown; assetId: unknown; assetVersionId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const located = locate(state, text(input.recordId, "Repository record ID"), input.actor); if (!located) throw new RepositoryAdminError("Repository record was not found.", 404);
  const media = asset(state, input.assetId, input.assetVersionId, input.actor); const reason = text(input.reason, "Reason", 500); const key = text(input.idempotencyKey, "Idempotency key");
  const requestHash = deterministicContentHash({ recordId: located.record.id, assetId: media.assetId, assetVersionId: media.id }); if (auditReplay(state, input.actor, key, requestHash)) return { record: located.record, historicalSnapshotsChanged: false as const };
  expected(located.record, input.expectedRecordVersion); if (located.record.status === "ARCHIVED") throw new RepositoryAdminError("Archived records must be reactivated before selecting a preferred asset.", 409);
  const before = structuredClone(located.record); located.record.preferredAssetId = media.assetId; located.record.preferredAssetVersionId = media.id; located.record.updatedAt = now(); located.record.updatedByActorUserId = input.actor.id; located.record.recordVersion = (located.record.recordVersion ?? 0) + 1;
  audit(state, input.actor, located, "PREFERRED_ASSET_FUTURE_ONLY", reason, key, requestHash, before, located.record); return { record: located.record, historicalSnapshotsChanged: false as const };
}

export function createCaseUsedRemedy(input: { remediationId: unknown; pageId: unknown; name: unknown; attributePurpose: unknown; assetId: unknown; assetVersionId: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const org = organisation(input.actor); const remediationId = text(input.remediationId, "Remediation ID"), pageId = text(input.pageId, "Page ID");
  const remediation = state.stageBRemediations.find((item) => item.id === remediationId && item.organisationId === org); const page = state.reportPlacementPages.find((item) => item.id === pageId && item.remediationId === remediationId && item.organisationId === org && item.section === "B" && item.state === "DRAFT");
  if (!remediation || !page || remediation.caseId !== page.caseId || remediation.floorId !== page.floorId || remediation.reportId !== page.reportId || !(REMEDY_CATEGORIES as readonly string[]).includes(page.pageType)) throw new RepositoryAdminError("An editable exact-scope Stage B remedy page is required.", 404);
  const media = asset(state, input.assetId, input.assetVersionId, input.actor); const key = text(input.idempotencyKey, "Idempotency key"); const name = text(input.name, "Name"), purpose = text(input.attributePurpose, "Purpose or attribute");
  const requestHash = deterministicContentHash({ remediationId, pageId, name, purpose, assetId: media.assetId, assetVersionId: media.id });
  const replay = state.caseUsedRemedyRecords.find((item) => item.organisationId === org && item.idempotencyKey === key); if (replay) { if (replay.requestHash !== requestHash) throw new RepositoryAdminError("This idempotency key was already used with different case-used inputs.", 409); return replay; }
  expected(remediation, input.expectedRecordVersion, "remediation");
  const record: CaseUsedRemedyRecord = { id: id("case-used-remedy"), organisationId: org, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    caseId: remediation.caseId, floorId: remediation.floorId, remediationId, pageId, remedialType: page.pageType as StageBRemedyType, name, attributePurpose: purpose,
    preferredAssetId: media.assetId, preferredAssetVersionId: media.id, sourceMediaChecksumSha256: media.checksumSha256, source: "ONE_TIME_USE_THIS_CASE", status: "ACTIVE", createdAt: now(), idempotencyKey: key, requestHash };
  if (allPermanent(state, input.actor).some((item) => item.record.id === record.id) || state.caseUsedRemedyRecords.some((item) => item.id === record.id)) throw new RepositoryAdminError("Generated remedy ID collided with an existing record; retry.", 409);
  state.caseUsedRemedyRecords.unshift(record); remediation.updatedByActorUserId = input.actor.id; remediation.recordVersion = (remediation.recordVersion ?? 0) + 1;
  audit(state, input.actor, { category: "CASE_USED_REMEDY", record }, "CASE_USED_CREATE", "One-Time Use — This Case record created in exact page scope.", key, requestHash, undefined, record);
  return record;
}

export function mergeCaseUsedIntoMainLibrary(input: { caseUsedRemedyId: unknown; elements?: unknown; directions?: unknown; tags?: unknown; duplicatePolicy?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const sourceId = text(input.caseUsedRemedyId, "Case-used remedy ID"); const source = state.caseUsedRemedyRecords.find((item) => item.id === sourceId && item.organisationId === organisation(input.actor));
  if (!source) throw new RepositoryAdminError("Case-used remedy was not found.", 404); const policy = (input.duplicatePolicy ?? "USE_EXISTING") as DuplicatePolicy; if (!(["USE_EXISTING", "MERGE_DETAILS", "CREATE_ANYWAY"] as const).includes(policy)) throw new RepositoryAdminError("Choose a supported duplicate decision.");
  const elements = list(input.elements, "Element", REPOSITORY_ELEMENTS), directions = list(input.directions, "Direction", REPOSITORY_DIRECTIONS), tags = list(input.tags, "Tag");
  if (!elements.length && !directions.length) throw new RepositoryAdminError("Merge into the Main Library Draft requires explicit element or direction applicability.");
  const reason = text(input.reason, "Reason", 500), key = text(input.idempotencyKey, "Idempotency key"); const requestHash = deterministicContentHash({ sourceId, elements, directions, tags, policy });
  const replay = auditReplay(state, input.actor, key, requestHash); if (replay) return { source, draft: locate(state, replay.recordId, input.actor)?.record };
  expected(source, input.expectedRecordVersion, "case-used remedy"); const existing = duplicate(state, input.actor, source.remedialType, source.name);
  if (existing && policy !== "CREATE_ANYWAY") throw new RepositoryAdminError(`Duplicate ${existing.record.status.toLowerCase()} record ${existing.record.id} found. Review it or explicitly choose Create Anyway for a separate provenance-bound Draft.`, 409);
  const created = createRecord(state, input.actor, { category: source.remedialType, name: source.name, attributePurpose: source.attributePurpose, assetId: source.preferredAssetId,
    assetVersionId: source.preferredAssetVersionId, elements, directions, tags, ...(existing ? { duplicateOfRecordId: existing.record.id } : {}), sourceCaseUsed: source, idempotencyKey: key, requestHash });
  source.mergedRepositoryRecordId = created.record.id; source.mergedAt = now(); source.mergedBy = input.actor.id; source.updatedByActorUserId = input.actor.id; source.recordVersion = (source.recordVersion ?? 0) + 1;
  audit(state, input.actor, created, "CASE_USED_MERGE_TO_MAIN_DRAFT", reason, key, requestHash, source, created.record); return { source, draft: created.record };
}

export function repositoryUsage(state: AppState, actor: AppUser, recordId: string) {
  assertAdmin(actor); const org = organisation(actor); const located = locate(state, recordId, actor); const caseUsed = state.caseUsedRemedyRecords.find((item) => item.id === recordId && item.organisationId === org);
  if (!located && !caseUsed) throw new RepositoryAdminError("Repository record was not found.", 404);
  const contextualAssets = [...state.sectionAAssets, ...state.sectionCAssets].filter((item) => item.organisationId === org && item.repositoryRecordId === recordId);
  const placements = state.physicalPlacements.filter((item) => item.organisationId === org && item.state !== "DELETED" && (item.remedyId === recordId
    || contextualAssets.some((source) => source.remediationId === item.remediationId && source.assetVersionId === item.imageAssetVersionId
      && source.name === item.nameSnapshot && source.attributePurpose === item.attributePurposeSnapshot)));
  const reportIds = [...new Set(placements.map((item) => item.reportId))]; const caseIds = [...new Set(placements.map((item) => item.caseId))];
  return { recordId, usageCount: placements.length, caseCount: caseIds.length, reportCount: reportIds.length, caseIds, reportIds, placementIds: placements.map((item) => item.id), immutableSnapshots: placements.map((item) => ({ placementId: item.id, name: item.nameSnapshot, purpose: item.attributePurposeSnapshot, assetVersionId: item.imageAssetVersionId, snapshotId: item.imageAssetSnapshotId })) };
}

function parseCsv(raw: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < raw.length; index++) { const char = raw[index];
    if (quoted) { if (char === '"' && raw[index + 1] === '"') { cell += '"'; index++; } else if (char === '"') quoted = false; else cell += char; }
    else if (char === '"') quoted = true; else if (char === ",") { row.push(cell); cell = ""; } else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; } else cell += char;
  }
  if (quoted) throw new RepositoryAdminError("CSV contains an unterminated quoted field."); if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((item) => item.some((value) => value.trim()));
}
function csvCell(value: unknown) { const raw = String(value ?? ""); const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; }
export const REPOSITORY_CSV_HEADERS = ["category", "name", "attributePurpose", "assetVersionId", "assetFilename", "elements", "directions", "tags"] as const;
export function repositoryCsvTemplate() { return `${REPOSITORY_CSV_HEADERS.join(",")}\n`;
}
export function exportRepositoryCsv(state: AppState, actor: AppUser) {
  assertAdmin(actor); const header = [...REPOSITORY_CSV_HEADERS, "recordId", "status", "preferredAssetId", "updatedAt"];
  const rows = allPermanent(state, actor).sort((a, b) => a.category.localeCompare(b.category) || a.record.name.localeCompare(b.record.name)).map((item) => {
    const media = state.mediaAssetVersions.find((version) => version.id === item.record.preferredAssetVersionId); const remedy = item.kind === "REMEDY" ? item.record : undefined;
    return [item.category, item.record.name, item.record.attributePurpose, item.record.preferredAssetVersionId, media?.filename ?? "", remedy?.elements.join("|") ?? "", remedy?.directions.join("|") ?? "", (item.record.tags ?? []).join("|"), item.record.id, item.record.status, item.record.preferredAssetId, item.record.updatedAt ?? item.record.createdAt ?? ""].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export function stageRepositoryCsvImport(input: { filename: unknown; csv: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const filename = text(input.filename, "CSV filename", 180); if (!filename.toLowerCase().endsWith(".csv")) throw new RepositoryAdminError("Only UTF-8 CSV import is enabled in this milestone.");
  if (typeof input.csv !== "string" || !input.csv.length || input.csv.length > 1_000_000) throw new RepositoryAdminError("CSV must be non-empty and at most 1 MB.");
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) !== 0) throw new RepositoryAdminError("A new import batch requires expectedRecordVersion 0.", 428);
  const key = text(input.idempotencyKey, "Idempotency key"), requestHash = deterministicContentHash({ filename, csv: input.csv }); const replay = state.repositoryImportBatches.find((item) => item.organisationId === organisation(input.actor) && item.idempotencyKey === key);
  if (replay) { if (replay.requestHash !== requestHash) throw new RepositoryAdminError("This import key was already used with different CSV content.", 409); return { batch: replay, rows: state.repositoryImportRows.filter((item) => item.batchId === replay.id) }; }
  const parsed = parseCsv(input.csv); if (parsed.length < 2) throw new RepositoryAdminError("CSV requires the template header and at least one data row."); if (parsed.length - 1 > 500) throw new RepositoryAdminError("CSV import is limited to 500 rows per staged batch.");
  const headers = parsed[0].map((item) => item.trim()); if (REPOSITORY_CSV_HEADERS.some((header) => !headers.includes(header))) throw new RepositoryAdminError(`CSV headers must include: ${REPOSITORY_CSV_HEADERS.join(", ")}.`);
  const batchId = id("repository-import"); const rows: RepositoryImportRowRecord[] = parsed.slice(1).map((cells, rowIndex) => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])); const errors: string[] = []; let normalized: RepositoryImportRowRecord["normalized"];
    try {
      const parsedCategory = category(raw.category); const name = text(raw.name, "Name"), purpose = text(raw.attributePurpose, "Purpose or attribute");
      let media = state.mediaAssetVersions.find((item) => item.id === raw.assetVersionId && (!item.organisationId || item.organisationId === organisation(input.actor)) && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status));
      if (!media && raw.assetFilename) { const matches = state.mediaAssetVersions.filter((item) => item.filename === raw.assetFilename && (!item.organisationId || item.organisationId === organisation(input.actor)) && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status)); if (matches.length === 1) media = matches[0]; else errors.push(matches.length ? "Asset filename is ambiguous; provide assetVersionId." : "Approved media asset was not found by ID or filename."); }
      if (!media) errors.push("Approved media asset was not found by ID or filename.");
      const elements = list(raw.elements, "Element", REPOSITORY_ELEMENTS), directions = list(raw.directions, "Direction", REPOSITORY_DIRECTIONS), tags = list(raw.tags, "Tag");
      if (!(REMEDY_CATEGORIES as readonly string[]).includes(parsedCategory) && (elements.length || directions.length)) errors.push("Applicability fields are allowed only for Remedy categories.");
      if (media && !errors.length) normalized = { category: parsedCategory, name, attributePurpose: purpose, assetId: media.assetId, assetVersionId: media.id, elements, directions, tags };
    } catch (cause) { errors.push(cause instanceof Error ? cause.message : "Row validation failed."); }
    const foundDuplicate = normalized ? duplicate(state, input.actor, normalized.category, normalized.name) : undefined;
    return { id: id("repository-import-row"), organisationId: organisation(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
      batchId, rowNumber: rowIndex + 2, raw, ...(normalized ? { normalized } : {}), status: errors.length ? "INVALID" : foundDuplicate ? "DUPLICATE" : "VALID", errors,
      ...(foundDuplicate ? { duplicateRecordId: foundDuplicate.record.id } : {}) };
  });
  const batch = { id: batchId, organisationId: organisation(input.actor), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
    format: "CSV" as const, filename, status: "STAGED" as const, totalRows: rows.length, validRows: rows.filter((item) => item.status === "VALID").length,
    invalidRows: rows.filter((item) => item.status === "INVALID").length, duplicateRows: rows.filter((item) => item.status === "DUPLICATE").length, approvedRows: 0,
    createdAt: now(), createdBy: input.actor.id, idempotencyKey: key, requestHash };
  state.repositoryImportBatches.unshift(batch); state.repositoryImportRows.unshift(...rows); audit(state, input.actor, { category: rows[0]?.normalized?.category ?? "EXTRA", record: batch }, "CSV_IMPORT_STAGED", "Bounded UTF-8 CSV staged for explicit review.", key, requestHash, undefined, batch);
  return { batch, rows };
}

export function approveRepositoryImportRows(input: { batchId: unknown; rowIds: unknown; duplicatePolicy?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  assertAdmin(input.actor); const state = getAppState(); const batchId = text(input.batchId, "Import batch ID"); const batch = state.repositoryImportBatches.find((item) => item.id === batchId && item.organisationId === organisation(input.actor)); if (!batch) throw new RepositoryAdminError("Import batch was not found.", 404);
  expected(batch, input.expectedRecordVersion, "import batch"); const rowIds = list(input.rowIds, "Import row ID"); if (!rowIds.length) throw new RepositoryAdminError("Select at least one valid staged row."); const policy = (input.duplicatePolicy ?? "USE_EXISTING") as DuplicatePolicy;
  const reason = text(input.reason, "Reason", 500), key = text(input.idempotencyKey, "Idempotency key"); const requestHash = deterministicContentHash({ batchId, rowIds: [...rowIds].sort(), policy });
  if (auditReplay(state, input.actor, key, requestHash)) return { batch, rows: state.repositoryImportRows.filter((item) => item.batchId === batch.id) };
  const selected = state.repositoryImportRows.filter((item) => item.batchId === batch.id && rowIds.includes(item.id)); if (selected.length !== rowIds.length) throw new RepositoryAdminError("One or more selected import rows do not belong to this batch.", 404);
  for (const row of selected) {
    if (!row.normalized || row.status === "INVALID" || row.status === "APPROVED") { row.status = "FAILED"; if (!row.errors.length) row.errors.push("Row is not an approvable staged record."); continue; }
    const existing = duplicate(state, input.actor, row.normalized.category, row.normalized.name);
    if (existing && policy !== "CREATE_ANYWAY") { row.status = "FAILED"; row.duplicateRecordId = existing.record.id; row.errors.push("Duplicate requires explicit Create Anyway during partial Draft creation."); continue; }
    const rowKey = `${key}:${row.id}`, rowHash = deterministicContentHash({ batchId, rowId: row.id, normalized: row.normalized, policy });
    const created = createRecord(state, input.actor, { ...row.normalized, ...(existing ? { duplicateOfRecordId: existing.record.id } : {}), idempotencyKey: rowKey, requestHash: rowHash });
    row.status = "APPROVED"; row.createdRecordId = created.record.id; row.updatedByActorUserId = input.actor.id; row.recordVersion = (row.recordVersion ?? 0) + 1;
  }
  batch.approvedRows = state.repositoryImportRows.filter((item) => item.batchId === batch.id && item.status === "APPROVED").length; const remaining = state.repositoryImportRows.filter((item) => item.batchId === batch.id && item.status !== "APPROVED");
  batch.status = remaining.length ? "PARTIALLY_APPROVED" : "APPROVED"; batch.updatedByActorUserId = input.actor.id; batch.recordVersion = (batch.recordVersion ?? 0) + 1;
  audit(state, input.actor, { category: "EXTRA", record: batch }, "CSV_IMPORT_PARTIAL_DRAFT_CREATE", reason, key, requestHash, undefined, batch);
  return { batch, rows: state.repositoryImportRows.filter((item) => item.batchId === batch.id) };
}

export function exportFailedRepositoryImportRows(state: AppState, actor: AppUser, batchId: string) {
  assertAdmin(actor); const batch = state.repositoryImportBatches.find((item) => item.id === batchId && item.organisationId === organisation(actor)); if (!batch) throw new RepositoryAdminError("Import batch was not found.", 404);
  const rows = state.repositoryImportRows.filter((item) => item.batchId === batch.id && ["INVALID", "DUPLICATE", "FAILED"].includes(item.status)); const header = [...REPOSITORY_CSV_HEADERS, "rowNumber", "status", "errors", "duplicateRecordId"];
  return [header.join(","), ...rows.map((row) => [...REPOSITORY_CSV_HEADERS.map((key) => row.raw[key] ?? ""), row.rowNumber, row.status, row.errors.join(" | "), row.duplicateRecordId ?? ""].map(csvCell).join(","))].join("\n");
}

export function consumeSectionARepositoryRecord(input: { remediationId: unknown; recordId: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const located = locate(state, text(input.recordId, "Repository record ID"), input.actor); if (!located || located.kind !== "CONTEXTUAL" || !(["FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME"] as const).includes(located.category as "FURNITURE_ADDON")) throw new RepositoryAdminError("Approved Section A repository record was not found.", 404);
  if (located.record.status !== "APPROVED") throw new RepositoryAdminError("Only approved repository records are available to future workspaces.", 409);
  const record = registerSectionAAsset({ remediationId: input.remediationId, assetType: located.record.category, name: located.record.name, attributePurpose: located.record.attributePurpose,
    assetId: located.record.preferredAssetId, assetVersionId: located.record.preferredAssetVersionId, idempotencyKey: input.idempotencyKey, expectedRecordVersion: input.expectedRecordVersion, actor: input.actor });
  record.repositoryRecordId = located.record.id; return record;
}

export function consumeSectionCRepositoryRecord(input: { remediationId: unknown; extraPageId: unknown; recordId: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const state = getAppState(); const located = locate(state, text(input.recordId, "Repository record ID"), input.actor); if (!located || located.kind !== "CONTEXTUAL" || located.category !== "EXTRA") throw new RepositoryAdminError("Approved Extras repository record was not found.", 404);
  if (located.record.status !== "APPROVED") throw new RepositoryAdminError("Only approved repository records are available to future workspaces.", 409);
  const record = registerSectionCAsset({ remediationId: input.remediationId, extraPageId: input.extraPageId, name: located.record.name, attributePurpose: located.record.attributePurpose,
    assetId: located.record.preferredAssetId, assetVersionId: located.record.preferredAssetVersionId, idempotencyKey: input.idempotencyKey, expectedRecordVersion: input.expectedRecordVersion, actor: input.actor });
  record.repositoryRecordId = located.record.id; return record;
}

export function repositoryHealth(state: AppState, actor: AppUser) {
  assertAdmin(actor); return allPermanent(state, actor).map((item) => {
    const preferred = state.mediaAssetVersions.find((version) => version.id === item.record.preferredAssetVersionId && version.assetId === item.record.preferredAssetId);
    const issues = [...(!preferred ? ["PREFERRED_ASSET_MISSING"] : !["FOUNDER_APPROVED", "ACTIVE"].includes(preferred.status) ? ["PREFERRED_ASSET_NOT_APPROVED"] : []),
      ...(item.kind === "REMEDY" && !item.record.elements.length && !item.record.directions.length ? ["BROAD_REMEDY_APPLICABILITY"] : [])];
    return { recordId: item.record.id, category: item.category, status: item.record.status, health: issues.length ? "REVIEW" as const : "HEALTHY" as const, issues };
  });
}
