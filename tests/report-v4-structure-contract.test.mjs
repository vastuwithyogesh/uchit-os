import test from "node:test";
import assert from "node:assert/strict";
import { canonicalReportPayload, V3_REPORT_TEMPLATE_VERSION, V4_REPORT_TEMPLATE_VERSION } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";

const aouRows = ["Earth", "Water", "Fire", "Air", "Space"].map((element, index) => ({
  rowKey: `uchit-aou/v1:row-${index + 2}`, element, directionScope: element === "Earth" ? ["SSW", "SW"] : [`D${index}`],
  attributes: `${element} attributes`, directions: `${element} source directions`, colours: `${element} colours`, shapes: `${element} shapes`,
  metals: `${element} metals`, activities: `${element} activities`, utilities: `${element} utilities`, objects: `${element} objects`,
  sourceReference: `aou!A1:I6:row-${index + 2}`, contentHash: `row-hash-${index}`, copyLayer: "SOURCE", displayCopyStatus: "DRAFT"
}));

function fixture() {
  return {
    clients: [{ id: "client-1", displayName: "Protected Client", city: "Protected city" }], leadQualifications: [], clientIntakeProfiles: [],
    vastuCases: [{ id: "case-1", clientId: "client-1", projectId: "project-1", caseNumber: "UV-1", serviceType: "EXISTING_SPACE", scopeVersion: "scope-v1" }],
    floorWorkspaces: [{ id: "floor-1", caseId: "case-1", projectId: "project-1", floorLabel: "Ground floor", status: "LOCKED", locked: true, evidenceUploads: [] }],
    planVersions: [{ id: "plan-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", versionLabel: "Plan v1", status: "CURRENT", protectedFileRef: "opaque-plan" }],
    orientationVersions: [{ id: "orientation-1", projectId: "project-1", caseId: "case-1", exactDegree: 42.5, googleEarthEvidenceVersionId: "earth-evidence-1", status: "LOCKED" }],
    spatialEvidenceVersions: [{ id: "marked-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", planVersionId: "plan-1", kind: "HAND_MARKED_PLAN", protectedFileRef: "opaque-marked", fullColour: true, status: "CURRENT" }],
    openingMappings: [{ id: "opening-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", planVersionId: "plan-1", orientationVersionId: "orientation-1", kind: "MAIN_ENTRANCE", markerX: 10, markerY: 20, verified: true, methodologyStatus: "APPROVED", directionCode: "E1", evidenceVersionId: "marked-1" }],
    spaceMappings: [{ id: "space-1", projectId: "project-1", caseId: "case-1", floorId: "floor-1", planVersionId: "plan-1", orientationVersionId: "orientation-1", spaceLabel: "Kitchen", polygon: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }], verified: true, methodologyStatus: "APPROVED", directionCode: "SE", evidenceVersionId: "marked-1" }],
    evaluationSnapshots: [{ id: "eval-1", caseId: "case-1", floorId: "floor-1", planVersionId: "plan-1", orientationVersionId: "orientation-1", snapshotName: "Ground floor Utility", sourceVersion: "uchit-utility-master/v1", generatedMatrix: [{ code: "Kitchen", utilityName: "KITCHEN", directionCode: "SE", attributeText: "Exact approved attribute", verdict: "GOOD", ruleId: "utility-master-row-1", sourceRowNumber: 1 }], provenance: { inputHash: "utility-in", outputHash: "utility-out", algorithmVersion: "utility-master-adapter/v1", methodologyVersionId: "utility-method-v1" } }],
    shaktiSnapshots: [{ id: "shakti-1", caseId: "case-1", floorId: "floor-1", planVersionId: "plan-1", orientationVersionId: "orientation-1", inputValues: [1], elementAverages: { Earth: 1 }, rankedVerdicts: [], tieBreakUsed: false, provenance: { inputHash: "shakti-in", outputHash: "shakti-out", algorithmVersion: "shakti/v1", methodologyVersionId: "shakti-method-v1" } }],
    utilityVerdicts: [{ id: "verdict-1", caseId: "case-1", floorId: "floor-1", planVersionId: "plan-1", orientationVersionId: "orientation-1", utilityEvaluationSnapshotId: "eval-1", element: "Earth", directionSet: ["SSW", "SW"], bars: [{ directionCode: "SSW", value: 10 }, { directionCode: "SW", value: 10 }], lines: { extension: 10, balance: 5, exhaustion: 0 }, verdict: "BALANCE", solutionFraming: "Equaliser", status: "APPROVED", triggeredDirections: ["SSW", "SW"], matchedConditions: ["BALANCE"], explanation: "BALANCE selected from the exact frozen graph.", sourceRuleIds: ["utility-master-row-1"], sourceRowNumbers: [1], methodologyVersionId: "utility-method-v1", methodologyContentHash: "utility-method-hash", utilityWorkbookHash: "utility-workbook-hash", utilityWorkbookVersion: "uchit-utility-master/v1", inputHash: "graph-in", outputHash: "graph-out", idempotencyKey: "verdict-key", createdAt: "2026-01-01T00:00:00.000Z" }],
    caseDocuments: [{ id: "manual-sheet-1", caseId: "case-1", floorLabel: "Ground floor", versionLabel: "Manual sheet v1", documentDate: "2026-01-01", assetType: "MANUAL_UTILITY_SHEET" }],
    siteAnalyses: [{ id: "site-1", caseId: "case-1", floorId: "floor-1", status: "FOUNDER_APPROVED", version: 1, needsRegeneration: false, evidenceType: "VIDEO_ANALYSIS", capturedAt: "2026-01-01T00:00:00.000Z", observations: { site: "Observed", entrance: "Observed", surroundings: "Observed", light: "Observed", ventilation: "Observed", airflow: "Observed", neighbouringEffects: "Observed", relevantObservations: "Observed" }, stageAVerdictVersion: "Stage A v1" }],
    postSiteFindings: [{ id: "post-1", caseId: "case-1", floorId: "floor-1", status: "FOUNDER_APPROVED", version: 1, needsRegeneration: false, differences: "Recorded", corrections: "Recorded", newFindings: "Recorded", additionalObservations: "Recorded" }],
    assessmentObservations: [], recommendations: [], implementationTasks: []
  };
}

