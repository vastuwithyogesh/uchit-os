import type { AppUser, EntranceZoneVersionRecord } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { getApprovedEntranceZoneCatalog } from "./entrance-zone-catalog.ts";
import { appendFloorInvalidations } from "./founder-regeneration.ts";
import { getActiveCaseForClient } from "./service-framework.ts";
import { getAppState } from "./store.ts";

export class EntranceZoneWorkflowError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428 | 503;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 | 503 = 400) { super(message); this.name = "EntranceZoneWorkflowError"; this.statusCode = statusCode; }
}

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
function text(value: unknown, label: string, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[<>\u0000-\u001f\u007f]/.test(value)) throw new EntranceZoneWorkflowError(`${label} is required and must be safe text up to ${max} characters.`);
  return value.trim();
}
function optionalCode(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, "Entrance zone code", 40);
}
function assertFounder(actor: AppUser) {
  if (actor.role !== "SUPER_ADMIN" || (actor.organisationId && actor.organisationCapability !== "organisation_owner")) throw new EntranceZoneWorkflowError("Only the Founder organisation owner can confirm entrance zones.", 403);
}

type EntranceScope = "PROPERTY_MAIN_GATE" | "FLOOR_PRIMARY_ENTRANCE";

const authoritativeEntranceStatus = new Set(["CURRENT", "FINALIZED"] as const);
function isAuthoritativeEntranceStatus(status: EntranceZoneVersionRecord["status"]) {
  return status === "CURRENT" || status === "FINALIZED";
}
function rankEntranceAuthority(item: EntranceZoneVersionRecord | undefined) {
  if (!item) return -1;
  if (item.status === "FINALIZED") return 2;
  if (item.status === "CURRENT") return 1;
  return 0;
}

function getScopeRecord(state: ReturnType<typeof getAppState>, caseId: string, scope: EntranceScope, floorId?: string) {
  return state.entranceZoneVersions.filter((item) => item.caseId === caseId && item.scope === scope && (scope === "PROPERTY_MAIN_GATE" || item.floorId === floorId)
    && (item.status === "CURRENT" || item.status === "FINALIZED" || item.status === "SUPERSEDED")).sort((a, b) => {
    const rankDelta = rankEntranceAuthority(b) - rankEntranceAuthority(a);
    if (rankDelta !== 0) return rankDelta;
    const bVersion = b.recordVersion ?? 0;
    const aVersion = a.recordVersion ?? 0;
    if (rankEntranceStatusVersion(a) === rankEntranceStatusVersion(b)) return bVersion - aVersion;
    return bVersion - aVersion;
  })[0];
}

function rankEntranceStatusVersion(record: EntranceZoneVersionRecord) {
  return record.recordVersion ?? 0;
}

function getDraft(scopeRecords: EntranceZoneVersionRecord[]) {
  return scopeRecords.find((item) => item.status === "DRAFT");
}

function getProjectFloorIds(state: ReturnType<typeof getAppState>, caseRecord: { id: string; projectId?: string | null; organisationId?: string; clientId?: string }) {
  const project = caseRecord.projectId
    ? state.projects.find((item) => {
      if (caseRecord.clientId) return item.id === caseRecord.projectId && item.clientId === caseRecord.clientId;
      return item.id === caseRecord.projectId;
    })
    : undefined;
  if (!project) return { project: undefined as never, floors: [] as { id: string }[] };
  const floors = state.floorWorkspaces.filter((item) => item.projectId === project.id && item.caseId === caseRecord.id);
  return { project, floors };
}

function invalidationTargetsForScope(state: ReturnType<typeof getAppState>, caseRecord: { id: string; projectId?: string | null; organisationId?: string }, scope: EntranceScope, floorId?: string) {
  const { project, floors } = getProjectFloorIds(state, caseRecord);
  if (!project) return [] as { floorId?: string }[];
  if (scope === "FLOOR_PRIMARY_ENTRANCE" && floorId) return [{ floorId }];
  return floors.map((item) => ({ floorId: item.id }));
}

