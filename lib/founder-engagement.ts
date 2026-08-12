import type { AppState } from "./store.ts";
import type { AppUser, CommunicationChannel, FounderReviewBookingRecord, QualificationKind, VastuServiceType } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { APPROVED_QUALIFICATION_DEFINITIONS } from "./qualification-form-definitions.ts";
import { renderFounderTemplate, type FounderTemplateKey, type TemplateValues } from "./founder-communication-templates.ts";
import { APPROVED_FOUNDER_ASSETS, validateApprovedAssetMetadata } from "./founder-media-manifest.ts";

export class FounderEngagementError extends Error { statusCode: number; constructor(statusCode: number, message: string) { super(message); this.statusCode = statusCode; } }
function fail(status: number, message: string): never { throw new FounderEngagementError(status, message); }
const nowIso = (now = new Date()) => now.toISOString();
const uuid = () => crypto.randomUUID();
const safeIdempotency = (value: string) => { if (!/^[A-Za-z0-9:_-]{8,160}$/.test(value)) fail(428, "A bounded idempotency key is required."); return value; };
const hashText = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");

export function assertConfiguredFounder(actor: AppUser, founderUserId: string, organisationId: string) {
  if (actor.id !== founderUserId || actor.organisationId !== organisationId || actor.organisationCapability !== "organisation_owner") fail(403, "Only the configured Founder owner can perform this action.");
}

export function validateApprovedAssetDryRun(input: { actor: AppUser; founderUserId: string; organisationId: string; assetKey: string; filename: string; sizeBytes: number; pageCount: number; checksumSha256: string; mimeType?: string }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId);
  const manifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === input.assetKey);
  if (!manifest) fail(404, "Approved asset manifest entry not found.");
  if (input.filename !== manifest.filename) fail(400, "The selected filename does not match the approved immutable asset version.");
  validateApprovedAssetMetadata({ key: manifest.key, checksumSha256: input.checksumSha256, sizeBytes: input.sizeBytes, pageCount: input.pageCount, mimeType: input.mimeType ?? manifest.mimeType });
  return { ok: true as const, dryRun: true as const, assetKey: manifest.key, filename: manifest.filename, sizeBytes: manifest.sizeBytes, pageCount: manifest.pageCount, checksumSha256: manifest.checksumSha256, bytesStored: false as const };
}

