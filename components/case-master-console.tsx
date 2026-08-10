"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { canonicalStageLabel, getServiceReadiness, normalizeCaseService, serviceTypeLabel } from "@/lib/service-framework";

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
  return response.json() as Promise<AppState>;
}

async function fetchChartSummary() {
  const response = await fetch("/api/chart-assets", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load chart asset summary");
  }
  return response.json() as Promise<ChartAssetSummaryPayload>;
}

export function CaseMasterConsole() {
  const [state, setState] = useState<AppState | null>(null);
  const [assetSummary, setAssetSummary] = useState<ChartAssetSummaryPayload["summary"] | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [message, setMessage] = useState("Loading the latest case snapshot...");
  const [busy, setBusy] = useState(false);

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const [nextState, nextAssets] = await Promise.all([fetchBootstrap(), fetchChartSummary()]);
      setState(nextState);
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
  const caseRecord = state?.vastuCases.find((item) => item.clientId === selectedClient?.id);
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const payments = state?.payments.filter((item) => item.clientId === selectedClient?.id) ?? [];
  const reports = state?.reportVersions.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const timeline = state?.timelineEvents.filter((item) => item.clientId === selectedClient?.id) ?? [];
  const service = caseRecord ? normalizeCaseService(caseRecord) : null;
  const serviceReadiness = caseRecord ? getServiceReadiness(caseRecord) : null;

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
        <h3>{service ? serviceTypeLabel(service.serviceType) : "Open the case to choose a service"}</h3>
        {service && serviceReadiness ? (
          <>
            <p className="subtle">Current stage: <strong>{canonicalStageLabel(service.canonicalStage)}</strong>. Inputs ready: {serviceReadiness.completed} of {serviceReadiness.total}.</p>
            <div className="pill-row" aria-label="Service versions">
              <span className="pill">Service template {service.serviceTemplateVersion}</span>
              <span className="pill">Scope {service.scopeVersion}</span>
              {caseRecord?.currentDrawing?.versionLabel ? <span className="pill">Drawing {caseRecord.currentDrawing.versionLabel}</span> : null}
            </div>
            <div className="list" style={{ marginTop: 14 }}>
              {serviceReadiness.checklist.map((item) => (
                <div className="list-item" key={item.key}>
                  <strong>{item.label}</strong>
                  <span className={`tag ${item.ready ? "good" : "warn"}`}>{item.ready ? "Ready" : "Needed"}</span>
                  <span className="meta">{item.ready ? "Confirmed for this case" : item.guidance}</span>
                </div>
              ))}
            </div>
          </>
        ) : <p className="subtle">Service details and the correct readiness checklist appear after the advance is approved and the case is opened.</p>}
      </div>

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
