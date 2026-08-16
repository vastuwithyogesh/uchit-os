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
  assert.match(projection, /item\.status === "DELIVERED"/);
  assert.match(projection, /item\.recipientClientId === client\.id/);
  assert.match(projection, /deliveryMilestones: currentCase \? getClientSafeDeliveryMilestones/);
});

test("client report route checks exact delivery ownership and immutable protected artifact", () => {
  const route = source("app/api/client/reports/[reportId]/route.ts");
  assert.match(route, /recipientClientId === client\.id/);
  assert.match(route, /item\.status === "DELIVERED"/);
  assert.match(route, /readDeliveredProtectedPdf/);
  assert.doesNotMatch(route, /renderPrintableReport|artifactStillMatches/);
});

test("client navigation is isolated from staff navigation", () => {
  const policy = source("lib/access-policy.ts");
  const accessible = functionBody(policy, "getAccessiblePageRules");
  assert.match(accessible, /role === "CLIENT"/);
  assert.match(accessible, /return \[\]/);
  assert.match(accessible, /item\.href !== "\/client"/);
  assert.match(source("app/client/page.tsx"), /ClientPortal/);
  assert.doesNotMatch(source("app/api/client/portal/route.ts"), /CLIENT_DELIVERY_ENABLED|CLIENT_DELIVERY_DEFERRED/);
});