export function registerMediaAssetVersion(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; assetKey: string; privateObjectKey: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId); safeIdempotency(input.idempotencyKey);
  const manifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === input.assetKey);
  if (!manifest) fail(404, "Approved asset manifest entry not found.");
  if (!input.privateObjectKey || /^(https?:|data:|\/)/i.test(input.privateObjectKey)) fail(400, "Use an opaque private storage key, never a URL or path.");
  const registrationHash = deterministicContentHash({ assetKey: input.assetKey, privateObjectKey: input.privateObjectKey });
  const replay = input.state.mediaAssetVersions.find((item) => item.organisationId === input.organisationId && item.reason === `registration:${input.idempotencyKey}`);
  if (replay) { if (replay.registrationHash !== registrationHash) fail(409, "This idempotency key was already used for different media registration content."); return { asset: input.state.mediaAssets.find((item) => item.id === replay.assetId)!, version: replay, replayed: true }; }
  const existing = input.state.mediaAssets.find((item) => item.organisationId === input.organisationId && item.id === `media:${manifest.key.toLowerCase()}`);
  if (input.expectedRecordVersion === undefined) fail(428, "The latest media record version is required.");
  if ((existing?.recordVersion ?? 0) !== input.expectedRecordVersion) fail(409, "The media library changed. Reload before registering this version.");
  const asset = existing ?? { id: `media:${manifest.key.toLowerCase()}`, organisationId: input.organisationId, category: manifest.category, audience: manifest.audience ?? "CLIENT_SENDABLE" as const, serviceApplicability: manifest.serviceApplicability, title: manifest.title, description: "Approved immutable Founder Media Library asset.", tags: ["approved-source", manifest.key.toLowerCase()], createdAt: nowIso(), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  if (!existing) input.state.mediaAssets.push(asset);
  const prior = input.state.mediaAssetVersions.filter((item) => item.assetId === asset.id).sort((a,b) => b.version-a.version)[0];
  const version = { id: uuid(), organisationId: input.organisationId, assetId: asset.id, version: (prior?.version ?? 0) + 1, filename: manifest.filename, privateObjectKey: input.privateObjectKey, mimeType: manifest.mimeType, sizeBytes: manifest.sizeBytes, checksumSha256: manifest.checksumSha256, pageCount: manifest.pageCount, status: "DRAFT" as const, clientSendable: manifest.clientSendable, statutoryPurpose: manifest.statutoryPurpose, widthPixels: manifest.widthPixels, heightPixels: manifest.heightPixels, hasAlphaChannel: manifest.hasAlphaChannel, brandRole: manifest.brandRole, uploadedByActorUserId: input.actor.id, uploadedAt: nowIso(), supersedesVersionId: prior?.id, reason: `registration:${input.idempotencyKey}`, registrationHash, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  input.state.mediaAssetVersions.push(version); return { asset, version, replayed: false };
}

export function transitionMediaAssetVersion(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; versionId: string; target: "FOUNDER_APPROVED" | "ACTIVE" | "SUPERSEDED" | "ARCHIVED"; expectedRecordVersion?: number; reason: string }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId);
  const version = input.state.mediaAssetVersions.find((item) => item.id === input.versionId && item.organisationId === input.organisationId);
  if (!version) fail(404, "Media asset version not found.");
  if (input.expectedRecordVersion === undefined) fail(428, "The latest media version is required.");
  if (version.recordVersion !== input.expectedRecordVersion) fail(409, "The media asset changed. Reload before retrying.");
  if (!input.reason.trim()) fail(400, "A reason is required.");
  const allowed: Record<string, string[]> = { DRAFT: ["FOUNDER_APPROVED"], FOUNDER_APPROVED: ["ACTIVE"], ACTIVE: ["SUPERSEDED", "ARCHIVED"], SUPERSEDED: ["ARCHIVED"], ARCHIVED: [] };
  if (!allowed[version.status]?.includes(input.target)) fail(409, "That immutable media lifecycle transition is not allowed.");
  version.status = input.target; version.recordVersion += 1; version.updatedByActorUserId = input.actor.id;
  if (input.target === "FOUNDER_APPROVED") { version.approvedAt = nowIso(); version.approvedByActorUserId = input.actor.id; }
  if (input.target === "ACTIVE") { version.activatedAt = nowIso(); version.activatedByActorUserId = input.actor.id; const asset = input.state.mediaAssets.find((item) => item.id === version.assetId)!; const old = input.state.mediaAssetVersions.find((item) => item.id === asset.activeVersionId); if (old && old.id !== version.id) { old.status = "SUPERSEDED"; old.supersededByVersionId = version.id; old.recordVersion = (old.recordVersion ?? 0) + 1; } asset.activeVersionId = version.id; asset.recordVersion = (asset.recordVersion ?? 0) + 1; }
  return version;
}

export function updateCanonicalLeadProfile(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; leadId: string; expectedRecordVersion?: number; idempotencyKey: string; reason: string; changes: Partial<{ fullName: string; email: string; phone: string; city: string; country: string; timeZone: string; serviceInterest: VastuServiceType }> }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId); safeIdempotency(input.idempotencyKey);
  const allowed = new Set(["fullName", "email", "phone", "city", "country", "timeZone", "serviceInterest"]);
  if (Object.keys(input.changes).some((key) => !allowed.has(key))) fail(400, "The profile update contains an unsupported field.");
  const requestHash = deterministicContentHash({ leadId: input.leadId, reason: input.reason.trim(), changes: input.changes });
  const replay = input.state.leadProfileVersions.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  const lead = input.state.optInLeads.find((item) => item.id === input.leadId && item.organisationId === input.organisationId);
  if (!lead) fail(404, "Lead not found.");
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was already used for different profile changes."); return { replayed: true, version: replay, lead }; }
  if (input.expectedRecordVersion === undefined) fail(428, "The latest lead version is required.");
  if ((lead.recordVersion ?? 0) !== input.expectedRecordVersion) fail(409, "The lead changed. Reload before saving.");
  if (!input.reason.trim()) fail(400, "A private reason is required for profile changes.");
  const prior = { fullName: lead.fullName, email: lead.email, phone: lead.phone, city: lead.city, country: lead.country, timeZone: lead.timeZone, primaryServiceInterest: lead.serviceInterest };
  const next = { ...prior, ...input.changes };
  if (!next.fullName?.trim() || (!next.email?.trim() && !next.phone?.trim())) fail(400, "Name and at least one contact are required.");
  if (next.timeZone) { try { new Intl.DateTimeFormat("en", { timeZone: next.timeZone }).format(); } catch { fail(400, "Choose a valid IANA time zone."); } }
  Object.assign(lead, input.changes, { updatedByActorUserId: input.actor.id, recordVersion: (lead.recordVersion ?? 0) + 1 });
  const client = input.state.clients.find((item) => item.id === (lead.convertedClientId ?? lead.uniqueClientId) && item.organisationId === input.organisationId);
  if (client) Object.assign(client, { displayName: lead.fullName, email: lead.email, phone: lead.phone, city: lead.city, updatedByActorUserId: input.actor.id, recordVersion: (client.recordVersion ?? 0) + 1 });
  const version = { id: uuid(), organisationId: input.organisationId, leadId: lead.id, clientId: client?.id, version: input.state.leadProfileVersions.filter((item) => item.leadId === lead.id).length + 1, canonicalSnapshot: next, priorSnapshotHash: deterministicContentHash(prior), snapshotHash: deterministicContentHash(next), requestHash, reason: input.reason.trim(), actorUserId: input.actor.id, createdAt: nowIso(), idempotencyKey: input.idempotencyKey, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  input.state.leadProfileVersions.push(version);
  return { replayed: false, version, lead };
}

