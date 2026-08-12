import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import type { AppUser } from "../lib/domain.ts";
import { APPROVED_FOUNDER_ASSETS } from "../lib/founder-media-manifest.ts";
import { createFounderCommunicationContext, FounderEngagementError, registerMediaAssetVersion, transitionMediaAssetVersion } from "../lib/founder-engagement.ts";

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
