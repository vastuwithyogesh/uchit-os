import { getCanonicalAouSource, AOU_EXPLICIT_DIRECTION_GROUPS, AOU_SHEET_RANGE, AOU_SHEET_RANGE_HASH, AOU_SOURCE_VERSION, AOU_WORKBOOK_CONTENT_HASH } from "../../lib/aou-methodology.ts";
import { createHash } from "node:crypto";
import { deterministicContentHash } from "../../lib/evaluation-provenance.ts";
import { getUtilityMasterSource, utilityMasterRuleId } from "../../lib/utility-master.ts";
import { calculateUtilityGraphVerdict } from "../../lib/utility-verdict.ts";

export const PILOT_TIME = "2026-08-11T06:30:00.000Z";
export const SYNTHETIC_MANUAL_EVIDENCE_SHA256 = "585627601e14dbdd7e65278ecb287e80c759977147b6e3e40a82f647579bccd0";
const SYNTHETIC_MANUAL_EVIDENCE_BASE64 = "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";

export const pilotIds = Object.freeze({
  organisationId: "10000000-0000-4000-8000-000000000001",
  founderId: "10000000-0000-4000-8000-000000000002",
  clientId: "10000000-0000-4000-8000-000000000003",
  proposalId: "10000000-0000-4000-8000-000000000004",
  projectId: "10000000-0000-4000-8000-000000000005",
  caseId: "10000000-0000-4000-8000-000000000006",
  floorId: "10000000-0000-4000-8000-000000000007",
  planId: "10000000-0000-4000-8000-000000000008",
  googleEvidenceId: "10000000-0000-4000-8000-000000000009",
  marked32Id: "10000000-0000-4000-8000-000000000010",
  marked16Id: "10000000-0000-4000-8000-000000000011",
  brahmasthanId: "10000000-0000-4000-8000-000000000012",
  marmaaId: "10000000-0000-4000-8000-000000000013",
  graphEvidenceId: "10000000-0000-4000-8000-000000000014",
  orientationId: "10000000-0000-4000-8000-000000000015",
  evaluationId: "10000000-0000-4000-8000-000000000016",
  shaktiId: "10000000-0000-4000-8000-000000000017",
  verdictId: "10000000-0000-4000-8000-000000000018",
  manualSheetId: "10000000-0000-4000-8000-000000000019",
  siteId: "10000000-0000-4000-8000-000000000020",
  postSiteId: "10000000-0000-4000-8000-000000000021",
  previewReportId: "10000000-0000-4000-8000-000000000022",
  officialReportId: "10000000-0000-4000-8000-000000000023"
});

export const founderPilotActor = Object.freeze({
  id: pilotIds.founderId,
  fullName: "Founder Pilot Operator",
  email: "founder-pilot@example.invalid",
  role: "SUPER_ADMIN",
  color: "#111111",
  organisationId: pilotIds.organisationId,
  organisationCapability: "organisation_owner"
});

export function syntheticManualEvidence() {
  return {
    bytes: Uint8Array.from(Buffer.from(SYNTHETIC_MANUAL_EVIDENCE_BASE64, "base64")),
    fileName: "synthetic-founder-pilot-manual-sheet.jpg",
    mimeType: "image/jpeg",
    checksumSha256: SYNTHETIC_MANUAL_EVIDENCE_SHA256,
    role: "MANUAL_UTILITY_SHEET"
  };
}

// The pilot intentionally keeps every floor artifact byte-independent without
// introducing a dependency on an external image fixture. JPEG COM segments
// are valid metadata, so these variants remain valid full-colour evidence while
// carrying a distinct immutable byte/checksum for each scoped file.
function syntheticEvidenceVariant(tag, fileName, role) {
  const base = Buffer.from(SYNTHETIC_MANUAL_EVIDENCE_BASE64, "base64");
  const endMarker = base.length >= 2 && base[base.length - 2] === 0xff && base[base.length - 1] === 0xd9 ? base.length - 2 : base.length;
  const comment = Buffer.from(String(tag), "utf8");
  const segment = Buffer.concat([Buffer.from([0xff, 0xfe, (comment.length + 2) >> 8, (comment.length + 2) & 0xff]), comment]);
  const bytes = Buffer.concat([base.subarray(0, endMarker), segment, base.subarray(endMarker)]);
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes: Uint8Array.from(bytes), fileName, mimeType: "image/jpeg", checksumSha256, role };
}

