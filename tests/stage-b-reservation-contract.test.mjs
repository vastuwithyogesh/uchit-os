import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

const workflow = source("lib/workflow-service.ts");
const methodology = source("lib/methodology-registry.ts");
const domain = source("lib/domain.ts");
const reportUi = source("components/report-console.tsx");
const printRoute = source("app/api/reports/[reportId]/print/route.ts");

test("Stage B reservation is created only from a released floor report", () => {
  const release = functionBody(workflow, "releaseVerdict");
  const releasedIndex = release.indexOf('report.status = "RELEASED"');
  const reservationIndex = release.indexOf("state.remedialWorkflowReservations.unshift");
  assert.ok(releasedIndex >= 0 && reservationIndex > releasedIndex);
  assert.match(release, /stageAReportId: report\.id/);
  assert.match(release, /floorId: floor\.id/);
  assert.match(release, /status: "BLOCKED_METHOD_INPUT"/);
  assert.match(release, /!state\.remedialWorkflowReservations\.some/);
});

test("reserved Stage B has no remedy selection or invented methodology", () => {
  const reservation = domain.slice(domain.indexOf("export interface RemedialWorkflowReservation"), domain.indexOf("export const methodologyModules"));
  assert.match(reservation, /stageAReportId/);
  assert.match(reservation, /BLOCKED_METHOD_INPUT/);
  assert.doesNotMatch(reservation, /remedyName|selectedRemedy|threshold|priority|sequence|reportText/);
  assert.match(functionBody(methodology, "publishMethodologyVersion"), /STAGE_B_REMEDIAL/);
  assert.match(methodology, /Blocked.*Methodology Input Required/is);
  assert.doesNotMatch(workflow, /generic remedy|yantra|crystal|numerology remedy/i);
});

test("report UI explains the reservation and all export routes fail closed", () => {
  assert.match(reportUi, /Stage B reserved/);
  assert.match(reportUi, /Blocked — Methodology Input Required/);
  assert.match(reportUi, /report\.status === "RELEASED"/);
  assert.match(printRoute, /report\.isPreview[\s\S]*status: 403/);
  assert.match(printRoute, /report\.status !== "RELEASED"[\s\S]*status: 403/);
});
