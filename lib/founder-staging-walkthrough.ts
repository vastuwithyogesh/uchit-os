export type FounderStagingUiState = "empty" | "loading" | "error" | "retry" | "permissionDenied" | "success";

export type FounderStagingStep = {
  id: string;
  order: number;
  title: string;
  route: string;
  component: string;
  actions: string[];
  prerequisite: string;
  scope: string;
  gate: string;
  manualChecks: string[];
  blockedChecks: string[];
  uiStates: FounderStagingUiState[];
};

export const FOUNDER_STAGING_UI_STATES: FounderStagingUiState[] = ["empty", "loading", "error", "retry", "permissionDenied", "success"];

export const FOUNDER_STAGING_STEPS: FounderStagingStep[] = [
  {
    id: "advance-confirmation", order: 1, title: "Advance confirmation", route: "/crm", component: "components/commercial-console.tsx",
    actions: ["proposal-create", "proposal-approve", "advance-pay", "advance-proof-verify"], prerequisite: "Approved scope/proposal with starting fee and minimum advance policy.",
    scope: "organisation → client → proposal/payment proof", gate: "Advance proof and confirmation must be approved before a Vastu Case ID exists.",
    manualChecks: ["Confirm the proposal terms snapshot.", "Upload/select immutable advance proof and confirm the exact amount is at least the configured minimum.", "Repeat the same request only with the same idempotency key; expect the original result."],
    blockedChecks: ["Case creation before confirmed advance must return a lifecycle conflict.", "Amounts below the configured minimum, foreign proof, missing concurrency, and unauthorised verification must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "case-intake-floors", order: 2, title: "Case, intake and floor workspaces", route: "/crm", component: "components/client-intake-form.tsx + components/workflow-console.tsx",
    actions: ["case-create", "client-intake-upsert", "case-service-configure", "floor-create"], prerequisite: "Confirmed advance and active Founder organisation context.",
    scope: "organisation → permanent client → case/project → exact floor", gate: "Case ID is created once after confirmed advance; every floor receives its own workspace and record version.",
    manualChecks: ["Complete the approved intake fields without entering unsupported methodology.", "Create the confirmed floor count and verify separate floor selectors/workspaces.", "Confirm project-level assignment only; no floor-level consultant split."],
    blockedChecks: ["Client-supplied organisation or owner fields must not override server scope.", "Cross-case/client/floor references, duplicate case creation, stale revisions, and incomplete service setup must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "plan-and-evidence", order: 3, title: "Plan and evidence upload", route: "/spatial", component: "components/spatial-workspace.tsx + components/files-drawings-console.tsx",
    actions: ["/api/case-files (POST/GET)", "plan-version-create", "case-document-upsert"], prerequisite: "Exact active case and selected floor.",
    scope: "organisation → project/case → exact floor → current plan version", gate: "Protected files are immutable, opaque, checksum-bound and never exposed through public/client routes.",
    manualChecks: ["Upload one distinct plan file per floor through the protected case-file route.", "Record exactly one current plan version per floor.", "Upload/select the original full-colour hand-marked utility sheet and verify its immutable evidence metadata."],
    blockedChecks: ["Missing file, wrong floor, foreign case, unsafe reference, duplicate current version, or artifacted report mutation must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "orientation-lock", order: 4, title: "Orientation evidence and deliberate lock", route: "/spatial", component: "components/spatial-workspace.tsx",
    actions: ["spatial-evidence-create", "orientation-version-lock"], prerequisite: "Current project evidence and exact numeric degree input.",
    scope: "organisation → project/case → locked orientation evidence → dependent floors", gate: "Google Earth evidence, valid numeric degree, reason and deliberate Founder lock are required; no degree boundary is inferred.",
    manualChecks: ["Record the Google Earth evidence at project scope.", "Enter the exact measured degree and a bounded reason.", "Deliberately lock it and verify the prior version remains historical."],
    blockedChecks: ["Missing/invalid evidence, invalid degree, short reason, stale revision, or an attempted silent unlock must fail closed and create regeneration dependencies."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "manual-gridding", order: 5, title: "Manual 32D/16D gridding evidence", route: "/spatial", component: "components/spatial-workspace.tsx",
    actions: ["spatial-evidence-create", "opening-mapping-create", "space-mapping-create"], prerequisite: "Current plan and locked orientation for the selected floor.",
    scope: "organisation → case → exact floor → exact current plan/orientation/evidence", gate: "Founder-confirmed marked 32-sector chakra and separate marked 16-direction evidence are mandatory; uploaded evidence is authoritative.",
    manualChecks: ["Upload a different full-colour hand-marked 32D sheet for each floor and explicitly confirm the overlay visibly contains exactly 32 sectors.", "Upload a separate full-colour hand-marked 16D sheet for each floor and explicitly confirm floor/plan ownership.", "Treat Brahmasthan, Marmaa and energy graph sheets as manual evidence only."],
    blockedChecks: ["Missing/false confirmation, cross-floor/plan references, unverified evidence, geometry calculation, sector inference, direction-boundary guessing, and automatic findings must remain blocked."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "evaluation", order: 6, title: "Approved Utility and Shakti evaluation", route: "/evaluation", component: "components/evaluation-console.tsx",
    actions: ["utility-evaluate", "utility-verdict", "shakti-rank"], prerequisite: "All floor prerequisites, approved methodology bindings, current evidence and no open regeneration blockers.",
    scope: "organisation → active case → exact floor/plan/orientation → methodology version", gate: "UtilityMaster and approved graph rules are deterministic and version-pinned; AOU remains separate framing input.",
    manualChecks: ["Run only known, non-conflicting UtilityMaster rows.", "Verify source rule IDs, workbook hash/version and deterministic replay.", "Review one element at a time for the frozen Shakti graph/verdict."],
    blockedChecks: ["Unknown utility, unsupported direction, missing/contradictory methodology, changed workbook hash, cross-floor inputs, open regeneration, and generic remedies must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "stage-a", order: 7, title: "Stage A preview and verdict presentation", route: "/reports", component: "components/report-console.tsx",
    actions: ["preview-report", "stage-a-present", "final-report-prepare"], prerequisite: "Current valid floor evaluation/verdict and resolved review blockers.",
    scope: "one organisation → one case → one floor → one report version", gate: "Preview is watermarked and internal-only; presentation records the exact immutable Stage A version.",
    manualChecks: ["Generate the watermarked internal preview.", "Confirm the exact floor version was presented.", "Verify preview direct download/print/export is denied server-side."],
    blockedChecks: ["Missing evidence/evaluation, unresolved Review Required or Needs Regeneration, cross-floor report, preview export, and direct object URL must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "site-review", order: 8, title: "Site Analysis and Post-Site Findings", route: "/site", component: "components/site-analysis-console.tsx",
    actions: ["site-analysis-upsert", "site-analysis-checkpoint", "post-site-findings-upsert", "post-site-findings-checkpoint"], prerequisite: "Presented exact Stage A verdict for the selected floor.",
    scope: "organisation → case/project → exact floor → presented verdict/evaluation version", gate: "Human observations and protected evidence only; no automatic redesign or engine rerun.",
    manualChecks: ["Record video analysis or physical visit observations for site, entrance, surroundings, light, ventilation, airflow, neighbouring effects and relevant observations.", "Founder-review and Founder-approve the Site Analysis.", "Record and approve the linked Post-Site Findings/Layout Review."],
    blockedChecks: ["No Stage A verdict, missing observation/evidence, wrong floor, stale lineage, unapproved Site Analysis, or attempt to rerun evaluation must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "balance", order: 9, title: "Balance payment clearance", route: "/crm", component: "components/commercial-console.tsx",
    actions: ["balance-pay", "balance-proof-verify"], prerequisite: "Presented Stage A verdict and reconciled remaining balance.",
    scope: "organisation → client/proposal → active case", gate: "Full balance proof and Founder-authorized confirmation are required before report approval/release.",
    manualChecks: ["Record the remaining balance proof with immutable metadata.", "Confirm the reconciled amount and verify the case gate changes only after approval."],
    blockedChecks: ["Balance before presentation, short payment, foreign proof, duplicate non-idempotent confirmation, stale revision, and unauthorised verification must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "approval-pdf", order: 10, title: "Founder approval and protected PDF", route: "/reports", component: "components/report-console.tsx + protected report routes",
    actions: ["report-approve", "verdict-release", "GET /api/reports/:reportId/pdf?mode=export|print"], prerequisite: "Exact floor report, full balance, Founder review and all release blockers resolved.",
    scope: "organisation → case/project → exact floor/report version → immutable artifact", gate: "FOUNDER_REVIEWED → FOUNDER_APPROVED → PDF_GENERATED → PDF_VERIFIED → RELEASED; print allowed, editing/copying/page extraction blocked.",
    manualChecks: ["Record Founder review and approval for the exact floor version.", "Verify embedded original full-colour hand-marked sheet checksum.", "Export/print only after RELEASED with authenticated Founder access and private no-store headers."],
    blockedChecks: ["Missing balance, Founder approval, manual sheet, current evaluation, open regeneration, methodology blocker, hash mismatch, preview export, cross-floor/object URL, or in-place released mutation must fail closed."], uiStates: FOUNDER_STAGING_UI_STATES
  },
  {
    id: "delivery-history", order: 11, title: "Internal floor delivery history", route: "/delivery", component: "components/delivery-console.tsx",
    actions: ["delivery-milestone-upsert (internal milestone only)"], prerequisite: "Released protected floor PDF.",
    scope: "organisation → active case revision → exact floor", gate: "History may be recorded internally; public/client delivery remains disabled in Founder Edition.",
    manualChecks: ["Review the released floor artifact, release actor/time and internal delivery history.", "Verify a partial floor release never closes the project while another floor is incomplete."],
    blockedChecks: ["Client portal delivery, public share links, unscoped delivery, and any attempt to mark the overall project complete early remain blocked."], uiStates: FOUNDER_STAGING_UI_STATES
  }
];

export type FounderStagingRecovery = { condition: string; expectedStatus: 400 | 403 | 404 | 409 | 428 | 503; operatorAction: string; stateImpact: string };

export const FOUNDER_STAGING_RECOVERY_MATRIX: FounderStagingRecovery[] = [
  { condition: "Missing required file/evidence", expectedStatus: 409, operatorAction: "Upload/select the exact protected file, then retry with a new idempotency key only if the request is materially new.", stateImpact: "No partial mutation; dependent work remains blocked." },
  { condition: "Missing or stale record/global revision", expectedStatus: 428, operatorAction: "Reload bootstrap/session and resubmit the unchanged draft with both current tokens.", stateImpact: "No mutation or audit duplication." },
  { condition: "Stale record/global revision after tokens supplied", expectedStatus: 409, operatorAction: "Reload latest case/floor, compare changes, and deliberately reapply the draft.", stateImpact: "Rollback preserves prior state and unsaved UI draft." },
  { condition: "Cross-floor, cross-case, cross-plan or cross-organisation reference", expectedStatus: 404, operatorAction: "Return to the selected active floor and choose an evidence/version from that exact scope.", stateImpact: "No foreign data is read or changed." },
  { condition: "Payment pending or unreconciled", expectedStatus: 409, operatorAction: "Complete the required proof verification; do not bypass the gate from the report UI.", stateImpact: "Report approval/release remains locked." },
  { condition: "Founder review/approval pending", expectedStatus: 409, operatorAction: "Use the exact report version's next checkpoint; never approve a successor or different floor by substitution.", stateImpact: "Artifact remains unreleased." },
  { condition: "Methodology Review Required or Blocked — Methodology Input Required", expectedStatus: 409, operatorAction: "Open the methodology owner queue and resolve only with an approved version/rule; do not guess.", stateImpact: "No evaluation, verdict, remedy or report output is generated." },
  { condition: "Needs Regeneration/open invalidation", expectedStatus: 409, operatorAction: "Use the floor queue: require replacement → bind regenerated version → verify Ready for Review.", stateImpact: "Old evaluations/reports remain historical; draft outputs stay blocked." },
  { condition: "Unauthorised role or inactive membership", expectedStatus: 403, operatorAction: "Sign in with the active Founder-authorized organisation owner; do not retry silently.", stateImpact: "No data or audit mutation." },
  { condition: "Durable storage unavailable", expectedStatus: 503, operatorAction: "Stop the walkthrough, record the operational failure, and retry only after storage readiness is restored.", stateImpact: "Atomic rollback/no partial release." }
];

export const FOUNDER_STAGING_BLOCKED_ACTIONS = Object.freeze([
  "Client portal/public delivery",
  "Preview PDF download/print/export",
  "Direct private object URLs",
  "Computed 32D/16D geometry, sector inference or degree-boundary classification",
  "Unapproved Site/Environment scoring or automatic findings",
  "Stage B remedy selection, thresholds, priorities, sequencing or report language",
  "Lovable database sync/import/webhooks",
  "In-place mutation of released reports or evidence"
]);

export function buildFounderStagingDryRunPlan(input: { organisationId: string; clientId: string; projectId: string; caseId: string; floorIds: string[]; expectedRevision: number; expectedRecordVersions: Record<string, number> }) {
  if (!input.organisationId || !input.clientId || !input.projectId || !input.caseId || input.floorIds.length < 1) throw new Error("Founder staging dry-run requires synthetic organisation, client, project, case and floor IDs.");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Founder staging dry-run requires a non-negative expected global revision.");
  return {
    mode: "FOUNDER_STAGING_DRY_RUN" as const,
    writes: false,
    externalWrites: false,
    clientDeliveryEnabled: false,
    organisationId: input.organisationId,
    scope: { clientId: input.clientId, projectId: input.projectId, caseId: input.caseId, floorIds: [...input.floorIds] },
    concurrency: { expectedRevision: input.expectedRevision, expectedRecordVersions: { ...input.expectedRecordVersions } },
    steps: FOUNDER_STAGING_STEPS.map((step) => ({ id: step.id, order: step.order, route: step.route, actions: [...step.actions], scope: step.scope, gate: step.gate })),
    blockedActions: [...FOUNDER_STAGING_BLOCKED_ACTIONS],
    recoveryMatrix: FOUNDER_STAGING_RECOVERY_MATRIX.map((item) => ({ ...item }))
  };
}