export function syntheticPlanEvidence(tag = "ground-plan") {
  return syntheticEvidenceVariant(`SYNTHETIC-PLAN:${tag}`, `synthetic-${tag}-plan.jpg`, "PLAN_AUTHENTICATION");
}

export function syntheticManualEvidenceVariant(tag = "first-floor") {
  return syntheticEvidenceVariant(`SYNTHETIC-MANUAL:${tag}`, `synthetic-${tag}-manual-sheet.jpg`, "MANUAL_UTILITY_SHEET");
}

function owned(record = {}) {
  return { organisationId: pilotIds.organisationId, createdByActorUserId: pilotIds.founderId, recordVersion: 1, ...record };
}

function methodologyRecords() {
  const specifications = [
    ["DIRECTION_32", "pilot-direction-32-v1", "manual-32d-evidence/v1"],
    ["DIRECTION_16", "pilot-direction-16-v1", "manual-16d-evidence/v1"],
    ["SITE_ENVIRONMENT", "pilot-site-v1", "human-site-observation/v1"],
    ["UTILITY", "pilot-utility-v1", "utility-master-adapter/v1"],
    ["SHAKTI_ELEMENT", "pilot-shakti-v1", "utility-verdict-framing/v1"]
  ];
  const versions = []; const rules = []; const fixtures = [];
  for (const [module, id, adapter] of specifications) {
    const version = owned({
      id, module, version: 1, label: "Founder Pilot " + module + " v1", lifecycleStatus: "ACTIVE",
      executionAdapterVersion: adapter, sourceLabel: module === "UTILITY" ? "Approved UtilityMaster workbook" : "Approved Founder manual contract",
      sourceAssetVersion: module === "UTILITY" ? getUtilityMasterSource().sourceVersion : adapter,
      sourceAssetHash: module === "UTILITY" ? getUtilityMasterSource().workbookHash : deterministicContentHash({ module, adapter }),
      contentHash: deterministicContentHash({ module, adapter, fixture: "releaseable" }),
      reason: "Synthetic golden-pilot binding for approved Founder workflow.", idempotencyKey: "pilot-method-" + module,
      createdAt: PILOT_TIME, approvedAt: PILOT_TIME, approvedByActorUserId: pilotIds.founderId
    });
    versions.push(version);
    rules.push(owned({
      id: id + "-rule", methodologyVersionId: id, ruleKey: module + "_PILOT_RULE",
      sourceReference: module === "UTILITY" ? "UtilityMaster exact source rows" : "Approved manual evidence contract",
      decisionStatus: "APPROVED", conditionJson: { fixture: "releaseable", computedGeometry: false },
      outcomeJson: { status: "APPROVED", methodologyInvented: false },
      contentHash: deterministicContentHash({ module, rule: "pilot" }), idempotencyKey: "pilot-rule-" + module,
      createdAt: PILOT_TIME
    }));
    fixtures.push(owned({
      id: id + "-fixture", methodologyVersionId: id, fixtureKey: "FOUNDER_GOLDEN_PILOT",
      inputJson: { synthetic: true, oneFloor: true }, expectedOutputJson: { status: "APPROVED" },
      decisionStatus: "APPROVED", contentHash: deterministicContentHash({ module, fixture: true }),
      idempotencyKey: "pilot-fixture-" + module, createdAt: PILOT_TIME
    }));
  }
  return { versions, rules, fixtures };
}

