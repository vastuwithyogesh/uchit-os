"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import type { CanonicalPipelineStage, InboundLeadRecord, TimelineEvent } from "@/lib/domain";
import { canonicalPipelineStages } from "@/lib/domain";
import { getAllowedPipelineTransitions, normalizeClientPipeline } from "@/lib/crm-pipeline";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type LeadPayload = { leads: InboundLeadRecord[]; counts?: { total: number; qualified: number; new: number; filtered: number } };
type ViewMode = "LIST" | "BOARD";
export type UnifiedLeadsWorkspaceMode = "all" | "leads" | "pipeline";
type Row = {
  id: string;
  clientId?: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  source: string;
  sourceRecordId?: string;
  sourceSystem?: string;
  legacyStatus?: string;
  stage: CanonicalPipelineStage;
  nextAction?: { summary: string; dueAt: string };
  score?: number;
  isReturning?: boolean;
  syncStatus?: string;
  lastSeenAt?: string;
  submissions?: number;
};

const stageLabel = (stage: string) => stage.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());

/** Acquisition and qualification only. Case, floor, payment and report stages stay separate. */
const leadPipelineStages: CanonicalPipelineStage[] = [
  "NEW", "CONTACTED", "VSL_SENT", "VSL_WATCHED", "PAID_REVIEW_PENDING", "PAID_REVIEW_BOOKED",
  "FORM_PENDING", "REVIEW_COMPLETED", "QUALIFIED", "PROPOSAL_SCOPE", "WON", "DISQUALIFIED", "CLOSED_REFERRAL",
];

function toneFor(stage: string) {
  if (stage === "DISQUALIFIED" || stage === "CLOSED_REFERRAL") return "blocked";
  if (stage === "WON" || stage === "IN_DELIVERY" || stage === "FOLLOW_UP") return "approved";
  if (stage === "QUALIFIED" || stage === "PROPOSAL_SCOPE") return "ready";
  return "neutral";
}

function readableDate(value?: string) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function normaliseRows(state: Bootstrap | null, leads: InboundLeadRecord[]) {
  const clients = state?.clients ?? [];
  const byClientId = new Map(clients.map((client) => [client.id, client]));
  const rows = new Map<string, Row>();
  for (const lead of leads) {
    const client = byClientId.get(lead.convertedClientId ?? lead.uniqueClientId);
    const pipeline = client ? normalizeClientPipeline(client) : undefined;
    rows.set(lead.id, {
      id: lead.id,
      clientId: client?.id,
      name: client?.displayName ?? lead.fullName,
      email: client?.email ?? lead.email,
      phone: client?.phone ?? lead.phone,
      city: client?.city ?? lead.city,
      source: client?.source ?? lead.source,
      sourceRecordId: lead.sourceRecordId,
      sourceSystem: lead.sourceSystem ?? "UCHIT",
      legacyStatus: lead.status,
      stage: pipeline?.stage ?? (lead.status === "QUALIFIED" ? "QUALIFIED" : "NEW"),
      nextAction: pipeline?.nextAction,
      score: lead.score,
      isReturning: lead.isReturningLead,
      syncStatus: lead.syncStatus ?? "NATIVE",
      lastSeenAt: lead.lastSeenAt,
      submissions: lead.submissionCount,
    });
  }
  for (const client of clients) {
    if (Array.from(rows.values()).some((row) => row.clientId === client.id)) continue;
    const pipeline = normalizeClientPipeline(client);
    rows.set(`client:${client.id}`, {
      id: `client:${client.id}`,
      clientId: client.id,
      name: client.displayName,
      email: client.email,
      phone: client.phone,
      city: client.city,
      source: client.source,
      sourceSystem: client.source === "LOVABLE" ? "LOVABLE" : "UCHIT",
      stage: pipeline.stage,
      nextAction: pipeline.nextAction,
      syncStatus: "NATIVE",
    });
  }
  return Array.from(rows.values());
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("The latest lead workspace could not be loaded.");
  return response.json() as Promise<T>;
}