export async function createSecureGrant(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; purpose: "BROCHURE" | "QUALIFICATION_PDF" | "QUALIFICATION_FORM" | "BOOKING_RESPONSE"; leadId: string; clientId?: string; assetVersionId?: string; formDefinitionId?: string; bookingId?: string; days: 14 | 30; rotateGrantId?: string; now?: Date }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId);
  const now = input.now ?? new Date();
  const reusable = input.state.secureAccessGrants.find((grant) => grant.organisationId === input.organisationId && grant.leadId === input.leadId && grant.purpose === input.purpose && !grant.revokedAt && new Date(grant.expiresAt) > now && grant.assetVersionId === input.assetVersionId && grant.formDefinitionId === input.formDefinitionId && grant.bookingId === input.bookingId);
  if (reusable && !input.rotateGrantId) return { grant: reusable, token: undefined, reused: true };
  const token = `${uuid().replaceAll("-", "")}${uuid().replaceAll("-", "")}`;
  const grant = { id: uuid(), organisationId: input.organisationId, purpose: input.purpose, leadId: input.leadId, clientId: input.clientId, assetVersionId: input.assetVersionId, formDefinitionId: input.formDefinitionId, bookingId: input.bookingId, tokenHash: await hashText(token), expiresAt: new Date(now.getTime() + input.days * 86400000).toISOString(), createdAt: now.toISOString(), createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  if (input.rotateGrantId) { const old = input.state.secureAccessGrants.find((item) => item.id === input.rotateGrantId && item.organisationId === input.organisationId); if (!old) fail(404, "Secure link not found."); old.revokedAt = now.toISOString(); old.replacedByGrantId = grant.id; old.recordVersion = (old.recordVersion ?? 0) + 1; }
  input.state.secureAccessGrants.push(grant); return { grant, token, reused: false };
}

export async function resolveSecureGrant(state: AppState, token: string, purpose: string, now = new Date()) {
  const tokenHash = await hashText(token);
  const grant = state.secureAccessGrants.find((item) => item.tokenHash === tokenHash && item.purpose === purpose);
  if (!grant || grant.revokedAt || new Date(grant.expiresAt) <= now) fail(404, "This secure link is unavailable or has expired.");
  if (!grant.openedAt) { grant.openedAt = now.toISOString(); grant.recordVersion = (grant.recordVersion ?? 0) + 1; }
  return grant;
}

