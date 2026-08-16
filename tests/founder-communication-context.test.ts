import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import type { AppUser } from "../lib/domain.ts";
import { APPROVED_FOUNDER_ASSETS } from "../lib/founder-media-manifest.ts";
import { createFounderCommunicationContext, FounderEngagementError, registerMediaAssetVersion, resolveSecureGrant, transitionMediaAssetVersion } from "../lib/founder-engagement.ts";

const org = "org-communication-context";
const founder: AppUser = { id: "yogesh-owner", fullName: "Yogesh Hora", email: "iyogesh2020@gmail.com", role: "SUPER_ADMIN", color: "#111111", organisationId: org, organisationCapability: "organisation_owner" };
const stateWithLead = () => {
  const state = createEmptyAppState();
  state.clients.push({ id: "CL-1", organisationId: org, displayName: "Synthetic Lead", email: "synthetic@example.test", phone: "+919999999999", city: "Ludhiana", source: "UCHIT", assignedSetterId: founder.id, stage: "NEW", pipelineStage: "NEW", recordVersion: 0 });
  state.optInLeads.push({ id: "lead-1", organisationId: org, identityKey: "email:synthetic@example.test", uniqueClientId: "CL-1", convertedClientId: "CL-1", fullName: "Synthetic Lead", email: "synthetic@example.test", phone: "+919999999999", city: "Ludhiana", serviceInterest: "EXISTING_SPACE", source: "UCHIT", score: 0, message: "", status: "NEW", importedAt: "2026-08-12T00:00:00.000Z", firstSeenAt: "2026-08-12T00:00:00.000Z", lastSeenAt: "2026-08-12T00:00:00.000Z", submissionCount: 1, duplicateCount: 0, isReturningLead: false, recordVersion: 0 });
  return state;
};

test("context pins active brochure grant and never guesses qualification kind", async () => {
  const state = stateWithLead();
  const manifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === "BROCHURE_EXISTING_SPACE_V2")!;
  const registered = registerMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, assetKey: manifest.key, privateObjectKey: "media/synthetic-brochure", reason: "Synthetic test asset.", idempotencyKey: "context-register-01", expectedRecordVersion: 0 });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Synthetic verification." });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Synthetic activation." });
  const context = await createFounderCommunicationContext({ state, actor: founder, founderUserId: founder.id, organisationId: org, leadId: "lead-1", clientId: "CL-1", templateKey: "BROCHURE", serviceType: "EXISTING_SPACE", idempotencyKey: "context-brochure-01", expectedRecordVersion: 0 });
  assert.match(context.valuesPatch?.["Secure Brochure Link"] ?? "", /^\/api\/public\/media\//);
  assert.equal(context.assetVersionIds?.length, 1);
  await assert.rejects(() => createFounderCommunicationContext({ state, actor: founder, founderUserId: founder.id, organisationId: org, leadId: "lead-1", clientId: "CL-1", templateKey: "QUALIFICATION", idempotencyKey: "context-qualification-01", expectedRecordVersion: 0 }), (error: unknown) => error instanceof FounderEngagementError && error.statusCode === 400);
});

test("Residential context resolves the active exact asset and target client scope", async () => {
  const state = stateWithLead();
  const manifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === "QUALIFICATION_RESIDENTIAL_V3")!;
  const registered = registerMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, assetKey: manifest.key, privateObjectKey: "media/synthetic-residential", reason: "Register exact residential qualification PDF.", idempotencyKey: "context-register-residential-01", expectedRecordVersion: 0 });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Founder verified exact form bytes." });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Activate exact residential form version." });

  const context = await createFounderCommunicationContext({ state, actor: founder, founderUserId: founder.id, organisationId: org, leadId: "lead-1", clientId: "CL-1", templateKey: "QUALIFICATION", qualificationKind: "RESIDENTIAL", idempotencyKey: "context-residential-01", expectedRecordVersion: 0 });

  assert.equal(context.assetVersionIds?.[0], registered.version.id);
  assert.equal(context.formDefinitionId, state.qualificationFormDefinitions.find((definition) => definition.status === "ACTIVE")?.id);
  assert.equal(context.grantIds?.length, 2);
  assert.equal(state.secureAccessGrants.every((grant) => grant.leadId === "lead-1" && grant.clientId === "CL-1"), true);
  assert.match(context.valuesPatch?.["Secure Online Form Link"] ?? "", /^\/api\/public\/qualification\//);
  assert.match(context.valuesPatch?.["Secure PDF Link"] ?? "", /^\/api\/public\/media\//);
});

