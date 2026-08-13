"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import type { CanonicalServiceStage, CaseInputReadiness, VastuServiceType } from "@/lib/domain";
import { canonicalStageLabel, getActiveCaseForClient, getServiceReadiness, getServiceReadinessChecklist, normalizeCaseService, serviceTypeLabel } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type ChartAssetSummaryPayload = {
  summary: {
    required: number;
    uploaded: number;
    pending: number;
    complete: boolean;
  };
};

async function fetchBootstrap() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load case snapshot");
  }
  return response.json() as Promise<AppState & { persistenceRevision?: number | null }>;
}

async function fetchChartSummary() {
  const response = await fetch("/api/chart-assets", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load chart asset summary");
  }
  return response.json() as Promise<ChartAssetSummaryPayload>;
}

class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function postAction(payload: Record<string, unknown>, role: string) {
  const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(role as never), body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The change could not be saved. Review the fields and try again.", response.status);
  return result;
}

export function CaseMasterConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<AppState | null>(null);
  const [assetSummary, setAssetSummary] = useState<ChartAssetSummaryPayload["summary"] | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [message, setMessage] = useState("Loading the latest case snapshot...");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [serviceType, setServiceType] = useState<VastuServiceType>("EXISTING_SPACE");
  const [canonicalStage, setCanonicalStage] = useState<CanonicalServiceStage>("UNDERSTAND");
  const [serviceTemplateVersion, setServiceTemplateVersion] = useState("uchit-service/v2");
  const [scopeVersion, setScopeVersion] = useState("scope/v1");
  const [inputReadiness, setInputReadiness] = useState<CaseInputReadiness>({});
  const [drawingVersion, setDrawingVersion] = useState("");
  const [drawingVerifiedAt, setDrawingVerifiedAt] = useState("");
  const [drawingDiscrepancy, setDrawingDiscrepancy] = useState("");
  const [drawingSuperseded, setDrawingSuperseded] = useState(false);
  const [persistenceRevision, setPersistenceRevision] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [rectificationReason, setRectificationReason] = useState("");

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const [nextState, nextAssets] = await Promise.all([fetchBootstrap(), fetchChartSummary()]);
      setState(nextState);
      setPersistenceRevision(nextState.persistenceRevision ?? null);
      setAssetSummary(nextAssets.summary);
      setSelectedClientId((current) => preferredClientId ?? current ?? nextState.clients[0]?.id ?? "");
      setMessage("Case snapshot refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  const clients = state?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const lead = state?.leadQualifications.find((item) => item.clientId === selectedClient?.id);
  const proposal = state?.commercialProposals.find((item) => item.clientId === selectedClient?.id);
  const booking = state?.reviewCallBookings.find((item) => item.clientId === selectedClient?.id);
  const caseRecord = state && selectedClient ? getActiveCaseForClient(state, selectedClient.id) : undefined;
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const payments = state?.payments.filter((item) => item.clientId === selectedClient?.id) ?? [];
  const reports = state?.reportVersions.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const timeline = state?.timelineEvents.filter((item) => item.clientId === selectedClient?.id) ?? [];
  const service = caseRecord ? normalizeCaseService(caseRecord) : null;
  const serviceReadiness = caseRecord ? getServiceReadiness(caseRecord) : null;
  const draftCase = caseRecord ? { ...caseRecord, serviceType, canonicalStage, serviceTemplateVersion, scopeVersion, inputReadiness, currentDrawing: serviceType === "NEW_CONSTRUCTION" ? { versionLabel: drawingVersion, verifiedAt: drawingVerifiedAt || undefined, discrepancy: drawingDiscrepancy || undefined, superseded: drawingSuperseded } : undefined } : null;
  const draftChecklist = draftCase ? getServiceReadinessChecklist(draftCase) : [];
  const pendingRectification = state?.rectificationRequests.find((item) => item.predecessorCaseId === caseRecord?.id && item.status === "PENDING");
  const canApproveRectification = Boolean(pendingRectification && (activeUser.role === "ADMIN" || activeUser.role === "SUPER_ADMIN") && pendingRectification.requestedBy.id !== activeUser.id);

  useEffect(() => {
    if (!caseRecord) return;
    const profile = normalizeCaseService(caseRecord);
    setServiceType(profile.serviceType);
    setCanonicalStage(profile.canonicalStage);
    setServiceTemplateVersion(profile.serviceTemplateVersion);
    setScopeVersion(profile.scopeVersion);
    setInputReadiness(caseRecord.inputReadiness ?? {});
    setDrawingVersion(caseRecord.currentDrawing?.versionLabel ?? "");
    setDrawingVerifiedAt(caseRecord.currentDrawing?.verifiedAt?.slice(0, 10) ?? "");
    setDrawingDiscrepancy(caseRecord.currentDrawing?.discrepancy ?? "");
    setDrawingSuperseded(Boolean(caseRecord.currentDrawing?.superseded));
    setDirty(false);
  }, [caseRecord?.id, caseRecord?.serviceType, caseRecord?.canonicalStage, caseRecord?.serviceTemplateVersion, caseRecord?.scopeVersion, caseRecord?.inputReadiness, caseRecord?.currentDrawing]);

  function changeService(next: VastuServiceType) {
    if (next === serviceType) return;
    if (Object.values(inputReadiness).some(Boolean) && !window.confirm("Changing the service clears the current readiness checklist because the required inputs are different. Continue?")) return;
    setServiceType(next);
    setInputReadiness({});
    setDirty(true);
  }

  async function saveServiceSetup() {
    if (!caseRecord) return;
    setBusy(true);
    setMessage("Saving service setup...");
    try {
      await postAction({ action: "case-service-configure", caseId: caseRecord.id, serviceType, canonicalStage, serviceTemplateVersion, scopeVersion, inputReadiness, currentDrawing: serviceType === "NEW_CONSTRUCTION" ? { versionLabel: drawingVersion, verifiedAt: drawingVerifiedAt || undefined, discrepancy: drawingDiscrepancy || undefined, superseded: drawingSuperseded } : undefined, expectedRecordVersion: caseRecord.recordVersion ?? 0, expectedRevision: persistenceRevision }, activeUser.role);
      await refresh(selectedClient?.id);
      setDirty(false);
      setMessage("Service setup saved. Evaluation readiness has been refreshed.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409 && /changed|stale|version/i.test(error.message)) { setConflict(true); setMessage("This case changed after you opened it. Reload the latest case, then review and reapply your changes. Nothing was saved."); }
      else if (error instanceof ActionError && error.status === 409) { setConflict(false); setMessage(error.message); }
      else if (error instanceof ActionError && error.status === 428) setMessage("The case version is missing. Reload the latest case before saving.");
      else setMessage(error instanceof Error ? error.message : "The service setup could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function requestRectification() {
    if (!caseRecord || rectificationReason.trim().length < 20) { setMessage("Explain the correction in at least 20 characters."); return; }
    if (!window.confirm("Request a formal rectification? The released report stays unchanged. Approval opens a new linked case revision.")) return;
    setBusy(true);
    try {
      await postAction({ action: "case-rectification-request", caseId: caseRecord.id, reason: rectificationReason.trim(), idempotencyKey: crypto.randomUUID(), expectedRecordVersion: caseRecord.recordVersion ?? 0, expectedRevision: persistenceRevision }, activeUser.role);
      await refresh(selectedClient?.id); setRectificationReason(""); setMessage("Rectification requested. A different administrator must approve it.");
    } catch (error) { if (error instanceof ActionError && error.status === 409) { setConflict(true); setMessage("This case changed. Reload it before requesting rectification."); } else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest case before requesting rectification."); else setMessage(error instanceof Error ? error.message : "Rectification could not be requested."); }
    finally { setBusy(false); }
  }

  async function approveRectification() {
    if (!caseRecord || !pendingRectification || !canApproveRectification) return;
    if (!window.confirm("Approve this rectification? The old report remains immutable and a new linked case workspace will open.")) return;
    setBusy(true);
    try {
      await postAction({ action: "case-rectification-approve", requestId: pendingRectification.id, expectedRecordVersion: caseRecord.recordVersion ?? 0, expectedRevision: persistenceRevision }, activeUser.role);
      await refresh(selectedClient?.id); setMessage("Rectification approved. The new case revision is now active.");
    } catch (error) { if (error instanceof ActionError && error.status === 409) { setConflict(true); setMessage("This case changed. Reload it before approving rectification."); } else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest case before approving rectification."); else setMessage(error instanceof Error ? error.message : "Rectification could not be approved."); }
    finally { setBusy(false); }
  }

  const snapshotChecklist = useMemo(
    () => [
      { label: "Lead qualified", done: Boolean(lead), note: lead ? `Score ${lead.score}` : "Waiting on qualification" },
      { label: "Proposal approved", done: proposal?.status === "APPROVED", note: proposal ? proposal.status : "No proposal yet" },
      { label: "Review call closed", done: booking?.status === "COMPLETED", note: booking ? booking.status : "Not booked yet" },
      { label: "Case opened", done: Boolean(caseRecord), note: caseRecord ? caseRecord.caseNumber : "Still locked" },
      {
        label: "Balance verified",
        done: Boolean(payments.find((payment) => payment.type === "BALANCE" && payment.verifiedAt)),
        note: payments.find((payment) => payment.type === "BALANCE" && payment.verifiedAt) ? "Proof checked" : "Waiting on screenshot verification"
      },
      { label: "Final report ready", done: Boolean(reports.find((report) => !report.isPreview)), note: reports.find((report) => !report.isPreview)?.status ?? "Not prepared yet" }
    ],
    [lead, proposal, booking, caseRecord, payments, reports]
  );

  const completedSteps = snapshotChecklist.filter((item) => item.done).length;
  const nextAction = (() => {
    if (!lead) return "Qualify the lead first.";
    if (!proposal) return "Create the proposal for this client.";
    if (proposal.status !== "APPROVED") return "Get the proposal approved.";
    if (!booking) return "Book the review call.";
    if (!caseRecord) return "Open the case after advance verification.";
    if (floors.length === 0) return "Create the first floor workspace.";
    if (!reports.find((report) => report.isPreview)) return "Generate the Stage-A preview.";
    if (!reports.find((report) => !report.isPreview)) return "Prepare the final report.";
    return "This client is well progressed. Review the latest timeline before the next action.";
  })();

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Case snapshot</div>
        <h2>One operational summary for the selected client</h2>
        <p className="subtle">
          This view pulls the main moving parts into one place: lead, proposal, booking, case, floors, payments, reports, timeline, and visual asset readiness.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{completedSteps} / {snapshotChecklist.length}</span>
            <span className="stat-label">journey steps complete</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{caseRecord?.status ?? "Locked"}</span>
            <span className="stat-label">current case state</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{reports.length}</span>
            <span className="stat-label">report versions</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{assetSummary?.complete ? "Ready" : "Pending"}</span>
            <span className="stat-label">chart upload coverage</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 14 }}>
          <button className="button" type="button" disabled={busy} onClick={() => refresh(selectedClient?.id)}>
            Refresh snapshot
          </button>
          <select value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Journey checklist</div>
        <h3>What is done already</h3>
        <div className="list" style={{ marginTop: 14 }}>
          {snapshotChecklist.map((item) => (
            <div key={item.label} className="list-item">
              <strong>{item.label}</strong>
              <span className={`tag ${item.done ? "good" : "warn"}`}>{item.done ? "Done" : "Pending"}</span>
              <span className="meta">{item.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card span-12">
        <div className="eyebrow">Service setup</div>
        <h3>{service ? "Choose the service and confirm its required inputs" : "Open the case to choose a service"}</h3>
        {service && serviceReadiness ? (
          <>
            <p className="subtle">Saved service: <strong>{serviceTypeLabel(service.serviceType)}</strong>. Current stage: <strong>{canonicalStageLabel(service.canonicalStage)}</strong>. Case revision: <strong>{caseRecord?.revisionNumber ?? 1}</strong>. Saved inputs ready: {serviceReadiness.completed} of {serviceReadiness.total}.</p>
            <div className="two-col" style={{ marginTop: 14 }}>
              <div className="field"><label htmlFor="service-type">Service</label><select id="service-type" value={serviceType} onChange={(event) => changeService(event.target.value as VastuServiceType)} disabled={busy}><option value="EXISTING_SPACE">Existing space assessment</option><option value="NEW_CONSTRUCTION">New construction planning</option></select></div>
              <div className="field"><label htmlFor="service-stage">Current stage</label><select id="service-stage" value={canonicalStage} onChange={(event) => { setCanonicalStage(event.target.value as CanonicalServiceStage); setDirty(true); }} disabled={busy}>{(["UNDERSTAND", "VERIFY", "MAP", "EVALUATE", "PRIORITISE", "RECOMMEND", "IMPLEMENT"] as CanonicalServiceStage[]).map((stage) => <option value={stage} key={stage}>{canonicalStageLabel(stage)}</option>)}</select></div>
              <div className="field"><label htmlFor="service-template-version">Service template version</label><input id="service-template-version" value={serviceTemplateVersion} onChange={(event) => { setServiceTemplateVersion(event.target.value); setDirty(true); }} disabled={busy} /></div>
              <div className="field"><label htmlFor="scope-version">Scope version</label><input id="scope-version" value={scopeVersion} onChange={(event) => { setScopeVersion(event.target.value); setDirty(true); }} disabled={busy} /></div>
            </div>
            <fieldset className="panel" style={{ marginTop: 14 }}><legend><strong>Required information</strong></legend>{draftChecklist.filter((item) => item.key !== "currentDrawingVerified").map((item) => <label key={item.key} className="list-item"><span><input type="checkbox" checked={Boolean(inputReadiness[item.key as keyof CaseInputReadiness])} onChange={(event) => { setInputReadiness((current) => ({ ...current, [item.key]: event.target.checked })); setDirty(true); }} disabled={busy} /> <strong>{item.label}</strong></span><span className="meta">{item.guidance}</span></label>)}</fieldset>
            {serviceType === "NEW_CONSTRUCTION" ? <fieldset className="panel" style={{ marginTop: 14 }}><legend><strong>Current drawing</strong></legend><div className="two-col"><div className="field"><label htmlFor="drawing-version">Drawing version</label><input id="drawing-version" value={drawingVersion} onChange={(event) => { setDrawingVersion(event.target.value); setDirty(true); }} disabled={busy} /></div><div className="field"><label htmlFor="drawing-verified-at">Verified date</label><input id="drawing-verified-at" type="date" value={drawingVerifiedAt} onChange={(event) => { setDrawingVerifiedAt(event.target.value); setDirty(true); }} disabled={busy} /></div></div><div className="field" style={{ marginTop: 10 }}><label htmlFor="drawing-discrepancy">Unresolved discrepancy</label><textarea id="drawing-discrepancy" value={drawingDiscrepancy} onChange={(event) => { setDrawingDiscrepancy(event.target.value); setDirty(true); }} disabled={busy} placeholder="Leave blank when the drawing is verified and consistent." /></div><label className="list-item"><span><input type="checkbox" checked={drawingSuperseded} onChange={(event) => { setDrawingSuperseded(event.target.checked); setDirty(true); }} disabled={busy} /> <strong>This drawing has been replaced</strong></span><span className="meta">Superseded drawings cannot make the case ready.</span></label></fieldset> : null}
            <div className="workflow" style={{ marginTop: 14 }}><button type="button" className="button" onClick={saveServiceSetup} disabled={busy || !dirty} aria-busy={busy}>{busy ? "Saving..." : "Save service setup"}</button><span className={`tag ${dirty ? "warn" : "good"}`}>{dirty ? "Unsaved changes" : "Saved"}</span><span className="meta">Current form readiness: {draftChecklist.filter((item) => item.ready).length} of {draftChecklist.length}</span></div>
            <details style={{ marginTop: 14 }}><summary>Saved readiness status</summary><div className="list">{serviceReadiness.checklist.map((item) => <div className="list-item" key={item.key}><strong>{item.label}</strong><span className={`tag ${item.ready ? "good" : "warn"}`}>{item.ready ? "Ready" : "Needed"}</span></div>)}</div></details>
            {conflict ? <div className="panel" role="alert" style={{ marginTop: 14 }}><strong>Reload before saving</strong><p className="subtle">Your unsaved form may be based on an older case version. Reload the latest case, then reapply the changes you still need.</p><button type="button" className="button-secondary" onClick={() => { setConflict(false); void refresh(selectedClient?.id); }} disabled={busy}>Reload latest case</button></div> : null}
          </>
        ) : <p className="subtle">Service details and the correct readiness checklist appear after the advance is approved and the case is opened.</p>}
      </div>

      {caseRecord ? <div className="card span-12"><div className="eyebrow">Formal rectification</div><h3>Open a new linked case revision</h3><p className="subtle">Use this only when released or evaluated work needs correction. The old report and evidence stay unchanged. Approval creates a separate linked case workspace.</p>{pendingRectification ? <div className="panel"><strong>Request pending</strong><p className="subtle">{pendingRectification.reason}</p><span className="meta">Requested by {pendingRectification.requestedBy.name}</span>{canApproveRectification ? <button type="button" className="button" style={{ marginTop: 10 }} onClick={approveRectification} disabled={busy}>Approve and open new revision</button> : <span className="tag warn">A different administrator must approve</span>}</div> : <><div className="field"><label htmlFor="rectification-reason">Why is a new revision needed?</label><textarea id="rectification-reason" value={rectificationReason} onChange={(event) => setRectificationReason(event.target.value)} maxLength={500} placeholder="Describe what changed and why the existing evidence cannot be edited." disabled={busy} /></div><button type="button" className="button-secondary" onClick={requestRectification} disabled={busy || rectificationReason.trim().length < 20}>Request rectification</button></>}{caseRecord.parentCaseId ? <details style={{ marginTop: 14 }}><summary>Revision history</summary><p className="meta">This is revision {caseRecord.revisionNumber ?? 1}. Previous case ID: {caseRecord.parentCaseId}. <a href="/timeline">Open the permanent client history</a>.</p></details> : null}</div> : null}

      <div className="card span-4">
        <div className="eyebrow">Case health</div>
        <h3>Current record state</h3>
        <div className="panel" style={{ marginTop: 14 }}>
          <strong>{selectedClient?.displayName ?? "No client selected"}</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {nextAction}
          </div>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Client</strong>
            <span className="meta">{selectedClient?.displayName ?? "No client selected"}</span>
          </div>
          <div className="list-item">
            <strong>Case</strong>
            <span className="meta">{caseRecord ? `${caseRecord.caseNumber} · ${caseRecord.status}` : "Not opened"}</span>
          </div>
          <div className="list-item">
            <strong>Floors</strong>
            <span className="meta">{floors.length}</span>
          </div>
          <div className="list-item">
            <strong>Reports</strong>
            <span className="meta">{reports.length}</span>
          </div>
          <div className="list-item">
            <strong>Timeline events</strong>
            <span className="meta">{timeline.length}</span>
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Asset readiness</div>
        <h3>Visual upload coverage</h3>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Required charts</strong>
            <span className="meta">{assetSummary?.required ?? 0}</span>
          </div>
          <div className="list-item">
            <strong>Uploaded charts</strong>
            <span className="meta">{assetSummary?.uploaded ?? 0}</span>
          </div>
          <div className="list-item">
            <strong>Pending charts</strong>
            <span className="meta">{assetSummary?.pending ?? 0}</span>
          </div>
          <div className="list-item">
            <strong>Readiness</strong>
            <span className={`tag ${assetSummary?.complete ? "good" : "warn"}`}>{assetSummary?.complete ? "Complete" : "Incomplete"}</span>
          </div>
        </div>
      </div>

      <div className="card span-12">
        <div className="eyebrow">Recent trail</div>
        <h3>Latest activity for this client</h3>
        <div className="timeline" style={{ marginTop: 14 }}>
          {timeline.slice(0, 8).map((event) => (
            <article key={event.id} className="timeline-item">
              <header>
                <div>
                  <strong>{event.headline}</strong>
                  <div className="meta">{new Date(event.happenedAt).toLocaleString()}</div>
                </div>
                <span className="tag neutral">{event.category}</span>
              </header>
              <p className="subtle">{event.details}</p>
            </article>
          ))}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
