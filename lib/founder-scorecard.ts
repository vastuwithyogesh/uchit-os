import type { AppState } from "./store.ts";
import type { ClientRecord, VastuCaseRecord, UserRole } from "./domain.ts";
import { getActiveCaseForClient } from "./service-framework.ts";

export const founderScorecardStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "READY",
  "COMPLETE",
  "NEEDS_REGENERATION"
] as const;
export type FounderScorecardStatus = (typeof founderScorecardStatuses)[number];

export type FounderScorecardModule = {
  id: string;
  number: number;
  title: string;
  purpose: string;
  status: FounderScorecardStatus;
  explanation: string;
  primaryAction: { href: string; label: string };
  recoveryAction?: { href: string; label: string };
  technical: string;
};

export type FounderFloorProgress = {
  id: string;
  label: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY" | "COMPLETE" | "NEEDS_REGENERATION";
  completedModules: number;
  totalModules: number;
  reportStatus?: string;
};

export type FounderScorecard = {
  client?: ClientRecord;
  caseRecord?: VastuCaseRecord;
  project?: AppState["projects"][number];
  modules: FounderScorecardModule[];
  floors: FounderFloorProgress[];
  recommendedModuleId: string;
};

function currentPlan(state: AppState, caseRecord: VastuCaseRecord | undefined, floorId: string) {
  if (!caseRecord?.projectId) return undefined;
  return state.planVersions.find((item) => item.caseId === caseRecord.id && item.projectId === caseRecord.projectId && item.floorId === floorId && item.status === "CURRENT");
}

function currentSpatialEvidence(state: AppState, caseRecord: VastuCaseRecord | undefined, floorId: string, planId: string | undefined, classification?: "MARKED_32D_CHAKRA_V1" | "MARKED_16D_MAPPING_V1") {
  if (!caseRecord?.projectId || !planId) return undefined;
  return state.spatialEvidenceVersions.find((item) => item.caseId === caseRecord.id && item.projectId === caseRecord.projectId && item.floorId === floorId && item.planVersionId === planId
    && item.kind === "HAND_MARKED_PLAN" && item.status === "CURRENT" && item.fullColour && (!classification || item.classification === classification));
}

function floorHasOpenRegeneration(state: AppState, caseId: string, floorId: string) {
  return state.dependencyInvalidations.some((item) => item.caseId === caseId && item.floorId === floorId
    && ["NEEDS_REGENERATION", "REPLACEMENT_REQUIRED", "REGENERATED"].includes(item.status));
}

function floorProgress(state: AppState, caseRecord: VastuCaseRecord | undefined, floor: AppState["floorWorkspaces"][number]): FounderFloorProgress {
  if (!caseRecord) return { id: floor.id, label: floor.floorLabel, status: "NOT_STARTED", completedModules: 0, totalModules: 12 };
  const plan = currentPlan(state, caseRecord, floor.id);
  const orientation = state.orientationVersions.find((item) => item.caseId === caseRecord.id && item.projectId === caseRecord.projectId && item.status === "LOCKED");
  const marked = currentSpatialEvidence(state, caseRecord, floor.id, plan?.id);
  const marked32 = currentSpatialEvidence(state, caseRecord, floor.id, plan?.id, "MARKED_32D_CHAKRA_V1")?.has32SectorChakra === true;
  const marked16 = currentSpatialEvidence(state, caseRecord, floor.id, plan?.id, "MARKED_16D_MAPPING_V1")?.has16DirectionMapping === true;
  const manualSheet = state.caseDocuments.find((item) => item.caseId === caseRecord.id && item.floorLabel === floor.floorLabel && item.assetType === "MANUAL_UTILITY_SHEET" && item.isCurrent && item.verified && item.founderApprovalStatus === "APPROVED" && !item.blocker && !item.discrepancy);
  const evaluation = state.evaluationSnapshots.find((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
  const utility = (state.utilityVerdicts ?? []).some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id && item.status === "APPROVED");
  const shakti = state.shaktiSnapshots.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id);
  const site = state.siteAnalyses.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration);
  const postSite = state.postSiteFindings.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration);
  const review = state.stageAFloorApprovalCheckpoints.some((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.checkpoint === "FOUNDER_REVIEWED");
  const released = floor.reportStatus === "RELEASED";
  const completeFlags = [Boolean(caseRecord), Boolean(caseRecord.projectId), floor.locked, Boolean(plan && orientation && marked), Boolean(marked32 && marked16 && manualSheet), Boolean(evaluation && utility && shakti), Boolean(site && postSite), Boolean(floor.stageAVerdictStatus === "PRESENTED" && review), Boolean(caseRecord.fullPaymentApproved), released, false, released];
  const completedModules = completeFlags.filter(Boolean).length;
  const status = floorHasOpenRegeneration(state, caseRecord.id, floor.id) ? "NEEDS_REGENERATION" : released ? "COMPLETE" : completedModules === 0 ? "NOT_STARTED" : "IN_PROGRESS";
  return { id: floor.id, label: floor.floorLabel, status, completedModules, totalModules: 12, reportStatus: floor.reportStatus };
}

