"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalPipelineStages, type CanonicalPipelineStage } from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { getAllowedPipelineTransitions, normalizeClientPipeline } from "@/lib/crm-pipeline";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { FounderStepCard } from "@/components/founder-step-card";

type Bootstrap = AppState & { persistenceRevision?: number | null };

class ActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const stageLabel = (stage: string) => stage.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

export function CrmPipelineBoard() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [target, setTarget] = useState<CanonicalPipelineStage>("NEW");
  const [nextAction, setNextAction] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [correction, setCorrection] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading pipeline...");
  const key = useRef(crypto.randomUUID());

  const refresh = useCallback(async (preferred?: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Pipeline could not be loaded.");
      const next = await response.json() as Bootstrap;
      setState(next);
      setSelectedId((current) => (preferred ?? current) || next.clients[0]?.id || "");
      setMessage("Pipeline is up to date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pipeline could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const clients = state?.clients ?? [];
  const client = clients.find((item) => item.id === selectedId) ?? clients[0];
  const pipeline = client ? normalizeClientPipeline(client) : undefined;
  const normalTargets = pipeline ? getAllowedPipelineTransitions(pipeline.stage) : [];
  const allowedTargets = correction && ["ADMIN", "SUPER_ADMIN"].includes(activeUser.role)
    ? canonicalPipelineStages.filter((item) => item !== pipeline?.stage)
    : normalTargets;

  useEffect(() => {
    setTarget(allowedTargets[0] ?? pipeline?.stage ?? "NEW");
    setNextAction(pipeline?.nextAction?.summary ?? "");
    setDueAt(pipeline?.nextAction?.dueAt?.slice(0, 16) ?? "");
    setCorrection(false);
    setReason("");
    key.current = crypto.randomUUID();
  }, [client?.id, client?.recordVersion]);

  async function save() {
    if (!state || !client) return;
    const terminal = target === "CLOSED_REFERRAL" || target === "DISQUALIFIED";
    if (correction && !window.confirm("Record this administrative correction? The reason will remain in history.")) return;
    setBusy(true);
    try {
      const payload = {
        action: "client-pipeline-transition",
        clientId: client.id,
        pipelineStage: target,
        nextAction: terminal ? undefined : nextAction,
        nextActionDueAt: terminal ? undefined : new Date(dueAt).toISOString(),
        correction,
        correctionReason: correction ? reason : undefined,
        idempotencyKey: key.current,
        expectedRecordVersion: client.recordVersion ?? 0,
        expectedRevision: state.persistenceRevision ?? null,
      };
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: buildActionHeaders(activeUser.role),
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "Pipeline change could not be saved.", response.status);
      }
      key.current = crypto.randomUUID();
      await refresh(client.id);
      setMessage("Pipeline updated.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("This client changed while you were working. Your draft is still here. Reload, compare the latest record, then save again.");
      else if (error instanceof ActionError && error.status === 428) setMessage("The client or workspace version is missing. Your draft is still here. Reload before saving.");
      else setMessage(error instanceof Error ? error.message : "Pipeline change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const terminal = target === "CLOSED_REFERRAL" || target === "DISQUALIFIED";
  const valid = Boolean(client && target !== pipeline?.stage && (terminal || (nextAction.trim() && dueAt && new Date(dueAt).getTime() > Date.now())) && (!correction || (reason.trim().length >= 20 && reason.trim().length <= 500)));
  const messageIsError = message.includes("could not") || message.includes("missing") || message.includes("changed");
  const currentDue = pipeline?.nextAction?.dueAt ? new Date(pipeline.nextAction.dueAt) : null;
  const currentTone = !pipeline ? "neutral" : currentDue && currentDue.getTime() < Date.now() ? "attention" : "ready";

  return (
    <section className="card span-12 founder-work-surface" aria-labelledby="pipeline-title">
      <div className="founder-context-bar" aria-label="Current CRM context">
        <span>Clients</span><span aria-hidden="true">→</span><strong>{client?.displayName ?? "Choose a client"}</strong><span aria-hidden="true">→</span><span>{pipeline ? stageLabel(pipeline.stage) : "Pipeline"}</span>
      </div>
      <FounderStepCard
        step="Current task"
        title={pipeline?.nextAction?.summary ?? "Choose the next pipeline step"}
        description="Move one client forward with a dated next action. The server remains the source of truth for allowed transitions."
        tone={currentTone}
        status={pipeline ? stageLabel(pipeline.stage) : "Select a client"}
        className="founder-step-card-primary"
      >
        <div className="founder-step-grid">
          <div className="field">
            <label htmlFor="pipeline-client">Client</label>
            <select id="pipeline-client" value={client?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)} disabled={busy && !state}>
              {clients.length ? clients.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>) : <option value="">No clients yet</option>}
            </select>
          </div>
          <div className="founder-current-status" aria-label="Current pipeline status">
            <span className="meta-label">Now</span>
            <strong>{pipeline ? stageLabel(pipeline.stage) : "No record"}</strong>
            <span className="meta">{pipeline?.owner?.name ? `Owner: ${pipeline.owner.name}` : "Owner not assigned"}</span>
            <span className="meta">{currentDue ? (currentDue.getTime() < Date.now() ? "Overdue" : `Due ${currentDue.toLocaleString()}`) : "No due action"}</span>
          </div>
          <div className="field">
            <label htmlFor="pipeline-target">Move to</label>
            <select id="pipeline-target" value={target} onChange={(e) => setTarget(e.target.value as CanonicalPipelineStage)} disabled={!client || busy}>
              {allowedTargets.length ? allowedTargets.map((item) => <option key={item} value={item}>{stageLabel(item)}</option>) : <option value={pipeline?.stage ?? "NEW"}>No next transition</option>}
            </select>
          </div>
          {!terminal ? <>
            <div className="field">
              <label htmlFor="pipeline-action">Next task</label>
              <input id="pipeline-action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} maxLength={500} disabled={!client || busy} placeholder="What will happen next?" />
            </div>
            <div className="field">
              <label htmlFor="pipeline-due">Due date and time</label>
              <input id="pipeline-due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={!client || busy} />
            </div>
          </> : <p className="founder-inline-note">This terminal stage clears the previous next action. Confirm only when the record should leave active follow-up.</p>}
        </div>
        {["ADMIN", "SUPER_ADMIN"].includes(activeUser.role) ? <details className="founder-technical-details">
          <summary>More options · administrative correction</summary>
          <div className="details-body">
            <label className="list-item"><span><input type="checkbox" checked={correction} onChange={(e) => setCorrection(e.target.checked)} disabled={busy} /> Record an out-of-sequence correction</span></label>
            {correction ? <div className="field"><label htmlFor="pipeline-reason">Correction reason (20–500 characters)</label><textarea id="pipeline-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={busy} /></div> : <p className="subtle">Normal transitions remain the default. Corrections are audited and require a reason.</p>}
          </div>
        </details> : null}
        <div className="workflow founder-primary-actions">
          <button type="button" className="button founder-action-primary" disabled={busy || !valid} onClick={() => void save()}>Save next step</button>
          <button type="button" className="button-secondary" disabled={busy} onClick={() => void refresh(client?.id)}>Reload latest</button>
        </div>
      </FounderStepCard>
      <details className="founder-technical-details founder-policy-details">
        <summary>Policy and version details</summary>
        <div className="details-body"><p className="meta">Commercial policy v{state?.commercialPolicy.version ?? "—"} · default proposal ₹{state?.commercialPolicy.defaultProposalAmountInr.toLocaleString("en-IN") ?? "—"}</p><p className="subtle">Owner and allowed transitions are resolved server-side. A conflict keeps this draft on screen so it can be compared before retry.</p></div>
      </details>
      <div className="footer-note" role={messageIsError ? "alert" : "status"} aria-live="polite">{message}</div>
    </section>
  );
}
