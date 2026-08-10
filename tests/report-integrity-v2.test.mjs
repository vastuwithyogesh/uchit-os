import test from "node:test";
import assert from "node:assert/strict";
import { artifactStillMatches, createArtifactManifest, LEGACY_REPORT_TEMPLATE_VERSION, sha256Hex, canonicalReportPayload } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";

const actor = { id: "admin-1", fullName: "Reviewer", email: "reviewer@example.test", role: "ADMIN", color: "#000" };

function fixture() {
  return {
    clients: [{ id: "client-1", displayName: "Example Client", city: "Pune", source: "test", assignedSetterId: "setter-1", email: "client@example.test", phone: "000", stage: "QUALIFIED" }],
    leadQualifications: [{ id: "qualification-1", clientId: "client-1", score: 1, notes: "", qualificationCallDueAt: "2026-01-01", conversationalForm: [{ label: "Main challenge", answer: "Plan a practical home." }, { label: "Property Type", answer: "Home" }] }],
    commercialProposals: [], reviewCallBookings: [], payments: [], advanceVerifications: [],
    vastuCases: [{ id: "case-1", caseNumber: "UV-1", clientId: "client-1", proposalId: "proposal-1", status: "ORIENTATION_LOCKED", reportStatus: "DRAFT", orientationLocked: true, balanceApproved: false, fullPaymentApproved: false, serviceType: "EXISTING_SPACE", canonicalStage: "EVALUATE", serviceTemplateVersion: "uchit-service/v2", scopeVersion: "scope/v1", currentDrawing: { versionLabel: "Plan A", verifiedAt: "2026-01-01", superseded: false } }],
    floorWorkspaces: [{ id: "floor-1", caseId: "case-1", floorLabel: "Ground floor", status: "LOCKED", locked: true, evidenceUploads: ["plan.png"] }],
    assessmentObservations: [], recommendations: [], implementationTasks: [],
    reportVersions: [],
    evaluationSnapshots: [{ id: "eval-1", caseId: "case-1", snapshotName: "Evaluation", sourceVersion: "rules/v1", generatedMatrix: [{ code: "N", verdict: "GOOD", confidence: 90 }] }],
    mapping32D: [], mapping16D: [], utilityRules: [], shaktiSnapshots: [], timelineEvents: [], optInLeads: [], whatsappTemplates: [], whatsappLogs: []
  };
}