export function currentEntranceZones(state: ReturnType<typeof getAppState>, caseId: string, floorId?: string) {
  const propertyMainGate = getScopeRecord(state, caseId, "PROPERTY_MAIN_GATE");
  const floorGate = floorId ? getScopeRecord(state, caseId, "FLOOR_PRIMARY_ENTRANCE", floorId) : undefined;
  return { propertyMainGate, floorGate };
}

export function confirmEntranceZones(input: {
  caseId: unknown; floorId?: unknown; planVersionId?: unknown; marked32EvidenceVersionId?: unknown;
  propertyMainGateZoneCode?: unknown; floorGateZoneCode?: unknown; reason?: unknown;
  idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
}) {
  assertFounder(input.actor);
  const state = getAppState(); const caseId = text(input.caseId, "Case ID"); const floorId = input.floorId ? text(input.floorId, "Floor ID") : undefined;
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new EntranceZoneWorkflowError("Case not found.", 404);
  if (input.actor.organisationId && caseRecord.organisationId !== input.actor.organisationId) throw new EntranceZoneWorkflowError("Case not found.", 404);
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) throw new EntranceZoneWorkflowError("Entrance zones can be changed only on the active case revision.", 409);
  const planId = input.planVersionId ? text(input.planVersionId, "Plan version ID") : undefined;
  const evidenceId = input.marked32EvidenceVersionId ? text(input.marked32EvidenceVersionId, "32-sector evidence version ID") : undefined;
  const propertyCode = optionalCode(input.propertyMainGateZoneCode); const floorCode = optionalCode(input.floorGateZoneCode);
  const stableKey = text(input.idempotencyKey, "Idempotency key");
  const reason = input.reason === undefined || input.reason === "" ? undefined : text(input.reason, "Change reason", 500);
  const requestHash = deterministicContentHash({ caseId, floorId, planId, evidenceId, propertyCode: propertyCode ?? null, floorCode: floorCode ?? null, reason: reason ?? null });
  const replay = state.entranceZoneVersions.filter((item) => item.caseId === caseId && item.idempotencyKey === stableKey);
  if (replay.length) {
    if (replay.some((item) => item.requestHash !== requestHash)) throw new EntranceZoneWorkflowError("That idempotency key is already used for different entrance-zone inputs.", 409);
    return { propertyMainGate: replay.find((item) => item.scope === "PROPERTY_MAIN_GATE"), floorGate: replay.find((item) => item.scope === "FLOOR_PRIMARY_ENTRANCE"), replayed: true };
  }
  if (state.reportVersions.some((item) => item.caseId === caseId && item.artifact)) throw new EntranceZoneWorkflowError("An immutable report already exists. Open a formal rectification revision before changing entrance zones.", 409);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new EntranceZoneWorkflowError("The latest case record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== input.expectedRecordVersion) throw new EntranceZoneWorkflowError("The case changed. Refresh before confirming entrance zones.", 409);
  const project = caseRecord.projectId ? state.projects.find((item) => item.id === caseRecord.projectId && item.activeCaseId === caseRecord.id) : undefined;
  if (!project) throw new EntranceZoneWorkflowError("Project not found in the selected case.", 404);
  const floor = floorId ? state.floorWorkspaces.find((item) => item.id === floorId && item.projectId === project.id && item.caseId === caseId) : undefined;
  if (floorId && !floor) throw new EntranceZoneWorkflowError("Floor not found in the selected project and case.", 404);
  const floorScopeRequested = Boolean(floorCode);
  if (floorScopeRequested && (!floor || !planId || !evidenceId)) throw new EntranceZoneWorkflowError("Floor entrance requires its floor, current plan and confirmed 32-sector evidence.", 409);
  const plan = planId && floor ? state.planVersions.find((item) => item.id === planId && item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id && item.status === "CURRENT") : undefined;
  if (floorScopeRequested && !plan) throw new EntranceZoneWorkflowError("Floor entrance must reference the selected floor's current plan.", 409);
  const evidence = evidenceId && floor ? state.spatialEvidenceVersions.find((item) => item.id === evidenceId && item.projectId === project.id && item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan?.id && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT") : undefined;
  if (floorScopeRequested && !evidence) throw new EntranceZoneWorkflowError("Current Founder-confirmed 32-sector evidence is required.", 409);
  const organisationId = input.actor.organisationId ?? caseRecord.organisationId;
  const catalog = getApprovedEntranceZoneCatalog(state, organisationId);
  if (!catalog.ready || !catalog.version) throw new EntranceZoneWorkflowError(`BLOCKED_METHOD_INPUT: ${catalog.reason}`, 409);
  if (!propertyCode && !floorCode) throw new EntranceZoneWorkflowError("Choose at least one applicable property or floor entrance zone.");
  const byCode = new Map(catalog.zones.map((item) => [item.code, item]));
  if (propertyCode && !byCode.has(propertyCode)) throw new EntranceZoneWorkflowError("Property main gate must use an approved canonical 32-zone code.");
  if (floorCode && !byCode.has(floorCode)) throw new EntranceZoneWorkflowError("Floor entrance must use an approved canonical 32-zone code.");
  const current = currentEntranceZones(state, caseId, floorId);
  const changes = [
    propertyCode ? { scope: "PROPERTY_MAIN_GATE" as const, code: propertyCode, previous: current.propertyMainGate } : undefined,
    floorCode ? { scope: "FLOOR_PRIMARY_ENTRANCE" as const, code: floorCode, previous: current.floorGate } : undefined
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const changedExisting = changes.filter((item) => item.previous && (item.previous.zoneCode !== item.code || item.previous.marked32DEvidenceVersionId !== (evidence?.id ?? "CASE_SCOPED") || item.previous.planVersionId !== (plan?.id ?? "CASE_SCOPED")));
  if (changedExisting.length && (!reason || reason.length < 20)) throw new EntranceZoneWorkflowError("Explain the entrance-zone change using at least 20 characters.");
  if (propertyCode) {
    const activePropertyDraft = state.entranceZoneVersions.find((item) => item.caseId === caseId && item.scope === "PROPERTY_MAIN_GATE" && item.status === "DRAFT");
    if (activePropertyDraft) {
      throw new EntranceZoneWorkflowError("An active Property entrance draft already exists. Finalize or supersede it before creating another.", 409);
    }
  }
  if (floorCode) {
    const activeFloorDraft = state.entranceZoneVersions.find((item) => item.caseId === caseId && item.scope === "FLOOR_PRIMARY_ENTRANCE" && item.floorId === floorId && item.status === "DRAFT");
    if (activeFloorDraft) {
      throw new EntranceZoneWorkflowError("An active floor entrance draft already exists. Finalize or supersede it before creating another.", 409);
    }
  }
  if (!changes.length) {
    throw new EntranceZoneWorkflowError("The selected entrance zones and evidence are already current.", 409);
  }
  const activeDrafts = state.entranceZoneVersions.filter((item) => item.caseId === caseId && item.status === "DRAFT");
  if (activeDrafts.some((item) => item.scope === "PROPERTY_MAIN_GATE" && propertyCode && item.scope === "PROPERTY_MAIN_GATE")) {
    throw new EntranceZoneWorkflowError("An active Property entrance draft already exists. Finalize or supersede it before creating another.", 409);
  }
  if (activeDrafts.some((item) => item.scope === "FLOOR_PRIMARY_ENTRANCE" && item.floorId === floorId && floorCode)) {
    throw new EntranceZoneWorkflowError("An active floor entrance draft already exists. Finalize or supersede it before creating another.", 409);
  }
  const confirmedAt = now(); const created: EntranceZoneVersionRecord[] = [];
  for (const change of changes) {
    const zone = byCode.get(change.code)!;
    if (change.previous && change.previous.zoneCode === change.code && change.previous.marked32DEvidenceVersionId === (evidence?.id ?? "CASE_SCOPED") && change.previous.planVersionId === (plan?.id ?? "CASE_SCOPED")) continue;
    const next: EntranceZoneVersionRecord = {
      id: id("entrance-zone"), organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1,
      projectId: project.id, caseId, scope: change.scope, ...(change.scope === "FLOOR_PRIMARY_ENTRANCE" ? { floorId: floor!.id } : {}), ...(floor?.id ? { sourceFloorId: floor.id } : {}),
      planVersionId: change.scope === "FLOOR_PRIMARY_ENTRANCE" ? plan?.id ?? "CASE_SCOPED" : "PROPERTY_SCOPED",
      marked32DEvidenceVersionId: change.scope === "FLOOR_PRIMARY_ENTRANCE" ? evidence?.id ?? "CASE_SCOPED" : "PROPERTY_SCOPED",
      methodologyVersionId: catalog.version.id, methodologyContentHash: catalog.version.contentHash,
      catalogVersionId: catalog.version.id, catalogContentHash: catalog.version.contentHash,
      zoneCode: zone.code, zoneNameSnapshot: zone.classification, classificationSnapshot: zone.classification, ownerInterpretationHash: zone.ownerInterpretationHash,
      status: "DRAFT", supersedesVersionId: change.previous?.id, reason,
      confirmedAt, confirmedByActorUserId: input.actor.id, idempotencyKey: stableKey, requestHash
    };
    state.entranceZoneVersions.unshift(next); created.push(next);
  }
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  state.founderCommercialAuditEvents.push({
    id: id("audit"), organisationId, createdByActorUserId: input.actor.id, recordVersion: 1,
    eventType: "ENTRANCE_ZONES_CONFIRMED", entityType: "VASTU_CASE", entityId: caseId,
    actorUserId: input.actor.id, happenedAt: confirmedAt,
    reason: reason ?? "Founder confirmed the applicable entrance-zone classification.",
    beforeHash: deterministicContentHash(changes.map((item) => item.previous ? { id: item.previous.id, scope: item.previous.scope, zoneCode: item.previous.zoneCode } : null)),
    afterHash: deterministicContentHash(created.map((item) => ({ id: item.id, scope: item.scope, zoneCode: item.zoneCode, classification: item.classificationSnapshot,
      catalogVersionId: item.catalogVersionId, catalogContentHash: item.catalogContentHash, ownerInterpretationHash: item.ownerInterpretationHash, evidenceVersionId: item.marked32DEvidenceVersionId }))),
    idempotencyKey: `audit:${stableKey}`
  });
  state.timelineEvents.unshift({ id: id("event"), organisationId, createdByActorUserId: input.actor.id, recordVersion: 1,
    clientId: caseRecord.clientId, category: "Spatial", headline: "Entrance zones confirmed",
    details: created.map((item) => `${item.scope === "PROPERTY_MAIN_GATE" ? "Property main gate" : `${floor?.floorLabel ?? "Floor"} entrance`}: ${item.zoneCode} (${item.classificationSnapshot})`).join("; "),
    happenedAt: confirmedAt, actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName });
  return { propertyMainGate: created.find((item) => item.scope === "PROPERTY_MAIN_GATE") ?? current.propertyMainGate, floorGate: created.find((item) => item.scope === "FLOOR_PRIMARY_ENTRANCE") ?? current.floorGate, replayed: false };
}

export function finalizeEntranceZoneSuccessor(input: {
  caseId: unknown; draftId?: unknown; scope?: EntranceScope; floorId?: unknown;
  idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser;
  /** V1 entrance records do not invalidate legacy downstream evaluation graphs. */
  skipLegacyInvalidation?: boolean;
}) {
  assertFounder(input.actor);
  const state = getAppState();
  const caseId = text(input.caseId, "Case ID");
  const floorId = input.floorId ? text(input.floorId, "Floor ID") : undefined;
  const scope = input.scope ? text(input.scope, "Entrance scope", 30) : undefined;
  const stableKey = text(input.idempotencyKey, "Idempotency key");
  const requestedScope = scope === "PROPERTY_MAIN_GATE" || scope === "FLOOR_PRIMARY_ENTRANCE" ? scope : undefined;
  const requestHash = deterministicContentHash({ caseId, floorId, scope: requestedScope, draftId: input.draftId ? text(input.draftId, "Draft identifier") : undefined, stableKey });

  if (!requestedScope && !input.draftId) throw new EntranceZoneWorkflowError("Finalize requires a draft scope or draft identifier.");
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new EntranceZoneWorkflowError("Case not found.", 404);
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) throw new EntranceZoneWorkflowError("Entrance zones can be changed only on the active case revision.", 409);
  if (input.actor.organisationId && caseRecord.organisationId !== input.actor.organisationId) throw new EntranceZoneWorkflowError("Case not found.", 404);
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) < 0) throw new EntranceZoneWorkflowError("The latest case record version is required.", 428);
  if ((caseRecord.recordVersion ?? 0) !== input.expectedRecordVersion) throw new EntranceZoneWorkflowError("The case changed. Refresh before finalizing entrance zones.", 409);

  const draftId = input.draftId ? text(input.draftId, "Draft identifier") : undefined;
  const byScopeDraft = draftId
    ? state.entranceZoneVersions.find((item) => item.id === draftId)
    : state.entranceZoneVersions.find((item) => item.caseId === caseId && item.scope === requestedScope && (requestedScope !== "FLOOR_PRIMARY_ENTRANCE" || item.floorId === floorId) && item.status === "DRAFT");
  if (!byScopeDraft) throw new EntranceZoneWorkflowError("No draft entrance version found for finalization.", 404);
  if (byScopeDraft.caseId !== caseId) throw new EntranceZoneWorkflowError("Draft does not belong to the selected case.", 404);
  if (byScopeDraft.scope === "FLOOR_PRIMARY_ENTRANCE" && !byScopeDraft.floorId) {
    throw new EntranceZoneWorkflowError("Floor entrance drafts must target an exact floor.", 409);
  }
  if (byScopeDraft.scope === "FLOOR_PRIMARY_ENTRANCE" && floorId && byScopeDraft.floorId !== floorId) {
    throw new EntranceZoneWorkflowError("Floor mismatch for draft finalization.", 409);
  }
  if (requestedScope && byScopeDraft.scope !== requestedScope) throw new EntranceZoneWorkflowError("Draft scope does not match the requested scope.", 409);
  if (requestedScope && byScopeDraft.status === "DRAFT" && requestedScope === "FLOOR_PRIMARY_ENTRANCE" && !floorId) {
    throw new EntranceZoneWorkflowError("Floor entrance finalization requires an explicit floor identifier.", 409);
  }

  if (byScopeDraft.status !== "DRAFT") {
    if (byScopeDraft.status === "FINALIZED" || byScopeDraft.status === "CURRENT") {
      const finalizedRecord = byScopeDraft;
      return {
        propertyMainGate: finalizedRecord.scope === "PROPERTY_MAIN_GATE" ? finalizedRecord : undefined,
        floorGate: finalizedRecord.scope === "FLOOR_PRIMARY_ENTRANCE" ? finalizedRecord : undefined,
        replayed: true
      };
    }
    throw new EntranceZoneWorkflowError("Draft finalization requested for non-draft entrance version.", 409);
  }

  const replay = state.founderCommercialAuditEvents.find((item) => item.eventType === "ENTRANCE_ZONES_FINALIZED" && item.entityType === "VASTU_CASE" && item.entityId === caseId && item.idempotencyKey === `entrance-finalize:${stableKey}`);
  if (replay) {
    const parsed = (() => {
      try { return JSON.parse(replay.reason ?? "{}") as { draftId?: string; requestHash?: string }; } catch { return {} as { draftId?: string; requestHash?: string }; }
    })();
    if (parsed.requestHash !== requestHash) throw new EntranceZoneWorkflowError("That idempotency key is already used for a different finalize request.", 409);
    const finalRecord = state.entranceZoneVersions.find((item) => item.id === parsed.draftId);
    if (!finalRecord || finalRecord.status === "DRAFT") throw new EntranceZoneWorkflowError("Replay finalization record not found.", 409);
    return { propertyMainGate: finalRecord.scope === "PROPERTY_MAIN_GATE" ? finalRecord : undefined, floorGate: finalRecord.scope === "FLOOR_PRIMARY_ENTRANCE" ? finalRecord : undefined, replayed: true };
  }

  const project = caseRecord.projectId ? state.projects.find((item) => item.id === caseRecord.projectId) : undefined;
  if (!project) throw new EntranceZoneWorkflowError("Project not found in the selected case.", 404);

  const predecessor = getScopeRecord(state, caseId, byScopeDraft.scope, byScopeDraft.floorId);

  const finalizedAt = now();
  const previousStatus = predecessor ? predecessor.status : undefined;
  const draftStatus = byScopeDraft.status;
  byScopeDraft.status = "FINALIZED";
  byScopeDraft.finalizedAt = finalizedAt;
  byScopeDraft.finalizedByActorUserId = input.actor.id;
  if (predecessor && predecessor.id !== byScopeDraft.id && isAuthoritativeEntranceStatus(predecessor.status)) {
    predecessor.status = "SUPERSEDED";
    predecessor.supersededAt = finalizedAt;
  }
  try {
    if (input.skipLegacyInvalidation) {
      caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
    } else {
    for (const target of invalidationTargetsForScope(state, caseRecord, byScopeDraft.scope, byScopeDraft.floorId)) {
      appendFloorInvalidations({
        projectId: project.id, caseId,
        ...(target.floorId ? { floorId: target.floorId } : {}),
        causeType: "METHODOLOGY",
        sourceVersionId: byScopeDraft.id,
        reason: byScopeDraft.scope === "PROPERTY_MAIN_GATE"
          ? "Property main entrance draft has been finalized; downstream artifacts may require regeneration."
          : "Floor entrance draft has been finalized; downstream floor artifacts may require regeneration.",
        actor: input.actor, targetTypes: ["UTILITY_EVALUATION", "UTILITY_VERDICT", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"]
      });
    }
    caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
    }
    state.founderCommercialAuditEvents.push({
      id: id("audit"), organisationId: byScopeDraft.organisationId, createdByActorUserId: input.actor.id, recordVersion: 1,
      eventType: "ENTRANCE_ZONES_FINALIZED", entityType: "VASTU_CASE", entityId: caseId,
      actorUserId: input.actor.id, happenedAt: finalizedAt,
      reason: JSON.stringify({ draftId: byScopeDraft.id, requestHash, previousStatus, draftStatus }),
      beforeHash: predecessor ? deterministicContentHash({ predecessorId: predecessor.id }) : undefined,
      afterHash: deterministicContentHash({ draftId: byScopeDraft.id, scope: byScopeDraft.scope, zoneCode: byScopeDraft.zoneCode, floorId: byScopeDraft.floorId ?? null }),
      idempotencyKey: `entrance-finalize:${stableKey}`
    });
    state.timelineEvents.unshift({ id: id("event"), organisationId: byScopeDraft.organisationId, createdByActorUserId: input.actor.id, recordVersion: 1,
      clientId: caseRecord.clientId, category: "Spatial", headline: "Entrance zones finalized",
      details: `${byScopeDraft.scope === "PROPERTY_MAIN_GATE" ? "Property main gate" : `${byScopeDraft.floorId ? "Floor " + byScopeDraft.floorId : "Floor"} entrance`}: ${byScopeDraft.zoneCode} (${byScopeDraft.classificationSnapshot})`,
      happenedAt: finalizedAt, actorRole: input.actor.role, actorId: input.actor.id, actorName: input.actor.fullName
    });
  } catch (error) {
    // rollback only when this function fully mutates in-memory structures.
    byScopeDraft.status = draftStatus;
    delete byScopeDraft.finalizedAt;
    delete byScopeDraft.finalizedByActorUserId;
    if (predecessor && previousStatus) {
      predecessor.status = previousStatus;
      delete predecessor.supersededAt;
    }
    throw error;
  }

  return { propertyMainGate: byScopeDraft.scope === "PROPERTY_MAIN_GATE" ? byScopeDraft : undefined, floorGate: byScopeDraft.scope === "FLOOR_PRIMARY_ENTRANCE" ? byScopeDraft : undefined, replayed: false };
}
