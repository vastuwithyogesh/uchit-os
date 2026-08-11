import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody, switchCaseBody } from "./helpers/source-contracts.mjs";

const workflow = source("lib/workflow-service.ts");
const actions = source("app/api/actions/route.ts");
const domain = source("lib/domain.ts");
const commercial = source("components/commercial-console.tsx");
const reports = source("components/report-console.tsx");

test("proposal terms freeze the commercial policy version and minimum advance", () => {
  const create = functionBody(workflow, "createCommercialProposal");
  assert.match(domain, /termsSnapshot\?:/);
  assert.match(create, /policyVersion: state\.commercialPolicy\.version/);
  assert.match(create, /minimumAdvanceInr: state\.commercialPolicy\.minimumAdvanceInr/);
  assert.match(create, /currency: "INR"/);
  assert.match(create, /idempotencyKey/);
});

test("Founder commercial writes require entity and global concurrency plus idempotency", () => {
  for (const action of ["proposal-create", "proposal-approve", "case-create", "advance-proof-verify", "stage-a-present", "balance-proof-verify", "report-approve", "verdict-release"]) {
    assert.match(actions, new RegExp(`\\"${action}\\"`));
  }
  assert.match(actions, /expectedRecordVersion/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /stable idempotency key is required/i);
  assert.match(commercial, /expectedRecordVersion: protectedEntity\.recordVersion/);
  assert.match(commercial, /expectedRevision: liveState\.persistenceRevision/);
  assert.match(reports, /expectedRevision: state\.persistenceRevision/);
});

test("Founder owner may confirm own proof only through active Founder policy", () => {
  assert.match(switchCaseBody(actions, "advance-proof-verify"), /allowSameActorVerification:[\s\S]*foundation\?\.isFounderEdition[\s\S]*founderUserId === actor\.id[\s\S]*organisation_owner/);
  assert.match(switchCaseBody(actions, "balance-proof-verify"), /allowSameActorVerification:[\s\S]*foundation\?\.isFounderEdition[\s\S]*founderUserId === actor\.id[\s\S]*organisation_owner/);
  assert.match(functionBody(workflow, "verifyAdvanceProofAndOpenCase"), /!input\.allowSameActorVerification && proof\.uploadedById === input\.actor\.id/);
  assert.match(functionBody(workflow, "verifyBalanceProof"), /!input\.allowSameActorVerification && proof\.uploadedById === input\.actor\.id/);
});

test("Stage A preview and balance follow the verdict presentation gate", () => {
  const preview = functionBody(workflow, "generatePreviewReport");
  const present = functionBody(workflow, "recordStageAVerdictPresentation");
  const balance = functionBody(workflow, "approveBalancePayment");
  assert.match(preview, /evaluationSnapshots\.some/);
  assert.match(preview, /shaktiSnapshots\.some/);
  assert.match(preview, /stageAVerdictStatus = "READY"/);
  assert.match(present, /immutable watermarked Stage A preview/i);
  assert.match(present, /stageAVerdictStatus = "PRESENTED"/);
  assert.match(balance, /stageAVerdictStatus !== "PRESENTED"/);
});

test("Founder report policy records review, approval, and release checkpoints", () => {
  const approve = functionBody(workflow, "approveReport");
  const release = functionBody(workflow, "releaseVerdict");
  assert.match(approve, /policy\.mode === "FOUNDER"/);
  assert.match(approve, /FOUNDER_REVIEWED/);
  assert.match(approve, /FOUNDER_APPROVED/);
  assert.match(release, /FOUNDER_REVIEWED", "FOUNDER_APPROVED/);
  assert.match(release, /checkpoint: "RELEASED"/);
  assert.match(workflow, /TEAM_REPORT_APPROVAL_POLICY[\s\S]*creatorMayApprove: false/);
  assert.match(workflow, /report creator cannot approve their own report/i);
  assert.match(workflow, /two distinct approvers/i);
});

test("advance confirmation and automatic case creation cannot partially succeed", () => {
  const verify = functionBody(workflow, "verifyAdvanceProofAndOpenCase");
  assert.match(verify, /caseRecord = createVastuCase/);
  assert.doesNotMatch(verify, /automatic case opening could not complete|catch \(error\)/);
  assert.match(functionBody(workflow, "createVastuCase"), /payment\.status === "APPROVED"/);
  assert.match(functionBody(workflow, "createVastuCase"), /Boolean\(payment\.proofAssetId\)/);
});