function aouRecords() {
  const source = getCanonicalAouSource();
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const columns = ["Element", "Attributes", "Directions", "Colours", "Shapes", "Metals", "Activities", "Utilites", "Objects"];
  const versionId = "pilot-aou-v1";
  const rows = source.rows.map((sourceRow, index) => {
    const sourceCells = { Element: sourceRow.element, ...structuredClone(sourceRow.cells) };
    const directionScope = [...AOU_EXPLICIT_DIRECTION_GROUPS[sourceRow.element]];
    const sourceCellReferences = Object.fromEntries(columns.map((column, columnIndex) => [column, "aou!" + letters[columnIndex] + sourceRow.rowNumber]));
    const contentHash = deterministicContentHash({ sourceVersion: AOU_SOURCE_VERSION, sheetRange: AOU_SHEET_RANGE, rowNumber: sourceRow.rowNumber, element: sourceRow.element, sourceCells, directionScope });
    const displayFields = {
      attributes: sourceCells.Attributes, directions: sourceCells.Directions, colours: sourceCells.Colours,
      shapes: sourceCells.Shapes, metals: sourceCells.Metals, activities: sourceCells.Activities,
      utilities: sourceCells.Utilites, objects: sourceCells.Objects
    };
    return owned({
      id: "pilot-aou-row-" + (index + 1), methodologyVersionId: versionId,
      rowKey: AOU_SOURCE_VERSION + ":row-" + sourceRow.rowNumber, sourceRowNumber: sourceRow.rowNumber,
      element: sourceRow.element, directionScope, sourceCells, sourceCellReferences,
      ...displayFields, status: "APPROVED", sourceReference: AOU_SHEET_RANGE + ":row-" + sourceRow.rowNumber,
      contentHash, idempotencyKey: "pilot-aou-source-row-" + (index + 1), createdAt: PILOT_TIME,
      approvedAt: PILOT_TIME, approvedByActorUserId: pilotIds.founderId,
      displayCopy: {
        version: 1, status: "APPROVED", ...displayFields,
        contentHash: deterministicContentHash({ rowContentHash: contentHash, draftFields: displayFields, cleanupOnlyConfirmed: true }),
        reason: "Founder reviewed the unchanged synthetic-pilot display copy.", idempotencyKey: "pilot-aou-display-" + (index + 1),
        createdAt: PILOT_TIME, createdByActorUserId: pilotIds.founderId, approvedAt: PILOT_TIME,
        approvedByActorUserId: pilotIds.founderId, approvalReason: "Display copy preserves approved source meaning.",
        approvalIdempotencyKey: "pilot-aou-display-approval-" + (index + 1)
      }
    });
  });
  const contentHash = deterministicContentHash({
    sourceVersion: AOU_SOURCE_VERSION, workbookContentHash: AOU_WORKBOOK_CONTENT_HASH,
    sheetRange: AOU_SHEET_RANGE, rangeHash: AOU_SHEET_RANGE_HASH, rowHashes: rows.map((row) => row.contentHash)
  });
  const version = owned({
    id: versionId, version: 1, label: "Uchit AOU Master v1", lifecycleStatus: "ACTIVE",
    sourceLabel: "Approved workbook aou!A1:I6", sourceWorkbookHash: AOU_WORKBOOK_CONTENT_HASH,
    sourceRangeHash: AOU_SHEET_RANGE_HASH, sourceSheetRange: AOU_SHEET_RANGE, contentHash,
    reason: "Canonical Founder pilot AOU source.", idempotencyKey: "pilot-aou-source",
    createdAt: PILOT_TIME, approvedAt: PILOT_TIME, approvedByActorUserId: pilotIds.founderId
  });
  return { version, rows };
}

function immutableAudit(action, entityType, entityId, index) {
  const prior = index === 0 ? "GENESIS" : deterministicContentHash({ index: index - 1 });
  const afterHash = deterministicContentHash({ action, entityType, entityId, index });
  return owned({
    id: "pilot-audit-" + String(index + 1).padStart(2, "0"), actorUserId: pilotIds.founderId,
    actorDisplayName: "Founder Pilot Operator", action, entityType, entityId,
    caseId: pilotIds.caseId, projectId: pilotIds.projectId, floorId: pilotIds.floorId,
    beforeHash: prior, afterHash, reason: "Synthetic founder golden-pilot checkpoint.",
    requestId: "pilot-request-" + String(index + 1).padStart(2, "0"),
    idempotencyKey: "pilot-audit-key-" + String(index + 1).padStart(2, "0"),
    occurredAt: PILOT_TIME, previousAuditHash: prior,
    eventHash: deterministicContentHash({ prior, afterHash, action, index })
  });
}

