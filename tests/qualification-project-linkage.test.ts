import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyAppState } from "../lib/store.ts";
import type { AppUser } from "../lib/domain.ts";
import { APPROVED_QUALIFICATION_DEFINITIONS } from "../lib/qualification-form-definitions.ts";
import { createQualificationInvitation, FounderEngagementError, registerMediaAssetVersion, saveQualificationResponse, transitionMediaAssetVersion } from "../lib/founder-engagement.ts";

const organisationId = "org-linkage";
const founder: AppUser = { id: "founder-linkage", fullName: "Yogesh Hora", email: "founder@example.test", role: "SUPER_ADMIN", color: "#111111", organisationId, organisationCapability: "organisation_owner" };
function state() {
  const next = createEmptyAppState();
  next.clients.push({ id: "client-linkage", organisationId, displayName: "Test Client", email: "client@example.test", phone: "+919999999999", city: "Test City", source: "UCHIT", assignedSetterId: founder.id, stage: "CONVERTED", pipelineStage: "WON", recordVersion: 0 });
  next.optInLeads.push({ id: "lead-linkage", organisationId, identityKey: "email:client@example.test", uniqueClientId: "client-linkage", convertedClientId: "client-linkage", fullName: "Test Client", email: "client@example.test", phone: "+919999999999", city: "Test City", serviceInterest: "EXISTING_SPACE", source: "UCHIT", score: 0, message: "", status: "QUALIFIED", importedAt: "2026-08-17T00:00:00.000Z", firstSeenAt: "2026-08-17T00:00:00.000Z", lastSeenAt: "2026-08-17T00:00:00.000Z", submissionCount: 1, duplicateCount: 0, isReturningLead: false, recordVersion: 0 });
  return next;
}
function activateResidentialAsset(next: ReturnType<typeof state>) {
  const definition = APPROVED_QUALIFICATION_DEFINITIONS.RESIDENTIAL;
  const registered = registerMediaAssetVersion({ state: next, actor: founder, founderUserId: founder.id, organisationId, assetKey: definition.sourceAssetVersionId, privateObjectKey: "media/linkage-residential", reason: "Test-only exact qualification asset.", idempotencyKey: "linkage-asset-001", expectedRecordVersion: 0 });
  transitionMediaAssetVersion({ state: next, actor: founder, founderUserId: founder.id, organisationId, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Test-only Founder approval." });
  transitionMediaAssetVersion({ state: next, actor: founder, founderUserId: founder.id, organisationId, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Test-only activation." });
}
function answers(next: ReturnType<typeof state>) { return Object.fromEntries(next.qualificationFormDefinitions[0].questions.map((question) => [question.id, question.kind === "CONSENT" ? true : question.choices ? question.choices[0] : "Test-only answer"])); }

test("qualification binds to the explicitly selected project and creates no fallback duplicate", async () => {
  const next = state(); activateResidentialAsset(next);
  next.prospectiveProjects.push({ id: "project-target", organisationId, clientId: "client-linkage", leadId: "lead-linkage", kind: "RESIDENTIAL", status: "REVIEW_PENDING", serviceType: "EXISTING_SPACE", propertyType: "Residential", propertyLocation: "1 Test Crescent", createdAt: "2026-08-17T00:00:00.000Z", recordVersion: 3 });
  next.prospectiveProjects.push({ id: "project-other", organisationId, clientId: "client-linkage", leadId: "lead-linkage", kind: "RESIDENTIAL", status: "REVIEW_PENDING", serviceType: "EXISTING_SPACE", propertyType: "Residential", propertyLocation: "2 Test Crescent", createdAt: "2026-08-17T00:00:00.000Z", recordVersion: 1 });
  const invitation = await createQualificationInvitation({ state: next, actor: founder, founderUserId: founder.id, organisationId, leadId: "lead-linkage", clientId: "client-linkage", prospectiveProjectId: "project-target", kind: "RESIDENTIAL", selectedServices: ["RESIDENTIAL"], idempotencyKey: "linkage-invite-001", expectedRecordVersion: 0 });
  assert.equal(invitation.invitation.prospectiveProjectId, "project-target");
  const response = saveQualificationResponse({ state: next, invitationId: invitation.invitation.id, answers: answers(next), selectedServices: ["RESIDENTIAL"], submit: true, expectedRecordVersion: 1 });
  assert.equal(response.status, "SUBMITTED");
  assert.equal(response.prospectiveProjectId, "project-target");
  assert.equal(next.prospectiveProjects.length, 2);
  assert.equal(next.prospectiveProjects.find((item) => item.id === "project-target")?.responseVersionId, response.id);
  assert.equal(next.prospectiveProjects.find((item) => item.id === "project-other")?.responseVersionId, undefined);
});

test("qualification launch fails closed when multiple projects are present without selection", async () => {
  const next = state(); activateResidentialAsset(next);
  for (const id of ["project-a", "project-b"]) next.prospectiveProjects.push({ id, organisationId, clientId: "client-linkage", leadId: "lead-linkage", kind: "RESIDENTIAL", status: "REVIEW_PENDING", serviceType: "EXISTING_SPACE", createdAt: "2026-08-17T00:00:00.000Z", recordVersion: 1 });
  await assert.rejects(() => createQualificationInvitation({ state: next, actor: founder, founderUserId: founder.id, organisationId, leadId: "lead-linkage", clientId: "client-linkage", kind: "RESIDENTIAL", selectedServices: ["RESIDENTIAL"], idempotencyKey: "linkage-ambiguous-001", expectedRecordVersion: 0 }), (error: unknown) => error instanceof FounderEngagementError && error.statusCode === 409);
  assert.equal(next.prospectiveProjects.every((item) => !item.responseVersionId), true);
});
