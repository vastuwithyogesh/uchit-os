import test from "node:test";
import assert from "node:assert/strict";
import { artifactStillMatches, canonicalReportPayload, createArtifactManifest } from "../lib/report-artifacts.ts";
import { renderPrintableReport } from "../lib/report-html.ts";
import { getStageAFloorReviewBlockers, recordStageAFloorCheckpoint } from "../lib/founder-regeneration.ts";
import { getAouReadiness } from "../lib/aou-methodology.ts";
import { getUtilityMasterMethodologyBinding, resolveUtilityMasterRows } from "../lib/utility-master.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { getProjectProgress } from "../lib/project-model.ts";
import { buildAdversarialFounderPilotFixture, buildReleaseableFounderPilotFixture, founderPilotActor, pilotIds, SYNTHETIC_MANUAL_EVIDENCE_SHA256 } from "./fixtures/founder-pilot-fixture.mjs";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

async function rawSha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("releaseable Founder pilot preserves permanent identity, commercial gates and exact one-floor scope", () => {
  const fixture = buildReleaseableFounderPilotFixture();
  const { state, expected } = fixture;
  assert.equal(state.clients.length, 1);
  assert.equal(state.clients[0].id, pilotIds.clientId);
  assert.equal(state.vastuCases.length, 1);
  assert.equal(state.vastuCases[0].clientId, pilotIds.clientId);
  assert.equal(state.floorWorkspaces.length, 1);
  assert.equal(state.floorWorkspaces[0].projectId, pilotIds.projectId);
  assert.equal(state.commercialProposals[0].amountInr, expected.totalFeeInr);
  assert.equal(state.commercialProposals[0].termsSnapshot.minimumAdvanceInr, expected.advanceInr);
  assert.equal(state.payments.filter((item) => item.status === "APPROVED").reduce((sum, item) => sum + item.amountInr, 0), expected.totalFeeInr);
  assert.equal(state.orientationVersions[0].exactDegree, 325);
  assert.equal(state.orientationVersions[0].googleEarthEvidenceVersionId, pilotIds.googleEvidenceId);
  assert.equal(state.spatialEvidenceVersions.some((item) => item.id === pilotIds.marked32Id && item.has32SectorChakra === true), true);
  assert.equal(state.spatialEvidenceVersions.some((item) => item.id === pilotIds.marked16Id && item.has16DirectionMapping === true), true);
  const manualSheet = state.caseDocuments.find((item) => item.assetType === "MANUAL_UTILITY_SHEET");
  assert.equal(manualSheet?.founderApprovalStatus, "APPROVED");
  assert.equal(manualSheet?.evidenceRef, "case-file-pilot-manual-sheet");
  assert.equal(state.auditEvents.length, new Set(state.auditEvents.map((item) => item.idempotencyKey)).size);
  assert.equal(state.timelineEvents.length, new Set(state.timelineEvents.map((item) => item.id)).size);
});