export async function prepareManualCommunication(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; leadId: string; clientId?: string; prospectiveProjectIds?: string[]; templateKey: FounderTemplateKey; values: TemplateValues; channel: CommunicationChannel; recipient: string; assetVersionIds?: string[]; formDefinitionId?: string; bookingId?: string; grantIds?: string[]; renderedTimeZoneSnapshot?: string; manualNote?: string; idempotencyKey: string; expectedRecordVersion?: number }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId); safeIdempotency(input.idempotencyKey);
  const rendered = renderFounderTemplate(input.templateKey, input.values);
  const content = input.channel === "WHATSAPP" ? rendered.whatsapp : `${rendered.emailSubject}\n\n${rendered.email}`;
  const recipientHash = await hashText(input.recipient.trim().toLowerCase());
  const renderedContentHash = await hashText(content);
  const requestHash = deterministicContentHash({ leadId: input.leadId, clientId: input.clientId, prospectiveProjectIds: input.prospectiveProjectIds ?? [], templateKey: input.templateKey, channel: input.channel, recipientHash, renderedContentHash, assetVersionIds: input.assetVersionIds ?? [], formDefinitionId: input.formDefinitionId, bookingId: input.bookingId, grantIds: input.grantIds ?? [], renderedTimeZoneSnapshot: input.renderedTimeZoneSnapshot, manualNote: input.manualNote?.trim() });
  const replay = input.state.communicationPreparations.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was already used for different communication content."); return { replayed: true, record: replay, rendered }; }
  const lead = input.state.optInLeads.find((item) => item.id === input.leadId && item.organisationId === input.organisationId);
  if (!lead) fail(404, "Lead not found.");
  if (input.expectedRecordVersion === undefined) fail(428, "The latest lead version is required.");
  if ((lead.recordVersion ?? 0) !== input.expectedRecordVersion) fail(409, "The lead changed. Reload before preparing communication.");
  for (const versionId of input.assetVersionIds ?? []) {
    const version = input.state.mediaAssetVersions.find((item) => item.id === versionId && item.organisationId === input.organisationId);
    if (!version || version.status !== "ACTIVE" || !version.clientSendable) fail(409, "Only an active Founder-approved client-sendable asset can be prepared.");
  }
  const record = { id: uuid(), organisationId: input.organisationId, leadId: input.leadId, clientId: input.clientId, prospectiveProjectIds: input.prospectiveProjectIds ?? [], templateKey: input.templateKey, templateVersion: 1, channel: input.channel, state: "PREPARED" as const, recipientHash, renderedContentHash, assetVersionIds: input.assetVersionIds ?? [], formDefinitionId: input.formDefinitionId, bookingId: input.bookingId, grantIds: input.grantIds ?? [], renderedTimeZoneSnapshot: input.renderedTimeZoneSnapshot, manualNote: input.manualNote?.trim(), preparedAt: nowIso(), actorUserId: input.actor.id, idempotencyKey: input.idempotencyKey, requestHash, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  input.state.communicationPreparations.push(record); return { replayed: false, record, rendered };
}

export function markCommunicationOpened(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; preparationId: string; expectedRecordVersion?: number }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId);
  const record = input.state.communicationPreparations.find((item) => item.id === input.preparationId && item.organisationId === input.organisationId);
  if (!record) fail(404, "Prepared communication not found.");
  if (input.expectedRecordVersion === undefined) fail(428, "The latest communication version is required.");
  if (record.recordVersion !== input.expectedRecordVersion) fail(409, "The communication state changed. Reload before retrying.");
  if (record.state === "OPENED") return record;
  record.state = "OPENED"; record.openedAt = nowIso(); record.recordVersion = (record.recordVersion ?? 0) + 1; return record;
}

