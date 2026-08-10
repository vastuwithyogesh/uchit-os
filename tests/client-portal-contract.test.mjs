import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";

test("client ownership uses the verified actor email and fails closed", () => {
  const helper = source("lib/client-portal.ts");
  const ownership = functionBody(helper, "findOwnedClient");
  assert.match(ownership, /actor\.role !== "CLIENT"/);
  assert.match(ownership, /normalizeEmail\(actor\.email\)/);
  assert.match(ownership, /matches\.length !== 1/);
  assert.doesNotMatch(ownership, /displayName|phone/);
});

test("portal projection returns no payment proof bytes or internal evaluation details", () => {
  const helper = source("lib/client-portal.ts");
  const projection = functionBody(helper, "buildClientPortalView");
  assert.doesNotMatch(projection, /referenceScreenshot|generatedMatrix|inputValues|approvalEvidence/);
  assert.match(projection, /item\.clientId === client\.id/);
  assert.match(projection, /item\.status === "RELEASED"/);
  assert.match(projection, /deliveryMilestones: currentCase \? getClientSafeDeliveryMilestones/);
});

test("client report route checks ownership, release state and immutable integrity", () => {
  const route = source("app/api/client/reports/[reportId]/route.ts");
  assert.match(route, /caseRecord\.clientId !== client\.id/);
  assert.match(route, /report\.status !== "RELEASED"/);
  assert.match(route, /artifactStillMatches/);
});

test("client navigation is isolated from staff navigation", () => {
  const policy = source("lib/access-policy.ts");
  const accessible = functionBody(policy, "getAccessiblePageRules");
  assert.match(accessible, /role === "CLIENT"/);
  assert.match(accessible, /item\.href === "\/client"/);
  assert.match(accessible, /item\.href !== "\/client"/);
});