export function UnifiedLeadsWorkspace({ mode = "all" }: { mode?: UnifiedLeadsWorkspaceMode }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [leadPayload, setLeadPayload] = useState<LeadPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [view, setView] = useState<ViewMode>(mode === "pipeline" ? "BOARD" : "LIST");
  const [detailOpen, setDetailOpen] = useState(mode !== "leads");
  const [target, setTarget] = useState<CanonicalPipelineStage>("NEW");
  const [nextAction, setNextAction] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading your unified lead workspace…");
  const [errorKind, setErrorKind] = useState<"none" | "offline" | "conflict">("none");
  const key = useRef(crypto.randomUUID());
  const isLeadsPage = mode === "leads";
  const isPipelinePage = mode === "pipeline";
  const stageOptions = isPipelinePage ? leadPipelineStages : canonicalPipelineStages;

  const refresh = useCallback(async (preferredId?: string) => {
    setBusy(true);
    setErrorKind("none");
    try {
      const [nextState, nextLeads] = await Promise.all([
        fetchJson<Bootstrap>("/api/bootstrap"),
        fetchJson<LeadPayload>("/api/optin-leads"),
      ]);
      setState(nextState);
      setLeadPayload(nextLeads);
      setSelectedId((current) => preferredId ?? current);
      setMessage("Workspace is up to date.");
    } catch (error) {
      setErrorKind(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "none");
      setMessage(error instanceof Error ? error.message : "The lead workspace could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const rows = useMemo(() => normaliseRows(state, leadPayload?.leads ?? []), [state, leadPayload]);
  const sources = useMemo(() => Array.from(new Set(rows.map((row) => row.sourceSystem ?? "UCHIT"))).sort(), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => {
    const haystack = `${row.name} ${row.email ?? ""} ${row.phone ?? ""} ${row.city ?? ""} ${row.sourceRecordId ?? ""}`.toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase()))
      && (sourceFilter === "ALL" || row.sourceSystem === sourceFilter)
      && (!isPipelinePage || leadPipelineStages.includes(row.stage))
      && (stageFilter === "ALL" || row.stage === stageFilter);
  }), [rows, query, sourceFilter, stageFilter, isPipelinePage]);
  const selected = visibleRows.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? visibleRows[0];
  const selectedClient = selected?.clientId ? state?.clients.find((client) => client.id === selected.clientId) : undefined;
  const pipeline = selectedClient ? normalizeClientPipeline(selectedClient) : undefined;
  const allowedTargets = pipeline
    ? getAllowedPipelineTransitions(pipeline.stage).filter((stage) => !isPipelinePage || leadPipelineStages.includes(stage))
    : [];
  const events = useMemo<TimelineEvent[]>(() => selected?.clientId ? (state?.timelineEvents ?? []).filter((event) => event.clientId === selected.clientId).slice(0, 8) : [], [state, selected?.clientId]);

  useEffect(() => {
    if (!selected) return;
    setTarget(allowedTargets[0] ?? selected.stage);
    setNextAction(selected.nextAction?.summary ?? "");
    setDueAt(selected.nextAction?.dueAt?.slice(0, 16) ?? "");
    key.current = crypto.randomUUID();
  }, [selected?.id, selected?.stage, selected?.nextAction?.dueAt]);

  async function saveTransition() {
    if (!selectedClient || !state || target === pipeline?.stage) return;
    const terminal = target === "CLOSED_REFERRAL" || target === "DISQUALIFIED";
    if (!terminal && (!nextAction.trim() || !dueAt || new Date(dueAt).getTime() <= Date.now())) {
      setMessage("Add a future next action and due date before moving this client.");
      return;
    }
    setBusy(true);
    setErrorKind("none");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: buildActionHeaders(activeUser.role),
        body: JSON.stringify({
          action: "client-pipeline-transition",
          clientId: selectedClient.id,
          pipelineStage: target,
          nextAction: terminal ? undefined : nextAction,
          nextActionDueAt: terminal ? undefined : new Date(dueAt).toISOString(),
          idempotencyKey: key.current,
          expectedRecordVersion: selectedClient.recordVersion ?? 0,
          expectedRevision: state.persistenceRevision ?? null,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        if (response.status === 409) setErrorKind("conflict");
        throw new Error(result.error?.message ?? result.error ?? "The pipeline change could not be saved.");
      }
      key.current = crypto.randomUUID();
      setMessage("Pipeline updated. The canonical record and history are refreshed.");
      await refresh(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The pipeline change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const hasRows = rows.length > 0;
  const filteredEmpty = hasRows && visibleRows.length === 0;
  const primaryLabel = selectedClient ? "Save next pipeline step" : "Open client readiness";
  const renderedView: ViewMode = isLeadsPage ? "LIST" : view;

  return (
    <section className="unified-leads-workspace" aria-labelledby="unified-leads-title">
      <div className="unified-leads-header">
        <div>
          <div className="eyebrow">{isPipelinePage ? "Acquisition and qualification" : "Canonical lead workspace"}</div>
          <h2 id="unified-leads-title">{isPipelinePage ? "Lead Pipeline" : isLeadsPage ? "Leads and opt-ins" : "Leads and pipeline"}</h2>
          <p className="subtle">{isPipelinePage ? "Move leads through acquisition and qualification only. Client cases, floors, payments and reports stay in their own workspace." : "One Uchit view for native opt-ins and future Lovable-origin records. Uchit owns the current stage, owner and next action."}</p>
        </div>
        <span className="status-pill status-neutral" aria-label="Lovable integration status">Lovable connector dormant</span>
      </div>

      <div className="unified-leads-context" aria-label="Lead workspace context">
        <span>{visibleRows.length} visible</span><span aria-hidden="true">·</span><span>{rows.length} total</span><span aria-hidden="true">·</span><span>Founder Edition</span>
      </div>

      <div className="unified-leads-controls" aria-label="Lead filters">
        <label className="field"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, phone or source ID" aria-label="Search leads" /></label>
        <label className="field"><span>Stage</span><select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} aria-label="Filter by pipeline stage"><option value="ALL">All stages</option>{stageOptions.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>)}</select></label>
        <label className="field"><span>Source</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter by source"><option value="ALL">All sources</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
        {!isLeadsPage && !isPipelinePage ? <div className="unified-leads-view-toggle" aria-label="Lead view"><button type="button" className={view === "LIST" ? "button" : "button-secondary"} onClick={() => setView("LIST")} aria-pressed={view === "LIST"}>List</button><button type="button" className={view === "BOARD" ? "button" : "button-secondary"} onClick={() => setView("BOARD")} aria-pressed={view === "BOARD"}>Stages</button></div> : null}
      </div>

      {!hasRows ? <div className="workspace-state" role="status"><h3>No leads yet</h3><p>Native opt-ins will appear here. Lovable-origin leads remain unavailable until the signed connector is explicitly activated.</p><a className="button" href="/founder/01">Start client readiness</a></div> : filteredEmpty ? <div className="workspace-state" role="status"><h3>No matching leads</h3><p>Clear a filter or search term to see the canonical list.</p><button type="button" className="button-secondary" onClick={() => { setQuery(""); setSourceFilter("ALL"); setStageFilter("ALL"); }}>Clear filters</button></div> : (
        <div className={`unified-leads-layout view-${renderedView.toLowerCase()} ${isLeadsPage ? "is-leads-page" : ""} ${isPipelinePage ? "is-pipeline-page" : ""}`}>
          <div className="unified-leads-list" aria-label={renderedView === "LIST" ? "Lead list" : "Lead stage board"}>
            {renderedView === "LIST" ? visibleRows.map((row) => <button type="button" className={`unified-lead-row ${selected?.id === row.id ? "is-selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setDetailOpen(true); }} aria-pressed={selected?.id === row.id}>
              <span className="unified-lead-row-main"><strong>{row.name}</strong><span>{row.city || "Location pending"}</span></span>
              <span className={`status-pill status-${toneFor(row.stage)}`}>{stageLabel(row.stage)}</span>
              <span className="unified-lead-row-meta"><span>{row.sourceSystem ?? "UCHIT"}</span><span>{row.nextAction?.summary ?? "No next action"}</span></span>
            </button>) : stageOptions.map((stage) => {
              const stageRows = visibleRows.filter((row) => row.stage === stage);
              return <section className="unified-lead-stage" key={stage} aria-labelledby={`stage-${stage}`}><h3 id={`stage-${stage}`}>{stageLabel(stage)} <span>{stageRows.length}</span></h3>{stageRows.length ? stageRows.map((row) => <button type="button" className={`unified-lead-row ${selected?.id === row.id ? "is-selected" : ""}`} key={row.id} onClick={() => { setSelectedId(row.id); setDetailOpen(true); }}><span className="unified-lead-row-main"><strong>{row.name}</strong><span>{row.nextAction?.summary ?? "No next action"}</span></span><span className="unified-lead-row-meta"><span>{row.sourceSystem ?? "UCHIT"}</span></span></button>) : <p className="subtle">No leads in this stage.</p>}</section>;
            })}
          </div>

          <aside className={`unified-lead-detail ${isLeadsPage && !detailOpen ? "is-closed" : ""}`} aria-labelledby="lead-detail-title">
            {selected && (!isLeadsPage || detailOpen) ? <>
              {isLeadsPage ? <button type="button" className="button-secondary unified-lead-detail-close" onClick={() => setDetailOpen(false)}>Close lead profile</button> : null}
              <div className="eyebrow" aria-label="Lead detail">{isPipelinePage ? "Lead pipeline detail" : "Lead profile"}</div>
              <h3 id="lead-detail-title">{selected.name}</h3>
              <div className="unified-lead-detail-meta"><span className={`status-pill status-${toneFor(selected.stage)}`}>{stageLabel(selected.stage)}</span><span>{selected.sourceSystem ?? "UCHIT"}</span>{selected.clientId ? <span>Client ID linked</span> : <span>Client ID pending</span>}</div>
              {isLeadsPage ? <div className="unified-lead-profile-sections" aria-label="Lead profile sections">
                <section><h4>Summary</h4><p>{selected.source || "Native Uchit"}{selected.city ? ` · ${selected.city}` : ""}</p><p className="subtle">{selected.clientId ? "Permanent Client ID linked." : "Client ID will be created through the Founder readiness flow."}</p></section>
                <section><h4>Intake</h4><p>{selected.city ? `Property location: ${selected.city}` : "Intake location is not recorded yet."}</p></section>
                <section><h4>Timeline</h4><p>{events.length ? `${events.length} Uchit history events available.` : "No Uchit activity yet."}</p></section>
                <section><h4>Follow-ups</h4><p>{selected.nextAction?.summary ?? "No follow-up scheduled."}{selected.nextAction?.dueAt ? ` · due ${readableDate(selected.nextAction.dueAt)}` : ""}</p></section>
                <section><h4>Commercial</h4><p>Commercial terms and payment checkpoints are managed in the Founder workflow.</p></section>
              </div> : null}
              <dl className="unified-lead-fields"><div><dt>Contact</dt><dd>Protected contact on file</dd></div><div><dt>Attribution</dt><dd>{selected.source || "Native Uchit"}{selected.city ? ` · ${selected.city}` : ""}</dd></div><div><dt>Next action</dt><dd>{selected.nextAction?.summary ?? "Not set"}</dd></div><div><dt>Due</dt><dd>{readableDate(selected.nextAction?.dueAt)}</dd></div><div><dt>Source history</dt><dd>{selected.sourceRecordId ? "Source history linked" : "Native Uchit record"}</dd></div></dl>
              <div className="unified-lead-action">
                {isLeadsPage ? <a className="button founder-action-primary" href={`/lead-pipeline?leadId=${encodeURIComponent(selected.id)}`}>Continue in lead pipeline</a> : selectedClient ? <>
                  <div className="field"><label htmlFor="unified-target">Move to</label><select id="unified-target" value={target} onChange={(event) => setTarget(event.target.value as CanonicalPipelineStage)} disabled={busy || !allowedTargets.length}>{allowedTargets.length ? allowedTargets.map((stage) => <option key={stage} value={stage}>{stageLabel(stage)}</option>) : <option value={selected.stage}>No allowed next stage</option>}</select></div>
                  {target !== "CLOSED_REFERRAL" && target !== "DISQUALIFIED" ? <><div className="field"><label htmlFor="unified-next-action">Next action</label><input id="unified-next-action" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="What happens next?" maxLength={500} disabled={busy} /></div><div className="field"><label htmlFor="unified-due">Due date and time</label><input id="unified-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={busy} /></div></> : <p className="founder-inline-note">Terminal stages clear the prior next action.</p>}
                  <button type="button" className="button founder-action-primary" disabled={busy || !allowedTargets.length} onClick={() => void saveTransition()}>{busy ? "Saving…" : primaryLabel}</button>
                </> : <a className="button founder-action-primary" href="/founder/01">Open client readiness</a>}
              </div>
              <details className="founder-technical-details"><summary>Activity and source history</summary><div className="details-body">{events.length ? <ul className="unified-lead-history">{events.map((event) => <li key={event.id}><strong>{event.headline}</strong><span>{readableDate(event.happenedAt)} · {event.actorName ?? "Uchit"}</span></li>)}</ul> : <p className="subtle">No Uchit activity yet. Lovable activities/follow-ups will appear here as labelled source history only after approved activation.</p>}<p className="meta">Source history never becomes an Uchit audit event, owner or due date without a canonical action.</p></div></details>
              <details className="founder-technical-details"><summary>Technical details</summary><div className="details-body"><p className="meta">Record: {selected.id} · Stage revision: {selectedClient?.recordVersion ?? "not linked"} · Sync: {selected.syncStatus ?? "native"}</p>{selected.sourceRecordId ? <p className="meta">Source record: {selected.sourceRecordId}</p> : null}<p className="meta">Conflicts preserve this draft; reload after a 409/428 before retrying.</p></div></details>
            </> : <div className="workspace-state"><h3>Select a lead</h3><p>Choose a row to inspect its next action and canonical history.</p></div>}
          </aside>
        </div>
      )}

      <div className="footer-note" role={errorKind === "conflict" ? "alert" : "status"} aria-live="polite">{message}{errorKind === "conflict" ? " Your draft remains on screen; reload the latest record before retrying." : ""}</div>
      <button type="button" className="button-secondary unified-leads-reload" disabled={busy} onClick={() => void refresh(selected?.id)}>{busy ? "Refreshing…" : "Reload latest"}</button>
    </section>
  );
}