export async function createQualificationInvitation(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; leadId: string; clientId: string; kind: QualificationKind; selectedServices: Array<"RESIDENTIAL" | "COMMERCIAL">; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId); safeIdempotency(input.idempotencyKey);
  const requestHash = deterministicContentHash({ leadId: input.leadId, clientId: input.clientId, kind: input.kind, selectedServices: input.selectedServices });
  const replay = input.state.qualificationInvitations.find((item) => item.organisationId === input.organisationId && item.id === `qualification-invite:${input.idempotencyKey}`);
  if (replay) { if (replay.requestHash !== requestHash) fail(409, "This idempotency key was already used for a different qualification invitation."); return { invitation: replay, token: undefined, replayed: true }; }
  const lead = input.state.optInLeads.find((item) => item.id === input.leadId && item.organisationId === input.organisationId);
  const client = input.state.clients.find((item) => item.id === input.clientId && (!item.organisationId || item.organisationId === input.organisationId));
  if (!lead || !client || ![lead.convertedClientId, lead.uniqueClientId].includes(client.id)) fail(404, "The lead and permanent Client ID do not share this organisation scope.");
  client.organisationId ??= input.organisationId;
  if (input.expectedRecordVersion === undefined) fail(428, "The latest lead version is required.");
  if ((lead.recordVersion ?? 0) !== input.expectedRecordVersion) fail(409, "The lead changed. Reload before preparing the qualification form.");
  if (!input.selectedServices.length || input.selectedServices.length > 2 || new Set(input.selectedServices).size !== input.selectedServices.length) fail(400, "Select one or two distinct service interests.");
  if (input.kind === "RESIDENTIAL" && (input.selectedServices.length !== 1 || input.selectedServices[0] !== "RESIDENTIAL")) fail(409, "The selected services do not match the Residential form.");
  if (input.kind === "COMMERCIAL" && (input.selectedServices.length !== 1 || input.selectedServices[0] !== "COMMERCIAL")) fail(409, "The selected services do not match the Commercial form.");
  const definitionSeed = APPROVED_QUALIFICATION_DEFINITIONS[input.kind];
  const sourceAsset = input.state.mediaAssets.find((item) => item.id === `media:${definitionSeed.sourceAssetVersionId.toLowerCase()}` && item.organisationId === input.organisationId);
  const sourceAssetVersion = input.state.mediaAssetVersions.find((item) => item.id === sourceAsset?.activeVersionId && item.status === "ACTIVE" && item.clientSendable && item.checksumSha256 === definitionSeed.sourceChecksumSha256);
  if (!sourceAssetVersion) fail(409, "Activate the exact approved qualification PDF before creating an invitation.");
  let definition = input.state.qualificationFormDefinitions.find((item) => item.id === definitionSeed.id && item.organisationId === input.organisationId);
  if (!definition) { definition = { ...structuredClone(definitionSeed), organisationId: input.organisationId, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 }; input.state.qualificationFormDefinitions.push(definition); }
  if (definition.status !== "ACTIVE") fail(409, "Only the active Founder-approved qualification definition can be sent.");
  const now = input.now ?? new Date();
  const grantResult = await createSecureGrant({ state: input.state, actor: input.actor, founderUserId: input.founderUserId, organisationId: input.organisationId, purpose: "QUALIFICATION_FORM", leadId: input.leadId, clientId: input.clientId, formDefinitionId: definition.id, days: 14, now });
  const invitation = { id: `qualification-invite:${input.idempotencyKey}`, organisationId: input.organisationId, leadId: input.leadId, clientId: input.clientId, formDefinitionId: definition.id, grantId: grantResult.grant.id, status: "OPEN" as const, selectedServices: [...input.selectedServices], createdAt: now.toISOString(), expiresAt: grantResult.grant.expiresAt, requestHash, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 };
  input.state.qualificationInvitations.push(invitation);
  return { invitation, token: grantResult.token, replayed: false };
}

export async function resolveQualificationInvitation(state: AppState, token: string, now = new Date()) {
  const grant = await resolveSecureGrant(state, token, "QUALIFICATION_FORM", now);
  const invitation = state.qualificationInvitations.find((item) => item.grantId === grant.id && item.organisationId === grant.organisationId);
  if (!invitation || invitation.status !== "OPEN") fail(404, "This qualification invitation is unavailable.");
  const definition = state.qualificationFormDefinitions.find((item) => item.id === invitation.formDefinitionId && item.organisationId === invitation.organisationId && item.status === "ACTIVE");
  if (!definition) fail(409, "The approved qualification form version is unavailable.");
  const latestResponse = state.qualificationResponseVersions.filter((item) => item.invitationId === invitation.id).sort((a,b) => b.version-a.version)[0];
  return { invitation, definition, latestResponse };
}

