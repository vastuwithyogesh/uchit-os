"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import type { AttentionClass, DecisionPriority, ImplementationHorizon, ImplementationStatus, RecommendationLevel, ResponsibilityRole } from "@/lib/domain";
import { useSession } from "@/components/session-provider";
import { buildActionHeaders } from "@/lib/request-helpers";
import { getActiveCaseForClient } from "@/lib/service-framework";

type Bootstrap = AppState & { persistenceRevision?: number | null };
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function loadState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) throw new Error("The assessment workspace could not be loaded. Try again.");
  return response.json() as Promise<Bootstrap>;
}

async function postAction(payload: Record<string, unknown>, role: string) {
  const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(role as never), body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The change could not be saved.", response.status);
  return result;
}

export function AssessmentActionPlan() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedFloorId, setSelectedFloorId] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading the assessment workspace...");
  const [observationTitle, setObservationTitle] = useState("");
  const [observationText, setObservationText] = useState("");
  const [alignmentStatus, setAlignmentStatus] = useState("REVIEW");
  const [energyStatus, setEnergyStatus] = useState("NA");
  const [placementStatus, setPlacementStatus] = useState("REVIEW");
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [recommendationTitle, setRecommendationTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [recommendedAction, setRecommendedAction] = useState("");
  const [decisionPriority, setDecisionPriority] = useState<DecisionPriority>("MEDIUM");
  const [attentionClass, setAttentionClass] = useState<AttentionClass>("IMPORTANT");
  const [horizon, setHorizon] = useState<ImplementationHorizon>("SHORT_TERM");
  const [level, setLevel] = useState<RecommendationLevel>("L1");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [ownerRole, setOwnerRole] = useState<ResponsibilityRole>("CLIENT");
  const [ownerName, setOwnerName] = useState("");
  const [taskStatus, setTaskStatus] = useState<ImplementationStatus>("NOT_STARTED");
  const idempotencyKeys = useRef({ observation: crypto.randomUUID(), recommendation: crypto.randomUUID(), task: crypto.randomUUID() });

  const refresh = useCallback(async (preferredClientId?: string) => {
    setBusy(true);
    try {
      const next = await loadState();
      setState(next);
      setSelectedClientId((current) => preferredClientId ?? current ?? next.clients[0]?.id ?? "");
      setMessage("Assessment workspace is up to date.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The workspace could not be loaded."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const clients = state?.clients ?? [];
  const client = clients.find((item) => item.id === selectedClientId) ?? clients[0];
  const activeCase = state && client ? getActiveCaseForClient(state, client.id) : undefined;
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === activeCase?.id) ?? [];
  const selectedFloor = floors.find((item) => item.id === selectedFloorId) ?? floors[0];
  const observations = state?.assessmentObservations.filter((item) => item.caseId === activeCase?.id && item.floorId === selectedFloor?.id) ?? [];
  const recommendations = state?.recommendations.filter((item) => item.caseId === activeCase?.id && item.floorId === selectedFloor?.id) ?? [];
  const tasks = state?.implementationTasks.filter((item) => item.caseId === activeCase?.id && item.floorId === selectedFloor?.id) ?? [];
  const latestObservation = observations[0];
  const latestRecommendation = recommendations[0];
  const currentTask = tasks[0];
  const evidenceOptions = useMemo(() => {
    if (!selectedFloor?.locked) return [];
    const refs = [...selectedFloor.evidenceUploads, ...(state?.spatialEvidenceVersions ?? []).filter((item) => item.caseId === activeCase?.id && item.floorId === selectedFloor.id && item.status === "CURRENT").map((item) => item.protectedFileRef)];
    return Array.from(new Map(refs.map((ref) => [ref, { ref, floor: selectedFloor.floorLabel }] as const)).values());
  }, [state, activeCase?.id, selectedFloor]);
  const nextStep = !activeCase ? "Open a case first" : !observations.length ? "1. Record what you verified" : !recommendations.length ? "2. Explain what should change" : !tasks.length ? "3. Assign the action" : "4. Update progress";

  useEffect(() => {
    setObservationTitle(""); setObservationText(""); setAlignmentStatus("REVIEW"); setEnergyStatus("NA"); setPlacementStatus("REVIEW"); setSelectedEvidence([]);
    setRecommendationTitle(""); setRationale(""); setRecommendedAction(""); setDecisionPriority("MEDIUM"); setAttentionClass("IMPORTANT"); setHorizon("SHORT_TERM"); setLevel("L1");
    setTaskTitle(""); setTaskNotes(""); setOwnerRole("CLIENT"); setOwnerName(""); setTaskStatus("NOT_STARTED");
    if (currentTask) { setTaskTitle(currentTask.title); setTaskNotes(currentTask.notes ?? ""); setOwnerRole(currentTask.ownerRole); setOwnerName(currentTask.ownerName); setTaskStatus(currentTask.status); }
    idempotencyKeys.current = { observation: crypto.randomUUID(), recommendation: crypto.randomUUID(), task: crypto.randomUUID() };
  }, [activeCase?.id, selectedFloor?.id, currentTask?.id, currentTask?.version]);

  async function save(payload: Record<string, unknown>, success: string) {
    if (!activeCase || !selectedFloor || !state) return;
    setBusy(true);
    try {
      await postAction({ ...payload, caseId: activeCase.id, floorId: selectedFloor.id, expectedRecordVersion: activeCase.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null }, activeUser.role);
      await refresh(client?.id); setMessage(success);
      if (payload.action === "assessment-observation-upsert") idempotencyKeys.current.observation = crypto.randomUUID();
      if (payload.action === "assessment-recommendation-upsert") idempotencyKeys.current.recommendation = crypto.randomUUID();
      if (payload.action === "assessment-implementation-upsert") idempotencyKeys.current.task = crypto.randomUUID();
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("This case changed while you were working. Reload it, review the latest information, then enter the change again. Nothing was saved.");
      else if (error instanceof ActionError && error.status === 428) setMessage("The case version is missing. Reload before saving.");
      else setMessage(error instanceof Error ? error.message : "The change could not be saved.");
    } finally { setBusy(false); }
  }

  const canSaveObservation = Boolean(activeCase && selectedFloor?.locked && observationTitle.trim() && observationText.trim() && selectedEvidence.length);
  const canSaveRecommendation = Boolean(activeCase && selectedFloor && latestObservation && recommendationTitle.trim() && rationale.trim() && recommendedAction.trim());
  const canSaveTask = Boolean(activeCase && selectedFloor && latestRecommendation && taskTitle.trim() && ownerName.trim());

  return <section className="section-grid" aria-labelledby="assessment-title">
    <div className="card span-12"><div className="eyebrow">Assessment and action plan</div><h1 id="assessment-title">{nextStep}</h1><p className="subtle">Work on one floor at a time. Save one clear fact, explain the action, assign it, then keep its progress current.</p><div className="workflow"><label htmlFor="assessment-client"><strong>Client</strong></label><select id="assessment-client" value={client?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} disabled={busy}>{clients.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select><label htmlFor="assessment-floor"><strong>Floor</strong></label><select id="assessment-floor" value={selectedFloor?.id ?? ""} onChange={(event) => setSelectedFloorId(event.target.value)} disabled={busy}>{floors.map((floor) => <option value={floor.id} key={floor.id}>{floor.floorLabel}</option>)}</select><button type="button" className="button-secondary" onClick={() => void refresh(client?.id)} disabled={busy}>Reload</button></div><div className="pill-row" style={{ marginTop: 12 }}><span className="pill">Case {activeCase?.caseNumber ?? "not open"}</span><span className="pill">Floor {selectedFloor?.floorLabel ?? "not selected"}</span><span className="pill">Revision {activeCase?.revisionNumber ?? 1}</span><span className="pill">{observations.length} observations</span><span className="pill">{recommendations.length} recommendations</span><span className="pill">{tasks.length} actions</span></div></div>

    <div className="card span-12"><div className="eyebrow">Step 1</div><h2>Record what you verified</h2>{!activeCase ? <p className="subtle">Open a case before recording assessment work.</p> : <><div className="field"><label htmlFor="observation-title">Short title</label><input id="observation-title" value={observationTitle} onChange={(event) => setObservationTitle(event.target.value)} maxLength={160} /></div><div className="field"><label htmlFor="observation-text">What did you observe?</label><textarea id="observation-text" value={observationText} onChange={(event) => setObservationText(event.target.value)} maxLength={2000} /></div><div className="three-col"><div className="field"><label htmlFor="alignment-status">Alignment</label><select id="alignment-status" value={alignmentStatus} onChange={(event) => setAlignmentStatus(event.target.value)}><option value="ALIGNED">Aligned</option><option value="REVIEW">Needs review</option><option value="CONCERN">Concern</option></select></div><div className="field"><label htmlFor="energy-status">Energy</label><select id="energy-status" value={energyStatus} onChange={(event) => setEnergyStatus(event.target.value)}><option value="BALANCED">Balanced</option><option value="WEAK">Weak</option><option value="EXCESS">Excess</option><option value="NA">Not applicable</option></select></div><div className="field"><label htmlFor="placement-status">Placement</label><select id="placement-status" value={placementStatus} onChange={(event) => setPlacementStatus(event.target.value)}><option value="SUITABLE">Suitable</option><option value="REVIEW">Needs review</option><option value="RELOCATE">Relocate</option><option value="NA">Not applicable</option></select></div></div><fieldset className="panel"><legend><strong>Verified evidence</strong></legend>{evidenceOptions.length ? evidenceOptions.map((item) => <label className="list-item" key={item.ref}><span><input type="checkbox" checked={selectedEvidence.includes(item.ref)} onChange={(event) => setSelectedEvidence((current) => event.target.checked ? [...current, item.ref] : current.filter((ref) => ref !== item.ref))} /> {item.floor}: {item.ref}</span></label>) : <p className="subtle">No evidence from a locked floor is available. Add and lock floor evidence first.</p>}</fieldset><button type="button" className="button" disabled={busy || !canSaveObservation} onClick={() => { if (window.confirm("Save this verified observation to the case record?")) void save({ action: "assessment-observation-upsert", idempotencyKey: idempotencyKeys.current.observation, title: observationTitle, observation: observationText, alignmentStatus, energyStatus, placementStatus, evidenceRefs: selectedEvidence }, "Observation saved. Now write the recommendation."); }}>Save observation</button></>}</div>

    <div className="card span-12"><div className="eyebrow">Step 2</div><h2>Explain what should change</h2>{!latestObservation ? <p className="subtle">Save an observation first. The recommendation must link to verified work.</p> : <><div className="panel"><strong>Based on: {latestObservation.title}</strong><p className="subtle">{latestObservation.observation}</p></div><div className="field"><label htmlFor="recommendation-title">Recommendation title</label><input id="recommendation-title" value={recommendationTitle} onChange={(event) => setRecommendationTitle(event.target.value)} maxLength={160} /></div><div className="field"><label htmlFor="recommendation-rationale">Why?</label><textarea id="recommendation-rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} maxLength={2000} /></div><div className="field"><label htmlFor="recommended-action">What should be done?</label><textarea id="recommended-action" value={recommendedAction} onChange={(event) => setRecommendedAction(event.target.value)} maxLength={2000} /></div><div className="two-col"><div className="field"><label htmlFor="decision-priority">Priority</label><select id="decision-priority" value={decisionPriority} onChange={(event) => setDecisionPriority(event.target.value as DecisionPriority)}><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></div><div className="field"><label htmlFor="attention-class">Attention</label><select id="attention-class" value={attentionClass} onChange={(event) => setAttentionClass(event.target.value as AttentionClass)}><option value="IMMEDIATE">Immediate</option><option value="IMPORTANT">Important</option><option value="ADVISORY">Advisory</option></select></div><div className="field"><label htmlFor="implementation-horizon">When?</label><select id="implementation-horizon" value={horizon} onChange={(event) => setHorizon(event.target.value as ImplementationHorizon)}><option value="IMMEDIATE">Now</option><option value="SHORT_TERM">Short term</option><option value="MEDIUM_TERM">Medium term</option><option value="LONG_TERM">Long term</option></select></div><div className="field"><label htmlFor="recommendation-level">Change level</label><select id="recommendation-level" value={level} onChange={(event) => setLevel(event.target.value as RecommendationLevel)}><option value="L1">L1 · Reposition</option><option value="L2">L2 · Balance</option><option value="L3">L3 · Functional change</option><option value="L4">L4 · Civil or structural</option></select></div></div><button type="button" className="button" disabled={busy || !canSaveRecommendation} onClick={() => { if (window.confirm("Save this recommendation and link it to the observation?")) void save({ action: "assessment-recommendation-upsert", idempotencyKey: idempotencyKeys.current.recommendation, title: recommendationTitle, rationale, recommendedAction, decisionPriority, attentionClass, implementationHorizon: horizon, level, observationIds: [latestObservation.id], evidenceRefs: latestObservation.evidenceRefs }, "Recommendation saved. Now assign the action."); }}>Save recommendation</button></>}</div>

    <div className="card span-12"><div className="eyebrow">Step 3</div><h2>Assign and track the action</h2>{!latestRecommendation ? <p className="subtle">Save a recommendation first.</p> : <><div className="panel"><strong>{latestRecommendation.title}</strong><p className="subtle">{latestRecommendation.action}</p></div><div className="field"><label htmlFor="task-title">Action name</label><input id="task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} /></div><div className="field"><label htmlFor="task-notes">Simple instructions</label><textarea id="task-notes" value={taskNotes} onChange={(event) => setTaskNotes(event.target.value)} maxLength={2000} /></div><div className="two-col"><div className="field"><label htmlFor="owner-role">Who is responsible?</label><select id="owner-role" value={ownerRole} onChange={(event) => setOwnerRole(event.target.value as ResponsibilityRole)}><option value="CLIENT">Client</option><option value="CONSULTANT">Consultant</option><option value="ARCHITECT">Architect</option><option value="INTERIOR_DESIGNER">Interior designer</option><option value="STRUCTURAL_ENGINEER">Structural engineer</option><option value="MEP_ENGINEER">MEP engineer</option><option value="CONTRACTOR">Contractor</option><option value="SITE_TEAM">Site team</option></select></div><div className="field"><label htmlFor="owner-name">Person or team name</label><input id="owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="task-status">Progress</label><select id="task-status" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value as ImplementationStatus)}><option value="NOT_STARTED">Not started</option><option value="PLANNED">Planned</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="DEFERRED">Deferred</option><option value="NOT_APPLICABLE">Not applicable</option></select></div></div><button type="button" className="button" disabled={busy || !canSaveTask} onClick={() => { if (window.confirm(currentTask ? "Save this progress update?" : "Assign this action and add it to the implementation plan?")) void save({ action: "assessment-implementation-upsert", idempotencyKey: idempotencyKeys.current.task, recordId: currentTask?.id, recommendationId: latestRecommendation.id, title: taskTitle, notes: taskNotes || undefined, status: taskStatus, implementationHorizon: latestRecommendation.implementationHorizon, ownerRole, ownerName, evidenceRefs: currentTask?.evidenceRefs ?? latestRecommendation.evidenceRefs }, currentTask ? "Progress updated." : "Action assigned."); }}>{currentTask ? "Save progress" : "Assign action"}</button></>}</div>

    <div className="card span-12"><div className="eyebrow">Saved work</div><h2>Action plan</h2>{tasks.length ? <div className="list">{tasks.map((task) => <div className="list-item" key={task.id}><strong>{task.title}</strong><span className={`tag ${task.status === "COMPLETED" ? "good" : task.status === "DEFERRED" ? "warn" : "neutral"}`}>{task.status.replaceAll("_", " ").toLowerCase()}</span><span className="meta">Owner: {task.ownerName} · {task.ownerRole.replaceAll("_", " ").toLowerCase()} · {task.implementationHorizon.replaceAll("_", " ").toLowerCase()}</span><details><summary>Technical details</summary><span className="meta">Task version {task.version} · Case revision {task.caseRevisionNumber} · Evidence: {task.evidenceRefs.join(", ") || "none"}</span></details></div>)}</div> : <p className="subtle">No action has been assigned yet.</p>}<div className="footer-note" role={message.includes("could not") || message.includes("changed") || message.includes("missing") ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