export function buildReleaseableFounderPilotFixture() {
  const methodology = methodologyRecords();
  const aou = aouRecords();
  const selectedPairs = [
    ["FAMILY LOUNGE", "N"], ["STUDY TABLE", "N"], ["POOJA ROOM", "NE"],
    ["KITCHEN", "SE"], ["BED ROOM", "SW"], ["TOILET", "WNW"], ["REFRIGERATOR", "NW"]
  ];
  const utilitySource = getUtilityMasterSource();
  const selectedRows = selectedPairs.map(([utilityName, directionCode]) => {
    const matches = utilitySource.rows.filter((row) => row.utilityName === utilityName && row.directionCode === directionCode);
    if (matches.length !== 1) throw new Error("Releaseable Utility row is missing or conflicting: " + utilityName + " " + directionCode);
    return matches[0];
  });
  const generatedMatrix = selectedRows.map((row, index) => ({
    code: "PILOT-" + String(index + 1).padStart(2, "0"), utilityName: row.utilityName,
    directionCode: row.directionCode, attributeText: row.attributeText, verdict: row.outcome,
    ruleId: utilityMasterRuleId(row), sourceRowNumber: row.rowNumber, methodologyStatus: "APPROVED"
  }));
  const evaluationInputHash = deterministicContentHash(selectedPairs);
  const evaluationOutputHash = deterministicContentHash(generatedMatrix);
  const graph = calculateUtilityGraphVerdict({
    element: "Earth", directionSet: ["SSW", "SW"],
    bars: [{ directionCode: "SSW", value: 90 }, { directionCode: "SW", value: 95 }],
    lines: { extension: 80, balance: 50, exhaustion: 20 }
  });
  if (graph.status !== "APPROVED") throw new Error("Synthetic graph fixture must be approved.");

  const evidence = [
    owned({ id: pilotIds.googleEvidenceId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, kind: "GOOGLE_EARTH_ORIENTATION", classification: "STANDARD", protectedFileRef: "case-file-pilot-google-earth", fullColour: true, status: "CURRENT", idempotencyKey: "pilot-google", createdAt: PILOT_TIME }),
    owned({ id: pilotIds.marked32Id, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, protectedFileRef: "case-file-pilot-32d", fullColour: true, status: "CURRENT", idempotencyKey: "pilot-32d", createdAt: PILOT_TIME }),
    owned({ id: pilotIds.marked16Id, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, kind: "HAND_MARKED_PLAN", classification: "MARKED_16D_MAPPING_V1", has16DirectionMapping: true, protectedFileRef: "case-file-pilot-16d", fullColour: true, status: "CURRENT", idempotencyKey: "pilot-16d", createdAt: PILOT_TIME }),
    owned({ id: pilotIds.brahmasthanId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, kind: "OTHER", classification: "STANDARD", manualEvidencePurpose: "BRAHMASTHAN_GRID", protectedFileRef: "case-file-pilot-brahmasthan", fullColour: true, status: "CURRENT", idempotencyKey: "pilot-brahmasthan", createdAt: PILOT_TIME }),
    owned({ id: pilotIds.marmaaId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, kind: "OTHER", classification: "STANDARD", manualEvidencePurpose: "MARMAA_GRID", protectedFileRef: "case-file-pilot-marmaa", fullColour: true, status: "CURRENT", idempotencyKey: "pilot-marmaa", createdAt: PILOT_TIME }),
    owned({ id: pilotIds.graphEvidenceId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, kind: "OTHER", classification: "STANDARD", manualEvidencePurpose: "ENERGY_GRAPH", protectedFileRef: "case-file-pilot-energy-graph", fullColour: true, status: "CURRENT", idempotencyKey: "pilot-graph", createdAt: PILOT_TIME })
  ];

  const auditActions = ["OPT_IN_CREATED", "QUALIFICATION_REVIEWED", "PROPOSAL_APPROVED", "ADVANCE_CONFIRMED", "CASE_CREATED", "PLAN_VERSION_LOCKED", "ORIENTATION_LOCKED", "EVIDENCE_CONFIRMED", "UTILITY_EVALUATED", "STAGE_A_PRESENTED", "SITE_APPROVED", "POST_SITE_APPROVED", "BALANCE_CONFIRMED"];
  const state = {
    organisations: [owned({ id: pilotIds.organisationId, name: "Uchit Synthetic Pilot Organisation", status: "ACTIVE", founderUserId: pilotIds.founderId, activeWorkflowPolicyVersion: 1, activeApprovalPolicyVersion: 1, createdAt: PILOT_TIME, updatedAt: PILOT_TIME })],
    organisationMemberships: [owned({ id: "pilot-membership", userId: pilotIds.founderId, role: "SUPER_ADMIN", capability: "organisation_owner", status: "ACTIVE", createdAt: PILOT_TIME })],
    clients: [owned({ id: pilotIds.clientId, clientCode: "UV-PILOT-CLIENT-001", displayName: "Synthetic Residence Client", email: "synthetic-residence@example.invalid", phone: "+910000000001", city: "Pilot City", source: "FOUNDER_GOLDEN_PILOT", stage: "CONVERTED", pipelineStage: "IN_DELIVERY", nextAction: "Complete protected internal pilot verification", nextActionDueAt: "2026-08-12T06:30:00.000Z", pipelineOwnerUserId: pilotIds.founderId, pipelineOwnerName: "Founder Pilot Operator", pipelineOwnerRole: "SUPER_ADMIN", createdAt: PILOT_TIME })],
    clientIntakeProfiles: [owned({ id: "pilot-intake", clientId: pilotIds.clientId, version: 1, propertyContext: { serviceInterest: "EXISTING_SPACE", propertyType: "Synthetic single-floor residence", propertyStatus: "Pilot only", areaValue: 1800, areaUnit: "SQ_FT", cityCountry: "Synthetic Pilot Region", constraints: "No real client or location data." }, needs: { mainChallenge: "Validate the complete Founder Edition workflow.", desiredOutcome: "A deterministic protected one-floor report.", urgency: "PILOT" }, consent: { version: "uchit-intake/v1", contact: true, accuracy: true, confidentiality: true, confirmedAt: PILOT_TIME }, idempotencyKey: "pilot-intake-key", createdAt: PILOT_TIME })],
    leadQualifications: [owned({ id: "pilot-qualification", clientId: pilotIds.clientId, status: "QUALIFIED", conversationalForm: [{ label: "Founder pilot objective", answer: "Validate one complete synthetic residential workflow." }], createdAt: PILOT_TIME })],
    reviewCallBookings: [owned({ id: "pilot-review", clientId: pilotIds.clientId, status: "COMPLETED", scheduledFor: PILOT_TIME, completedAt: PILOT_TIME })],
    commercialPolicy: { organisationId: pilotIds.organisationId, version: 1, defaultProposalAmountInr: 51000, minimumAdvanceInr: 11000, qualificationCallTargetMinutes: 2, nextActionDueSoonHours: 24, defaultReviewCallMinutes: 30, updatedAt: PILOT_TIME },
    commercialPolicyHistory: [],
    commercialProposals: [owned({ id: pilotIds.proposalId, clientId: pilotIds.clientId, amountInr: 51000, minAdvanceInr: 11000, status: "APPROVED", termsSnapshot: { policyVersion: 1, proposalAmountInr: 51000, minimumAdvanceInr: 11000, currency: "INR" }, createdAt: PILOT_TIME, approvedAt: PILOT_TIME })],
    payments: [
      owned({ id: "pilot-payment-advance", clientId: pilotIds.clientId, caseId: pilotIds.caseId, proposalId: pilotIds.proposalId, type: "ADVANCE", amountInr: 11000, status: "APPROVED", proofAssetId: "pilot-proof-advance", approvedAt: PILOT_TIME }),
      owned({ id: "pilot-payment-balance", clientId: pilotIds.clientId, caseId: pilotIds.caseId, proposalId: pilotIds.proposalId, type: "BALANCE", amountInr: 40000, status: "APPROVED", proofAssetId: "pilot-proof-balance", approvedAt: PILOT_TIME })
    ],
    advanceVerifications: [owned({ id: "pilot-advance-verification", clientId: pilotIds.clientId, proposalId: pilotIds.proposalId, amountInr: 11000, status: "APPROVED", proofAssetId: "pilot-proof-advance", reviewedAt: PILOT_TIME })],
    projects: [owned({ id: pilotIds.projectId, clientId: pilotIds.clientId, activeCaseId: pilotIds.caseId, propertyName: "Synthetic Ground-Floor Residence", status: "IN_PROGRESS", createdAt: PILOT_TIME })],
    vastuCases: [owned({ id: pilotIds.caseId, caseNumber: "UV-PILOT-CASE-001", clientId: pilotIds.clientId, proposalId: pilotIds.proposalId, projectId: pilotIds.projectId, revisionNumber: 1, serviceType: "EXISTING_SPACE", serviceTemplateVersion: "founder-existing/v1", scopeVersion: "pilot-scope/v1", canonicalStage: "REPORTING", status: "REPORT_APPROVAL_PENDING", reportStatus: "APPROVED", orientationLocked: true, balanceApproved: true, fullPaymentApproved: true, stageAVerdictStatus: "PRESENTED", stageAVerdictPresentedAt: PILOT_TIME, stageAVerdictPresentedByActorUserId: pilotIds.founderId, createdAt: PILOT_TIME })],
    floorWorkspaces: [owned({ id: pilotIds.floorId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorLabel: "Ground floor", status: "LOCKED", locked: true, evidenceUploads: [], createdAt: PILOT_TIME })],
    planVersions: [owned({ id: pilotIds.planId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, versionLabel: "Synthetic plan v1", status: "CURRENT", protectedFileRef: "case-file-pilot-plan", idempotencyKey: "pilot-plan", createdAt: PILOT_TIME })],
    spatialEvidenceVersions: evidence,
    orientationVersions: [owned({ id: pilotIds.orientationId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, exactDegree: 325, googleEarthEvidenceVersionId: pilotIds.googleEvidenceId, status: "LOCKED", lockedAt: PILOT_TIME, lockedByActorUserId: pilotIds.founderId, lockReason: "Founder deliberately locked the measured synthetic pilot orientation against protected evidence.", idempotencyKey: "pilot-orientation", createdAt: PILOT_TIME })],
    openingMappings: [owned({ id: "pilot-opening-main", projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, orientationVersionId: pilotIds.orientationId, kind: "MAIN_ENTRANCE", markerX: 0.51, markerY: 0.08, verified: true, methodologyStatus: "APPROVED", methodologyVersionId: "pilot-direction-32-v1", directionCode: "N3", evidenceVersionId: pilotIds.marked32Id, idempotencyKey: "pilot-opening", createdAt: PILOT_TIME })],
    spaceMappings: selectedRows.map((row, index) => owned({ id: "pilot-space-" + (index + 1), projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, orientationVersionId: pilotIds.orientationId, spaceLabel: row.utilityName, polygon: [{ x: 0.1 + index * 0.02, y: 0.2 }, { x: 0.2 + index * 0.02, y: 0.2 }, { x: 0.15 + index * 0.02, y: 0.3 }], verified: true, methodologyStatus: "APPROVED", methodologyVersionId: "pilot-direction-16-v1", directionCode: row.directionCode, evidenceVersionId: pilotIds.marked16Id, idempotencyKey: "pilot-space-key-" + (index + 1), createdAt: PILOT_TIME })),
    evaluationSnapshots: [owned({ id: pilotIds.evaluationId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, orientationVersionId: pilotIds.orientationId, snapshotName: "Founder golden pilot Utility evaluation", sourceVersion: utilitySource.sourceVersion, generatedMatrix, provenance: { inputHash: evaluationInputHash, outputHash: evaluationOutputHash, algorithmVersion: "utility-master-adapter/v1", methodologyVersionId: "pilot-utility-v1" }, idempotencyKey: "pilot-utility-evaluation", createdAt: PILOT_TIME })],
    shaktiSnapshots: [owned({ id: pilotIds.shaktiId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, orientationVersionId: pilotIds.orientationId, inputValues: [90, 95], elementAverages: { Earth: 92.5 }, rankedVerdicts: [{ element: "Earth", score: 92.5 }], tieBreakUsed: false, provenance: { inputHash: graph.inputHash, outputHash: graph.outputHash, algorithmVersion: graph.algorithmVersion, methodologyVersionId: "pilot-shakti-v1" }, idempotencyKey: "pilot-shakti", createdAt: PILOT_TIME })],
    utilityVerdicts: [owned({ id: pilotIds.verdictId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, planVersionId: pilotIds.planId, orientationVersionId: pilotIds.orientationId, utilityEvaluationSnapshotId: pilotIds.evaluationId, element: "Earth", directionSet: graph.frozenInput.directionSet, bars: graph.frozenInput.bars, lines: graph.frozenInput.lines, verdict: graph.verdict, solutionFraming: graph.solutionFraming, status: graph.status, triggeredDirections: graph.triggeredDirections, matchedConditions: graph.matchedConditions, explanation: graph.explanation, sourceRuleIds: selectedRows.map(utilityMasterRuleId), sourceRowNumbers: selectedRows.map((row) => row.rowNumber), methodologyVersionId: "pilot-utility-v1", methodologyContentHash: methodology.versions.find((item) => item.module === "UTILITY").contentHash, utilityWorkbookHash: utilitySource.workbookHash, utilityWorkbookVersion: utilitySource.sourceVersion, inputHash: graph.inputHash, outputHash: graph.outputHash, idempotencyKey: "pilot-verdict", createdAt: PILOT_TIME })],
    caseDocuments: [owned({ id: pilotIds.manualSheetId, caseId: pilotIds.caseId, caseRevisionNumber: 1, serviceType: "EXISTING_SPACE", floorLabel: "Ground floor", assetType: "MANUAL_UTILITY_SHEET", versionLabel: "Synthetic manual utility sheet v1", documentDate: "2026-08-11", isCurrent: true, evidenceRef: "case-file-pilot-manual-sheet", blocker: false, ownerRole: "CONSULTANT", ownerName: "Founder Pilot Operator", revisionStatus: "VERIFIED", verified: true, founderApprovalStatus: "APPROVED", founderApprovedAt: PILOT_TIME, founderApprovedByActorUserId: pilotIds.founderId, idempotencyKey: "pilot-manual-sheet", createdAt: PILOT_TIME })],
    reportVersions: [owned({ id: pilotIds.previewReportId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, versionLabel: "Synthetic Stage A preview v1", isPreview: true, status: "READY_FOR_APPROVAL", approvals: [], stageAVerdictStatus: "PRESENTED", createdAt: PILOT_TIME }), owned({ id: pilotIds.officialReportId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, versionLabel: "Synthetic Founder official report v1", isPreview: false, status: "DRAFT", approvals: [], createdAt: PILOT_TIME })],
    siteAnalyses: [owned({ id: pilotIds.siteId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, caseRevisionNumber: 1, floorRevisionNumber: 1, version: 1, evidenceType: "VIDEO_ANALYSIS", evidenceRefs: ["case-file-pilot-site-video"], capturedAt: PILOT_TIME, observations: { site: "Synthetic site context recorded.", entrance: "Synthetic entrance evidence verified.", surroundings: "Synthetic surroundings recorded.", light: "Synthetic daylight observation recorded.", ventilation: "Synthetic ventilation observation recorded.", airflow: "Synthetic airflow observation recorded.", neighbouringEffects: "Synthetic neighbouring context recorded.", relevantObservations: "No methodology inference was generated." }, stageAVerdictReportId: pilotIds.previewReportId, stageAVerdictVersion: "Synthetic Stage A preview v1", upstreamEvaluationVersionId: pilotIds.evaluationId, status: "FOUNDER_APPROVED", needsRegeneration: false, idempotencyKey: "pilot-site", contentHash: deterministicContentHash({ site: true }), createdAt: PILOT_TIME, createdByActorName: "Founder Pilot Operator" })],
    postSiteFindings: [owned({ id: pilotIds.postSiteId, projectId: pilotIds.projectId, caseId: pilotIds.caseId, floorId: pilotIds.floorId, caseRevisionNumber: 1, floorRevisionNumber: 1, version: 1, siteAnalysisId: pilotIds.siteId, upstreamReportId: pilotIds.previewReportId, upstreamEvaluationVersionId: pilotIds.evaluationId, differences: "No synthetic layout difference recorded.", corrections: "No automatic correction generated.", newFindings: "No new methodology output generated.", additionalObservations: "Founder confirmed the post-site review record.", status: "FOUNDER_APPROVED", needsRegeneration: false, idempotencyKey: "pilot-post-site", contentHash: deterministicContentHash({ postSite: true }), createdAt: PILOT_TIME, createdByActorName: "Founder Pilot Operator" })],
    siteAnalysisApprovals: [], postSiteFindingsApprovals: [],
    assessmentObservations: [owned({ id: "pilot-observation", caseId: pilotIds.caseId, floorId: pilotIds.floorId, title: "Verified evidence lineage", observation: "All reported inputs are bound to the current synthetic floor and plan versions.", alignmentStatus: "ALIGNED", energyStatus: "BALANCED", placementStatus: "VERIFIED", evidenceRefs: [], idempotencyKey: "pilot-observation", createdAt: PILOT_TIME })],
    recommendations: [owned({ id: "pilot-recommendation", caseId: pilotIds.caseId, floorId: pilotIds.floorId, title: "Preserve approved evidence lineage", rationale: "Reproducibility requires the immutable versions bound to this report.", action: "Use only the approved plan, evidence and methodology versions recorded in this report.", decisionPriority: "IMPORTANT", attentionClass: "VERIFY", implementationHorizon: "IMMEDIATE", level: "FLOOR", observationIds: ["pilot-observation"], evidenceRefs: [], idempotencyKey: "pilot-recommendation", createdAt: PILOT_TIME })],
    implementationTasks: [],
    methodologyVersions: methodology.versions,
    methodologyRules: methodology.rules,
    methodologyGoldenFixtures: methodology.fixtures,
    aouMethodologyVersions: [aou.version],
    aouReferenceRows: aou.rows,
    dependencyInvalidations: [], regenerationResolutions: [], stageAFloorReviews: [], stageAFloorApprovalCheckpoints: [],
    remedialWorkflowReservations: [],
    auditEvents: auditActions.map((action, index) => immutableAudit(action, index < 4 ? "CLIENT" : index < 8 ? "CASE" : "REPORT", index < 4 ? pilotIds.clientId : index < 8 ? pilotIds.caseId : pilotIds.officialReportId, index)),
    timelineEvents: auditActions.map((action, index) => owned({ id: "pilot-timeline-" + (index + 1), clientId: pilotIds.clientId, category: "Founder Pilot", headline: action.replaceAll("_", " "), details: "Synthetic immutable workflow checkpoint.", happenedAt: PILOT_TIME, actorRole: "SUPER_ADMIN", actorId: pilotIds.founderId, actorName: "Founder Pilot Operator" })),
    rectificationRequests: [], pipelineTransitions: [], deliveryMilestones: [], caseFileAssets: [],
    optInLeads: [], inboundLeads: [], whatsappTemplates: [], whatsappLogs: [], paymentProofs: [],
    workflowPolicies: [], approvalPolicies: [], organisationAccessRequests: [], commercialPolicyHistory: []
  };
  return {
    mode: "RELEASEABLE", state, actor: founderPilotActor, report: state.reportVersions.find((item) => item.id === pilotIds.officialReportId),
    evidence: {
      plan: { bytes: syntheticManualEvidence().bytes, fileName: "synthetic-plan-authentication.jpg", mimeType: "image/jpeg", checksumSha256: SYNTHETIC_MANUAL_EVIDENCE_SHA256, role: "PLAN_AUTHENTICATION" },
      manual: syntheticManualEvidence()
    },
    expected: { utilityRows: selectedRows, graph, totalFeeInr: 51000, advanceInr: 11000, balanceInr: 40000 }
  };
}

