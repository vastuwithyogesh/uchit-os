import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const domain = source("lib/domain.ts");
const store = source("lib/store.ts");
const merge = source("lib/persistence-merge.ts");
const workflow = source("lib/workflow-service.ts");
const actions = source("app/api/actions/route.ts");

test("delivery milestones use service-specific kinds without fixed round promises", () => {
  for (const kind of ["REVIEW_ROUND", "FINAL_COMPLIANCE_CHECK", "CONSTRUCTION_CHECKPOINT", "CLARIFICATION", "FOLLOW_UP", "OPTIONAL_VERIFICATION"]) assert.match(domain, new RegExp(`"${kind}"`));
  const serviceKinds = workflow.slice(workflow.indexOf("const milestoneKindsByService"), workflow.indexOf("function optionalMilestoneDate"));
  assert.match(serviceKinds, /NEW_CONSTRUCTION.*REVIEW_ROUND.*FINAL_COMPLIANCE_CHECK.*CONSTRUCTION_CHECKPOINT/s);
  assert.match(serviceKinds, /EXISTING_SPACE.*CLARIFICATION.*FOLLOW_UP.*OPTIONAL_VERIFICATION/s);
  assert.doesNotMatch(serviceKinds, /\b(?:3|8)\b/);
});

test("delivery collection is additive and legacy-safe", () => {
  assert.match(domain, /interface DeliveryMilestone/);
  assert.match(store, /deliveryMilestones: DeliveryMilestone\[\]/);
  assert.match(store, /deliveryMilestones: \[\]/);
  assert.match(merge, /"deliveryMilestones"/);
});

test("delivery writes are consultant-only, allowlisted and concurrency protected", () => {
  assert.match(switchCaseBody(actions, "delivery-milestone-upsert"), /canEvaluateCases\(actor\)/);
  assert.match(actions, /delivery-milestone-upsert.*recordId.*kind.*sequence.*drawingRef.*evidenceRefs/s);
  assert.match(actions, /expectedRecordVersion/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /Unknown assessment field/);
  assert.match(actions, /milestone: await upsertDeliveryMilestone/);
});

test("completion is sequential and derives completion time", () => {
  const body = functionBody(workflow, "upsertDeliveryMilestone");
  assert.match(body, /item\.sequence < sequence/);
  assert.match(body, /item\.status !== "COMPLETED" && item\.status !== "DEFERRED"/);
  assert.match(body, /Complete or defer earlier milestones/);
  assert.match(body, /completedAt: status === "COMPLETED" \? \(existing\?\.completedAt \?\? stamp\.at\)/);
  assert.doesNotMatch(body, /input\.completedAt/);
});

test("blocked and deferred milestones require reasons and completed work requires evidence", () => {
  const body = functionBody(workflow, "upsertDeliveryMilestone");
  assert.match(body, /status === "BLOCKED" \|\| status === "DEFERRED"/);
  assert.match(body, /require a reason/);
  assert.match(body, /status === "COMPLETED" && evidenceRefs\.length === 0/);
  assert.match(body, /immutable and append-only/);
  assert.match(body, /await assertCaseFileEvidenceRefs/);
});

test("new-construction reviews bind the current verified drawing", () => {
  const body = functionBody(workflow, "upsertDeliveryMilestone");
  assert.match(body, /assetType !== "ARCHITECTURAL_DRAWING"/);
  assert.match(body, /!document\.isCurrent/);
  assert.match(body, /document\.revisionStatus !== "VERIFIED"/);
  assert.match(body, /drawingReviewKinds\.has\(kind\) && !drawingRef/);
  assert.match(body, /caseRevisionNumber: revisionNumber/);
});

test("only pre-delivery reviews freeze after artifact; post-delivery kinds remain editable", () => {
  assert.match(workflow, /preDeliveryMilestoneKinds.*REVIEW_ROUND.*FINAL_COMPLIANCE_CHECK/s);
  assert.doesNotMatch(workflow.slice(workflow.indexOf("const preDeliveryMilestoneKinds"), workflow.indexOf("const drawingReviewKinds")), /CONSTRUCTION_CHECKPOINT|FOLLOW_UP/);
  const body = functionBody(workflow, "upsertDeliveryMilestone");
  assert.match(body, /preDeliveryMilestoneKinds\.has\(kind\).*item\.artifact/s);
  assert.match(body, /assessmentContext\(input\.caseId, true\)/);
});

test("client-safe delivery projection is deterministic and hides evidence references", () => {
  const body = functionBody(workflow, "getClientSafeDeliveryMilestones");
  assert.match(body, /!preDeliveryMilestoneKinds\.has\(item\.kind\)/);
  assert.match(body, /item\.caseRevisionNumber === revisionNumber/);
  assert.match(body, /item\.serviceType === serviceType/);
  assert.match(body, /nextStep:/);
  assert.doesNotMatch(body, /evidenceRefs|evidenceCount|ownerName|ownerRole|reason|observationSummary|actionSummary/);
  assert.match(body, /left\.dueDate.*left\.title\.localeCompare/s);
});

test("delivery idempotency, edits, uniqueness, and sequencing bind exact revision and service", () => {
  const body = functionBody(workflow, "upsertDeliveryMilestone");
  assert.ok((body.match(/item\.caseRevisionNumber === revisionNumber/g) ?? []).length >= 4);
  assert.ok((body.match(/item\.serviceType === serviceType/g) ?? []).length >= 4);
});
