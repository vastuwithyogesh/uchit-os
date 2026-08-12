"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { foundation?: { isFounderEdition?: boolean }; persistenceRevision?: number | null };
type Focus = "stage-a" | "assembly" | "approval" | "pdf";
type PdfArtifact = { artifactId: string; status: "GENERATED" | "VERIFIED" | "RELEASED" | "SUPERSEDED"; recordVersion: number; pageCount: number; securityProfile: string };

export function FounderReportStep({ focus, clientId, caseId, floorId }: { focus: Focus; clientId?: string; caseId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [pdf, setPdf] = useState<PdfArtifact | null>(null);
  const [note, setNote] = useState("Reviewed against the exact floor evidence, evaluation version and report composition.");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading the exact report version…");
  const [conflict, setConflict] = useState(false);
  const key = useRef(crypto.randomUUID());
  const refresh = useCallback(async () => {
    setBusy(true); setConflict(false);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" }); const value = await response.json() as Bootstrap; if (!response.ok) throw new Error("The report context could not be loaded."); setState(value);
      const exactCase = value.vastuCases.find((item) => item.id === caseId); const client = value.clients.find((item) => item.id === (clientId ?? exactCase?.clientId)) ?? value.clients[0]; const activeCase = exactCase ?? (client ? getActiveCaseForClient(value, client.id) : undefined); const floor = value.floorWorkspaces.find((item) => item.id === floorId) ?? value.floorWorkspaces.find((item) => item.caseId === activeCase?.id); const report = value.reportVersions.find((item) => item.caseId === activeCase?.id && item.floorId === floor?.id && !item.isPreview);
      if (report) { const pdfResponse = await fetch(`/api/reports/${encodeURIComponent(report.id)}/pdf?mode=status`, { cache: "no-store" }); setPdf(pdfResponse.ok ? ((await pdfResponse.json()).artifact ?? null) : null); } else setPdf(null);
      setMessage("Report context is up to date.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The report context could not be loaded."); }
    finally { setBusy(false); }
  }, [caseId, clientId, floorId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const exactCase = state?.vastuCases.find((item) => item.id === caseId);
  const client = state?.clients.find((item) => item.id === (clientId ?? exactCase?.clientId)) ?? state?.clients[0];
  const caseRecord = exactCase ?? (state && client ? getActiveCaseForClient(state, client.id) : undefined);
  const floor = state?.floorWorkspaces.find((item) => item.id === floorId) ?? state?.floorWorkspaces.find((item) => item.caseId === caseRecord?.id);
  const preview = state?.reportVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.isPreview);
  const report = state?.reportVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && !item.isPreview);
  const reviewed = Boolean(report?.approvalEvidence?.some((item) => item.checkpoint === "FOUNDER_REVIEWED"));
  const approved = Boolean(report?.approvalEvidence?.some((item) => item.checkpoint === "FOUNDER_APPROVED"));

  async function runAction(action: "preview-report" | "stage-a-present" | "final-report-prepare" | "report-approve") {
    if (!state || state.persistenceRevision === null || state.persistenceRevision === undefined) return;
    const entity = action === "report-approve" ? report : caseRecord;
    if (!entity) { setMessage("Reload the exact report before continuing."); return; }
    const payload = action === "preview-report" ? { action, caseId: caseRecord?.id, floorId: floor?.id }
      : action === "stage-a-present" ? { action, caseId: caseRecord?.id, floorId: floor?.id, note }
        : action === "final-report-prepare" ? { action, caseId: caseRecord?.id, floorId: floor?.id }
          : { action, reportId: report?.id, comment: note };
    const confirmation = action === "stage-a-present" ? "Confirm human verification and record that this exact floor verdict was presented?"
      : action === "final-report-prepare" ? "Assemble a new immutable report version from the current approved floor inputs?"
        : action === "report-approve" ? reviewed ? "Founder approve this exact report version? Later changes require a new version." : "Record Founder review for this exact report version?"
          : null;
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true); setConflict(false);
    try { const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ ...payload, idempotencyKey: key.current, expectedRecordVersion: entity.recordVersion ?? 0, expectedRevision: state.persistenceRevision }) }); const result = await response.json(); if (!response.ok || result.ok === false) { if (response.status === 409 || response.status === 428) setConflict(true); throw new Error(result.error?.message ?? result.error ?? "The report action could not be saved."); } key.current = crypto.randomUUID(); setMessage(action === "preview-report" ? "Watermarked Stage A preview created." : action === "stage-a-present" ? "Stage A presentation recorded." : action === "final-report-prepare" ? "Exact floor report assembled." : reviewed ? "Founder approval recorded." : "Founder review recorded."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The report action could not be saved."); }
    finally { setBusy(false); }
  }

  async function runPdf(action: "generate" | "verify" | "release") {
    if (!state || !report || state.persistenceRevision === null || state.persistenceRevision === undefined) return;
    if (!window.confirm(action === "release" ? "Release this verified protected PDF? Released bytes cannot be edited in place." : action === "verify" ? "Verify the immutable PDF hash and permission profile?" : "Generate a protected PDF for this exact approved report version?")) return;
    setBusy(true); setConflict(false);
    try { const response = await fetch(`/api/reports/${encodeURIComponent(report.id)}/pdf`, { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action, expectedRecordVersion: report.recordVersion ?? 0, expectedRevision: state.persistenceRevision, ...(action === "generate" ? {} : { expectedArtifactVersion: pdf?.recordVersion }), idempotencyKey: key.current }) }); const result = await response.json(); if (!response.ok || result.ok === false) { if (response.status === 409 || response.status === 428) setConflict(true); throw new Error(result.error?.message ?? result.error ?? "The protected PDF action failed."); } key.current = crypto.randomUUID(); setPdf(result.result.artifact); setMessage(action === "generate" ? "Protected PDF generated." : action === "verify" ? "PDF hash and permissions verified." : "Protected PDF released."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The protected PDF action failed."); }
    finally { setBusy(false); }
  }

  let title = "Stage A verdict"; let button = "Create watermarked preview"; let disabled = !caseRecord || !floor; let execute = () => runAction("preview-report");
  if (focus === "stage-a" && preview) { title = "Stage A presentation"; button = floor?.stageAVerdictStatus === "PRESENTED" ? "Stage A presented" : "Record human verification & presentation"; disabled = floor?.stageAVerdictStatus === "PRESENTED"; execute = () => runAction("stage-a-present"); }
  if (focus === "assembly") { title = "One-floor report assembly"; button = report ? "Report assembled" : "Assemble exact floor report"; disabled = Boolean(report) || !caseRecord?.fullPaymentApproved; execute = () => runAction("final-report-prepare"); }
  if (focus === "approval") { title = approved ? "Founder approval complete" : reviewed ? "Founder approval" : "Founder review"; button = approved ? "Approved" : reviewed ? "Founder approve" : "Founder review"; disabled = Boolean(approved) || !report; execute = () => runAction("report-approve"); }
  if (focus === "pdf") { title = "Protected PDF"; button = !pdf ? "Generate protected PDF" : pdf.status === "GENERATED" ? "Verify PDF integrity" : pdf.status === "VERIFIED" ? "Release protected PDF" : "Protected PDF released"; disabled = pdf?.status === "RELEASED" || !report || !approved; execute = () => runPdf(!pdf ? "generate" : pdf.status === "GENERATED" ? "verify" : "release"); }

  return <section className="focused-step-form founder-report-step" aria-label={title}><div className="focused-context-row"><span>{client?.displayName ?? "No client"}</span><span>{caseRecord?.caseNumber ?? "No case"}</span><span>{floor?.floorLabel ?? "No floor"}</span></div><div className="focused-form-body"><div className="focused-summary-card"><strong>{title}</strong><span>{focus === "stage-a" ? preview ? `${preview.versionLabel} · ${floor?.stageAVerdictStatus ?? "not presented"}` : "No preview yet" : focus === "assembly" ? report?.versionLabel ?? "Waiting for complete gates" : focus === "approval" ? `${reviewed ? "Reviewed" : "Review pending"} · ${approved ? "Approved" : "Approval pending"}` : pdf ? `${pdf.status} · ${pdf.pageCount} pages · ${pdf.securityProfile}` : "No PDF artifact"}</span></div>{(focus === "stage-a" && preview && floor?.stageAVerdictStatus !== "PRESENTED") || focus === "approval" ? <label className="field"><span>{focus === "stage-a" ? "Presentation and verification note" : "Approval reason"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label> : null}<button type="button" className="button" disabled={busy || disabled} onClick={() => void execute()}>{busy ? "Saving…" : button}</button>{focus === "pdf" && pdf?.status === "RELEASED" && report ? <div className="secondary-inline-actions"><a className="button-secondary" href={`/api/reports/${encodeURIComponent(report.id)}/pdf?mode=export`}>Export authorised PDF</a><a className="button-secondary" href={`/api/reports/${encodeURIComponent(report.id)}/pdf?mode=print`} target="_blank" rel="noreferrer">Print</a></div> : null}</div>{conflict ? <div className="conflict-recovery" role="alert"><strong>The report changed while you were working.</strong><p>Your note is preserved. Reload before retrying.</p><button type="button" className="button-secondary" onClick={() => void refresh()}>Reload latest</button></div> : null}<div className="footer-note" role={/could not|failed|missing|changed/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div></section>;
}
