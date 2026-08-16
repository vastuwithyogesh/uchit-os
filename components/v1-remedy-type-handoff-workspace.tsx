"use client";

import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

const labels: Record<string, string> = { WATER: "Water", AIR: "Air", FIRE: "Fire", EARTH: "Earth", SPACE: "Space" };
const remedyLabels: Record<string, string> = { TATTAV_BALANCER: "Tattav Balancer", DISHA_BALANCER: "Disha Balancer", TATTAV_ACTIVATION: "Tattav Activation", DISHA_ACTIVATION: "Disha Activation", EQUALISER: "Equaliser" };

export function V1RemedyTypeHandoffWorkspace({ caseId, projectId, floorId }: { caseId?: string; projectId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<AppState | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [message, setMessage] = useState("Loading the current deterministic V1 handoff authority…");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());

  async function refresh() {
    const response = await fetch("/api/state", { cache: "no-store", headers: buildActionHeaders(activeUser.role) });
    const payload = await response.json() as { state: AppState; revision: number | null };
    if (!response.ok) throw new Error("The current V1 handoff authority could not be loaded.");
    setState(payload.state); setRevision(payload.revision);
    setMessage("Current V1 findings and clearance are ready for the native handoff action.");
  }
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "The current V1 handoff authority could not be loaded.")); }, [caseId, projectId, floorId]);

  const evaluation = state?.elementalEvaluationSnapshots.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "COMPLETE" && item.methodologyVersionId === "UCHIT_OS_EVALUATION_METHODOLOGY_V1.1_ELEMENTAL" && item.methodologyContentHash === "sha256:044c40b4c386e7be7c6f7f83b87b35c85090b6296dfd65cd6191806cfc6ddd99");
  const report = state?.elementalReportSnapshots.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED" && item.elementalEvaluationSnapshotId === evaluation?.id && item.elementalEvaluationOutputHash === evaluation?.outputHash);
  const clearance = state?.v1FullBalanceClearances?.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "APPROVED" && item.elementalEvaluationSnapshotId === evaluation?.id && item.elementalReportSnapshotId === report?.id);
  const handoff = state?.evaluationRemedyHandoffs.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "READY" && item.elementalEvaluationSnapshotId === evaluation?.id && item.elementalReportSnapshotId === report?.id && item.fullBalanceClearanceId === clearance?.id);
  const combined = state?.combinedEvaluationReportSnapshots.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status !== "SUPERSEDED" && item.remedyHandoffId === handoff?.id && item.remedyHandoffContentHash === handoff?.contentHash);
  const stageBInput = state?.stageBInputsV1.find((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.sourceEvaluationRemedyHandoffId === handoff?.id && item.status !== "SUPERSEDED");
  const reservation = state?.remedialWorkflowReservations.find((item) => item.caseId === caseId && item.floorId === floorId);
  const caseRecord = state?.vastuCases.find((item) => item.id === caseId);
  const decisions = ((evaluation?.elements ?? []) as Array<{ element: string; verdict: string; remedyType: string }>).map((item) => ({ ...item, label: labels[item.element] ?? item.element, remedyLabel: remedyLabels[item.remedyType] ?? item.remedyType }));

  async function create() {
    if (!state || !evaluation || handoff || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: "evaluation-remedy-handoff-create-v1", actorRole: activeUser.role, caseId, projectId, floorId, expectedRecordVersion: evaluation.recordVersion, expectedRevision: revision, idempotencyKey: key.current }) });
      const result = await response.json() as { ok?: boolean; error?: string | { message?: string } };
      if (!response.ok || result.ok === false) throw new Error(typeof result.error === "string" ? result.error : result.error?.message ?? "The native Remedy-Type Handoff could not be created.");
      key.current = crypto.randomUUID(); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The native Remedy-Type Handoff could not be created."); }
    finally { setBusy(false); }
  }

  async function postAction(action: string, payload: Record<string, unknown>, success: string) {
    if (!state || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json", ...buildActionHeaders(activeUser.role) }, body: JSON.stringify({ action, actorRole: activeUser.role, expectedRevision: revision, idempotencyKey: key.current, ...payload }) });
      const result = await response.json() as { ok?: boolean; error?: string | { message?: string } };
      if (!response.ok || result.ok === false) throw new Error(typeof result.error === "string" ? result.error : result.error?.message ?? `${action} failed.`);
      key.current = crypto.randomUUID(); await refresh(); setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : `${action} failed.`); }
    finally { setBusy(false); }
  }

  const createCombined = () => postAction("combined-report-draft-v1", { caseId, projectId, floorId, expectedRecordVersion: handoff?.recordVersion ?? evaluation?.recordVersion ?? 0 }, "Combined Evaluation draft created.");
  const finalizeCombined = () => postAction("combined-report-finalize-v1", { snapshotId: combined?.id, expectedRecordVersion: combined?.recordVersion ?? 0 }, "Combined Evaluation finalized.");
  const createStageBInput = () => postAction("stage-b-input-v1-draft", { handoffId: handoff?.id, expectedRecordVersion: handoff?.recordVersion ?? 0 }, "Stage-B Input draft created.");
  const finalizeStageBInput = () => postAction("stage-b-input-v1-finalize", { recordId: stageBInput?.id, expectedRecordVersion: stageBInput?.recordVersion ?? 0 }, "Stage-B Input finalized.");
  const resolveReadiness = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json", ...buildActionHeaders(activeUser.role) }, body: JSON.stringify({ action: "stage-b-readiness-v1", actorRole: activeUser.role, caseId, floorId, expectedRecordVersion: stageBInput?.recordVersion ?? 0, reservationRecordVersion: reservation?.recordVersion ?? 0, expectedRevision: revision, idempotencyKey: key.current }) });
      const result = await response.json() as { ok?: boolean; reservation?: { status?: string } | null; error?: string | { message?: string } };
      if (!response.ok || result.ok === false) throw new Error(typeof result.error === "string" ? result.error : result.error?.message ?? "Stage-B readiness could not be resolved.");
      key.current = crypto.randomUUID(); await refresh(); setMessage(result.reservation?.status === "READY_FOR_CONFIGURATION" ? "Stage-B readiness reached." : result.reservation?.status === "BLOCKED_METHOD_INPUT" ? "Stage-B readiness is blocked: the active Stage-B methodology is not available." : "Stage-B readiness is not available: the commercial entitlement is incomplete.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Stage-B readiness could not be resolved."); }
    finally { setBusy(false); }
  };

  return <section aria-label="Native V1 Remedy-Type Handoff" className="founder-panel">
    <div className="founder-panel-heading"><div><p className="eyebrow">Native V1 deterministic governance</p><h2>Remedy-Type Handoff</h2></div><span className="status-pill">{handoff ? "READY" : "READY TO CREATE"}</span></div>
    <p>This handoff contains deterministic remedy types only. Product, SKU, placement and implementation choices remain outside this milestone.</p>
    <div className="founder-grid founder-grid-3"><div><strong>Full Balance Clearance</strong><p>{clearance ? "APPROVED" : "REQUIRED"}</p></div><div><strong>Elemental Evaluation</strong><p>{evaluation?.status ?? "REQUIRED"}</p></div><div><strong>Elemental Report</strong><p>{report?.status ?? "REQUIRED"}</p></div></div>
    <div className="founder-grid founder-grid-2">{decisions.map((item) => <div key={item.element}><strong>{item.label}</strong><p>{item.verdict} → {item.remedyLabel}</p></div>)}</div>
    {handoff ? <p role="status">READY · Handoff {handoff.id} · source clearance {handoff.fullBalanceClearanceId}</p> : <button type="button" onClick={() => void create()} disabled={busy || !evaluation || !report || !clearance}>{busy ? "Creating…" : "Create Remedy-Type Handoff"}</button>}
    {handoff ? <section aria-label="Pre-Stage-B bridge" className="founder-panel">
      <h3>Pre-Stage-B bridge</h3>
      <p>Combined Evaluation is the pre-Stage-B artifact. Product selection, placement and implementation remain unavailable until the bridge is complete.</p>
      {!combined ? <button type="button" onClick={() => void createCombined()} disabled={busy}>Create Combined Evaluation</button> : <p role="status">Combined Evaluation · {combined.status} · {combined.id}</p>}
      {combined?.status === "DRAFT" ? <button type="button" onClick={() => void finalizeCombined()} disabled={busy}>Finalize Combined Evaluation</button> : null}
      {combined?.status === "FINALIZED" && !stageBInput ? <button type="button" onClick={() => void createStageBInput()} disabled={busy}>Create Stage-B Input</button> : null}
      {stageBInput ? <p role="status">Stage-B Input · {stageBInput.status} · {stageBInput.id}</p> : null}
      {stageBInput?.status === "DRAFT" ? <button type="button" onClick={() => void finalizeStageBInput()} disabled={busy}>Finalize Stage-B Input</button> : null}
      {stageBInput?.status === "FINALIZED" && (!reservation || reservation.status === "BLOCKED_METHOD_INPUT") ? <button type="button" onClick={() => void resolveReadiness()} disabled={busy}>Resolve Stage-B Readiness</button> : null}
      {stageBInput?.status === "FINALIZED" && !reservation && caseRecord && (!caseRecord.balanceApproved || !caseRecord.fullPaymentApproved) ? <p role="alert">Stage-B readiness is blocked: the commercial entitlement is incomplete for this case.</p> : null}
      {reservation?.status === "BLOCKED_METHOD_INPUT" ? <p role="alert">Stage-B readiness is blocked: the active Stage-B methodology is not available.</p> : null}
      {reservation?.status === "READY_FOR_CONFIGURATION" ? <p role="status">READY_FOR_CONFIGURATION · {reservation.id}</p> : null}
    </section> : null}
    <p role="status">{message}</p>
    {handoff && !combined && <p>Next native milestone: Combined Evaluation.</p>}
  </section>;
}