function moduleStatus(value: { complete: boolean; started?: boolean; ready?: boolean; blocked?: boolean; regeneration?: boolean }): FounderScorecardStatus {
  if (value.regeneration) return "NEEDS_REGENERATION";
  if (value.complete) return "COMPLETE";
  if (value.blocked) return "BLOCKED";
  if (value.ready) return "READY";
  return value.started ? "IN_PROGRESS" : "NOT_STARTED";
}

export function buildFounderScorecard(state: AppState, actor: { role: UserRole }, clientId?: string): FounderScorecard {
  const client = state.clients.find((item) => item.id === clientId) ?? state.clients.find((item) => getActiveCaseForClient(state, item.id)) ?? state.clients[0];
  const caseRecord = client ? getActiveCaseForClient(state, client.id) : undefined;
  const project = caseRecord?.projectId ? state.projects.find((item) => item.id === caseRecord.projectId) : undefined;
  const floors = caseRecord ? state.floorWorkspaces.filter((item) => item.caseId === caseRecord.id) : [];
  const floorProgresses = floors.map((floor) => floorProgress(state, caseRecord, floor));
  const regeneration = floors.some((floor) => caseRecord && floorHasOpenRegeneration(state, caseRecord.id, floor.id));
  const proposal = client ? state.commercialProposals.find((item) => item.clientId === client.id) : undefined;
  const advance = client ? state.advanceVerifications.find((item) => item.clientId === client.id && ["VERIFIED", "CASE_OPENED"].includes(item.status)) : undefined;
  const proposalReady = Boolean(proposal?.status === "APPROVED");
  const clientReady = Boolean(client && proposalReady && advance && caseRecord);
  const projectReady = Boolean(caseRecord?.projectId && project);
  const floorReady = floors.length > 0 && floors.every((floor) => floor.locked);
  const planReady = floors.length > 0 && floors.every((floor) => Boolean(currentPlan(state, caseRecord, floor.id) && currentSpatialEvidence(state, caseRecord, floor.id, currentPlan(state, caseRecord, floor.id)?.id) && caseRecord?.orientationLocked));
  const manualReady = floors.length > 0 && floors.every((floor) => {
    const plan = currentPlan(state, caseRecord, floor.id);
    return Boolean(currentSpatialEvidence(state, caseRecord, floor.id, plan?.id, "MARKED_32D_CHAKRA_V1")?.has32SectorChakra && currentSpatialEvidence(state, caseRecord, floor.id, plan?.id, "MARKED_16D_MAPPING_V1")?.has16DirectionMapping && state.caseDocuments.some((item) => item.caseId === caseRecord?.id && item.floorLabel === floor.floorLabel && item.assetType === "MANUAL_UTILITY_SHEET" && item.isCurrent && item.verified && item.founderApprovalStatus === "APPROVED"));
  });
  const evaluationReady = floors.length > 0 && floors.every((floor) => {
    const plan = currentPlan(state, caseRecord, floor.id);
    const orientation = state.orientationVersions.find((item) => item.caseId === caseRecord?.id && item.projectId === caseRecord?.projectId && item.status === "LOCKED");
    return Boolean(state.evaluationSnapshots.some((item) => item.caseId === caseRecord?.id && item.floorId === floor.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id)
      && (state.utilityVerdicts ?? []).some((item) => item.caseId === caseRecord?.id && item.floorId === floor.id && item.status === "APPROVED")
      && state.shaktiSnapshots.some((item) => item.caseId === caseRecord?.id && item.floorId === floor.id));
  });
  const verdictReady = floors.length > 0 && floors.every((floor) => floor.stageAVerdictStatus === "PRESENTED" && state.stageAFloorApprovalCheckpoints.some((item) => item.caseId === caseRecord?.id && item.floorId === floor.id && item.checkpoint === "FOUNDER_REVIEWED"));
  const siteReady = floors.length > 0 && floors.every((floor) => state.siteAnalyses.some((item) => item.caseId === caseRecord?.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration)
    && state.postSiteFindings.some((item) => item.caseId === caseRecord?.id && item.floorId === floor.id && item.status === "FOUNDER_APPROVED" && !item.needsRegeneration));
  const balanceReady = Boolean(caseRecord?.fullPaymentApproved);
  const reportReady = floors.length > 0 && floors.every((floor) => floor.reportStatus === "RELEASED");
  const modules: FounderScorecardModule[] = [
    { id: "client-commercial", number: 1, title: "Client and commercial readiness", purpose: "Turn the client conversation into an approved scope and confirmed advance.", status: moduleStatus({ complete: clientReady, started: Boolean(client || proposal), blocked: Boolean(client && proposal && !advance), ready: Boolean(client && proposalReady) }), explanation: !client ? "No client has been opened yet." : !proposal ? "Add the scope and fee before requesting advance confirmation." : !advance ? "A confirmed advance is required before the case can exist." : "Client identity, proposal and advance are ready.", primaryAction: { href: !client ? "/crm" : !proposal ? "/crm" : "/payment-proofs", label: !client ? "Add client" : !proposal ? "Set scope and fee" : !advance ? "Review advance" : "Open client record" }, recoveryAction: advance ? undefined : { href: "/crm", label: "Review commercial terms" }, technical: `client=${client?.id ?? "none"}; proposal=${proposal?.id ?? "none"}; advance=${advance?.id ?? "none"}` },
    { id: "case-project", number: 2, title: "Case and project setup", purpose: "Open the Vastu case and connect its project workspace.", status: moduleStatus({ complete: projectReady, started: Boolean(caseRecord), blocked: Boolean(!caseRecord && client && !advance), ready: Boolean(caseRecord && !projectReady) }), explanation: !caseRecord ? "The Vastu Case ID appears only after confirmed advance." : !project ? "The case exists; connect its project workspace next." : "The case and project are connected.", primaryAction: !caseRecord ? { href: "/payment-proofs", label: "Confirm advance first" } : { href: "/ops", label: project ? "Review project" : "Set up project" }, recoveryAction: !caseRecord ? { href: "/crm", label: "Return to client readiness" } : undefined, technical: `case=${caseRecord?.id ?? "none"}; project=${project?.id ?? "none"}` },
    { id: "floor-setup", number: 3, title: "Floor setup", purpose: "Create separate floor workspaces without merging their reports.", status: moduleStatus({ complete: floorReady, started: floors.length > 0, blocked: !caseRecord, ready: Boolean(caseRecord && floors.length > 0 && !floorReady) }), explanation: !caseRecord ? "Open the case before creating floors." : !floors.length ? "Add the first floor workspace." : floorReady ? "Every floor is locked and ready for its own work." : "Review and lock each floor independently.", primaryAction: !caseRecord ? { href: "/crm", label: "Open case setup" } : { href: "/ops", label: floors.length ? "Review floor workspaces" : "Add first floor" }, recoveryAction: !caseRecord ? { href: "/payment-proofs", label: "Confirm advance" } : undefined, technical: `floors=${floors.map((floor) => floor.id).join(",") || "none"}` },
    { id: "plans-evidence", number: 4, title: "Plans, evidence and orientation", purpose: "Bind the current plan, protected evidence and locked orientation to every floor.", status: moduleStatus({ complete: planReady, started: Boolean(floors.some((floor) => currentPlan(state, caseRecord, floor.id))), blocked: !floorReady || regeneration, regeneration }), explanation: regeneration ? "An upstream change needs replacement and deliberate regeneration." : !floorReady ? "Lock every floor before binding plan and orientation evidence." : planReady ? "Current plan, full-colour evidence and orientation are bound." : "Add the missing plan, evidence or orientation lock.", primaryAction: regeneration ? { href: "/spatial", label: "Resolve regeneration" } : { href: "/spatial", label: "Open spatial setup" }, recoveryAction: regeneration ? { href: "/files", label: "Review replacement evidence" } : !floorReady ? { href: "/ops", label: "Review floor setup" } : undefined, technical: `orientationLocked=${Boolean(caseRecord?.orientationLocked)}; currentPlans=${floors.filter((floor) => currentPlan(state, caseRecord, floor.id)).length}/${floors.length}` },
    { id: "gridding", number: 5, title: "Gridding, 32D/16D and manual sheet", purpose: "Confirm the Founder-prepared marked evidence and original utility sheet for each floor.", status: moduleStatus({ complete: manualReady, started: Boolean(floors.some((floor) => currentSpatialEvidence(state, caseRecord, floor.id, currentPlan(state, caseRecord, floor.id)?.id))), blocked: !planReady || regeneration, regeneration }), explanation: regeneration ? "Use the exact replacement version, then confirm it again." : !planReady ? "Complete plans and orientation before gridding evidence." : manualReady ? "Both marked mappings and the approved manual sheet are present per floor." : "Missing a Founder confirmation or approved manual utility sheet.", primaryAction: { href: manualReady ? "/evaluation" : "/files", label: manualReady ? "Review evaluation readiness" : "Confirm floor evidence" }, recoveryAction: !manualReady ? { href: "/spatial", label: "Open 32D/16D mapping" } : undefined, technical: `manualSheets=${state.caseDocuments.filter((item) => item.caseId === caseRecord?.id && item.assetType === "MANUAL_UTILITY_SHEET" && item.founderApprovalStatus === "APPROVED").length}; markedEvidence=${state.spatialEvidenceVersions.filter((item) => item.caseId === caseRecord?.id && item.status === "CURRENT").length}` },
    { id: "evaluation", number: 6, title: "Utility and Shakti evaluation", purpose: "Run only the approved, versioned evaluation inputs for each exact floor.", status: moduleStatus({ complete: evaluationReady, started: Boolean(state.evaluationSnapshots.some((item) => item.caseId === caseRecord?.id)), blocked: !manualReady || regeneration, regeneration }), explanation: regeneration ? "Evaluation outputs are stale and need deliberate regeneration." : !manualReady ? "Evaluation stays blocked until marked evidence and manual sheet approval are complete." : evaluationReady ? "Utility and Shakti outputs are versioned for every floor." : "The evaluation workspace is ready for the next approved input.", primaryAction: { href: "/evaluation", label: evaluationReady ? "Review evaluation" : "Open evaluation" }, recoveryAction: !manualReady ? { href: "/files", label: "Complete evidence first" } : regeneration ? { href: "/spatial", label: "Resolve regeneration" } : undefined, technical: `evaluations=${state.evaluationSnapshots.filter((item) => item.caseId === caseRecord?.id).length}; utilityVerdicts=${(state.utilityVerdicts ?? []).filter((item) => item.caseId === caseRecord?.id).length}; shakti=${state.shaktiSnapshots.filter((item) => item.caseId === caseRecord?.id).length}` },
    { id: "site", number: 7, title: "Site analysis and post-site findings", purpose: "Record human site observations and the linked layout review without rerunning evaluation.", status: moduleStatus({ complete: siteReady, started: Boolean(state.siteAnalyses.some((item) => item.caseId === caseRecord?.id)), blocked: !verdictReady || regeneration, regeneration }), explanation: regeneration ? "Site records depend on an upstream version that needs regeneration." : !verdictReady ? "Present and review the Stage A verdict before opening site analysis." : siteReady ? "Site analysis and Post-Site Findings are approved for every floor." : "The exact floor is ready for human site review.", primaryAction: { href: "/site", label: siteReady ? "Review site findings" : "Open site analysis" }, recoveryAction: !verdictReady ? { href: "/reports", label: "Open Stage A verdict" } : regeneration ? { href: "/reports", label: "Review upstream verdict" } : undefined, technical: `siteApproved=${state.siteAnalyses.filter((item) => item.caseId === caseRecord?.id && item.status === "FOUNDER_APPROVED").length}; postSiteApproved=${state.postSiteFindings.filter((item) => item.caseId === caseRecord?.id && item.status === "FOUNDER_APPROVED").length}` },
    { id: "verdict", number: 8, title: "Stage A verdict and Founder review", purpose: "Present the exact floor verdict, verify its evidence and record the Founder checkpoint.", status: moduleStatus({ complete: verdictReady, started: Boolean(floors.some((floor) => floor.stageAVerdictStatus)), blocked: !evaluationReady || regeneration, regeneration }), explanation: regeneration ? "The verdict depends on an upstream version that needs regeneration." : !evaluationReady ? "Complete evaluation before generating the Stage A verdict." : verdictReady ? "Each floor has a presented verdict and Founder review checkpoint." : "Generate, present and review each floor verdict.", primaryAction: { href: "/reports", label: verdictReady ? "Review Stage A history" : "Open Stage A verdict" }, recoveryAction: !evaluationReady ? { href: "/evaluation", label: "Complete evaluation" } : regeneration ? { href: "/spatial", label: "Resolve regeneration" } : undefined, technical: `presentedFloors=${floors.filter((floor) => floor.stageAVerdictStatus === "PRESENTED").length}/${floors.length}; reviewCheckpoints=${state.stageAFloorApprovalCheckpoints.filter((item) => item.caseId === caseRecord?.id && item.checkpoint === "FOUNDER_REVIEWED").length}` },
    { id: "balance", number: 9, title: "Balance and payment clearance", purpose: "Confirm the remaining balance after verdict presentation.", status: moduleStatus({ complete: balanceReady, started: Boolean(caseRecord?.balanceApproved || caseRecord?.fullPaymentApproved), blocked: !verdictReady, ready: Boolean(verdictReady && !balanceReady) }), explanation: !verdictReady ? "Balance remains locked until every floor verdict is presented." : balanceReady ? "Full balance is confirmed for this case." : "Record and confirm the remaining balance before report approval.", primaryAction: { href: "/payment-proofs", label: balanceReady ? "Review payment history" : "Confirm balance" }, recoveryAction: !verdictReady ? { href: "/reports", label: "Review Stage A verdict" } : undefined, technical: `balanceApproved=${Boolean(caseRecord?.balanceApproved)}; fullPaymentApproved=${Boolean(caseRecord?.fullPaymentApproved)}` },
    { id: "report", number: 10, title: "Founder approval and protected report", purpose: "Approve and release each immutable one-floor report after every gate passes.", status: moduleStatus({ complete: reportReady, started: Boolean(floors.some((floor) => floor.reportStatus && floor.reportStatus !== "DRAFT")), blocked: !balanceReady || regeneration, regeneration }), explanation: regeneration ? "A report dependency needs regeneration; released artifacts remain unchanged." : !balanceReady ? "Official report approval stays locked until full balance is confirmed." : reportReady ? "Every floor has a released protected report." : "Review, approve and release the next floor report.", primaryAction: { href: "/reports", label: reportReady ? "Review released reports" : "Open report approval" }, recoveryAction: !balanceReady ? { href: "/payment-proofs", label: "Complete balance clearance" } : regeneration ? { href: "/spatial", label: "Resolve regeneration" } : undefined, technical: `releasedFloors=${floors.filter((floor) => floor.reportStatus === "RELEASED").length}/${floors.length}; reportStatus=${caseRecord?.reportStatus ?? "none"}` },
    { id: "delivery", number: 11, title: "Delivery history and follow-up", purpose: "Keep the internal delivery record ready without opening client delivery in Founder Edition.", status: "BLOCKED", explanation: "Client delivery is intentionally disabled in this release. Internal history remains available after release.", primaryAction: { href: "/delivery", label: "Open internal history" }, recoveryAction: { href: "/reports", label: "Review released report" }, technical: "clientDelivery=DEFERRED; internalDeliveryHistory=STAFF_ONLY" },
    { id: "remedial", number: 12, title: "Stage B remedial handoff", purpose: "Reserve the handoff from the released Stage A version without inventing remedy logic.", status: "BLOCKED", explanation: "BLOCKED — METHOD INPUT REQUIRED. The remedial PRD and approved rules are not active.", primaryAction: { href: "/methodology", label: "Review methodology status" }, recoveryAction: { href: "/reports", label: "Review Stage A release" }, technical: `reservations=${state.remedialWorkflowReservations.filter((item) => item.caseId === caseRecord?.id).length}; status=BLOCKED_METHOD_INPUT` }
  ];
  const recommended = modules.find((item) => item.status !== "COMPLETE") ?? modules[modules.length - 1];
  return { client, caseRecord, project, modules, floors: floorProgresses, recommendedModuleId: recommended.id };
}