export function saveQualificationResponse(input: { state: AppState; invitationId: string; answers: Record<string, unknown>; selectedServices: Array<"RESIDENTIAL" | "COMMERCIAL">; submit: boolean; expectedRecordVersion: number; now?: Date }) {
  const invitation = input.state.qualificationInvitations.find((item) => item.id === input.invitationId);
  if (!invitation || invitation.status !== "OPEN" || new Date(invitation.expiresAt) <= (input.now ?? new Date())) fail(404, "This qualification invitation is unavailable.");
  if (invitation.recordVersion !== input.expectedRecordVersion) fail(409, "The form changed. Reload before saving.");
  const definition = input.state.qualificationFormDefinitions.find((item) => item.id === invitation.formDefinitionId && item.status === "ACTIVE") ?? Object.values(APPROVED_QUALIFICATION_DEFINITIONS).find((item) => item.id === invitation.formDefinitionId);
  if (!definition) fail(409, "The approved form version is unavailable.");
  const allowed = new Set(definition.questions.map((question) => question.id));
  if (Object.keys(input.answers).some((key) => !allowed.has(key))) fail(400, "The response contains a question from another form version.");
  const selectedPrefixes = input.selectedServices.map((service) => `${service.toLowerCase()}.`);
  const applicableQuestions = definition.questions.filter((question) => question.shared || selectedPrefixes.some((prefix) => question.id.startsWith(prefix)) || definition.kind !== "HYBRID");
  if (input.submit) { const missing = applicableQuestions.filter((question) => question.required && (input.answers[question.id] === undefined || input.answers[question.id] === "" || input.answers[question.id] === false)); if (missing.length) fail(400, "Complete every required approved question before submitting."); }
  if (!input.selectedServices.length || input.selectedServices.length > 2 || new Set(input.selectedServices).size !== input.selectedServices.length) fail(400, "Select one or two distinct service interests.");
  const permittedServices = definition.kind === "HYBRID" ? new Set(["RESIDENTIAL", "COMMERCIAL"] as const) : new Set(invitation.selectedServices);
  if (input.selectedServices.some((service) => !permittedServices.has(service))) fail(409, "This secure form was not issued for the selected service scope.");
  if (!input.selectedServices.includes(invitation.selectedServices[0])) fail(409, "The primary service selected for this invitation cannot be removed.");
  const prior = input.state.qualificationResponseVersions.filter((item) => item.invitationId === invitation.id).sort((a,b) => b.version-a.version)[0];
  if (prior?.status === "SUBMITTED") fail(409, "Submitted responses are immutable; create a correction version.");
  const response = prior ?? { id: uuid(), organisationId: invitation.organisationId, invitationId: invitation.id, clientId: invitation.clientId, formDefinitionId: invitation.formDefinitionId, version: 1, status: "DRAFT" as const, answers: {}, answersHash: "", selectedServices: [], secondaryInterestSelected: false, sourceQuestionIds: [], savedAt: nowIso(input.now), recordVersion: 0 };
  Object.assign(response, { answers: structuredClone(input.answers), answersHash: deterministicContentHash(input.answers), selectedServices: [...input.selectedServices], secondaryInterestSelected: input.selectedServices.length === 2, sourceQuestionIds: Object.keys(input.answers), savedAt: nowIso(input.now), status: input.submit ? "SUBMITTED" : "DRAFT", submittedAt: input.submit ? nowIso(input.now) : undefined, recordVersion: response.recordVersion + 1 });
  if (!prior) input.state.qualificationResponseVersions.push(response);
  invitation.recordVersion += 1;
  if (input.submit) { invitation.status = "SUBMITTED"; invitation.submittedAt = nowIso(input.now); for (const kind of input.selectedServices) { if (!input.state.prospectiveProjects.some((item) => item.responseVersionId === response.id && item.kind === kind)) input.state.prospectiveProjects.push({ id: uuid(), organisationId: invitation.organisationId, clientId: invitation.clientId, leadId: invitation.leadId, responseVersionId: response.id, kind, status: "QUALIFICATION_SUBMITTED", createdAt: nowIso(input.now), recordVersion: 1 }); } }
  return response;
}

export function assignReviewCall(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; responseVersionId: string; startsAt: string; timeZone: string; confirmationGrantId: string; idempotencyKey: string; expectedRecordVersion: number; now?: Date }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId); safeIdempotency(input.idempotencyKey);
  const assignmentHash = deterministicContentHash({ responseVersionId: input.responseVersionId, startsAt: input.startsAt, timeZone: input.timeZone, confirmationGrantId: input.confirmationGrantId });
  const replay = input.state.founderReviewBookings.find((item) => item.organisationId === input.organisationId && item.idempotencyKey === input.idempotencyKey);
  if (replay) {
    if (replay.assignmentHash !== assignmentHash) fail(409, "This idempotency key was already used for a different Review Call assignment.");
    return replay;
  }
  const response = input.state.qualificationResponseVersions.find((item) => item.id === input.responseVersionId && item.organisationId === input.organisationId && item.status === "SUBMITTED");
  if (!response) fail(409, "A completed qualification response is required before booking.");
  if (input.expectedRecordVersion === undefined) fail(428, "The latest qualification version is required.");
  if (response.recordVersion !== input.expectedRecordVersion) fail(409, "The qualification changed. Reload before assigning a Review Call.");
  try { new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format(); } catch { fail(400, "Choose a valid IANA time zone."); }
  const start = new Date(input.startsAt); if (Number.isNaN(start.getTime())) fail(400, "Choose a valid absolute start time.");
  const occupiedEnd = start.getTime() + 45 * 60000;
  const overlap = input.state.founderReviewBookings.some((item) => item.organisationId === input.organisationId && item.status !== "CANCELLED" && start.getTime() < new Date(item.startsAt).getTime() + 45 * 60000 && occupiedEnd > new Date(item.startsAt).getTime());
  if (overlap) fail(409, "This 45-minute appointment window overlaps another Review Call.");
  const isIndia = input.timeZone === "Asia/Kolkata";
  const timeFormat = (timeZone: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" }).format(start);
  const renderedClientTime = timeFormat(input.timeZone);
  const renderedIstTime = isIndia ? undefined : timeFormat("Asia/Kolkata");
  const projects = input.state.prospectiveProjects.filter((item) => item.responseVersionId === response.id).map((item) => item.id);
  const booking: FounderReviewBookingRecord = { id: uuid(), organisationId: input.organisationId, clientId: response.clientId, prospectiveProjectIds: projects, responseVersionId: response.id, formDefinitionId: response.formDefinitionId, startsAt: start.toISOString(), timeZone: input.timeZone, durationMinutes: 30, bufferMinutes: 15, renderedClientTime, renderedIstTime, status: "ASSIGNED", confirmationGrantId: input.confirmationGrantId, assignedByActorUserId: input.actor.id, assignedAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, assignmentHash, recordVersion: 1 };
  input.state.founderReviewBookings.push(booking); return booking;
}

