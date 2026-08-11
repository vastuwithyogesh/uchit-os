"use client";

import { useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { canApproveCommercialProposal, canApproveReport, canEditFloorWorkspaces, canReleaseVerdict } from "@/lib/permissions";
import { canCreateCase, canReleaseOfficialVerdict, formatMoney } from "@/lib/workflows";

type FounderBootstrapState = AppState & { foundation?: { isFounderEdition?: boolean } };

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load workflow state");
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

export function WorkflowConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<FounderBootstrapState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load the live workflow state to continue.");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newFloorLabel, setNewFloorLabel] = useState("First floor");
  const [evaluationName, setEvaluationName] = useState("Residential tab evaluation");
  const [shaktiValuesText, setShaktiValuesText] = useState("9,8,8,7,6,9,8,7,6,7,8,9,8,7,6,8");

  const clients = state?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const proposal = state?.commercialProposals.find((item) => item.clientId === selectedClient?.id);
  const booking = state?.reviewCallBookings.find((item) => item.clientId === selectedClient?.id);
  const caseRecord = state && selectedClient ? getActiveCaseForClient(state, selectedClient.id) : undefined;
  const floorWorkspaces = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const selectedFloor = floorWorkspaces[0];
  const reportVersions = state?.reportVersions.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const previewReport = reportVersions.find((item) => item.isPreview);
  const finalReport = reportVersions.find((item) => !item.isPreview);
  const advancePayment = state?.payments.find((item) => item.proposalId === proposal?.id && item.type === "ADVANCE");
  const balancePayment = state?.payments.find((item) => item.caseId === caseRecord?.id && item.type === "BALANCE");
  const evaluationSnapshots = state?.evaluationSnapshots.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const shaktiSnapshots = state?.shaktiSnapshots.filter((item) => item.caseId === caseRecord?.id) ?? [];
  const timeline = state?.timelineEvents.filter((item) => item.clientId === selectedClient?.id).slice(0, 6) ?? [];
  const latestEvaluationSnapshot = evaluationSnapshots[0];
  const latestShaktiSnapshot = shaktiSnapshots[0];
  const latestShaktiVerdict = latestShaktiSnapshot?.rankedVerdicts[0];

  const shaktiValues = useMemo(
    () =>
      shaktiValuesText
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value)),
    [shaktiValuesText]
  );

  const readyFloors = floorWorkspaces.filter((floor) => floor.status === "READY_FOR_REVIEW" || floor.locked).length;
  const evaluationReady = evaluationSnapshots.length > 0 && shaktiSnapshots.length > 0;
  const caseCanOpen = Boolean(proposal && canCreateCase(proposal, advancePayment));
  const finalReportCanPrepare = Boolean(
    caseRecord &&
      caseRecord.balanceApproved &&
      caseRecord.fullPaymentApproved &&
      balancePayment?.status === "APPROVED" &&
      Boolean(balancePayment.proofAssetId)
  );
  const isFounderEdition = state?.foundation?.isFounderEdition === true;
  const founderReviewDone = Boolean(finalReport?.approvalEvidence?.some((item) => item.checkpoint === "FOUNDER_REVIEWED"));
  const founderApprovalDone = Boolean(finalReport?.approvalEvidence?.some((item) => item.checkpoint === "FOUNDER_APPROVED"));
  const approvalCount = isFounderEdition ? Number(founderReviewDone) + Number(founderApprovalDone) : finalReport?.approvals?.length ?? 0;
  const verdictReadyByState = Boolean(
    caseRecord &&
      finalReport &&
      approvalCount >= 2 &&
      canReleaseOfficialVerdict(caseRecord, balancePayment)
  );

  const workflowBlockers = [
    !proposal ? "Create or load the commercial proposal first." : null,
    proposal && proposal.status !== "APPROVED" ? "The proposal still needs Super-Admin approval." : null,
    proposal && !advancePayment ? "The minimum advance has not been recorded yet." : null,
    proposal && advancePayment && !caseCanOpen ? "Advance exists but does not yet clear the case-opening rule." : null,
    caseRecord && floorWorkspaces.length === 0 ? "Add the first floor workspace to begin operational work." : null,
    caseRecord && readyFloors === 0 ? "No floor is marked ready for review yet." : null,
    caseRecord && !evaluationReady ? "Utility and Shakti snapshots are still incomplete." : null,
    caseRecord && !previewReport ? "Stage-A preview has not been generated yet." : null,
    caseRecord && !finalReportCanPrepare ? "Balance is not approved yet, so the final report remains locked." : null,
    finalReport && approvalCount < 2 ? (isFounderEdition ? "Founder review and Founder approval are still required." : "Two report approvals are still required.") : null,
    finalReport && !verdictReadyByState ? "Verdict release is still blocked by payment or approval gates." : null
  ].filter(Boolean) as string[];

  const nextOperatorMove = (() => {
    if (!proposal) return "Create or load the proposal so the commercial flow can continue.";
    if (proposal.status !== "APPROVED") return "Get the proposal approved by a Super-Admin.";
    if (!advancePayment || !caseCanOpen) return "Approve the advance so the case can open cleanly.";
    if (!caseRecord) return "Open the case now that the commercial gate is clear.";
    if (floorWorkspaces.length === 0) return "Create the first floor workspace for this case.";
    if (readyFloors === 0) return "Mark at least one floor ready for review.";
    if (!evaluationReady) return "Save the utility snapshot and Shakti ranking for this case.";
    if (!previewReport) return "Generate the Stage-A preview to start the report chain.";
    if (!finalReportCanPrepare) return "Approve the balance payment to unlock the final report.";
    if (!finalReport) return "Prepare the final report now that payment is clear.";
    if (approvalCount < 2) return isFounderEdition ? (founderReviewDone ? "Record Founder approval." : "Record Founder review.") : "Collect the remaining report approvals.";
    if (!verdictReadyByState) return "Clear the remaining verdict blockers before release.";
    return "All release gates are clear. The verdict can now be released.";
  })();

  const verdictDossier = [
    {
      label: "Preview report",
      value: previewReport ? previewReport.status : "Missing",
      note: previewReport ? (previewReport.watermarkText ? "Watermarked until balance is approved" : "No watermark needed") : "Generate the Stage-A preview first",
      tone: previewReport ? ("good" as const) : ("warn" as const)
    },
    {
      label: "Final report",
      value: finalReport ? finalReport.status : "Missing",
      note: finalReport ? `${finalReport.approvals.length} approvals recorded` : "Prepare after balance approval",
      tone: finalReport ? ("good" as const) : ("warn" as const)
    },
    {
      label: "Evaluation snapshot",
      value: latestEvaluationSnapshot ? latestEvaluationSnapshot.snapshotName : "Missing",
      note: latestEvaluationSnapshot ? `${latestEvaluationSnapshot.generatedMatrix.length} matrix rows captured from ${latestEvaluationSnapshot.sourceVersion}` : "Save the utility snapshot for this case",
      tone: latestEvaluationSnapshot ? ("good" as const) : ("warn" as const)
    },
    {
      label: "Shakti snapshot",
      value: latestShaktiSnapshot ? "Saved" : "Missing",
      note: latestShaktiSnapshot
        ? `${latestShaktiSnapshot.inputValues.length} inputs · ${latestShaktiSnapshot.tieBreakUsed ? "tie-break used" : "unique ranking"}`
        : "Save the 16-value ranking for this case",
      tone: latestShaktiSnapshot ? ("good" as const) : ("warn" as const)
    },
    {
      label: "Verdict lock",
      value: verdictReadyByState ? "Open" : "Held",
      note: verdictReadyByState ? "Payment and approval gates are clear" : "Still waiting on balance or report approvals",
      tone: verdictReadyByState ? ("good" as const) : ("warn" as const)
    }
  ];

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const nextState = await fetchState();
      setState(nextState);
      setSelectedClientId((current) => preferredClientId ?? current ?? nextState.clients[0]?.id ?? "");
      setMessage("Workflow state refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const actionName = String(action.action ?? "");
      const protectedEntity = ["proposal-approve", "case-create", "advance-proof-verify"].includes(actionName) ? proposal
        : actionName === "floor-create" ? caseRecord
        : actionName === "balance-proof-verify" ? caseRecord
          : ["report-approve", "verdict-release"].includes(actionName) ? finalReport : undefined;
      let payload = action;
      if (["proposal-approve", "case-create", "advance-proof-verify", "balance-proof-verify", "report-approve", "verdict-release", "floor-create"].includes(actionName)) {
        if (state?.persistenceRevision === undefined || state.persistenceRevision === null || !protectedEntity) throw new Error("Reload the latest record before this protected action.");
        payload = { ...action, expectedRecordVersion: protectedEntity.recordVersion ?? 0, expectedRevision: state.persistenceRevision,
          idempotencyKey: `founder:${actionName}:${protectedEntity.id}:${protectedEntity.recordVersion ?? 0}:${String(action.proofId ?? "none")}` };
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

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Operations spine</div>
        <h2>Run the case, floor, evaluation, and report systems from one place</h2>
        <p className="subtle">
          This is the operating control room for the app’s core journey after lead qualification: case opening, workspace management, evaluation, approvals, and final release.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{caseRecord?.status ?? "Locked"}</span>
            <span className="stat-label">current case state</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {readyFloors} / {floorWorkspaces.length}
            </span>
            <span className="stat-label">floors review-ready</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{evaluationReady ? "Ready" : "Pending"}</span>
            <span className="stat-label">evaluation coverage</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{verdictReadyByState ? "Open" : "Held"}</span>
            <span className="stat-label">verdict gate</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 14 }}>
          <button className="button" type="button" onClick={() => refresh()} disabled={busy}>
            Load workflow state
          </button>
          <select value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.displayName}
              </option>
            ))}
          </select>
          <span className="pill">{activeUser.role}</span>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Next operator move</div>
        <h3>What should happen now</h3>
        <div className="panel" style={{ marginTop: 14 }}>
          <strong>{selectedClient?.displayName ?? "Select a client"}</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {nextOperatorMove}
          </div>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Proposal amount</strong>
            <span className="meta">{proposal ? formatMoney(proposal.amountInr) : "Not loaded"}</span>
          </div>
          <div className="list-item">
            <strong>Advance gate</strong>
            <span className={`tag ${caseCanOpen ? "good" : "warn"}`}>{caseCanOpen ? "Open" : "Held"}</span>
          </div>
          <div className="list-item">
            <strong>Review call</strong>
            <span className="meta">{booking ? booking.status : "Not booked"}</span>
          </div>
          <div className="list-item">
            <strong>Balance gate</strong>
            <span className="meta">{finalReportCanPrepare ? "Clear" : "Pending"}</span>
          </div>
        </div>
        <div className="footer-note" style={{ marginTop: 12 }}>
          {workflowBlockers.length ? `Main blocker: ${workflowBlockers[0]}` : "This client is ready for final release."}
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Case opening</div>
        <h3>Payment to case chain</h3>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Proposal</strong>
            <span className="meta">{proposal?.status ?? "Not created"}</span>
          </div>
          <div className="list-item">
            <strong>Advance</strong>
            <span className="meta">{advancePayment ? `${advancePayment.status} · ${formatMoney(advancePayment.amountInr)}` : "Not approved yet"}</span>
          </div>
          <div className="list-item">
            <strong>Case</strong>
            <span className="meta">{caseRecord ? `${caseRecord.caseNumber} · ${caseRecord.status}` : "Locked"}</span>
          </div>
          <div className="list-item">
            <strong>Balance</strong>
            <span className="meta">{balancePayment ? `${balancePayment.status} · ${formatMoney(balancePayment.amountInr)}` : "Pending"}</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 12 }}>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !proposal || !canApproveCommercialProposal(activeUser) || proposal.status === "APPROVED"}
            onClick={() => run({ action: "proposal-approve", proposalId: proposal?.id }, "Commercial approval recorded.")}
          >
            Approve proposal
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !proposal || !caseCanOpen || Boolean(caseRecord)}
            onClick={() => run({ action: "case-create", clientId: selectedClient?.id, proposalId: proposal?.id }, "Case opened.")}
          >
            Open case
          </button>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Release readiness</div>
        <h3>What still blocks verdict release</h3>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Preview report</strong>
            <span className={`tag ${previewReport ? "good" : "warn"}`}>{previewReport ? "Ready" : "Pending"}</span>
          </div>
          <div className="list-item">
            <strong>Final report</strong>
            <span className={`tag ${finalReport ? "good" : "warn"}`}>{finalReport ? "Prepared" : "Pending"}</span>
          </div>
          <div className="list-item">
            <strong>Approvals</strong>
            <span className="meta">{approvalCount} / 2</span>
          </div>
          <div className="list-item">
            <strong>Verdict release</strong>
            <span className={`tag ${verdictReadyByState ? "good" : "warn"}`}>{verdictReadyByState ? "Unblocked" : "Held"}</span>
          </div>
        </div>
        <div className="footer-note" style={{ marginTop: 12 }}>
          {verdictReadyByState ? "All payment and approval gates are clear." : "Use the blocker list below to move this case toward release."}
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Verdict dossier</div>
        <h3>One glance at the release packet</h3>
        <p className="subtle" style={{ marginTop: 8 }}>
          This card keeps the report chain readable for the team: preview, final report, utility evaluation, Shakti ranking, and the final lock state.
        </p>
        <div className="list" style={{ marginTop: 14 }}>
          {verdictDossier.map((item) => (
            <div key={item.label} className="list-item">
              <strong>{item.label}</strong>
              <span className={`tag ${item.tone}`}>{item.value}</span>
              <span className="meta">{item.note}</span>
            </div>
          ))}
        </div>
        <div className="workflow" style={{ marginTop: 12 }}>
          <a href="/evaluation" className="button-secondary">
            Open evaluation
          </a>
          <a href="/reports" className="button-secondary">
            Open report flow
          </a>
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <strong>Latest Shakti ranking</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {latestShaktiVerdict ? `${latestShaktiVerdict.element} leading at ${latestShaktiVerdict.score}` : "No ranking saved yet"}
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Floor work</div>
        <h3>Create, lock, and ready floor workspaces</h3>
        <div className="field" style={{ marginTop: 14 }}>
          <label>New floor label</label>
          <input value={newFloorLabel} onChange={(event) => setNewFloorLabel(event.target.value)} />
        </div>
        <div className="workflow" style={{ marginTop: 10 }}>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !caseRecord || !canEditFloorWorkspaces(activeUser)}
            onClick={() => run({ action: "floor-create", caseId: caseRecord?.id, floorLabel: newFloorLabel }, "Floor workspace created.")}
          >
            Add floor
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !selectedFloor || !canEditFloorWorkspaces(activeUser)}
            onClick={() => run({ action: "floor-ready", floorId: selectedFloor?.id }, "Floor marked ready for review.")}
          >
            Mark ready
          </button>
        </div>
        <div className="panel" style={{ marginTop: 12 }}>
          <strong>Plans, evidence, and orientation</strong>
          <p className="meta">Use the protected spatial workflow for plan versions, full-colour marked evidence, Google Earth evidence, and exact orientation.</p>
          <a className="button" href="/spatial">Open spatial setup</a>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Selected floor</div>
        <h3>Current floor snapshot</h3>
        <div className="list" style={{ marginTop: 14 }}>
          {floorWorkspaces.length ? (
            floorWorkspaces.map((floor) => (
              <div key={floor.id} className="list-item">
                <strong>{floor.floorLabel}</strong>
                <span className="meta">{floor.status}</span>
              </div>
            ))
          ) : (
            <div className="list-item">
              <strong>No floor workspaces</strong>
              <span className="meta">Create the first one after case opening.</span>
            </div>
          )}
        </div>
        <div className="pill-row" style={{ marginTop: 12 }}>
          {(selectedFloor?.evidenceUploads ?? []).map((item) => (
            <span key={item} className="pill">
              {item}
            </span>
          ))}
          {!selectedFloor?.evidenceUploads?.length ? <span className="pill">No evidence uploaded yet</span> : null}
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Workflow blockers</div>
        <h3>Current hold list</h3>
        <div className="list" style={{ marginTop: 14 }}>
          {workflowBlockers.length ? (
            workflowBlockers.map((blocker) => (
              <div key={blocker} className="list-item">
                <strong>Attention needed</strong>
                <span className="meta">{blocker}</span>
              </div>
            ))
          ) : (
            <div className="list-item">
              <strong>No blockers</strong>
              <span className="meta">This client is ready to move to the final release step.</span>
            </div>
          )}
        </div>
      </div>

      <div className="card span-6">
        <div className="eyebrow">Evaluation engine</div>
        <h3>Save utility and Shakti snapshots</h3>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Evaluation snapshot name</label>
          <input value={evaluationName} onChange={(event) => setEvaluationName(event.target.value)} />
        </div>
        <div className="workflow" style={{ marginTop: 10 }}>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !caseRecord}
            onClick={() => run({ action: "utility-evaluate", caseId: caseRecord?.id, snapshotName: evaluationName }, "Utility evaluation snapshot saved.")}
          >
            Save utility snapshot
          </button>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Shakti values (16 comma-separated numbers)</label>
          <textarea value={shaktiValuesText} onChange={(event) => setShaktiValuesText(event.target.value)} />
        </div>
        <button
          className="button-secondary"
          type="button"
          disabled={busy || !caseRecord || shaktiValues.length !== 16}
          style={{ marginTop: 10 }}
          onClick={() => run({ action: "shakti-rank", caseId: caseRecord?.id, values: shaktiValues }, "Shakti snapshot saved.")}
        >
          Save Shakti snapshot
        </button>
        <div className="pill-row" style={{ marginTop: 12 }}>
          <span className="pill">Utility snapshots {evaluationSnapshots.length}</span>
          <span className="pill">Shakti snapshots {shaktiSnapshots.length}</span>
        </div>
      </div>

      <div className="card span-6">
        <div className="eyebrow">Report control</div>
        <h3>Preview, final report, approvals, and release</h3>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Preview report</strong>
            <span className="meta">{previewReport?.status ?? "Not prepared"}</span>
          </div>
          <div className="list-item">
            <strong>Final report</strong>
            <span className="meta">{finalReport?.status ?? "Not prepared"}</span>
          </div>
          <div className="list-item">
            <strong>Approvals</strong>
            <span className="meta">{approvalCount} / 2</span>
          </div>
          <div className="list-item">
            <strong>Release role</strong>
            <span className="meta">{canReleaseVerdict(activeUser) ? "Allowed for this account" : "Requires Admin or Super-Admin"}</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 12 }}>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !caseRecord || !canEditFloorWorkspaces(activeUser)}
            onClick={() => run({ action: "preview-report", caseId: caseRecord?.id }, "Preview generated.")}
          >
            Generate preview
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !caseRecord || !finalReportCanPrepare || !canEditFloorWorkspaces(activeUser)}
            onClick={() => run({ action: "final-report-prepare", caseId: caseRecord?.id }, "Final report prepared for approval.")}
          >
            Prepare final report
          </button>
        </div>
        <div className="workflow" style={{ marginTop: 10 }}>
          <button
            className="button-secondary"
            type="button"
            disabled={busy || !finalReport || !canApproveReport(activeUser)}
            onClick={() => run({ action: "report-approve", reportId: finalReport?.id }, "Final report approval recorded.")}
          >
            Approve final report
          </button>
          <button
            className="button"
            type="button"
            disabled={busy || !finalReport || !verdictReadyByState || !canReleaseVerdict(activeUser)}
            onClick={() => run({ action: "verdict-release", reportId: finalReport?.id }, "Verdict released.")}
          >
            Release verdict
          </button>
        </div>
      </div>

      <div className="card span-12">
        <div className="eyebrow">Recent timeline</div>
        <h3>Latest changes for the selected client</h3>
        <div className="timeline" style={{ marginTop: 14 }}>
          {timeline.length ? (
            timeline.map((event) => (
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
            ))
          ) : (
            <div className="list-item">
              <strong>No recent updates</strong>
              <span className="meta">Load the workflow state to see the latest trail.</span>
            </div>
          )}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
