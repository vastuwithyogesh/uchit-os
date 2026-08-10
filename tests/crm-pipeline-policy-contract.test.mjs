import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const domain = source("lib/domain.ts");
const store = source("lib/store.ts");
const merge = source("lib/persistence-merge.ts");
const workflows = source("lib/workflows.ts");
const workflow = source("lib/workflow-service.ts");
const pipeline = source("lib/crm-pipeline.ts");
const actions = source("app/api/actions/route.ts");
const policy = source("lib/commercial-policy.ts");
const evaluationConsole = source("components/evaluation-console.tsx");
const leadInboxConsole = source("components/lead-inbox-console.tsx");

test("canonical CRM pipeline is additive and legacy stages remain intact", () => {
  for (const stage of ["NEW", "CONTACTED", "VSL_SENT", "VSL_WATCHED", "PAID_REVIEW_PENDING", "PAID_REVIEW_BOOKED", "FORM_PENDING", "REVIEW_COMPLETED", "QUALIFIED", "PROPOSAL_SCOPE", "WON", "ONBOARDING", "IN_DELIVERY", "FOLLOW_UP", "CLOSED_REFERRAL", "DISQUALIFIED"]) assert.match(domain, new RegExp(`"${stage}"`));
  assert.match(domain, /stage: LeadStage/);
  assert.match(domain, /pipelineStage\?: CanonicalPipelineStage/);
  assert.match(functionBody(pipeline, "legacyPipelineStage"), /CONVERTED.*WON/s);
  assert.match(functionBody(pipeline, "normalizeClientPipeline"), /client\.pipelineStage \?\? legacyPipelineStage/);
});

test("pipeline transitions are sequential unless an administrator records a correction", () => {
  const transitions = pipeline.slice(pipeline.indexOf("const normalPipelineTransitions"), pipeline.indexOf("export function getAllowedPipelineTransitions"));
  assert.match(transitions, /NEW: \["CONTACTED", "DISQUALIFIED"\]/);
  assert.match(transitions, /PROPOSAL_SCOPE: \["WON", "DISQUALIFIED"\]/);
  assert.match(transitions, /FOLLOW_UP: \["CLOSED_REFERRAL"\]/);
  assert.match(transitions, /CLOSED_REFERRAL: \[\]/);
  assert.match(transitions, /DISQUALIFIED: \[\]/);
  const body = functionBody(workflow, "transitionClientPipeline");
  assert.match(body, /getAllowedPipelineTransitions\(beforeStage\)\.includes\(afterStage\)/);
  assert.match(body, /correction && isAdmin && correctionReason && correctionReason\.length >= 20/);
  assert.match(body, /cannot move backwards or skip steps/);
});

test("setter assignment is checked before idempotent data is returned and owner is authenticated actor", () => {
  const body = functionBody(workflow, "transitionClientPipeline");
  assert.ok(body.indexOf("Setters may update only clients assigned to them") < body.indexOf("if (retry) return"));
  assert.match(body, /const ownerId = input\.actor\.id/);
  assert.match(body, /const ownerName = input\.actor\.fullName/);
  assert.match(body, /const ownerRole = input\.actor\.role/);
  assert.doesNotMatch(actions.match(/"client-pipeline-transition": \[[^\]]+\]/)?.[0] ?? "", /ownerId|ownerName|ownerRole/);
});

test("active pipeline stages require a future dated action while terminal stages may clear it", () => {
  const body = functionBody(workflow, "transitionClientPipeline");
  assert.match(body, /afterStage === "CLOSED_REFERRAL" \|\| afterStage === "DISQUALIFIED"/);
  assert.match(body, /Every active pipeline stage requires a dated next action/);
  assert.match(body, /getTime\(\) <= Date\.now\(\)/);
  assert.match(body, /recordVersion: \(client\.recordVersion \?\? 0\) \+ 1/);
});

test("pipeline action is SETTER+ allowlisted, idempotent, concurrent and fully audited", () => {
  assert.match(switchCaseBody(actions, "client-pipeline-transition"), /canTriggerDeliverables\(actor\)/);
  assert.match(actions, /Unknown CRM field/);
  assert.match(actions, /client-pipeline-transition.*expectedRecordVersion.*expectedRevision/s);
  const body = functionBody(workflow, "transitionClientPipeline");
  assert.match(body, /idempotencyKey/);
  assert.match(body, /beforeStage, afterStage/);
  assert.match(body, /actor: \{ id: input\.actor\.id, name: input\.actor\.fullName, role: input\.actor\.role \}/);
  assert.match(body, /appendTimeline/);
});

test("commercial policy is versioned, legacy-safe and initialized in empty production state", () => {
  for (const key of ["defaultProposalAmountInr", "minimumAdvanceInr", "qualificationCallTargetMinutes", "nextActionDueSoonHours", "defaultReviewCallMinutes"]) assert.match(domain, new RegExp(key));
  const empty = store.match(/export const createEmptyAppState[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(empty, /pipelineTransitions: \[\]/);
  assert.match(empty, /commercialPolicy: structuredClone\(LEGACY_COMMERCIAL_POLICY_DEFAULTS\)/);
  assert.match(empty, /commercialPolicyHistory:/);
  assert.match(merge, /partialSnapshot\.commercialPolicy/);
  assert.match(policy, /Initial version migrated from the established workflow defaults/);
});

test("only Super Admin can publish a monotonic bounded policy with reason and audit", () => {
  assert.match(switchCaseBody(actions, "commercial-policy-update"), /actor\.role !== "SUPER_ADMIN"/);
  const body = functionBody(workflow, "updateCommercialPolicy");
  assert.match(body, /expectedPolicyVersion.*state\.commercialPolicy\.version/);
  assert.match(body, /version: state\.commercialPolicy\.version \+ 1/);
  assert.match(body, /reason\.length < 20/);
  assert.match(body, /minimumAdvanceInr > policy\.defaultProposalAmountInr/);
  assert.match(body, /updatedBy: \{ id: input\.actor\.id, name: input\.actor\.fullName, role: input\.actor\.role \}/);
  assert.match(body, /commercialPolicyHistory\.unshift/);
});

test("server commercial behavior reads policy while explicit proposal amounts remain authoritative", () => {
  const proposal = functionBody(workflow, "createCommercialProposal");
  assert.match(proposal, /amountInr \?\? state\.commercialPolicy\.defaultProposalAmountInr/);
  assert.match(proposal, /minAdvanceInr: state\.commercialPolicy\.minimumAdvanceInr/);
  assert.match(workflow, /state\.commercialPolicy\.qualificationCallTargetMinutes/);
  assert.match(workflow, /state\.commercialPolicy\.defaultReviewCallMinutes/);
  assert.doesNotMatch(workflow, /51000|11000|2-minute/);
  assert.match(workflows, /LEGACY_COMMERCIAL_POLICY_DEFAULTS/);
  assert.doesNotMatch(evaluationConsole, /formatMoney\(51000\)/);
  assert.match(evaluationConsole, /commercialPolicy\.defaultProposalAmountInr/);
  assert.doesNotMatch(leadInboxConsole, /proposal-create[\s\S]{0,100}amountInr:\s*51000/);
});
