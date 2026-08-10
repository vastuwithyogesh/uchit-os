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
    assessmentObservations: [], recommendations: [], implementationTasks: [], caseDocuments: [], deliveryMilestones: [],
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

test("v2 freezes only completed pre-delivery summaries and ignores post-delivery operations", async () => {
  const state = fixture();
  const report = { id: "report-v2-delivery", caseId: "case-1", versionLabel: "Final", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  const audit = { actorId: "internal-actor", actorName: "Internal owner", actorRole: "CONSULTANT", at: "2026-01-02T00:00:00.000Z" };
  state.vastuCases[0].serviceType = "NEW_CONSTRUCTION";
  state.deliveryMilestones.push({ id: "delivery-pre", caseId: "case-1", caseRevisionNumber: 1, serviceType: "NEW_CONSTRUCTION", kind: "REVIEW_ROUND", sequence: 1, roundLabel: "Design review", title: "Plan coordinated", status: "COMPLETED", completedAt: "2026-01-02T00:00:00.000Z", ownerRole: "ARCHITECT", ownerName: "Internal owner", drawingRef: { caseDocumentId: "private-doc-id", version: 2 }, observationSummary: "Rooms coordinated.", actionSummary: "Use plan version 2.", reason: "PRIVATE REASON", blocker: false, evidenceRefs: ["case-file-private"], idempotencyKey: "private-key", version: 1, created: audit, updated: audit });
  state.deliveryMilestones.push({ ...state.deliveryMilestones[0], id: "delivery-post", kind: "CONSTRUCTION_CHECKPOINT", title: "Site follow-up", status: "BLOCKED", reason: "PRIVATE SITE NOTE", sequence: 1 });
  const baseline = await sha256Hex(canonicalReportPayload(state, report));
  const serialized = JSON.stringify(canonicalReportPayload(state, report));
  assert.match(serialized, /Plan coordinated/);
  assert.match(serialized, /Rooms coordinated/);
  assert.doesNotMatch(serialized, /PRIVATE REASON|PRIVATE SITE NOTE|case-file-private|private-key|internal-actor|Internal owner|private-doc-id|Site follow-up/);
  const html = renderPrintableReport(state, report);
  assert.match(html, /Completed pre-delivery reviews/);
  assert.match(html, /Plan coordinated/);
  assert.doesNotMatch(html, /PRIVATE REASON|PRIVATE SITE NOTE|case-file-private|Internal owner|Site follow-up/);
  state.deliveryMilestones[1].status = "COMPLETED";
  state.deliveryMilestones[1].title = "Changed after delivery";
  assert.equal(await sha256Hex(canonicalReportPayload(state, report)), baseline);
  state.deliveryMilestones[0].actionSummary = "Changed frozen summary";
  assert.notEqual(await sha256Hex(canonicalReportPayload(state, report)), baseline);
});

test("v2 includes only verified current document summaries and no private document metadata", async () => {
  const state = fixture();
  const report = { id: "report-v2-documents", caseId: "case-1", versionLabel: "Final", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  const audit = { actorId: "private-reviewer", actorName: "Private Reviewer", actorRole: "CONSULTANT", at: "2026-01-02T00:00:00.000Z" };
  const document = { id: "doc-1", caseId: "case-1", caseRevisionNumber: 1, serviceType: "EXISTING_SPACE", assetType: "DIMENSIONED_PLAN", floorLabel: "Ground floor", versionLabel: "Plan 2", documentDate: "2026-01-01T00:00:00.000Z", isCurrent: true, evidenceRef: "private/documents/opaque-1", blocker: false, reviewObservation: "PRIVATE REVIEW NOTE", ownerRole: "ARCHITECT", ownerName: "Private owner", revisionStatus: "VERIFIED", idempotencyKey: "private-document-key", version: 1, received: audit, verified: audit, updated: audit };
  state.caseDocuments.push(document);
  const baseline = await sha256Hex(canonicalReportPayload(state, report));
  const serialized = JSON.stringify(canonicalReportPayload(state, report));
  assert.match(serialized, /DIMENSIONED_PLAN/);
  assert.match(serialized, /Plan 2/);
  assert.doesNotMatch(serialized, /private-reviewer|Private Reviewer|PRIVATE REVIEW NOTE|private\/documents|Private owner|private-document-key/);
  const html = renderPrintableReport(state, report);
  assert.match(html, /Verified document versions/);
  assert.match(html, /Plan 2/);
  assert.doesNotMatch(html, /private-reviewer|Private Reviewer|PRIVATE REVIEW NOTE|private\/documents|Private owner|private-document-key/);

  document.reviewObservation = "Changed private note";
  document.evidenceRef = "private/documents/opaque-2";
  assert.equal(await sha256Hex(canonicalReportPayload(state, report)), baseline);
  document.versionLabel = "Plan 3";
  assert.notEqual(await sha256Hex(canonicalReportPayload(state, report)), baseline);
  document.versionLabel = "Plan 2";
  state.caseDocuments.push({ ...document, id: "doc-old", versionLabel: "Plan 1", isCurrent: false, revisionStatus: "SUPERSEDED", verified: undefined });
  state.caseDocuments.push({ ...document, id: "doc-other-revision", caseRevisionNumber: 2, versionLabel: "Wrong revision" });
  state.caseDocuments.push({ ...document, id: "doc-other-case", caseId: "case-other", versionLabel: "Wrong case" });
  assert.equal(await sha256Hex(canonicalReportPayload(state, report)), baseline);
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

test("successor intake edits cannot change predecessor v2 hash or rendered bytes", async () => {
  const state = fixture();
  state.clientIntakeProfiles = [{
    clientId: "client-1", version: 1, idempotencyKey: "intake-1",
    businessContext: { company: "Private company detail" },
    contactPreference: { whatsapp: "+919999999999" },
    propertyContext: { serviceInterest: "EXISTING_SPACE", propertyType: "Apartment", propertyStatus: "Occupied", cityCountry: "Pune, India", constraints: "Keep civil work minimal" },
    needs: { mainChallenge: "Improve room use", desiredOutcome: "A practical plan" },
    consent: { version: "uchit-intake/v1", contact: true, accuracy: true, confidentiality: true, confirmedAt: "2026-01-01T00:00:00.000Z" },
    created: { actorId: "setter-1", actorName: "Setter", actorRole: "SETTER", at: "2026-01-01T00:00:00.000Z" },
    updated: { actorId: "setter-1", actorName: "Setter", actorRole: "SETTER", at: "2026-01-01T00:00:00.000Z" }
  }];
  const report = { id: "report-intake-frozen", caseId: "case-1", versionLabel: "Final", isPreview: false, status: "READY_FOR_APPROVAL", approvals: [] };
  report.artifact = await createArtifactManifest(state, report, actor);
  const originalHash = report.artifact.contentHash;
  const originalHtml = renderPrintableReport(state, report);
  assert.deepEqual(report.artifact.intakeSnapshot, { mainChallenge: "Improve room use", desiredOutcome: "A practical plan", serviceInterest: "EXISTING_SPACE", propertyType: "Apartment", propertyStatus: "Occupied", cityCountry: "Pune, India", constraints: "Keep civil work minimal" });
  assert.doesNotMatch(JSON.stringify(report.artifact.intakeSnapshot), /whatsapp|consent|company|idempotency|actor/i);

  state.vastuCases.unshift({ ...state.vastuCases[0], id: "case-2", caseNumber: "UV-1-R2", parentCaseId: "case-1", revisionNumber: 2, recordVersion: 0, status: "RECTIFICATION", reportStatus: "DRAFT" });
  state.clientIntakeProfiles[0].version = 2;
  state.clientIntakeProfiles[0].needs = { mainChallenge: "Changed for successor", desiredOutcome: "Different outcome" };
  state.clientIntakeProfiles[0].propertyContext.cityCountry = "Different city";

  assert.equal(await artifactStillMatches(state, report), true);
  assert.equal(await sha256Hex(canonicalReportPayload(state, report)), originalHash);
  assert.equal(renderPrintableReport(state, report), originalHtml);
});

test("pre-artifact intake edits remain meaningful canonical input changes", async () => {
  const state = fixture();
  state.clientIntakeProfiles = [{ clientId: "client-1", version: 1, idempotencyKey: "intake-1", needs: { mainChallenge: "Original" }, consent: { version: "uchit-intake/v1" }, created: { actorId: "setter-1", actorName: "Setter", actorRole: "SETTER", at: "2026-01-01" }, updated: { actorId: "setter-1", actorName: "Setter", actorRole: "SETTER", at: "2026-01-01" } }];
  const report = { id: "report-intake-draft", caseId: "case-1", versionLabel: "Draft", isPreview: true, status: "DRAFT", approvals: [] };
  const before = await sha256Hex(canonicalReportPayload(state, report));
  state.clientIntakeProfiles[0].needs.mainChallenge = "Changed before artifact";
  assert.notEqual(await sha256Hex(canonicalReportPayload(state, report)), before);
});

test("pre-intake v2 artifacts without a snapshot resolve to the historical empty projection", async () => {
  const state = fixture();
  const report = { id: "report-pre-intake", caseId: "case-1", versionLabel: "Historical", isPreview: false, status: "RELEASED", approvals: [], artifact: { schemaVersion: "report-artifact/v1", mediaType: "text/html", createdAt: "2026-01-01", createdBy: { id: actor.id, name: actor.fullName, role: actor.role }, templateVersion: "uchit-verdict/v2", evaluationSnapshotId: "eval-1", contentHash: "", immutable: true, downloadPath: "/historical" } };
  const historicalPayload = canonicalReportPayload(state, report);
  assert.equal(Object.hasOwn(historicalPayload, "intake"), false);
  report.artifact.contentHash = await sha256Hex(historicalPayload);
  state.clientIntakeProfiles = [{ clientId: "client-1", version: 1, idempotencyKey: "later-intake", needs: { mainChallenge: "Added later" }, consent: { version: "uchit-intake/v1" }, created: { actorId: "setter-1", actorName: "Setter", actorRole: "SETTER", at: "2026-02-01" }, updated: { actorId: "setter-1", actorName: "Setter", actorRole: "SETTER", at: "2026-02-01" } }];
  assert.equal(await artifactStillMatches(state, report), true);
  assert.doesNotMatch(renderPrintableReport(state, report), /Added later/);
});
