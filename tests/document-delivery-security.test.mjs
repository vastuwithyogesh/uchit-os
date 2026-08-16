import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

test("flat action allowlist uses existing CAS, revision, idempotency and DELIVERY capability", () => {
  const route = source("app/api/actions/route.ts");
  for (const action of ["document-delivery-prepare", "document-delivery-mark-ready", "document-delivery-deliver", "document-delivery-acknowledge"]) assert.match(route, new RegExp(action));
  assert.match(route, /documentDeliveryAllowedFields/); assert.match(route, /expectedRecordVersion/); assert.match(route, /expectedRevision/); assert.match(route, /idempotencyKey/);
  assert.match(route, /hasOrganisationCapability\(foundation\.membership, "DELIVERY"\)/);
  assert.match(route, /findOwnedClient/);
});

test("client delivery routes have no local kill switch or live-report fallback", () => {
  const portal = source("app/api/client/portal/route.ts"); const report = source("app/api/client/reports/[reportId]/route.ts");
  assert.doesNotMatch(portal, /CLIENT_DELIVERY_ENABLED|CLIENT_DELIVERY_DEFERRED/);
  assert.doesNotMatch(report, /CLIENT_DELIVERY_ENABLED|renderPrintableReport|artifactStillMatches/);
  assert.match(report, /status === "DELIVERED"|item\.status === "DELIVERED"/); assert.match(report, /recipientClientId === client\.id/);
  assert.match(report, /readDeliveredProtectedPdf/); assert.match(report, /application\/pdf/); assert.match(report, /persistStateToDatabase/);
  assert.match(report, /appendDocumentDeliveryAccess/); assert.match(report, /VIEWED/); assert.match(report, /DOWNLOADED/);
});

test("exact-artifact adapter preserves historical delivery and verifies private bytes", () => {
  const service = source("lib/final-pdf.server.ts");
  const inspect = functionBody(service, "inspectProtectedPdfForDelivery"); const read = functionBody(service, "readDeliveredProtectedPdf");
  assert.match(inspect, /uchit-verdict\/v5/); assert.match(inspect, /protectedPdfArtifactId/); assert.match(inspect, /source_snapshot_hash/); assert.match(inspect, /verifyBytes/);
  assert.doesNotMatch(inspect, /activeCaseId/);
  assert.match(read, /DELIVERED/); assert.match(read, /protectedPdfChecksumSha256/); assert.match(read, /reportCanonicalHash/); assert.match(read, /verifyBytes/); assert.match(read, /EXPORTED/);
});

test("legacy v5 direct release is closed and Founder PDF owner guard is unchanged", () => {
  const release = functionBody(source("lib/workflow-service.ts"), "releaseVerdict"); const founder = functionBody(source("lib/final-pdf.server.ts"), "assertFounder");
  assert.match(release, /uchit-verdict\/v5/); assert.match(release, /!pdfReleaseAuthorized/);
  assert.match(founder, /founderUserId !== actor\.id/); assert.match(founder, /role !== "SUPER_ADMIN"/); assert.match(founder, /capability !== "organisation_owner"/);
  assert.doesNotMatch(founder, /clientDeliveryEnabled/);
});

test("delivery records participate in AppState merge, organisation projection and scope checks", () => {
  for (const file of ["lib/store.ts", "lib/persistence-merge.ts", "lib/organisation-scope.ts", "lib/foundation.ts"]) {
    const body = source(file); assert.match(body, /documentDeliveries/); assert.match(body, /documentDeliveryEvents/);
  }
  assert.match(source("lib/organisation-scope.ts"), /"deliveryId"/);
});

test("delivery is the only client report authority and private artifact retention remains separate from media cleanup", () => {
  const portal = source("lib/client-portal.ts"); const clientRoute = source("app/api/client/reports/[reportId]/route.ts");
  assert.match(portal, /documentDeliveries/); assert.doesNotMatch(portal, /reportVersions[\s\S]*status === "RELEASED"/);
  assert.match(clientRoute, /deliveryId/); assert.match(clientRoute, /protectedPdfChecksumSha256/);
  const imageUtility = source("lib/image-utility.ts");
  assert.doesNotMatch(imageUtility, /final_pdf_artifacts|protectedPdfArtifactId|documentDeliveries/);
});

test("legacy milestone delivery stays distinct from controlled report distribution", () => {
  const page = source("app/delivery/page.tsx");
  assert.match(page, /internal milestone tracking/); assert.match(page, /Final protected-report distribution is governed separately/);
  assert.match(page, /\/report-deliveries/); assert.doesNotMatch(page, /client delivery remains deferred/);
});