test("repeated Residential preparation mints independent usable grants without invalidating the old links", async () => {
  const state = stateWithLead();
  const manifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === "QUALIFICATION_RESIDENTIAL_V3")!;
  const registered = registerMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, assetKey: manifest.key, privateObjectKey: "media/synthetic-residential-reissue", reason: "Register exact residential qualification PDF.", idempotencyKey: "context-register-reissue-01", expectedRecordVersion: 0 });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Founder verified exact form bytes." });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId: org, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Activate exact residential form version." });

  const first = await createFounderCommunicationContext({ state, actor: founder, founderUserId: founder.id, organisationId: org, leadId: "lead-1", clientId: "CL-1", templateKey: "QUALIFICATION", qualificationKind: "RESIDENTIAL", idempotencyKey: "context-reissue-first-01", expectedRecordVersion: 0 });
  const firstFormToken = first.valuesPatch?.["Secure Online Form Link"]?.split("/").pop() ?? "";
  const firstPdfToken = first.valuesPatch?.["Secure PDF Link"]?.split("/").pop() ?? "";
  const firstGrantIds = [...(first.grantIds ?? [])];

  const second = await createFounderCommunicationContext({ state, actor: founder, founderUserId: founder.id, organisationId: org, leadId: "lead-1", clientId: "CL-1", templateKey: "QUALIFICATION", qualificationKind: "RESIDENTIAL", idempotencyKey: "context-reissue-second-01", expectedRecordVersion: 0 });
  const secondFormToken = second.valuesPatch?.["Secure Online Form Link"]?.split("/").pop() ?? "";
  const secondPdfToken = second.valuesPatch?.["Secure PDF Link"]?.split("/").pop() ?? "";
  const secondGrantIds = [...(second.grantIds ?? [])];

  assert.notDeepEqual(secondGrantIds, firstGrantIds);
  assert.notEqual(secondFormToken, firstFormToken);
  assert.notEqual(secondPdfToken, firstPdfToken);
  assert.equal(state.secureAccessGrants.length, 4);
  assert.equal(state.secureAccessGrants.some((grant) => "token" in grant || "url" in grant), false);
  await resolveSecureGrant(state, firstFormToken, "QUALIFICATION_FORM");
  await resolveSecureGrant(state, firstPdfToken, "QUALIFICATION_PDF");
  await resolveSecureGrant(state, secondFormToken, "QUALIFICATION_FORM");
  await resolveSecureGrant(state, secondPdfToken, "QUALIFICATION_PDF");
  assert.equal(state.secureAccessGrants.every((grant) => !grant.revokedAt && grant.assetVersionId !== ""), true);
});

test("communication context remains tenant-isolated for a mismatched organisation", async () => {
  const state = stateWithLead();
  await assert.rejects(() => createFounderCommunicationContext({ state, actor: { ...founder, organisationId: "other-org" }, founderUserId: founder.id, organisationId: "other-org", leadId: "lead-1", clientId: "CL-1", templateKey: "QUALIFICATION", qualificationKind: "RESIDENTIAL", idempotencyKey: "context-other-org-01", expectedRecordVersion: 0 }), (error: unknown) => error instanceof FounderEngagementError && error.statusCode === 404);
});

test("communication context rejects a mismatched lead and client pair", async () => {
  const state = stateWithLead();
  await assert.rejects(() => createFounderCommunicationContext({ state, actor: founder, founderUserId: founder.id, organisationId: org, leadId: "lead-1", clientId: "CL-OTHER", templateKey: "QUALIFICATION", qualificationKind: "RESIDENTIAL", idempotencyKey: "context-other-client-01", expectedRecordVersion: 0 }), (error: unknown) => error instanceof FounderEngagementError && error.statusCode === 404);
});
