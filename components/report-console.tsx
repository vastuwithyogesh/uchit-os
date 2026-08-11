"use client";

import { useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
import { FounderStepCard } from "@/components/founder-step-card";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { canApproveReport, canEditFloorWorkspaces, canReleaseVerdict } from "@/lib/permissions";
import { canReleaseOfficialVerdict, formatMoney, isPreviewWatermarked } from "@/lib/workflows";
import { buildActionHeaders } from "@/lib/request-helpers";

type FounderBootstrapState = AppState & { foundation?: { isFounderEdition?: boolean } };
type ProtectedPdfArtifact = { artifactId: string; reportVersionId: string; status: "GENERATED" | "VERIFIED" | "RELEASED" | "SUPERSEDED"; recordVersion: number; artifactHashSha256: string; sizeBytes: number; pageCount: number; securityProfile: string };

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load report state");
  }
  return response.json() as Promise<FounderBootstrapState>;
}

async function postAction(payload: Record<string, unknown>, role?: string) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: buildActionHeaders(role as never),
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Request failed");
  }

  return result;
}

async function fetchPdfStatus(reportId: string) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/pdf?mode=status`, { cache: "no-store" });
  if (!response.ok) return null;
  const result = await response.json();
  return (result.artifact ?? null) as ProtectedPdfArtifact | null;
}

export function ReportConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<FounderBootstrapState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose “Load reports” to begin.");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedFloorId, setSelectedFloorId] = useState("");
  const [approvalComment, setApprovalComment] = useState("Reviewed against the evaluation snapshot and report layout.");
  const [presentationNote, setPresentationNote] = useState("Stage A findings and the watermarked verdict preview were presented and discussed with the client.");
  const [pdfArtifact, setPdfArtifact] = useState<ProtectedPdfArtifact | null>(null);

  const clients = state?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const currentCase = state && selectedClient ? getActiveCaseForClient(state, selectedClient.id) : undefined;
  const floors = state?.floorWorkspaces?.filter((item) => item.caseId === currentCase?.id) ?? [];
  const selectedFloor = floors.find((item) => item.id === selectedFloorId) ?? floors[0];
  const reports = state?.reportVersions?.filter((item) => item.caseId === currentCase?.id && item.floorId === selectedFloor?.id) ?? [];
  const previewReport = reports.find((item) => item.isPreview);
  const finalReport = reports.find((item) => !item.isPreview);
  const reportHistory = reports;
  const remedialReservation = state?.remedialWorkflowReservations?.find((item) => item.stageAReportId === finalReport?.id && item.floorId === selectedFloor?.id);
  const isFounderEdition = state?.foundation?.isFounderEdition === true;
  const founderReviewDone = Boolean(finalReport?.approvalEvidence?.some((item) => item.checkpoint === "FOUNDER_REVIEWED"));
  const founderApprovalDone = Boolean(finalReport?.approvalEvidence?.some((item) => item.checkpoint === "FOUNDER_APPROVED"));
  const approvalCount = isFounderEdition ? Number(founderReviewDone) + Number(founderApprovalDone) : finalReport?.approvals?.length ?? 0;
  const canApproveCurrentReport = Boolean(finalReport) && canApproveReport(activeUser);
  const balancePayment = state?.payments?.find((payment) => payment.caseId === currentCase?.id && payment.type === "BALANCE");
  const verdictReadyByState = Boolean(
    currentCase &&
      finalReport &&
      approvalCount >= 2 &&
      canReleaseOfficialVerdict(currentCase, balancePayment)
  );
  const canReleaseCurrentVerdict = Boolean(finalReport) && canReleaseVerdict(activeUser) && verdictReadyByState && pdfArtifact?.status === "VERIFIED";
  const canPrepareFinalReport = Boolean(
    currentCase &&
      currentCase.balanceApproved &&
      currentCase.fullPaymentApproved &&
      balancePayment?.status === "APPROVED" &&
      Boolean(balancePayment.proofAssetId)
  );
  const watermarkActive = Boolean(previewReport && isPreviewWatermarked(previewReport));
  const blockerReasons = [
    !previewReport ? "Preview report has not been generated yet." : null,
    !finalReport ? "Final report has not been prepared yet." : null,
    currentCase && !currentCase.balanceApproved ? "Balance is still pending." : null,
    currentCase && !currentCase.fullPaymentApproved ? "Full payment is not approved yet." : null,
    currentCase && balancePayment?.status !== "APPROVED" ? "Balance payment record is not approved." : null,
    currentCase && balancePayment?.status === "APPROVED" && !balancePayment.proofAssetId ? "Balance payment uses legacy evidence and must be reconciled before final release." : null,
    finalReport && approvalCount < 2 ? (isFounderEdition ? "Founder review and Founder approval are required before release." : "Two report approvals are required before verdict release.") : null,
    finalReport && founderApprovalDone && !pdfArtifact ? "Protected PDF has not been generated yet." : null,
    pdfArtifact?.status === "GENERATED" ? "Protected PDF integrity verification is pending." : null,
    finalReport && !canReleaseVerdict(activeUser) ? "Your role cannot release verdicts." : null
  ].filter(Boolean) as string[];

  const nextAction = (() => {
    if (!currentCase) return "Open a case before starting its report.";
    if (!previewReport) return "Create the watermarked preview.";
    if (!canPrepareFinalReport) return "Wait for the balance payment to be approved.";
    if (!finalReport) return "Prepare the final report now.";
    if (approvalCount < 2) return isFounderEdition ? (founderReviewDone ? "Record Founder approval." : "Record Founder review.") : "Collect the remaining report approvals.";
    if (!verdictReadyByState) return "Clear the remaining verdict blockers.";
    if (!pdfArtifact) return "Generate the protected PDF.";
    if (pdfArtifact.status === "GENERATED") return "Verify PDF integrity and protection.";
    if (pdfArtifact.status === "VERIFIED") return "Release the verified PDF.";
    return "The immutable PDF is released. Export or print it when authorised.";
  })();

  const releaseChecklist = [
    { label: "Preview exists", done: Boolean(previewReport), note: previewReport ? previewReport.status : "Generate the Stage-A preview first" },
    {
      label: "Balance approved",
      done: Boolean(currentCase?.balanceApproved && currentCase?.fullPaymentApproved && balancePayment?.status === "APPROVED" && balancePayment.proofAssetId),
      note: balancePayment?.proofAssetId ? "Balance and scoped receipt are verified" : currentCase?.balanceApproved ? "Legacy receipt must be reconciled" : "Balance is still pending"
    },
    { label: "Final report prepared", done: Boolean(finalReport), note: finalReport ? finalReport.status : "Prepare the official report" },
    { label: isFounderEdition ? "Founder checkpoints logged" : "Two approvals logged", done: approvalCount >= 2, note: `${approvalCount} / 2 checkpoints` },
    { label: "Protected PDF verified", done: pdfArtifact?.status === "VERIFIED" || pdfArtifact?.status === "RELEASED", note: pdfArtifact?.status ?? "Generate after Founder approval" },
    { label: "Release role allowed", done: canReleaseVerdict(activeUser), note: canReleaseVerdict(activeUser) ? "Role permitted" : "Admin or Super-Admin needed" }
  ];

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const nextState = await fetchState();
      setState(nextState);
      const nextClientId = preferredClientId ?? selectedClientId ?? nextState.clients?.[0]?.id ?? "";
      setSelectedClientId(nextClientId);
      const nextCase = nextClientId ? getActiveCaseForClient(nextState, nextClientId) : undefined;
      const nextFloors = nextState.floorWorkspaces.filter((item) => item.caseId === nextCase?.id);
      const nextFloor = nextFloors.find((item) => item.id === selectedFloorId) ?? nextFloors[0];
      const nextFinal = nextState.reportVersions.find((item) => item.caseId === nextCase?.id && item.floorId === nextFloor?.id && !item.isPreview);
      setPdfArtifact(nextFinal ? await fetchPdfStatus(nextFinal.id) : null);
      setMessage("Live report state refreshed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, successMessage: string, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true);
    try {
      const actionName = String(action.action ?? "");
      let payload = action;
      if (["preview-report", "final-report-prepare", "stage-a-present", "report-approve", "verdict-release"].includes(actionName)) {
        const protectedEntity = ["preview-report", "final-report-prepare", "stage-a-present"].includes(actionName) ? currentCase : finalReport;
        if (state?.persistenceRevision === undefined || state.persistenceRevision === null || !protectedEntity) throw new Error("Reload the latest report before this protected action.");
        payload = { ...action, expectedRecordVersion: protectedEntity.recordVersion ?? 0, expectedRevision: state.persistenceRevision,
          idempotencyKey: `founder:${actionName}:${protectedEntity.id}:${protectedEntity.recordVersion ?? 0}` };
      }
      await postAction(payload, activeUser.role);
      await refresh(selectedClient?.id);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPdf(action: "generate" | "verify" | "release", confirmation: string) {
    if (!window.confirm(confirmation) || !finalReport || state?.persistenceRevision === null || state?.persistenceRevision === undefined) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(finalReport.id)}/pdf`, {
        method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action,
          expectedRecordVersion: finalReport.recordVersion ?? 0, expectedRevision: state.persistenceRevision,
          ...(action === "generate" ? {} : { expectedArtifactVersion: pdfArtifact?.recordVersion }),
          idempotencyKey: `founder:pdf:${action}:${finalReport.id}:${action === "generate" ? finalReport.artifact?.contentHash : pdfArtifact?.artifactId}` })
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error ?? "Protected PDF action failed");
      setPdfArtifact(result.result.artifact); await refresh(selectedClient?.id);
      setMessage(action === "generate" ? "Protected PDF generated" : action === "verify" ? "PDF integrity verified" : "Protected PDF released");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Protected PDF action failed"); }
    finally { setBusy(false); }
  }

  return (
    <section className="section-grid">
      <div className="card span-8 founder-work-surface">
        <div className="founder-context-bar" aria-label="Current report context"><span>Reports</span><span aria-hidden="true">→</span><strong>{selectedClient?.displayName ?? "Choose a client"}</strong><span aria-hidden="true">→</span><span>{selectedFloor?.floorLabel ?? "Floor"}</span></div>
        <FounderStepCard
          step="Current release task"
          title={nextAction}
          description="Work on one floor report at a time. Preview stays internal; export and print are available only after the protected release gate passes."
          tone={canReleaseCurrentVerdict ? "ready" : blockerReasons.length ? "blocked" : "attention"}
          status={canReleaseCurrentVerdict ? "Ready" : blockerReasons.length ? "Blocked" : "In progress"}
          className="founder-step-card-primary"
        >
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{previewReport ? "Yes" : "No"}</span>
            <span className="stat-label">preview ready</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{watermarkActive ? "On" : "Off"}</span>
            <span className="stat-label">preview watermark</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{approvalCount}</span>
            <span className="stat-label">approvals</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{verdictReadyByState ? "Ready" : "Blocked"}</span>
            <span className="stat-label">ready to release</span>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="workflow">
            <button className={state ? "button-secondary" : "button"} type="button" onClick={() => refresh()} disabled={busy} aria-busy={busy}>
              {state ? "Refresh" : "Load reports"}
            </button>
            <label htmlFor="report-client"><strong>Client</strong></label>
            <select id="report-client" aria-label="Choose a client" value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="report-floor"><strong>Floor</strong></label>
            <select id="report-floor" aria-label="Choose a floor" value={selectedFloor?.id ?? ""} onChange={(event) => { setSelectedFloorId(event.target.value); setPdfArtifact(null); }} style={{ minWidth: 180 }}>
              {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.floorLabel}</option>)}
            </select>
          </div>
          <div className="workflow" style={{ marginTop: 14 }}>
            <button
              type="button"
              className={!previewReport ? "button" : "button-secondary"}
              disabled={busy || !currentCase || !selectedFloor || !canEditFloorWorkspaces(activeUser)}
              onClick={() => run({ action: "preview-report", caseId: currentCase?.id, floorId: selectedFloor?.id }, "Stage-A floor preview generated")}
            >
              Create preview
            </button>
            <button
              type="button"
              className={previewReport && canPrepareFinalReport && !finalReport ? "button" : "button-secondary"}
              disabled={busy || !currentCase || !selectedFloor || selectedFloor.stageAVerdictStatus !== "PRESENTED" || !canPrepareFinalReport || !canEditFloorWorkspaces(activeUser)}
              onClick={() => run({ action: "final-report-prepare", caseId: currentCase?.id, floorId: selectedFloor?.id }, "Final floor report prepared")}
            >
              Prepare final report
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !currentCase || !selectedFloor || !previewReport || selectedFloor.stageAVerdictStatus === "PRESENTED"}
              onClick={() => run({ action: "stage-a-present", caseId: currentCase?.id, floorId: selectedFloor?.id, note: presentationNote }, "Stage A floor verdict presentation saved", "Confirm that this exact watermarked floor Stage A version was presented?")}
            >
              Record verdict presentation
            </button>
            <button
              type="button"
              className={Boolean(finalReport) && approvalCount < 2 ? "button" : "button-secondary"}
              disabled={busy || !canApproveCurrentReport}
              onClick={() => run({ action: "report-approve", reportId: finalReport?.id, comment: approvalComment }, isFounderEdition && !founderReviewDone ? "Founder review saved" : "Approval saved", "Approve this exact report version? This action is recorded in the permanent history.")}
            >
              {isFounderEdition ? (founderReviewDone ? "Founder approve" : "Founder review") : "Approve final report"}
            </button>
            <button type="button" className={founderApprovalDone && !pdfArtifact ? "button" : "button-secondary"}
              disabled={busy || !founderApprovalDone || Boolean(pdfArtifact)}
              onClick={() => runPdf("generate", "Generate one immutable encrypted PDF from this exact approved floor report and full-colour evidence?")}>Generate protected PDF</button>
            <button type="button" className={pdfArtifact?.status === "GENERATED" ? "button" : "button-secondary"}
              disabled={busy || pdfArtifact?.status !== "GENERATED"}
              onClick={() => runPdf("verify", "Verify the PDF hash, embedded evidence, and print-only permission profile?")}>Verify PDF</button>
            <button type="button" className={canReleaseCurrentVerdict ? "button" : "button-secondary"}
              disabled={busy || !canReleaseCurrentVerdict}
              onClick={() => runPdf("release", "Release this verified immutable PDF? The released bytes and report version cannot be replaced in place.")}>Release protected PDF</button>
          </div>
          {finalReport ? (
            <div style={{ marginTop: 14 }}>
              <label htmlFor="approval-comment"><strong>Why are you approving this report?</strong></label>
              <textarea id="approval-comment" value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} rows={3} style={{ width: "100%", marginTop: 6 }} />
            </div>
          ) : null}
          {previewReport && selectedFloor?.stageAVerdictStatus !== "PRESENTED" ? <div style={{ marginTop: 14 }}><label htmlFor="presentation-note"><strong>What was presented?</strong></label><textarea id="presentation-note" value={presentationNote} onChange={(event) => setPresentationNote(event.target.value)} rows={3} style={{ width: "100%", marginTop: 6 }} /></div> : null}
        </div>
        </FounderStepCard>
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{previewReport?.versionLabel ?? "Stage-A Preview"}</strong>
                <div className="meta">{currentCase?.caseNumber ?? "No case loaded"}</div>
              </div>
              <span className={`tag ${watermarkActive ? "warn" : "good"}`}>
                {watermarkActive ? "Watermarked" : "Clear"}
              </span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Preview status</strong>
                <span className="meta">{previewReport?.status ?? "Not created"}</span>
              </div>
              <div className="list-item">
                <strong>Watermark note</strong>
                <span className="meta">{previewReport?.watermarkText ?? "No preview note yet"}</span>
              </div>
              <div className="list-item">
                <strong>Balance gate</strong>
                <span className="meta">{currentCase?.balanceApproved ? "Cleared" : "Pending"}</span>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{finalReport?.versionLabel ?? "Official Verdict Report"}</strong>
                <div className="meta">Approval and release track</div>
              </div>
              <span className={`tag ${verdictReadyByState ? "good" : "warn"}`}>
                {verdictReadyByState ? "Ready" : "Blocked"}
              </span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              <div className="list-item">
                <strong>Final report status</strong>
                <span className="meta">{finalReport?.status ?? "Not prepared"}</span>
              </div>
              <div className="list-item">
                <strong>Approval count</strong>
                <span className="meta">{approvalCount} / 2</span>
              </div>
              <div className="list-item">
                <strong>Balance payment</strong>
                <span className="meta">{balancePayment ? `${balancePayment.status} · ${formatMoney(balancePayment.amountInr)}` : "Missing"}</span>
              </div>
              <div className="list-item">
                <strong>Case gate</strong>
                <span className="meta">{currentCase?.reportStatus ?? "DRAFT"}</span>
              </div>
              <div className="list-item">
                <strong>Protected PDF</strong>
                <span className="meta">{pdfArtifact ? `${pdfArtifact.status} · ${pdfArtifact.pageCount} pages` : "Not generated"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <strong>Report archive</strong>
              <div className="meta">Every saved report version stays in this history.</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {reportHistory.length ? (
              reportHistory.map((report) => (
                <div key={report.id} className="list-item">
                  <strong>{report.versionLabel}</strong>
                  <span className="meta">
                    {report.isPreview ? "Preview" : "Official"} · {report.status}
                  </span>
                  <div className="pill-row">
                    <span className={`tag ${report.isPreview ? "warn" : "good"}`}>{report.isPreview ? "Watermarked lane" : "Verdict lane"}</span>
                    <span className="pill">{report.approvals.length} approvals</span>
                    {report.artifact && !report.isPreview && report.status === "RELEASED" ? <><a className="button-secondary" href={`/api/reports/${encodeURIComponent(report.id)}/pdf?mode=export`}>Export PDF</a><a className="button-secondary" href={`/api/reports/${encodeURIComponent(report.id)}/pdf?mode=print`} target="_blank" rel="noreferrer">Print PDF</a></> : report.isPreview ? <span className="pill">Internal preview · export blocked</span> : <span className="pill">Export locked until protected release</span>}
                    {report.watermarkText ? <span className="pill">{report.watermarkText}</span> : null}
                  </div>
                  <details>
                    <summary>Technical and approval details</summary>
                    {report.artifact ? <span className="meta">File fingerprint: {report.artifact.contentHash} · Template: {report.artifact.templateVersion}</span> : null}
                    {(report.approvalEvidence ?? []).map((approval) => <span className="meta" key={`${report.id}-${approval.actorId}`}>{approval.actorName} ({approval.actorRole}) · {new Date(approval.approvedAt).toLocaleString("en-IN")} · {approval.comment}</span>)}
                  </details>
                </div>
              ))
            ) : (
              <div className="list-item">
                <strong>No reports for this client yet</strong>
                <span className="meta">Generate the preview to start the archive</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Release path</div>
        <h2>What must happen next</h2>
        <div className="panel" style={{ marginTop: 14 }}>
          <strong>{selectedClient?.displayName ?? "Select a client"}</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {nextAction}
          </div>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          {releaseChecklist.map((item) => (
            <div key={item.label} className="list-item">
              <strong>{item.label}</strong>
              <span className={`tag ${item.done ? "good" : "warn"}`}>{item.done ? "Done" : "Pending"}</span>
              <span className="meta">{item.note}</span>
            </div>
          ))}
        </div>
        {remedialReservation ? <div className="footer-note" style={{ marginTop: 12 }}><strong>Stage B reserved</strong><br />Blocked — Methodology Input Required. No remedy logic will run until Yogesh approves the remedial PRD and a versioned methodology adapter.</div> : null}
        {blockerReasons.length > 0 ? (
          <div className="footer-note" style={{ marginTop: 12 }}>
            Blockers: {blockerReasons.join(" ")}
          </div>
        ) : (
          <div className="footer-note" style={{ marginTop: 12 }}>
            All verdict gates are clear for the current case.
          </div>
        )}
        <div className="footer-note" role={message.toLowerCase().includes("failed") ? "alert" : "status"} aria-live="polite" style={{ marginTop: 12 }}>
          {message}
        </div>
      </div>
    </section>
  );
}
