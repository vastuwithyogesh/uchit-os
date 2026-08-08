"use client";

import { useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
import {
  canApproveCommercialProposal,
  canApproveReport,
  canEditFloorWorkspaces,
  canManageTemplates,
  canReleaseVerdict,
  canTriggerDeliverables
} from "@/lib/permissions";

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load bootstrap state");
  }
  return response.json();
}

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Request failed");
  }
  return result;
}

export function WorkflowConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("Load the live state to start");

  const client = state?.clients?.[0];
  const proposal = state?.commercialProposals?.find((item) => item.clientId === client?.id);
  const caseRecord = state?.vastuCases?.find((item) => item.clientId === client?.id);
  const report = state?.reportVersions?.find((item) => item.caseId === caseRecord?.id);
  const timeline = state?.timelineEvents?.filter((item) => item.clientId === client?.id).slice(0, 5) ?? [];
  const utilitySample = useMemo(() => state?.utilityRules?.slice(0, 3) ?? [], [state]);

  async function refresh() {
    setBusy(true);
    try {
      setState(await fetchState());
      setMessage("Live state refreshed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await postAction({ ...action, actorRole: activeUser.role });
      setState(await fetchState());
      setMessage(JSON.stringify(result).slice(0, 160));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card span-12">
      <div className="eyebrow">Live workflow console</div>
      <h2>Exercise the actual action layer</h2>
      <p className="subtle">This panel talks to `/api/bootstrap` and `/api/actions`, so we can move beyond static seeded screens and test the local workflow logic in the browser.</p>
      <div className="hero-actions">
        <button className="button" type="button" onClick={refresh} disabled={busy}>Load state</button>
        <button className="button-secondary" type="button" onClick={() => run({ action: "proposal-approve", proposalId: proposal?.id })} disabled={busy || !proposal || !canApproveCommercialProposal(activeUser)}>Approve proposal</button>
        <button className="button-secondary" type="button" onClick={() => run({ action: "case-create", clientId: client?.id, proposalId: proposal?.id })} disabled={busy || !proposal || !canTriggerDeliverables(activeUser)}>Create case</button>
        <button className="button-secondary" type="button" onClick={() => run({ action: "preview-report", caseId: caseRecord?.id })} disabled={busy || !caseRecord || !canEditFloorWorkspaces(activeUser)}>Generate preview</button>
        <button className="button-secondary" type="button" onClick={() => run({ action: "report-approve", reportId: report?.id })} disabled={busy || !report || !canApproveReport(activeUser)}>Approve report</button>
        <button className="button-secondary" type="button" onClick={() => run({ action: "verdict-release", reportId: report?.id })} disabled={busy || !report || !canReleaseVerdict(activeUser)}>Release verdict</button>
      </div>
      <div className="two-col" style={{ marginTop: 18 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <strong>Current snapshot</strong>
              <div className="meta">{client?.displayName ?? "No client loaded"}</div>
            </div>
            <span className="tag neutral">{activeUser.role}</span>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            <div className="list-item"><strong>Proposal</strong><span className="meta">{proposal?.status ?? "none"}</span></div>
            <div className="list-item"><strong>Case</strong><span className="meta">{caseRecord?.status ?? "none"}</span></div>
            <div className="list-item"><strong>Report</strong><span className="meta">{report?.status ?? "none"}</span></div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div>
              <strong>Action result</strong>
              <div className="meta">{message}</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {timeline.map((event) => (
              <div key={event.id} className="list-item">
                <strong>{event.headline}</strong>
                <span className="meta">{event.category}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="footer-note">Seed rules visible: {utilitySample.length}. {canManageTemplates(activeUser) ? "Template editing is available to this role." : "Template editing is restricted for this role."}</div>
    </section>
  );
}