export function buildAdversarialFounderPilotFixture() {
  const releaseable = buildReleaseableFounderPilotFixture();
  const state = structuredClone(releaseable.state);
  state.spatialEvidenceVersions = state.spatialEvidenceVersions.filter((item) => item.id !== pilotIds.marked16Id);
  state.caseDocuments[0].founderApprovalStatus = "PENDING";
  state.methodologyVersions.find((item) => item.module === "UTILITY").sourceAssetHash = "changed-workbook-hash";
  const duplicateEarth = structuredClone(state.aouReferenceRows.find((item) => item.element === "Earth"));
  duplicateEarth.id = "pilot-aou-row-ambiguous";
  duplicateEarth.rowKey = duplicateEarth.rowKey + "-ambiguous";
  state.aouReferenceRows.push(duplicateEarth);
  return {
    mode: "ADVERSARIAL", state, actor: founderPilotActor, report: state.reportVersions.find((item) => item.id === pilotIds.officialReportId),
    attempts: {
      belowMinimumAdvance: 10999,
      caseBeforeAdvance: true,
      unknownUtility: ["UNREGISTERED PILOT UTILITY", "NE"],
      conflictingUtility: ["SERVANT ROOM", "SSE"],
      unsupportedDirection: ["KITCHEN", "ENW"],
      changedWorkbookHash: "changed-workbook-hash",
      crossFloorEvidenceId: "20000000-0000-4000-8000-000000000001",
      staleExpectedRecordVersion: 0,
      missingExpectedRevision: true,
      previewDirectExport: true,
      stageBFromUnreleased: true
    }
  };
}
