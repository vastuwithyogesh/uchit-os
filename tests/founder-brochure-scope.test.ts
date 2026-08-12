import test from "node:test";
import assert from "node:assert/strict";
import type { AppUser } from "../lib/domain.ts";
import { createEmptyAppState } from "../lib/store.ts";
import { createFounderProposalDraft, getFounderProposalBlockers } from "../lib/founder-commercial.ts";
import { registerMediaAssetVersion, transitionMediaAssetVersion } from "../lib/founder-engagement.ts";

const organisationId = "org-brochure-scope";
const founder: AppUser = { id: "owner-brochure", fullName: "Yogesh Hora", email: "owner@example.test", role: "SUPER_ADMIN", color: "#111", organisationId, organisationCapability: "organisation_owner" };

test("active approved brochure can be the sole Existing Space scope reference", () => {
  const state = createEmptyAppState();
  state.clients.push({ id: "UC-BROCHURE", organisationId, displayName: "Synthetic Brochure Client", city: "Synthetic City", source: "TEST", assignedSetterId: founder.id, email: "brochure@example.test", phone: "+919000000001", stage: "QUALIFIED", pipelineStage: "PROPOSAL_SCOPE", recordVersion: 1 });
  state.qualificationResponseVersions.push({ id: "qual-brochure", organisationId, invitationId: "invite-brochure", clientId: "UC-BROCHURE", formDefinitionId: "form-brochure", version: 1, status: "SUBMITTED", answers: { concern: "Synthetic" }, answersHash: "hash", selectedServices: ["RESIDENTIAL"], secondaryInterestSelected: false, sourceQuestionIds: ["concern"], savedAt: "2026-08-12T00:00:00.000Z", submittedAt: "2026-08-12T00:00:00.000Z", recordVersion: 1 });
  state.prospectiveProjects.push({ id: "project-brochure", organisationId, clientId: "UC-BROCHURE", leadId: "lead-brochure", responseVersionId: "qual-brochure", kind: "RESIDENTIAL", status: "COMMERCIAL_PENDING", serviceType: "EXISTING_SPACE", createdAt: "2026-08-12T00:00:00.000Z", recordVersion: 1 });
  const registered = registerMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId, assetKey: "BROCHURE_EXISTING_SPACE_V2", privateObjectKey: "synthetic/brochure/existing-v2", reason: "Synthetic brochure-as-scope registration.", idempotencyKey: "brochure-register-0001", expectedRecordVersion: 0 });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Synthetic brochure approval." });
  transitionMediaAssetVersion({ state, actor: founder, founderUserId: founder.id, organisationId, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Synthetic brochure activation." });
  const proposal = createFounderProposalDraft({ state, actor: founder, founderUserId: founder.id, organisationId, clientId: "UC-BROCHURE", prospectiveProjectId: "project-brochure", classification: "STANDARD_PAID", professionalFeePaise: 5_100_000, appliedGstBasisPoints: 1_800, agreedAdvancePaise: 1_100_000, idempotencyKey: "brochure-proposal-0001", expectedProjectVersion: 1 });
  assert.equal(proposal.content.scopeItems.length, 0);
  assert.equal(proposal.content.deliverables.length, 0);
  assert.equal(proposal.content.policyBindings.brochureAssetVersionId, registered.version.id);
  assert.equal(proposal.content.policyBindings.brochureAssetKey, "BROCHURE_EXISTING_SPACE_V2");
  const blockerCodes = getFounderProposalBlockers(state, proposal).map((item) => item.code);
  assert.equal(blockerCodes.includes("P3_SCOPE"), false);
  assert.equal(blockerCodes.includes("P4_DELIVERABLES"), false);
});