export function respondToBooking(input: { state: AppState; bookingId: string; action: "CONFIRM_THIS_TIME" | "REQUEST_ANOTHER_TIME"; now?: Date }) {
  const booking = input.state.founderReviewBookings.find((item) => item.id === input.bookingId); if (!booking) fail(404, "Booking not found.");
  const now = input.now ?? new Date();
  if (input.action === "REQUEST_ANOTHER_TIME") { if (new Date(booking.startsAt).getTime() - now.getTime() <= 12 * 3600000) fail(409, "The self-service rescheduling window is closed. Contact Uchit directly."); booking.status = "RESCHEDULE_REQUESTED"; booking.recordVersion += 1; return booking; }
  if (booking.status !== "ASSIGNED") fail(409, "This booking cannot be confirmed in its current state."); booking.status = "CLIENT_CONFIRMED"; booking.confirmedAt = now.toISOString(); booking.recordVersion += 1; return booking;
}

export function rescheduleReviewCall(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; bookingId: string; startsAt: string; timeZone: string; confirmationGrantId: string; reason: string; idempotencyKey: string; expectedRecordVersion?: number; now?: Date }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId); safeIdempotency(input.idempotencyKey);
  const prior = input.state.founderReviewBookings.find((item) => item.id === input.bookingId && item.organisationId === input.organisationId);
  if (!prior) fail(404, "Review Call not found.");
  if (input.expectedRecordVersion === undefined) fail(428, "The latest Review Call version is required.");
  if (prior.recordVersion !== input.expectedRecordVersion) fail(409, "The Review Call changed. Reload before rescheduling.");
  if (!input.reason.trim()) fail(400, "A reason is required to reschedule a Review Call.");
  const response = input.state.qualificationResponseVersions.find((item) => item.id === prior.responseVersionId && item.organisationId === input.organisationId);
  if (!response) fail(409, "The bound qualification response is unavailable.");
  const priorStatus = prior.status;
  prior.status = "CANCELLED";
  let successor: FounderReviewBookingRecord;
  try {
    successor = assignReviewCall({ state: input.state, actor: input.actor, founderUserId: input.founderUserId, organisationId: input.organisationId, responseVersionId: response.id, startsAt: input.startsAt, timeZone: input.timeZone, confirmationGrantId: input.confirmationGrantId, idempotencyKey: input.idempotencyKey, expectedRecordVersion: response.recordVersion, now: input.now });
  } catch (error) {
    prior.status = priorStatus;
    throw error;
  }
  prior.reason = input.reason.trim(); prior.recordVersion += 1;
  successor.priorBookingId = prior.id; successor.reason = input.reason.trim();
  for (const task of input.state.founderReminderTasks.filter((item) => item.bookingId === prior.id && !["SKIPPED", "CANCELLED"].includes(item.status))) { task.status = "CANCELLED"; task.recordVersion += 1; }
  for (const binding of input.state.zoomMeetingBindings.filter((item) => item.bookingId === prior.id && item.status === "ACTIVE")) { binding.status = "RETIRED"; binding.retiredAt = nowIso(input.now); binding.recordVersion += 1; }
  return successor;
}