test("releaseable pilot creates deterministic Utility, graph, Site and immutable v4 Founder release lineage", async () => {
  const fixture = buildReleaseableFounderPilotFixture();
  const { state, report, actor, expected } = fixture;
  for (const row of expected.utilityRows) {
    const resolved = resolveUtilityMasterRows(row.utilityName, row.directionCode);
    assert.equal(resolved.status, "APPROVED");
    assert.equal(resolved.rows.length, 1);
    assert.equal(resolved.rows[0].attributeText, row.attributeText);
    assert.equal(resolved.rows[0].outcome, row.outcome);
  }
  assert.equal(expected.graph.status, "APPROVED");
  assert.equal(expected.graph.verdict, "SUPPRESS");
  assert.equal(state.siteAnalyses[0].stageAVerdictReportId, pilotIds.previewReportId);
  assert.equal(state.postSiteFindings[0].siteAnalysisId, pilotIds.siteId);
  assert.equal(state.siteAnalyses[0].upstreamEvaluationVersionId, pilotIds.evaluationId);
  await createArtifactManifest(state, report, actor);
  assert.equal(report.artifact.templateVersion, "uchit-verdict/v4");
  assert.deepEqual(report.artifact.griddingEvidenceVersionIds, [pilotIds.brahmasthanId, pilotIds.marmaaId, pilotIds.graphEvidenceId].sort());
  assert.deepEqual(report.artifact.entranceZoneVersionIds, ["pilot-entrance-zone-floor-v1"]);
  assert.deepEqual(getStageAFloorReviewBlockers(state, report), []);

  const reviewed = recordStageAFloorCheckpoint(state, report, "FOUNDER_REVIEWED", actor, "Founder reviewed the exact synthetic floor lineage.", "pilot-checkpoint-reviewed");
  assert.ok(reviewed.review.methodologyVersionIds.includes("pilot-direction-32-v1"));
  const replay = recordStageAFloorCheckpoint(state, report, "FOUNDER_REVIEWED", actor, "Founder reviewed the exact synthetic floor lineage.", "pilot-checkpoint-reviewed");
  assert.equal(replay.checkpoint.id, reviewed.checkpoint.id);
  recordStageAFloorCheckpoint(state, report, "FOUNDER_APPROVED", actor, "Founder approved the exact synthetic floor report.", "pilot-checkpoint-approved");
  report.status = "RELEASED";
  recordStageAFloorCheckpoint(state, report, "RELEASED", actor, "Founder released the verified protected synthetic report.", "pilot-checkpoint-released");
  state.remedialWorkflowReservations.push({
    id: "pilot-stage-b-reservation", organisationId: pilotIds.organisationId, createdByActorUserId: pilotIds.founderId,
    recordVersion: 1, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId,
    stageAReportId: report.id, status: "BLOCKED_METHOD_INPUT", createdAt: "2026-08-11T06:30:00.000Z"
  });
  assert.deepEqual(state.stageAFloorApprovalCheckpoints.map((item) => item.checkpoint).sort(), ["FOUNDER_APPROVED", "FOUNDER_REVIEWED", "RELEASED"]);
  assert.equal(state.remedialWorkflowReservations[0].stageAReportId, report.id);
  assert.equal(state.remedialWorkflowReservations[0].status, "BLOCKED_METHOD_INPUT");
  assert.equal(state.remedialWorkflowReservations[0].methodologyVersionId, undefined);
  assert.equal(getProjectProgress(state, pilotIds.projectId).status, "IN_PROGRESS");
});

test("official pilot report follows v4 order, displays manual evidence, protects PDF and remains immutable", async () => {
  const fixture = buildReleaseableFounderPilotFixture();
  const { state, report, actor, evidence } = fixture;
  await createArtifactManifest(state, report, actor);
  report.status = "APPROVED";
  const html = renderPrintableReport(state, report);
  assert.ok(html.indexOf("6. Shakti energy graph") < html.indexOf("7. Original full-colour hand-marked utility sheet"));
  assert.ok(html.indexOf("7. Original full-colour hand-marked utility sheet") < html.indexOf("8. Utility mapping and zoning"));
  assert.match(html, /BRAHMASTHAN GRID/);
  assert.match(html, /MARMAA GRID/);
  assert.match(html, /ENERGY GRAPH/);
  assert.match(html, /Complete approved AOU appendix/);
  assert.doesNotMatch(html, /70%|Supercharge|generic Vastu remed|automatic remedy/i);
  assert.match(html, /Deferred.*Remedial methodology/i);
  const renderInput = {
    reportVersionId: report.id, sourceSnapshotHash: report.artifact.contentHash, html,
    evidence: [evidence.plan, evidence.manual], ownerSecret: "synthetic-founder-pilot-owner-secret-32-plus"
  };
  const first = await renderProtectedPdf(renderInput);
  const second = await renderProtectedPdf(renderInput);
  assert.deepEqual(first.bytes, second.bytes);
  const inspection = inspectProtectedPdf(first.bytes);
  assert.equal(inspection.encrypted, true);
  assert.equal(inspection.printingAllowed, true);
  assert.equal(inspection.editingBlocked, true);
  assert.equal(inspection.copyingBlocked, true);
  assert.equal(inspection.pageExtractionBlocked, true);
  assert.equal(inspection.embeddedFilePresent, true);
  assert.match(new TextDecoder("latin1").decode(first.bytes), /\/Subtype \/Image/);
  assert.notDeepEqual(first.bytes, (await renderProtectedPdf({ ...renderInput, evidence: [evidence.plan, { ...evidence.manual, checksumSha256: "f".repeat(64) }] })).bytes);
  assert.equal(await rawSha256(evidence.manual.bytes), SYNTHETIC_MANUAL_EVIDENCE_SHA256);

  const payloadBefore = JSON.stringify(canonicalReportPayload(state, report));
  const htmlBefore = renderPrintableReport(state, report);
  state.clients[0].nextAction = "Later operational edit outside the frozen report";
  state.timelineEvents.push({ id: "later-event", clientId: pilotIds.clientId, headline: "Later edit", details: "Unrelated", happenedAt: "2026-08-12T00:00:00.000Z", actorRole: "SUPER_ADMIN" });
  assert.equal(JSON.stringify(canonicalReportPayload(state, report)), payloadBefore);
  assert.equal(renderPrintableReport(state, report), htmlBefore);
  assert.equal(await artifactStillMatches(state, report), true);
});