function v4Report() {
  return { id: "report-v4", caseId: "case-1", floorId: "floor-1", versionLabel: "Ground floor report v4", isPreview: true, status: "PAYMENT_BLOCKED", approvals: [],
    artifact: { templateVersion: V4_REPORT_TEMPLATE_VERSION, evaluationSnapshotId: "eval-1", utilityVerdictIds: ["verdict-1"], shaktiSnapshotId: "shakti-1", floorId: "floor-1", planVersionId: "plan-1", orientationVersionId: "orientation-1", handMarkedEvidenceVersionId: "marked-1", manualUtilitySheetDocumentId: "manual-sheet-1", siteAnalysisId: "site-1", postSiteFindingsId: "post-1", contentHash: "v4-hash", immutable: true,
      aouReferenceSnapshot: { methodologyVersionId: "private-aou-version-id", methodologyVersionLabel: "Uchit AOU Master v1", methodologyContentHash: "aou-content-hash", sourceVersion: "uchit-aou/v1", sourceWorkbookHash: "workbook-hash", sourceRangeHash: "range-hash", selectedRowIds: ["private-earth-row-id"], selectedRows: [aouRows[0]], appendixRows: aouRows, snapshotHash: "aou-snapshot-hash" } } };
}

test("v4 follows the exact approved section order and manual-sheet placement", () => {
  const html = renderPrintableReport(fixture(), v4Report());
  const headings = [...html.matchAll(/<h2>(\d+)\. ([^<]+)<\/h2>/g)].map((match) => Number(match[1]));
  assert.deepEqual(headings, Array.from({ length: 16 }, (_, index) => index + 1));
  assert.ok(html.indexOf("Shakti energy graph") < html.indexOf("Original full-colour hand-marked utility sheet"));
  assert.ok(html.indexOf("Original full-colour hand-marked utility sheet") < html.indexOf("Utility mapping and zoning"));
  assert.match(html, /Complete approved AOU appendix/);
  assert.match(html, /Uchit AOU Master v1|uchit-aou\/v1/);
  assert.doesNotMatch(html, /private-aou-version-id|private-earth-row-id/);
  assert.doesNotMatch(html, /70%|Supercharge|single-number Vastu score/i);
  assert.match(html, /No generic remedies/);
});

test("v4 freezes one floor and AOU snapshot while ignoring other-floor and later AOU state changes", () => {
  const appState = fixture(); const report = v4Report();
  const beforePayload = JSON.stringify(canonicalReportPayload(appState, report));
  const beforeHtml = renderPrintableReport(appState, report);
  appState.floorWorkspaces.push({ id: "floor-2", caseId: "case-1", projectId: "project-1", floorLabel: "First floor", status: "DRAFT", locked: false, evidenceUploads: [] });
  appState.evaluationSnapshots.push({ id: "eval-other", caseId: "case-1", floorId: "floor-2", planVersionId: "plan-other", orientationVersionId: "orientation-1", generatedMatrix: [{ code: "OTHER FLOOR", verdict: "BAD" }] });
  appState.aouReferenceRows = [{ id: "later-unbound-row", attributes: "Later mutable AOU state" }];
  assert.equal(JSON.stringify(canonicalReportPayload(appState, report)), beforePayload);
  assert.equal(renderPrintableReport(appState, report), beforeHtml);
  assert.doesNotMatch(beforePayload, /First floor|OTHER FLOOR|later-unbound-row/);
});

test("historical v3 composition and renderer never absorb v4 Utility verdict or AOU fields", () => {
  const appState = fixture(); const report = v4Report();
  report.artifact = { ...report.artifact, templateVersion: V3_REPORT_TEMPLATE_VERSION };
  const payload = JSON.stringify(canonicalReportPayload(appState, report));
  const html = renderPrintableReport(appState, report);
  assert.match(payload, /report-content\/v3/);
  assert.doesNotMatch(payload, /utilityVerdicts|aouReferenceSnapshot|aou-content-hash/);
  assert.doesNotMatch(html, /AOU verdict-framing reference|Shakti energy graph and element verdict framing/);
});

test("v4 source contract retains A4/private preview and protected final PDF boundaries", () => {
  const html = renderPrintableReport(fixture(), v4Report());
  assert.match(html, /@page\{size:A4/);
  assert.match(html, /PREVIEW ONLY/);
  assert.doesNotMatch(html, /Authorised print request/);
  assert.match(html, /overflow-wrap:anywhere/);
});
