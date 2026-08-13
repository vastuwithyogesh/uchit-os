import type { AppUser, SpatialEvidenceVersionRecord } from "@/lib/domain";
import { assertCaseFileEvidenceScope } from "@/lib/case-file-assets.server";
import { appendFloorInvalidations, openRegenerationStatuses } from "@/lib/founder-regeneration";
import { getActiveCaseForClient, normalizeCaseService } from "@/lib/service-framework";
import { getAppState } from "@/lib/store";

class SpatialWorkflowError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428 | 503;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 | 503 = 400) {
    super(message);
    this.name = "SpatialWorkflowError";
    this.statusCode = statusCode;
  }
}

function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function requiredString(value: unknown, label: string, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new SpatialWorkflowError(`${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

function idempotencyKey(value: unknown) {
  return requiredString(value, "Idempotency key", 160);
}

function spatialContext(caseIdValue: unknown, floorIdValue?: unknown) {
  const state = getAppState();
  const caseId = requiredString(caseIdValue, "Case ID", 160);
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord) throw new SpatialWorkflowError("Case not found.", 404);
  if (getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseRecord.id) throw new SpatialWorkflowError("Spatial changes are allowed only on the active case revision.", 409);
  if (state.reportVersions.some((item) => item.caseId === caseId && item.artifact)) throw new SpatialWorkflowError("An immutable report already exists. Open a formal rectification revision before changing spatial evidence.", 409);
  const project = caseRecord.projectId ? state.projects.find((item) => item.id === caseRecord.projectId) : undefined;
  if (!project) throw new SpatialWorkflowError("Project setup is incomplete. Refresh or reopen the case workspace.", 409);
  const floor = floorIdValue === undefined ? undefined : state.floorWorkspaces.find((item) => item.id === floorIdValue && item.caseId === caseId && item.projectId === project.id);
  if (floorIdValue !== undefined && !floor) throw new SpatialWorkflowError("Floor does not belong to this project and active case.", 404);
  return { state, caseRecord, project, floor, service: normalizeCaseService(caseRecord) };
}

function assertExpectedVersion(recordVersion: number | undefined, expected: unknown) {
  if (!Number.isInteger(expected) || Number(expected) < 0) throw new SpatialWorkflowError("The latest case record version is required.", 428);
  if ((recordVersion ?? 0) !== expected) throw new SpatialWorkflowError("The case changed. Refresh before saving spatial work.", 409);
}

function organisationId(actor: AppUser, caseOrganisationId?: string) {
  const value = actor.organisationId ?? caseOrganisationId;
  if (!value) throw new SpatialWorkflowError("Organisation-scoped protected storage is required.", 503);
  return value;
}

function founderCanConfirmEvidence(actor: AppUser) {
  // Production organisation scope must carry the owner capability. Local demo
  // callers have no organisation binding and remain useful for deterministic tests.
  return actor.role === "SUPER_ADMIN" && (!actor.organisationId || actor.organisationCapability === "organisation_owner");
}

function appendTimeline(clientId: string, actor: AppUser, headline: string, details: string) {
  getAppState().timelineEvents.unshift({
    id: id("event"), clientId, category: "Spatial", headline, details, happenedAt: now(),
    actorRole: actor.role, actorId: actor.id, actorName: actor.fullName
  });
}

export async function createPlanVersion(input: { caseId: unknown; floorId: unknown; versionLabel: unknown; evidenceRef: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const { state, caseRecord, project, floor, service } = spatialContext(input.caseId, input.floorId);
  assertExpectedVersion(caseRecord.recordVersion, input.expectedRecordVersion);
  const key = idempotencyKey(input.idempotencyKey);
  const retry = state.planVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor!.id && item.idempotencyKey === key);
  if (retry) return retry;
  const versionLabel = requiredString(input.versionLabel, "Plan version", 80);
  const protectedFileRef = requiredString(input.evidenceRef, "Protected plan evidence", 200);
  if (state.planVersions.some((item) => item.caseId === caseRecord.id && item.floorId === floor!.id && item.versionLabel.toLowerCase() === versionLabel.toLowerCase())) throw new SpatialWorkflowError("That plan version already exists for this floor.", 409);
  await assertCaseFileEvidenceScope(protectedFileRef, { organisationId: organisationId(input.actor, caseRecord.organisationId), caseId: caseRecord.id,
    caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: service.serviceType, floorLabel: floor!.floorLabel });
  const createdAt = now();
  for (const current of state.planVersions.filter((item) => item.caseId === caseRecord.id && item.floorId === floor!.id && item.status === "CURRENT")) {
    current.status = "SUPERSEDED"; current.supersededAt = createdAt;
  }
  const plan = { id: id("plan"), projectId: project.id, caseId: caseRecord.id, floorId: floor!.id, versionLabel,
    status: "CURRENT" as const, protectedFileRef, idempotencyKey: key, createdAt };
  state.planVersions.unshift(plan);
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  floor!.status = "NEEDS_REGENERATION";
  // A replacement plan invalidates dependent spatial/evaluation lineage, but it
  // does not undo the historical fact that this floor workspace was created and
  // readied in Step 02. Reopening Floor setup here creates a navigation loop.
  floor!.locked = true;
  floor!.regenerationReason = "A new plan version requires spatial mappings and dependent evaluation to be regenerated.";
  const currentOrientation = state.orientationVersions.find((item) => item.caseId === caseRecord.id && item.status === "LOCKED");
  if (currentOrientation) appendFloorInvalidations({ projectId: project.id, caseId: caseRecord.id, floorId: floor!.id,
    causeType: "PLAN", sourceVersionId: plan.id, reason: floor!.regenerationReason, actor: input.actor });
  appendTimeline(caseRecord.clientId, input.actor, "Plan version recorded", `${floor!.floorLabel} plan ${versionLabel} is current; earlier spatial outputs remain historical.`);
  return plan;
}

export async function createSpatialEvidenceVersion(input: { caseId: unknown; floorId?: unknown; planVersionId?: unknown; kind: unknown; classification?: unknown; manualEvidencePurpose?: unknown; has32SectorChakra?: unknown; has16DirectionMapping?: unknown; evidenceRef: unknown; fullColourConfirmed: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const { state, caseRecord, project, floor, service } = spatialContext(input.caseId, input.floorId);
  assertExpectedVersion(caseRecord.recordVersion, input.expectedRecordVersion);
  const key = idempotencyKey(input.idempotencyKey);
  const kind = requiredString(input.kind, "Evidence kind", 60) as SpatialEvidenceVersionRecord["kind"];
  if (!["HAND_MARKED_PLAN", "GOOGLE_EARTH_ORIENTATION", "SITE_PHOTO", "OTHER"].includes(kind)) throw new SpatialWorkflowError("Choose a supported spatial evidence kind.");
  if (input.fullColourConfirmed !== true) throw new SpatialWorkflowError("Confirm that the original evidence is a full-colour scan.");
  const classification = (input.classification === undefined ? "STANDARD" : requiredString(input.classification, "Evidence classification", 80)) as "STANDARD" | "MARKED_32D_CHAKRA_V1" | "MARKED_16D_MAPPING_V1";
  if (!["STANDARD", "MARKED_32D_CHAKRA_V1", "MARKED_16D_MAPPING_V1"].includes(classification)) throw new SpatialWorkflowError("Choose a supported evidence classification.");
  const manualEvidencePurpose = input.manualEvidencePurpose === undefined ? undefined
    : requiredString(input.manualEvidencePurpose, "Manual evidence purpose", 80) as "BRAHMASTHAN_GRID" | "MARMAA_GRID" | "ENERGY_GRAPH";
  if (manualEvidencePurpose && !["BRAHMASTHAN_GRID", "MARMAA_GRID", "ENERGY_GRAPH"].includes(manualEvidencePurpose)) throw new SpatialWorkflowError("Choose a supported manual gridding evidence purpose.");
  if (manualEvidencePurpose && (kind !== "OTHER" || classification !== "STANDARD" || !floor)) throw new SpatialWorkflowError("Manual gridding evidence must be a standard OTHER record bound to one exact floor and plan.");
  if (input.has32SectorChakra !== undefined && typeof input.has32SectorChakra !== "boolean") throw new SpatialWorkflowError("32-sector Founder confirmation must be true or false.");
  if (input.has16DirectionMapping !== undefined && typeof input.has16DirectionMapping !== "boolean") throw new SpatialWorkflowError("16-direction Founder confirmation must be true or false.");
  if (classification === "MARKED_32D_CHAKRA_V1") {
    if (!founderCanConfirmEvidence(input.actor)) throw new SpatialWorkflowError("Only the Founder organisation owner can confirm 32-sector marked evidence.", 403);
    if (kind !== "HAND_MARKED_PLAN" || input.has32SectorChakra !== true) throw new SpatialWorkflowError("32-sector evidence requires a Founder confirmation that the chakra overlay is visibly present.");
  }
  if (classification === "MARKED_16D_MAPPING_V1") {
    if (!founderCanConfirmEvidence(input.actor)) throw new SpatialWorkflowError("Only the Founder organisation owner can confirm 16-direction marked evidence.", 403);
    if (kind !== "HAND_MARKED_PLAN" || input.has16DirectionMapping !== true) throw new SpatialWorkflowError("16-direction evidence requires a Founder confirmation that the marked mapping belongs to this floor and plan.");
  }
  if (classification === "STANDARD" && (input.has32SectorChakra !== undefined || input.has16DirectionMapping !== undefined)) throw new SpatialWorkflowError("Founder evidence confirmations require their versioned evidence classification.");
  if (kind === "HAND_MARKED_PLAN" && !floor) throw new SpatialWorkflowError("Hand-marked plan evidence must belong to one floor.");
  if (kind === "GOOGLE_EARTH_ORIENTATION" && floor) throw new SpatialWorkflowError("Google Earth orientation evidence belongs to the project, not one floor.");
  const plan = input.planVersionId === undefined ? undefined : state.planVersions.find((item) => item.id === input.planVersionId && item.caseId === caseRecord.id && item.projectId === project.id && (!floor || item.floorId === floor.id));
  if (kind === "HAND_MARKED_PLAN" && (!plan || plan.status !== "CURRENT")) throw new SpatialWorkflowError("Hand-marked evidence must reference the current plan version for this floor.", 409);
  if (manualEvidencePurpose && (!plan || plan.status !== "CURRENT")) throw new SpatialWorkflowError("Manual gridding evidence must reference the current plan version for this floor.", 409);
  const retry = state.spatialEvidenceVersions.find((item) => item.caseId === caseRecord.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.idempotencyKey === key);
  if (retry) {
    const sameConfirmation = Boolean(retry.has32SectorChakra) === (input.has32SectorChakra === true)
      && Boolean(retry.has16DirectionMapping) === (input.has16DirectionMapping === true)
      && (retry.classification ?? "STANDARD") === classification
      && retry.manualEvidencePurpose === manualEvidencePurpose
      && retry.kind === kind;
    if (!sameConfirmation) throw new SpatialWorkflowError("That idempotency key is already used for a different evidence version.", 409);
    return retry;
  }
  const protectedFileRef = requiredString(input.evidenceRef, "Protected evidence", 200);
  await assertCaseFileEvidenceScope(protectedFileRef, { organisationId: organisationId(input.actor, caseRecord.organisationId), caseId: caseRecord.id,
    caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: service.serviceType, floorLabel: floor?.floorLabel });
  const createdAt = now();
  const replacedEvidence = state.spatialEvidenceVersions.filter((item) => item.caseId === caseRecord.id && item.floorId === floor?.id && item.kind === kind && item.status === "CURRENT"
    && (classification === "STANDARD" ? (item.classification ?? "STANDARD") === "STANDARD" : item.classification === classification)
    && item.manualEvidencePurpose === manualEvidencePurpose);
  for (const current of replacedEvidence) {
    current.status = "SUPERSEDED"; current.supersededAt = createdAt;
  }
  const evidence: SpatialEvidenceVersionRecord = { id: id("spatial-evidence"), projectId: project.id, caseId: caseRecord.id,
    floorId: floor?.id, planVersionId: plan?.id, kind, classification, has32SectorChakra: classification === "MARKED_32D_CHAKRA_V1" ? true : undefined,
    has16DirectionMapping: classification === "MARKED_16D_MAPPING_V1" ? true : undefined, manualEvidencePurpose,
    protectedFileRef, fullColour: true, status: "CURRENT", idempotencyKey: key, createdAt };
  state.spatialEvidenceVersions.unshift(evidence);
  if (replacedEvidence.length) appendFloorInvalidations({ projectId: project.id, caseId: caseRecord.id, floorId: floor?.id,
    causeType: "EVIDENCE", sourceVersionId: evidence.id, reason: `${kind.replaceAll("_", " ")} changed; exact dependent floor outputs require regeneration.`, actor: input.actor });
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(caseRecord.clientId, input.actor, "Spatial evidence recorded", `${kind.replaceAll("_", " ")} (${classification}) was stored as immutable full-colour evidence.`);
  return evidence;
}

export function lockExactOrientation(input: { caseId: unknown; exactDegree: unknown; googleEarthEvidenceVersionId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const { state, caseRecord, project } = spatialContext(input.caseId);
  assertExpectedVersion(caseRecord.recordVersion, input.expectedRecordVersion);
  const key = idempotencyKey(input.idempotencyKey);
  const retry = state.orientationVersions.find((item) => item.caseId === caseRecord.id && item.idempotencyKey === key);
  if (retry) return retry;
  const exactDegree = Number(input.exactDegree);
  if (!Number.isFinite(exactDegree) || exactDegree < 0 || exactDegree >= 360) throw new SpatialWorkflowError("Orientation degree must be numeric from 0 up to, but not including, 360. Direction boundaries remain methodology-controlled.");
  const reason = requiredString(input.reason, "Orientation lock reason", 500);
  if (reason.length < 20) throw new SpatialWorkflowError("Orientation lock reason must be at least 20 characters.");
  const evidenceId = requiredString(input.googleEarthEvidenceVersionId, "Google Earth evidence version", 200);
  const evidence = state.spatialEvidenceVersions.find((item) => item.id === evidenceId && item.projectId === project.id && item.caseId === caseRecord.id
    && item.kind === "GOOGLE_EARTH_ORIENTATION" && item.status === "CURRENT" && item.fullColour);
  if (!evidence) throw new SpatialWorkflowError("Current full-colour Google Earth evidence is required before orientation lock.", 409);
  const previous = state.orientationVersions.find((item) => item.caseId === caseRecord.id && item.status === "LOCKED");
  const lockedAt = now();
  if (previous) previous.status = "SUPERSEDED";
  const orientation = { id: id("orientation"), projectId: project.id, caseId: caseRecord.id, exactDegree,
    googleEarthEvidenceVersionId: evidence.id, status: "LOCKED" as const, lockedAt, lockedByActorUserId: input.actor.id,
    lockReason: reason, idempotencyKey: key, createdAt: lockedAt };
  state.orientationVersions.unshift(orientation);
  caseRecord.orientationLocked = true;
  caseRecord.status = "ORIENTATION_LOCKED";
  caseRecord.recordVersion = (caseRecord.recordVersion ?? 0) + 1;
  for (const floor of state.floorWorkspaces.filter((item) => item.caseId === caseRecord.id)) {
    floor.locked = true;
    floor.status = "LOCKED";
  }
  if (previous) appendFloorInvalidations({ projectId: project.id, caseId: caseRecord.id, causeType: "ORIENTATION", sourceVersionId: orientation.id,
    reason: "Locked orientation changed; all dependent spatial and evaluation outputs require regeneration.", actor: input.actor });
  appendTimeline(caseRecord.clientId, input.actor, previous ? "Orientation version changed" : "Orientation locked",
    `Exact orientation ${exactDegree} degrees was deliberately locked against immutable Google Earth evidence. ${reason}`);
  return orientation;
}

function currentSpatialReferences(caseId: unknown, floorId: unknown, planVersionId: unknown, orientationVersionId: unknown, evidenceVersionId: unknown) {
  const { state, caseRecord, project, floor } = spatialContext(caseId, floorId);
  const plan = state.planVersions.find((item) => item.id === planVersionId && item.projectId === project.id && item.caseId === caseRecord.id && item.floorId === floor!.id && item.status === "CURRENT");
  if (!plan) throw new SpatialWorkflowError("Mapping must reference this floor's current plan version.", 409);
  const orientation = state.orientationVersions.find((item) => item.id === orientationVersionId && item.projectId === project.id && item.caseId === caseRecord.id && item.status === "LOCKED");
  if (!orientation) throw new SpatialWorkflowError("Mapping requires the current locked orientation version.", 409);
  const evidence = state.spatialEvidenceVersions.find((item) => item.id === evidenceVersionId && item.projectId === project.id && item.caseId === caseRecord.id
    && item.floorId === floor!.id && item.planVersionId === plan.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1"
    && item.has32SectorChakra === true && item.fullColour && item.status === "CURRENT");
  if (!evidence) throw new SpatialWorkflowError("Mapping requires current Founder-confirmed 32-sector marked evidence for this floor and plan.", 409);
  return { state, caseRecord, project, floor: floor!, plan, orientation, evidence };
}

function normalizedCoordinate(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new SpatialWorkflowError(`${label} must be inside the normalized plan boundary from 0 to 1.`);
  return number;
}

export function createOpeningMapping(input: { caseId: unknown; floorId: unknown; planVersionId: unknown; orientationVersionId: unknown; evidenceVersionId: unknown; kind: unknown; markerX: unknown; markerY: unknown; verified: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const context = currentSpatialReferences(input.caseId, input.floorId, input.planVersionId, input.orientationVersionId, input.evidenceVersionId);
  assertExpectedVersion(context.caseRecord.recordVersion, input.expectedRecordVersion);
  const key = idempotencyKey(input.idempotencyKey);
  const retry = context.state.openingMappings.find((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id && item.idempotencyKey === key);
  if (retry) return retry;
  const kind = requiredString(input.kind, "Opening kind", 40) as "MAIN_ENTRANCE" | "ENTRANCE" | "WINDOW";
  if (!["MAIN_ENTRANCE", "ENTRANCE", "WINDOW"].includes(kind)) throw new SpatialWorkflowError("Choose main entrance, entrance, or window.");
  if (input.verified !== true) throw new SpatialWorkflowError("Every entrance or window marker must be deliberately verified before it is saved.");
  if (kind === "MAIN_ENTRANCE" && context.state.openingMappings.some((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id
    && item.planVersionId === context.plan.id && item.orientationVersionId === context.orientation.id && item.kind === "MAIN_ENTRANCE")) {
    throw new SpatialWorkflowError("This floor and plan already has a main entrance marker.", 409);
  }
  const mapping = { id: id("opening"), projectId: context.project.id, caseId: context.caseRecord.id, floorId: context.floor.id,
    planVersionId: context.plan.id, orientationVersionId: context.orientation.id, kind,
    markerX: normalizedCoordinate(input.markerX, "Horizontal marker"), markerY: normalizedCoordinate(input.markerY, "Vertical marker"), verified: true,
    methodologyStatus: "BLOCKED_METHOD_INPUT" as const, evidenceVersionId: context.evidence.id, idempotencyKey: key, createdAt: now() };
  context.state.openingMappings.unshift(mapping);
  if (context.state.evaluationSnapshots.some((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id)
    || context.state.shaktiSnapshots.some((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id)) {
    appendFloorInvalidations({ projectId: context.project.id, caseId: context.caseRecord.id, floorId: context.floor.id,
      causeType: "MAPPING", sourceVersionId: mapping.id, reason: "A verified opening mapping changed after evaluation; dependent floor outputs require regeneration.",
      actor: input.actor, targetTypes: ["UTILITY_EVALUATION", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"] });
  }
  context.caseRecord.recordVersion = (context.caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(context.caseRecord.clientId, input.actor, "32-direction opening marker recorded", `${kind.replaceAll("_", " ")} was verified on ${context.floor.floorLabel}. Direction classification remains blocked until an approved methodology version is selected.`);
  return mapping;
}

export function createSpaceMapping(input: { caseId: unknown; floorId: unknown; planVersionId: unknown; orientationVersionId: unknown; evidenceVersionId: unknown; spaceLabel: unknown; polygon: unknown; verified: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; actor: AppUser }) {
  const context = currentSpatialReferences(input.caseId, input.floorId, input.planVersionId, input.orientationVersionId, input.evidenceVersionId);
  assertExpectedVersion(context.caseRecord.recordVersion, input.expectedRecordVersion);
  const key = idempotencyKey(input.idempotencyKey);
  const retry = context.state.spaceMappings.find((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id && item.idempotencyKey === key);
  if (retry) return retry;
  if (input.verified !== true) throw new SpatialWorkflowError("Every mapped space must be deliberately verified before it is saved.");
  if (!Array.isArray(input.polygon) || input.polygon.length < 3 || input.polygon.length > 200) throw new SpatialWorkflowError("A mapped space needs 3 to 200 verified plan points.");
  const polygon = input.polygon.map((point, index) => {
    if (!point || typeof point !== "object" || Array.isArray(point) || Object.keys(point).some((key) => key !== "x" && key !== "y")) throw new SpatialWorkflowError(`Plan point ${index + 1} is invalid.`);
    const coordinate = point as { x?: unknown; y?: unknown };
    return { x: normalizedCoordinate(coordinate.x, `Point ${index + 1} horizontal position`), y: normalizedCoordinate(coordinate.y, `Point ${index + 1} vertical position`) };
  });
  const mapping = { id: id("space"), projectId: context.project.id, caseId: context.caseRecord.id, floorId: context.floor.id,
    planVersionId: context.plan.id, orientationVersionId: context.orientation.id, spaceLabel: requiredString(input.spaceLabel, "Space label", 120),
    polygon, verified: true, evidenceVersionId: context.evidence.id, methodologyStatus: "BLOCKED_METHOD_INPUT" as const,
    idempotencyKey: key, createdAt: now() };
  context.state.spaceMappings.unshift(mapping);
  if (context.state.evaluationSnapshots.some((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id)
    || context.state.shaktiSnapshots.some((item) => item.caseId === context.caseRecord.id && item.floorId === context.floor.id)) {
    appendFloorInvalidations({ projectId: context.project.id, caseId: context.caseRecord.id, floorId: context.floor.id,
      causeType: "MAPPING", sourceVersionId: mapping.id, reason: "A verified space mapping changed after evaluation; dependent floor outputs require regeneration.",
      actor: input.actor, targetTypes: ["UTILITY_EVALUATION", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"] });
  }
  context.caseRecord.recordVersion = (context.caseRecord.recordVersion ?? 0) + 1;
  appendTimeline(context.caseRecord.clientId, input.actor, "16-direction space recorded", `${mapping.spaceLabel} was verified on ${context.floor.floorLabel}. Direction classification remains blocked until an approved methodology version is selected.`);
  return mapping;
}

export function getSpatialEvaluationBlockers(caseId: string) {
  const state = getAppState();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord?.projectId) return ["Create the project and its floor workspaces before spatial evaluation."];
  const floors = state.floorWorkspaces.filter((item) => item.caseId === caseId && item.projectId === caseRecord.projectId);
  const orientation = state.orientationVersions.find((item) => item.caseId === caseId && item.projectId === caseRecord.projectId && item.status === "LOCKED");
  const blockers: string[] = [];
  if (!orientation) blockers.push("Lock an exact orientation version using current Google Earth evidence.");
  for (const floor of floors) {
    const plan = state.planVersions.find((item) => item.caseId === caseId && item.floorId === floor.id && item.status === "CURRENT");
    if (!plan) { blockers.push(`Add a current plan version for ${floor.floorLabel}.`); continue; }
    const evidence = state.spatialEvidenceVersions.find((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id && item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour);
    if (!evidence) blockers.push(`Add current full-colour hand-marked evidence for ${floor.floorLabel}.`);
    const marked32DEvidence = state.spatialEvidenceVersions.find((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id
      && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT" && item.fullColour);
    if (!marked32DEvidence) blockers.push(`Add Founder-confirmed 32-sector chakra evidence for ${floor.floorLabel}.`);
    const marked16DEvidence = state.spatialEvidenceVersions.find((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id
      && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1" && item.has16DirectionMapping === true && item.status === "CURRENT" && item.fullColour);
    if (!marked16DEvidence) blockers.push(`Add Founder-confirmed 16-direction marked mapping for ${floor.floorLabel}.`);
    if (orientation && !state.openingMappings.some((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id && item.kind === "MAIN_ENTRANCE" && item.verified)) blockers.push(`Verify the main entrance on ${floor.floorLabel}.`);
    if (orientation && state.openingMappings.some((item) => item.caseId === caseId && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id && !item.verified)) blockers.push(`Verify every opening on ${floor.floorLabel}.`);
  }
  if (state.dependencyInvalidations.some((item) => item.caseId === caseId && openRegenerationStatuses.includes(item.status as typeof openRegenerationStatuses[number]))) blockers.push("Regenerate stale spatial mappings and evaluations after the upstream change.");
  return blockers;
}