test("v2 report integrity fails closed when any rendered mutable input changes", async () => {
  const state = fixture();
  const report = { id: "report-v2", caseId: "case-1", versionLabel: "Final", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  report.artifact = await createArtifactManifest(state, report, actor);
  assert.equal(await artifactStillMatches(state, report), true);

  const mutations = [
    () => { state.leadQualifications[0].conversationalForm[0].answer = "Changed objective"; },
    () => { state.floorWorkspaces[0].floorLabel = "Changed floor"; },
    () => { state.vastuCases[0].serviceType = "NEW_CONSTRUCTION"; },
    () => { state.vastuCases[0].currentDrawing.versionLabel = "Plan B"; }
  ];
  for (const mutate of mutations) {
    const isolated = structuredClone(state);
    const isolatedReport = structuredClone(report);
    if (mutate === mutations[0]) isolated.leadQualifications[0].conversationalForm[0].answer = "Changed objective";
    if (mutate === mutations[1]) isolated.floorWorkspaces[0].floorLabel = "Changed floor";
    if (mutate === mutations[2]) isolated.vastuCases[0].serviceType = "NEW_CONSTRUCTION";
    if (mutate === mutations[3]) isolated.vastuCases[0].currentDrawing.versionLabel = "Plan B";
    assert.equal(await artifactStillMatches(isolated, isolatedReport), false);
  }
});

test("v2 canonical input is revision-bound, deterministic, and excludes private assessment metadata", async () => {
  const state = fixture();
  const report = { id: "report-v2-structured", caseId: "case-1", versionLabel: "Final", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  const audit = { actorId: "consultant-1", actorName: "Consultant", actorRole: "CONSULTANT", at: "2026-01-01T00:00:00.000Z" };
  state.assessmentObservations.push({ id: "obs-1", caseId: "case-1", caseRevisionNumber: 1, serviceType: "EXISTING_SPACE", version: 1, idempotencyKey: "private-key", title: "Kitchen", observation: "Keep the work area clear.", alignmentStatus: "REVIEW", energyStatus: "BALANCED", placementStatus: "SUITABLE", evidenceRefs: ["private/path.png"], created: audit, updated: audit });
  state.recommendations.push({ id: "rec-1", caseId: "case-1", caseRevisionNumber: 1, serviceType: "EXISTING_SPACE", version: 1, idempotencyKey: "private-key-2", title: "Clear work area", rationale: "Supports practical use.", action: "Remove the obstruction.", decisionPriority: "HIGH", attentionClass: "IMPORTANT", implementationHorizon: "SHORT_TERM", level: "L1", observationIds: ["obs-1"], evidenceRefs: ["private/path.png"], created: audit, updated: audit });
  state.implementationTasks.push({ id: "task-1", caseId: "case-1", caseRevisionNumber: 1, serviceType: "EXISTING_SPACE", version: 1, idempotencyKey: "private-key-3", recommendationId: "rec-1", title: "Move obstruction", notes: "INTERNAL NOTE MUST NOT LEAK", status: "PLANNED", implementationHorizon: "SHORT_TERM", ownerRole: "CLIENT", ownerName: "Home owner", evidenceRefs: ["private/path.png"], created: audit, updated: audit });

  const originalPayload = canonicalReportPayload(state, report);
  const originalHash = await sha256Hex(originalPayload);
  const serialized = JSON.stringify(originalPayload);
  for (const secret of ["INTERNAL NOTE MUST NOT LEAK", "private-key", "private/path.png", "consultant-1", "Consultant"]) assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  state.assessmentObservations[0].observation = "Changed client-safe finding.";
  assert.notEqual(await sha256Hex(canonicalReportPayload(state, report)), originalHash);
  state.assessmentObservations[0].observation = "Keep the work area clear.";
  state.implementationTasks[0].notes = "Different private note";
  assert.equal(await sha256Hex(canonicalReportPayload(state, report)), originalHash);

  state.assessmentObservations.push({ ...state.assessmentObservations[0], id: "obs-other", caseId: "case-other", observation: "Other case" });
  state.assessmentObservations.push({ ...state.assessmentObservations[0], id: "obs-other-revision", caseRevisionNumber: 2, observation: "Other revision" });
  assert.equal(await sha256Hex(canonicalReportPayload(state, report)), originalHash);

  const html = renderPrintableReport(state, report);
  assert.match(html, /Keep the work area clear/);
  assert.match(html, /Remove the obstruction/);
  assert.match(html, /Move obstruction/);
  assert.doesNotMatch(html, /INTERNAL NOTE|private-key|private\/path|consultant-1|Other case|Other revision/);
});

test("legacy v1 artifacts retain their original hash and report layout", async () => {
  const state = fixture();
  const report = { id: "report-v1", caseId: "case-1", versionLabel: "Legacy Preview", isPreview: true, status: "DRAFT", approvals: [], artifact: { schemaVersion: "report-artifact/v1", mediaType: "text/html", createdAt: "2026-01-01", createdBy: { id: actor.id, name: actor.fullName, role: actor.role }, templateVersion: LEGACY_REPORT_TEMPLATE_VERSION, evaluationSnapshotId: "eval-1", contentHash: "", immutable: true, downloadPath: "/legacy" } };
  report.artifact.contentHash = await sha256Hex(canonicalReportPayload(state, report));
  assert.equal(await artifactStillMatches(state, report), true);
  state.leadQualifications[0].conversationalForm[0].answer = "Later intake edit";
  state.floorWorkspaces[0].floorLabel = "Later floor edit";
  assert.equal(await artifactStillMatches(state, report), true);
  const html = renderPrintableReport(state, report);
  assert.match(html, /Evaluation summary/);
  assert.doesNotMatch(html, /Executive summary and client objective/);
  assert.match(html, /PREVIEW ONLY · NOT FOR FINAL USE/);
});