export function cancelReviewCall(input: { state: AppState; actor: AppUser; founderUserId: string; organisationId: string; bookingId: string; reason: string; expectedRecordVersion?: number; now?: Date }) {
  assertConfiguredFounder(input.actor, input.founderUserId, input.organisationId);
  const booking = input.state.founderReviewBookings.find((item) => item.id === input.bookingId && item.organisationId === input.organisationId);
  if (!booking) fail(404, "Review Call not found.");
  if (input.expectedRecordVersion === undefined) fail(428, "The latest Review Call version is required.");
  if (booking.recordVersion !== input.expectedRecordVersion) fail(409, "The Review Call changed. Reload before cancelling.");
  if (!input.reason.trim()) fail(400, "A reason is required to cancel a Review Call.");
  booking.status = "CANCELLED"; booking.reason = input.reason.trim(); booking.recordVersion += 1;
  for (const task of input.state.founderReminderTasks.filter((item) => item.bookingId === booking.id && !["SKIPPED", "CANCELLED"].includes(item.status))) { task.status = "CANCELLED"; task.recordVersion += 1; }
  for (const binding of input.state.zoomMeetingBindings.filter((item) => item.bookingId === booking.id && item.status === "ACTIVE")) { binding.status = "RETIRED"; binding.retiredAt = nowIso(input.now); binding.recordVersion += 1; }
  return booking;
}

export const FOUNDER_REVIEW_CALL_ZOOM_HOST = "iyogesh2020@gmail.com" as const;
export const FOUNDER_REVIEW_CALL_ZOOM_SCOPES = ["meeting:write:admin", "meeting:read:admin", "user:read:admin"] as const;
export type ZoomConnector = { createUniqueMeeting(input: { bookingId: string; startsAt: string; durationMinutes: number; hostUserEmail: typeof FOUNDER_REVIEW_CALL_ZOOM_HOST; idempotencyKey: string }): Promise<{ providerMeetingId: string; privateJoinMetadataCiphertext: string }>; retireMeeting?(providerMeetingId: string): Promise<void> };
export async function setupZoomMeeting(input: { state: AppState; bookingId: string; connector?: ZoomConnector; idempotencyKey: string; now?: Date }) {
  safeIdempotency(input.idempotencyKey); const booking = input.state.founderReviewBookings.find((item) => item.id === input.bookingId); if (!booking) fail(404, "Booking not found.");
  const replay = input.state.zoomMeetingBindings.find((item) => item.bookingId === booking.id && item.idempotencyKey === input.idempotencyKey && item.status === "ACTIVE"); if (replay) return replay;
  if (booking.status !== "CLIENT_CONFIRMED" && booking.status !== "MEETING_SETUP_FAILED") fail(409, "Client confirmation is required before Zoom setup.");
  if (!input.connector) { booking.status = "MEETING_SETUP_FAILED"; booking.recordVersion += 1; fail(503, "Zoom is not configured. Client confirmation is preserved for retry."); }
  try { const created = await input.connector.createUniqueMeeting({ bookingId: booking.id, startsAt: booking.startsAt, durationMinutes: 30, hostUserEmail: FOUNDER_REVIEW_CALL_ZOOM_HOST, idempotencyKey: input.idempotencyKey }); const binding = { id: uuid(), organisationId: booking.organisationId, bookingId: booking.id, provider: "ZOOM" as const, providerMeetingId: created.providerMeetingId, privateJoinMetadataCiphertext: created.privateJoinMetadataCiphertext, hostUserEmail: FOUNDER_REVIEW_CALL_ZOOM_HOST, oauthMode: "SERVER_TO_SERVER_OAUTH" as const, scopeSnapshot: [...FOUNDER_REVIEW_CALL_ZOOM_SCOPES], status: "ACTIVE" as const, createdAt: nowIso(input.now), idempotencyKey: input.idempotencyKey, recordVersion: 1 }; input.state.zoomMeetingBindings.push(binding); booking.status = "CONFIRMED"; booking.recordVersion += 1; scheduleReminderTasks(input.state, booking, input.now); return binding; } catch { booking.status = "MEETING_SETUP_FAILED"; booking.recordVersion += 1; fail(503, "Zoom meeting setup failed. Confirmation is preserved; retry safely."); }
}

export function scheduleReminderTasks(state: AppState, booking: FounderReviewBookingRecord, now = new Date()) {
  for (const [threshold, hours, templateKey] of [["24H", 24, "REMINDER_24H"], ["2H", 2, "REMINDER_2H"]] as const) { const dueAt = new Date(new Date(booking.startsAt).getTime() - hours * 3600000); state.founderReminderTasks.push({ id: uuid(), organisationId: booking.organisationId, bookingId: booking.id, threshold, dueAt: dueAt.toISOString(), status: dueAt <= now ? "SKIPPED" : "PENDING", whatsappState: "NOT_PREPARED", emailState: "NOT_PREPARED", templateKey, templateVersion: 1, createdAt: now.toISOString(), recordVersion: 1 }); }
}
