"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppState } from "@/lib/store";
import type { DependencyInvalidationRecord, ShaktiSnapshotRecord, UtilityRule } from "@/lib/domain";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { getCaseEvaluationBlockers, getServiceReadiness, normalizeCaseService, serviceTypeLabel } from "@/lib/service-framework";
import { useActionFeedback } from "@/components/action-feedback";

type UtilityMasterResponse = {
  rules: UtilityRule[];
  utilityMaster: { sourceVersion: string; workbookHash: string; rows: unknown[] };
  counts: { total: number; utilityMasterRows: number; utilityMasterUtilities: number; good: number; bad: number; okOk: number };
};

class ActionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function fetchMaster() {
  const response = await fetch("/api/utility/master", { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : "The approved Utility rule master could not be loaded.", response.status);
  return result as UtilityMasterResponse;
}

async function fetchBootstrap() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) throw new ActionError("The latest evaluation state could not be loaded.", response.status);
  return response.json() as Promise<AppState>;
}

async function postAction(payload: Record<string, unknown>, role: string) {
  const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(role as never), body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The evaluation action could not be completed.", response.status);
  return result;
}

function TaskState({ recorded, ready }: { recorded: boolean; ready: boolean }) {
  return <span className={`status-pill ${recorded ? "status-approved" : ready ? "status-ready" : "status-blocked"}`}>{recorded ? "RECORDED" : ready ? "READY TO RUN" : "BLOCKED"}</span>;
}