test("adversarial pilot fails closed without contaminating releaseable inputs", async () => {
  const adversarial = buildAdversarialFounderPilotFixture();
  assert.equal(resolveUtilityMasterRows(...adversarial.attempts.unknownUtility).status, "REVIEW_REQUIRED");
  assert.equal(resolveUtilityMasterRows(...adversarial.attempts.conflictingUtility).status, "BLOCKED_METHOD_INPUT");
  assert.equal(resolveUtilityMasterRows(...adversarial.attempts.unsupportedDirection).status, "REVIEW_REQUIRED");
  assert.equal(getUtilityMasterMethodologyBinding(adversarial.state, pilotIds.organisationId).status, "BLOCKED_METHOD_INPUT");
  assert.equal(getAouReadiness(adversarial.state, pilotIds.organisationId).ready, false);
  await assert.rejects(() => createArtifactManifest(adversarial.state, adversarial.report, adversarial.actor), /AOU|manual utility|Founder-approved|REVIEW_REQUIRED|BLOCKED/i);

  const releaseable = buildReleaseableFounderPilotFixture();
  await createArtifactManifest(releaseable.state, releaseable.report, releaseable.actor);
  releaseable.state.spatialEvidenceVersions = releaseable.state.spatialEvidenceVersions.filter((item) => item.id !== pilotIds.marked16Id);
  const manualSheet = releaseable.state.caseDocuments.find((item) => item.assetType === "MANUAL_UTILITY_SHEET");
  assert.ok(manualSheet);
  manualSheet.founderApprovalStatus = "PENDING";
  const blockers = getStageAFloorReviewBlockers(releaseable.state, releaseable.report).join(" ");
  assert.match(blockers, /16-direction/);
  assert.match(blockers, /manual utility sheet/);
  assert.equal(adversarial.attempts.belowMinimumAdvance < 11000, true);
});

test("protected API bypass, concurrency, commercial and Stage B gates remain server-enforced", () => {
  const actions = source("app/api/actions/route.ts");
  const workflow = source("lib/workflow-service.ts");
  const pdfRoute = source("app/api/reports/[reportId]/pdf/route.ts");
  const printRoute = source("app/api/reports/[reportId]/print/route.ts");
  assert.match(functionBody(workflow, "createVastuCase"), /approved advance|advance/i);
  assert.match(functionBody(workflow, "approveAdvancePayment"), /minimumAdvanceInr|11000|minimum advance/i);
  assert.match(functionBody(workflow, "approveBalancePayment"), /stageAVerdictStatus !== "PRESENTED"/);
  assert.match(functionBody(workflow, "verifyBalanceProof"), /approveBalancePayment/);
  assert.match(switchCaseBody(actions, "report-approve"), /expectedRecordVersion/);
  assert.match(actions, /expectedRevision/);
  assert.match(actions, /status: 428/);
  assert.match(actions, /globalRevisionStale/);
  assert.match(actions, /rollbackState/);
  assert.match(pdfRoute, /resolveActiveOrganisationContext/);
  assert.match(pdfRoute, /mode=export|mode === "export"/);
  assert.match(pdfRoute, /mode=print|mode === "print"/);
  assert.match(printRoute, /report\.isPreview[\s\S]*403/);
  const stageB = source("lib/stage-b-remediation.ts");
  assert.match(functionBody(stageB, "ensureStageBReservation"), /FOUNDER_APPROVED/);
  assert.doesNotMatch(functionBody(workflow, "releaseVerdict"), /remedialWorkflowReservations\.unshift/);
});

test("fixture and canonical payload contain synthetic data only and no source-document residue", async () => {
  const fixture = buildReleaseableFounderPilotFixture();
  await createArtifactManifest(fixture.state, fixture.report, founderPilotActor);
  const serialized = JSON.stringify({ state: fixture.state, payload: canonicalReportPayload(fixture.state, fixture.report) });
  assert.match(serialized, /Synthetic|PILOT/);
  assert.match(serialized, /example\.invalid/);
  assert.doesNotMatch(serialized, /codex-remote-attachments|Downloads|Aankvidyaa|personal watermark|registration number/i);
  const urls = serialized.match(/https?:\\?\/\\?\/[^\"\\]+/gi) ?? [];
  assert.deepEqual(urls, ["https://maps.example.invalid/test-only-founder-pilot"]);
  assert.doesNotMatch(serialized, /data:|blob:/i);
  assert.doesNotMatch(serialized, /latitude|longitude|coordinates/i);
});
