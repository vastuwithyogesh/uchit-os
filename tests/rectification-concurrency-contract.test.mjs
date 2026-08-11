import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const domain = source("lib/domain.ts");
const store = source("lib/store.ts");
const persistenceMerge = source("lib/persistence-merge.ts");
const workflow = source("lib/workflow-service.ts");
const framework = source("lib/service-framework.ts");
const actions = source("app/api/actions/route.ts");
const bootstrap = source("app/api/bootstrap/route.ts");
const reports = source("lib/report-artifacts.ts");

test("rectification is a linked successor and predecessor linkage is not mutated", () => {
  assert.match(domain, /parentCaseId\?: string/);
  assert.match(domain, /revisionNumber\?: number/);
  const approve = functionBody(workflow, "approveCaseRectification");
  assert.match(approve, /parentCaseId: predecessor\.id/);
  assert.match(approve, /revisionNumber/);
  assert.doesNotMatch(approve, /predecessor\.supersededByCaseId/);
  assert.match(approve, /artifactStillMatchesBefore/);
  assert.match(approve, /artifactStillMatchesAfter/);
  assert.doesNotMatch(functionBody(reports, "legacyCanonicalReportPayload"), /parentCaseId|revisionNumber|recordVersion/);
});

test("successor resets all operational and commercial release gates", () => {
  const approve = functionBody(workflow, "approveCaseRectification");
  for (const contract of [/status: "RECTIFICATION"/, /reportStatus: "DRAFT"/, /orientationLocked: false/, /balanceApproved: false/, /fullPaymentApproved: false/, /inputReadiness: undefined/, /currentDrawing: undefined/]) assert.match(approve, contract);
  assert.doesNotMatch(approve, /state\.floorWorkspaces\.(?:unshift|push)/);
});

test("rectification requires two people and is idempotent", () => {
  const request = functionBody(workflow, "requestCaseRectification");
  const approve = functionBody(workflow, "approveCaseRectification");
  assert.match(request, /reason\.length < 20/);
  assert.match(request, /idempotencyKey/);
  assert.match(request, /item\.predecessorCaseId === caseId && item\.idempotencyKey === idempotencyKey/);
  assert.match(request, /if \(existing\) return existing/);
  assert.match(approve, /request\.requestedBy\.id === input\.actor\.id/);
  assert.match(approve, /status === "APPROVED"/);
  assert.match(switchCaseBody(actions, "case-rectification-approve"), /actor\.role !== "ADMIN" && actor\.role !== "SUPER_ADMIN"/);
});

test("rectification collections persist with legacy-safe defaults", () => {
  assert.match(store, /rectificationRequests: RectificationRequestRecord\[\]/);
  assert.match(store, /rectificationRequests: \[\]/);
  assert.match(persistenceMerge, /"rectificationRequests"/);
});

test("sensitive actions require case and global optimistic concurrency", () => {
  assert.match(actions, /concurrencyActions/);
  assert.match(actions, /expectedRecordVersion/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /loadStateSnapshotFromPersistence/);
  assert.match(actions, /persistStateToDatabase\(undefined, expectedGlobalRevision\)/);
  assert.match(actions, /setAppState\(rollbackState\)/);
  assert.match(actions, /status: 428/);
  assert.match(actions, /status: 409/);
  assert.match(functionBody(workflow, "configureCaseService"), /assertExpectedRecordVersion/);
});

test("bootstrap exposes the global concurrency token without changing the state envelope", () => {
  assert.match(bootstrap, /loadStateSnapshotFromPersistence/);
  assert.match(bootstrap, /\.\.\.scopedState, persistenceRevision: snapshot\.revision/);
  assert.match(bootstrap, /projectOrganisationState\(snapshot\.state, context\.organisation\.id\)/);
  assert.match(store, /persistenceRevision\?: number \| null/);
});

test("active-case selection is revision-aware rather than array-order dependent", () => {
  const selector = functionBody(framework, "getActiveCaseForClient");
  assert.match(selector, /revisionNumber/);
  assert.match(source("lib/case-workspace.ts"), /getActiveCaseForClient/);
  assert.match(source("lib/client-portal.ts"), /getActiveCaseForClient/);
  assert.match(source("components/crm-workbench.tsx"), /getActiveCaseForClient/);
  assert.match(source("components/commercial-console.tsx"), /getActiveCaseForClient/);
  assert.match(source("components/workflow-console.tsx"), /getActiveCaseForClient/);
  assert.match(source("components/report-console.tsx"), /getActiveCaseForClient/);
  assert.match(functionBody(workflow, "getClientSnapshot"), /getActiveCaseForClient/);
});

test("rectification requires formal evidence and audit links identify the full revision chain", () => {
  const request = functionBody(workflow, "requestCaseRectification");
  const approve = functionBody(workflow, "approveCaseRectification");
  assert.match(request, /hasFormalEvidence/);
  assert.match(request, /evaluationSnapshots\.some/);
  assert.match(request, /shaktiSnapshots\.some/);
  assert.match(request, /reportVersions\.some/);
  assert.match(request, /request \$\{request\.id\} for predecessor \$\{caseRecord\.id\}/);
  assert.match(approve, /request \$\{request\.id\}/);
  assert.match(approve, /predecessor \$\{predecessor\.id\}/);
  assert.match(approve, /successor \$\{successor\.id\}/);
});

test("client keeps historical released reports while only the successor is current", () => {
  const portal = source("lib/client-portal.ts");
  assert.match(portal, /const caseIds = new Set\(cases\.map/);
  assert.match(portal, /filter\(\(item\) => caseIds\.has\(item\.caseId\)\)/);
  assert.match(portal, /item\.status === "RELEASED"/);
  assert.match(portal, /const currentCase = getActiveCaseForClient/);
  assert.match(portal, /status: "RECTIFICATION", label: "Revision opened"/);
});