export function EvaluationConsole({ clientId: initialClientId, caseId: requestedCaseId, floorId: initialFloorId }: { clientId?: string; caseId?: string; floorId?: string } = {}) {
  const { activeUser } = useSession();
  const { notify } = useActionFeedback();
  const router = useRouter();
  const [rules, setRules] = useState<UtilityRule[]>([]);
  const [masterMeta, setMasterMeta] = useState<UtilityMasterResponse["counts"] | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [message, setMessage] = useState("Loading the exact evaluation context...");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("Founder Utility evaluation");
  const [shaktiValuesText, setShaktiValuesText] = useState("9,8,8,7,6,9,8,7,6,7,8,9,8,7,6,8");
  const [replacementMode, setReplacementMode] = useState(false);
  const [replacementReason, setReplacementReason] = useState("");
  const utilityKey = useRef(crypto.randomUUID());
  const shaktiKey = useRef(crypto.randomUUID());
  const replacementKey = useRef(crypto.randomUUID());
  const regenerationKey = useRef(crypto.randomUUID());

  const currentCase = state?.vastuCases.find((item) => item.id === requestedCaseId && (!initialClientId || item.clientId === initialClientId));
  const selectedClient = state?.clients.find((client) => client.id === currentCase?.clientId);
  const selectedFloor = state?.floorWorkspaces.find((item) => item.id === initialFloorId && item.caseId === currentCase?.id && (!currentCase?.projectId || item.projectId === currentCase.projectId));
  const currentPlan = state?.planVersions.find((item) => item.caseId === currentCase?.id && item.floorId === selectedFloor?.id && item.status === "CURRENT");
  const currentOrientation = state?.orientationVersions.find((item) => item.caseId === currentCase?.id && item.status === "LOCKED");
  const readiness = currentCase ? getServiceReadiness(currentCase) : null;
  const service = currentCase ? normalizeCaseService(currentCase) : null;
  const evaluationBlockers = currentCase && state && selectedFloor ? getCaseEvaluationBlockers(state, currentCase.id, selectedFloor.id, {
    // An explicit evaluation successor must be able to replace its own stale
    // snapshot. Upstream mapping invalidations remain blocking.
    ignoreRegenerationTargetTypes: ["UTILITY_EVALUATION", "UTILITY_VERDICT", "SHAKTI_EVALUATION", "FINDING", "DRAFT_REPORT"]
  }) : ["Select an authorised case and floor."];
  const evaluationReady = Boolean(currentCase && selectedFloor && evaluationBlockers.length === 0);
  const evaluationSnapshots = state?.evaluationSnapshots.filter((item) => item.caseId === currentCase?.id && item.floorId === selectedFloor?.id && item.planVersionId === currentPlan?.id && item.orientationVersionId === currentOrientation?.id) ?? [];
  const shaktiSnapshots = state?.shaktiSnapshots.filter((item) => item.caseId === currentCase?.id && item.floorId === selectedFloor?.id && item.planVersionId === currentPlan?.id && item.orientationVersionId === currentOrientation?.id) ?? [];
  const utilitySnapshot = evaluationSnapshots[0];
  const shaktiSnapshot = shaktiSnapshots[0];
  const utilitySnapshotRecorded = Boolean(utilitySnapshot);
  const shaktiSnapshotRecorded = Boolean(shaktiSnapshot);
  const utilityInputs = state?.spaceMappings.filter((item) => item.caseId === currentCase?.id && item.floorId === selectedFloor?.id && item.planVersionId === currentPlan?.id && item.orientationVersionId === currentOrientation?.id && item.verified && item.methodologyStatus === "APPROVED" && item.directionCode).map((item) => ({ utilityName: item.spaceLabel, directionCode: item.directionCode! })) ?? [];
  const shaktiValues = useMemo(() => shaktiValuesText.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value)), [shaktiValuesText]);
  const shaktiReplacement = state?.dependencyInvalidations.find((item) => item.caseId === currentCase?.id && item.floorId === selectedFloor?.id && item.targetType === "SHAKTI_EVALUATION" && ["REPLACEMENT_REQUIRED", "REGENERATED"].includes(item.status));
  const grouped = useMemo(() => rules.reduce((acc, rule) => { acc[rule.verdict].push(rule); return acc; }, { GOOD: [] as UtilityRule[], BAD: [] as UtilityRule[], "OK-OK": [] as UtilityRule[] }), [rules]);

  async function refresh(nextMessage?: string) {
    setBusyAction((current) => current ?? "refresh");
    try {
      const [master, bootstrap] = await Promise.all([fetchMaster(), fetchBootstrap()]);
      setRules(master.rules); setMasterMeta(master.counts); setState(bootstrap);
      setMessage(nextMessage ?? "Evaluation context is up to date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The evaluation context could not be refreshed.");
    } finally { setBusyAction(null); }
  }

  async function act(action: Record<string, unknown>, successMessage: string, key: { current: string }) {
    if (!state || state.persistenceRevision === undefined || state.persistenceRevision === null || !currentCase || !selectedFloor) { setMessage("Reload the latest case and select one authorised floor before evaluating."); return false; }
    const actionName = String(action.action);
    const regenerationVersion = actionName === "regeneration-transition" && typeof action.invalidationId === "string"
      ? state.dependencyInvalidations.find((item) => item.id === action.invalidationId)?.recordVersion
      : undefined;
    const expectedRecordVersion = typeof action.expectedRecordVersion === "number"
      ? action.expectedRecordVersion
      : typeof regenerationVersion === "number" ? regenerationVersion : (currentCase.recordVersion ?? 0);
    setBusyAction(actionName);
    try {
      await postAction({ ...action, floorId: selectedFloor.id, expectedRecordVersion, expectedRevision: state.persistenceRevision, idempotencyKey: key.current }, activeUser.role);
      key.current = crypto.randomUUID();
      notify("success", successMessage);
      await refresh(successMessage); router.refresh();
      return true;
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("The evaluation context changed. Reload the exact Case and floor, review the latest lineage, then try again.");
      else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest Case version before continuing.");
      else { const safeMessage = error instanceof Error ? error.message : "The evaluation action could not be completed."; setMessage(safeMessage); notify("error", safeMessage); }
      return false;
    } finally { setBusyAction(null); }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (shaktiReplacement?.status === "REPLACEMENT_REQUIRED" && shaktiSnapshots.length === 1) setShaktiValuesText("");
  }, [shaktiReplacement?.id, shaktiReplacement?.status, shaktiSnapshots.length]);

  const replacementAction = shaktiReplacement?.status === "REPLACEMENT_REQUIRED" && shaktiSnapshots.length > 1
    ? { label: "Bind replacement snapshot", toStatus: "REGENERATED" as const, replacementVersionId: shaktiSnapshot?.id }
    : shaktiReplacement?.status === "REGENERATED"
      ? { label: "Verify replacement lineage", toStatus: "READY_FOR_REVIEW" as const, replacementVersionId: shaktiReplacement.replacementVersionId }
      : null;

  return <section className="section-grid" aria-labelledby="evaluation-title">
    <div className="card span-12 founder-work-surface">
      <div className="founder-context-bar" aria-label="Locked evaluation context"><span>Evaluation</span><span aria-hidden="true">→</span><strong>{currentCase?.caseNumber ?? "Case unavailable"}</strong><span aria-hidden="true">→</span><span>{selectedClient?.displayName ?? "Client unavailable"}</span><span aria-hidden="true">→</span><span>{selectedFloor?.floorLabel ?? "Floor unavailable"}</span></div>
      <div className="eyebrow">Step 08 · Utility and Shakti evaluation</div>
      <h2 id="evaluation-title">Record both immutable evaluation snapshots</h2>
      <p className="subtle">Complete one exact-lineage task at a time. Evaluation can be prepared now; presentation and release remain governed later.</p>
      {(!currentCase || !selectedFloor) && <p role="alert">Select an authorised Case and floor before evaluating. No context is chosen automatically.</p>}
      {!evaluationReady && currentCase && selectedFloor && <div className="panel status-blocked" role="alert"><strong>Evaluation is blocked</strong><ul>{evaluationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
      <div className="two-col" style={{ marginTop: 16 }}>
        <article className={`next-step-card ${utilitySnapshotRecorded ? "status-approved" : ""}`} aria-labelledby="utility-task-title">
          <div className="pill-row"><span className="eyebrow">Task 1 of 2</span><TaskState recorded={utilitySnapshotRecorded} ready={evaluationReady} /></div>
          <h3 id="utility-task-title">Utility evaluation</h3>
          {utilitySnapshotRecorded ? <><p className="subtle">The immutable Utility snapshot is recorded for this exact floor, current plan, locked orientation and approved methodology.</p><dl><div><dt>Snapshot</dt><dd>{utilitySnapshot.snapshotName}</dd></div><div><dt>Rules pinned</dt><dd>{utilitySnapshot.provenance?.selectedRuleIds?.length ?? utilitySnapshot.generatedMatrix.length}</dd></div></dl><details><summary>Utility snapshot lineage</summary><div className="details-body"><p className="meta">Snapshot ID {utilitySnapshot.id}</p><p className="meta">Plan {utilitySnapshot.planVersionId} · Orientation {utilitySnapshot.orientationVersionId}</p><p className="meta">Methodology {utilitySnapshot.provenance?.methodologyVersionId ?? "Unavailable"}</p></div></details></> : <><p className="subtle">Run the active approved UtilityMaster rules against the verified utility mappings for this exact floor and save one immutable snapshot.</p><div className="pill-row"><span className="pill">{utilityInputs.length} mapped input{utilityInputs.length === 1 ? "" : "s"}</span><span className="pill">{masterMeta?.total ?? rules.length} active approved rule{(masterMeta?.total ?? rules.length) === 1 ? "" : "s"}</span></div><label className="field" htmlFor="snapshot-name"><span>Snapshot name</span><input id="snapshot-name" value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} maxLength={120} /></label><button type="button" className="button founder-action-primary" disabled={Boolean(busyAction) || !evaluationReady || !snapshotName.trim() || utilityInputs.length === 0} onClick={() => void act({ action: "utility-evaluate", caseId: currentCase?.id, snapshotName, utilityInputs }, "Utility evaluation recorded for this exact floor and lineage.", utilityKey)}>{busyAction === "utility-evaluate" ? "Running Utility evaluation..." : "Run and save Utility evaluation"}</button>{!evaluationReady ? <p className="meta">Complete the readiness items above before running Utility evaluation.</p> : utilityInputs.length === 0 ? <p className="meta">Record at least one verified utility mapping before running Utility evaluation.</p> : !snapshotName.trim() ? <p className="meta">Enter a snapshot name to continue.</p> : null}</>}
        </article>

        <article className={`next-step-card ${shaktiSnapshotRecorded && !shaktiReplacement ? "status-approved" : ""}`} aria-labelledby="shakti-task-title">
          <div className="pill-row"><span className="eyebrow">Task 2 of 2</span><TaskState recorded={shaktiSnapshotRecorded && !shaktiReplacement} ready={evaluationReady} /></div>
          <h3 id="shakti-task-title">Shakti evaluation</h3>
          {shaktiSnapshotRecorded && !replacementMode && !shaktiReplacement ? <><p className="subtle">The immutable Shakti snapshot is recorded for this exact lineage. Its input values are read-only.</p><div className="pill-row"><span className="pill">16 values</span><span className="pill">{shaktiSnapshot.rankedVerdicts[0]?.element ?? "Ranking recorded"} first</span></div><details><summary>View recorded values and lineage</summary><div className="details-body"><p className="meta">{shaktiSnapshot.inputValues.join(", ")}</p><p className="meta">Snapshot ID {shaktiSnapshot.id}</p><p className="meta">Plan {shaktiSnapshot.planVersionId} · Orientation {shaktiSnapshot.orientationVersionId}</p></div></details><button type="button" className="button-secondary" disabled={Boolean(busyAction)} onClick={() => setReplacementMode(true)}>Create new Shakti snapshot</button></> : <><p className="subtle">Enter exactly 16 finite values. A new snapshot never edits or deletes the recorded version.</p>{shaktiSnapshotRecorded && !shaktiReplacement && <label className="field" htmlFor="shakti-replacement-reason"><span>Reason for successor and invalidation</span><textarea id="shakti-replacement-reason" value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} minLength={20} maxLength={500} /></label>}{shaktiSnapshotRecorded && !shaktiReplacement ? <button type="button" className="button-secondary" disabled={Boolean(busyAction) || replacementReason.trim().length < 20} onClick={() => void act({ action: "evaluation-replacement-request", caseId: currentCase?.id, targetType: "SHAKTI_EVALUATION", snapshotId: shaktiSnapshot.id, reason: replacementReason }, "A Shakti successor is now required. The prior snapshot remains immutable in history.", replacementKey)}>{busyAction === "evaluation-replacement-request" ? "Creating successor request..." : "Require new Shakti snapshot"}</button> : <><label className="field" htmlFor="shakti-values"><span>16 Shakti values</span><textarea id="shakti-values" value={shaktiValuesText} onChange={(event) => setShaktiValuesText(event.target.value)} aria-invalid={shaktiValues.length !== 16} aria-describedby={shaktiValues.length !== 16 ? "shakti-values-error" : undefined} /></label>{shaktiValues.length !== 16 && <p id="shakti-values-error" className="field-error">Enter exactly 16 finite comma-separated values.</p>}<button type="button" className="button founder-action-primary" disabled={Boolean(busyAction) || !evaluationReady || shaktiValues.length !== 16 || (shaktiSnapshotRecorded && !shaktiReplacement)} onClick={() => void act({ action: "shakti-rank", caseId: currentCase?.id, values: shaktiValues }, "Shakti evaluation recorded for this exact floor and lineage.", shaktiKey)}>{busyAction === "shakti-rank" ? "Running Shakti evaluation..." : "Run and save Shakti evaluation"}</button></>}</>}
          {shaktiReplacement && <div className="panel status-attention"><strong>Successor workflow · {shaktiReplacement.status.replaceAll("_", " ")}</strong><p className="subtle">The prior snapshot remains immutable. Step 08 stays in regeneration until the replacement is bound and verified.</p>{replacementAction && <button type="button" className="button-secondary" disabled={Boolean(busyAction)} onClick={() => void act({ action: "regeneration-transition", caseId: currentCase?.id, invalidationId: shaktiReplacement.id, toStatus: replacementAction.toStatus, replacementVersionId: replacementAction.replacementVersionId, reason: replacementReason || shaktiReplacement.reason }, `${replacementAction.label} completed.`, regenerationKey)}>{busyAction === "regeneration-transition" ? "Updating lineage..." : replacementAction.label}</button>}</div>}
        </article>
      </div>

      <div className={`panel ${utilitySnapshotRecorded && shaktiSnapshotRecorded && !shaktiReplacement ? "status-approved" : "status-attention"}`} style={{ marginTop: 16 }} aria-live="polite"><strong>{utilitySnapshotRecorded && shaktiSnapshotRecorded && !shaktiReplacement ? "Both evaluations are recorded" : utilitySnapshotRecorded ? "Save the Shakti evaluation to continue" : shaktiSnapshotRecorded ? "Save the Utility evaluation to continue" : "Record both evaluation snapshots to continue"}</strong><p className="subtle">The universal Next Step control updates from the same server-derived state after each successful action.</p></div>

      <details className="founder-technical-details"><summary>Methodology and technical details</summary><div className="details-body"><div className="pill-row"><span className="pill">GOOD {grouped.GOOD.length}</span><span className="pill">BAD {grouped.BAD.length}</span><span className="pill">OK-OK {grouped["OK-OK"].length}</span><span className="pill">UtilityMaster rows {masterMeta?.utilityMasterRows ?? 0}</span></div><p className="meta">{service ? `${serviceTypeLabel(service.serviceType)} · ${readiness?.completed ?? 0} of ${readiness?.total ?? 0} required inputs ready.` : "No service context."}</p><button type="button" className="button-secondary" onClick={() => void refresh("Approved methodology and evaluation state reloaded without changing active inputs.")} disabled={Boolean(busyAction)}>{busyAction === "refresh" ? "Reloading..." : "Reload approved methodology"}</button><div className="list">{rules.map((rule) => <div key={rule.id} className="list-item"><strong>{rule.zoneCode}</strong><span className="meta">{rule.description}</span><span className={`tag ${rule.verdict === "GOOD" ? "good" : rule.verdict === "BAD" ? "bad" : "warn"}`}>{rule.verdict}</span></div>)}</div></div></details>
      <div className="footer-note" role={/could not|changed|blocked|failed|reload/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div>
    </div>
  </section>;
}
