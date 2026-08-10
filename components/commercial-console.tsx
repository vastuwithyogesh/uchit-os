"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdvanceVerificationRecord,
  ClientRecord,
  CommercialProposalRecord,
  PaymentRecord,
  ReportVersionRecord,
  ReviewCallBookingRecord,
  VastuCaseRecord
} from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { useSession } from "@/components/session-provider";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { formatTimeStamp } from "@/lib/format";
import { canApproveReport, canReleaseVerdict, canVerifyPayments } from "@/lib/permissions";
import { DEFAULT_PROPOSAL_AMOUNT_INR, MIN_ADVANCE_INR, approvalSummary, canCreateCase, canReleaseOfficialVerdict, formatMoney } from "@/lib/workflows";
import { buildActionHeaders } from "@/lib/request-helpers";
import { prepareImageUpload } from "@/lib/image-upload";
import type { PaymentProofRecord } from "@/lib/payment-proof-types";

interface CommercialConsoleProps {
  clients: ClientRecord[];
  proposals: CommercialProposalRecord[];
  reviewCallBookings: ReviewCallBookingRecord[];
  payments: PaymentRecord[];
  advanceVerifications: AdvanceVerificationRecord[];
  cases: VastuCaseRecord[];
  reports: ReportVersionRecord[];
}

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load commercial state");
  }
  return response.json() as Promise<AppState>;
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

export function CommercialConsole(props: CommercialConsoleProps) {
  const { activeUser } = useSession();
  const [liveState, setLiveState] = useState<AppState | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(props.clients[0]?.id ?? "");
  const [meetingProvider, setMeetingProvider] = useState<ReviewCallBookingRecord["provider"]>("GOOGLE_MEET");
  const [meetingTime, setMeetingTime] = useState(() => {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
    next.setHours(10, 30, 0, 0);
    return next.toISOString().slice(0, 16);
  });
  const [proofAmount, setProofAmount] = useState(MIN_ADVANCE_INR);
  const [proofFileName, setProofFileName] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proofId, setProofId] = useState("");
  const [balanceProofAmount, setBalanceProofAmount] = useState(40000);
  const [balanceProofFileName, setBalanceProofFileName] = useState("");
  const [balanceProofUrl, setBalanceProofUrl] = useState("");
  const [balanceProofId, setBalanceProofId] = useState("");
  const [reviewOutcomeNote, setReviewOutcomeNote] = useState("Client attended the review call and is ready for the next step.");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Use the controls below to move the commercial flow forward.");

  const clients = liveState?.clients ?? props.clients;
  const proposals = liveState?.commercialProposals ?? props.proposals;
  const reviewCallBookings = liveState?.reviewCallBookings ?? props.reviewCallBookings;
  const payments = liveState?.payments ?? props.payments;
  const advanceVerifications = liveState?.advanceVerifications ?? props.advanceVerifications;
  const cases = liveState?.vastuCases ?? props.cases;
  const reports = liveState?.reportVersions ?? props.reports;

  const activeClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const activeProposal = proposals.find((proposal) => proposal.clientId === activeClient?.id);
  const activeCase = activeClient ? getActiveCaseForClient({ vastuCases: cases }, activeClient.id) : undefined;
  const activeReport =
    reports.find((item) => item.caseId === activeCase?.id && !item.isPreview) ??
    reports.find((item) => item.caseId === activeCase?.id);
  const activeBooking = reviewCallBookings.find((item) => item.clientId === activeClient?.id);
  const activeVerification = advanceVerifications.find((item) => item.clientId === activeClient?.id && item.proposalId === activeProposal?.id);
  const activePayments = payments.filter((payment) => payment.clientId === activeClient?.id);
  const approval = activeCase && activeProposal ? approvalSummary(activeCase, activeProposal, activePayments) : null;
  const advancePayment = activePayments.find((payment) => payment.proposalId === activeProposal?.id && payment.type === "ADVANCE");
  const balancePayment = activePayments.find((payment) => payment.caseId === activeCase?.id && payment.type === "BALANCE");
  const advanceVerified = Boolean(activeVerification?.proofAssetId && advancePayment?.proofAssetId);
  const approvalCount = activeReport?.isPreview ? 0 : activeReport?.approvals?.length ?? 0;
  const canPrepareFinalReport = Boolean(
    activeCase &&
      activeCase.balanceApproved &&
      activeCase.fullPaymentApproved &&
      balancePayment?.status === "APPROVED" &&
      Boolean(balancePayment.proofAssetId)
  );
  const verdictReadyByState = Boolean(
    activeCase &&
      activeReport &&
      !activeReport.isPreview &&
      approvalCount >= 2 &&
      canReleaseOfficialVerdict(activeCase, balancePayment)
  );
  const canRelease = Boolean(activeCase && activeReport && canReleaseOfficialVerdict(activeCase, balancePayment));
  const caseGateOpen = Boolean(activeProposal && canCreateCase(activeProposal, advancePayment));

  const commercialStatus = useMemo(() => {
    if (!activeProposal) {
      return "No proposal is loaded for this client yet.";
    }
    return `${activeProposal.status} · ${formatMoney(activeProposal.amountInr)} · minimum advance ${formatMoney(activeProposal.minAdvanceInr)}`;
  }, [activeProposal]);

  const journeySteps = useMemo(
    () => [
      { label: "Proposal ready", done: Boolean(activeProposal), note: activeProposal ? commercialStatus : "Waiting for proposal" },
      {
        label: "Call booked",
        done: Boolean(activeBooking),
        note: activeBooking ? `${activeBooking.provider} · ${formatTimeStamp(activeBooking.scheduledAt)}` : "Pending review-call booking"
      },
      {
        label: "Advance verified",
        done: advanceVerified,
        note: advanceVerified ? `${formatMoney(activeVerification!.amountInr)} verified` : "Waiting on independently verified receipt"
      },
      { label: "Case opened", done: Boolean(activeCase), note: activeCase ? activeCase.caseNumber : "Case is still locked" },
      { label: "Verdict ready", done: Boolean(canRelease), note: canRelease ? "Ready for final release" : "Balance or approvals still pending" }
    ],
    [activeBooking, activeCase, activeProposal, activeVerification, advanceVerified, canRelease, commercialStatus]
  );

  const blockers = [
    !activeProposal ? "Create the proposal first." : null,
    activeProposal && activeProposal.status !== "APPROVED" ? "The proposal still needs Super-Admin approval." : null,
    activeProposal && !activeBooking ? "Book the review call before collecting the advance." : null,
    activeProposal && !advanceVerified ? "Upload and independently verify the scoped advance receipt to open the case." : null,
    activeProposal && !caseGateOpen ? "Advance exists, but it does not yet clear the minimum gate." : null,
    activeCase && !balancePayment ? "Balance payment is not recorded yet." : null,
    activeCase && !canPrepareFinalReport ? "Balance approval still blocks the final report." : null,
    activeReport && !activeReport.isPreview && approvalCount < 2 ? "Two report approvals are still required." : null,
    activeReport && !activeReport.isPreview && !verdictReadyByState ? "Verdict release is still blocked by payment or approval gates." : null
  ].filter(Boolean) as string[];

  const nextAction = (() => {
    if (!activeProposal) return "Create the proposal for this client.";
    if (activeProposal.status !== "APPROVED") return "Get the proposal approved by a Super-Admin.";
    if (!activeBooking) return "Book the review call and send the meeting link.";
    if (!advanceVerified) return "Upload the advance receipt, then have a different administrator verify it.";
    if (!activeCase) return "Open the case now that the advance rule is satisfied.";
    if (!balancePayment) return "Collect and verify the balance payment.";
    if (!canPrepareFinalReport) return "Finish balance approval to unlock the final report.";
    if (!activeReport || activeReport.isPreview) return "Prepare the final report.";
    if (approvalCount < 2) return "Collect the remaining report approvals.";
    if (!verdictReadyByState) return "Clear the remaining release blockers.";
    return "All gates are clear. The verdict can now be released.";
  })();

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const nextState = await fetchState();
      setLiveState(nextState);
      setSelectedClientId((current) => preferredClientId ?? current ?? nextState.clients[0]?.id ?? "");
      setMessage("Commercial state refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadProof(kind: "advance" | "balance", file: File | null) {
    if (!file) {
      return;
    }

    if (!activeClient || (kind === "advance" && !activeProposal) || (kind === "balance" && !activeCase)) {
      setMessage("Choose the client and matching proposal or active case first.");
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareImageUpload(file);
      const formData = new FormData();
      formData.append("key", kind === "advance" ? "advance-proof" : "balance-proof");
      formData.append("file", prepared.file);
      formData.append("clientId", activeClient.id);
      if (kind === "advance" && activeProposal) formData.append("proposalId", activeProposal.id);
      if (kind === "balance" && activeCase) formData.append("caseId", activeCase.id);
      const response = await fetch("/api/payment-proofs", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error ?? "Upload failed");
      }
      if (kind === "advance") {
        setProofId(result.proof.id);
        setProofFileName(result.proof.fileName);
        setProofUrl(result.proof.url);
        setMessage(prepared.compressed ? "Advance proof screenshot uploaded after trimming the file." : "Advance proof screenshot uploaded.");
      } else {
        setBalanceProofId(result.proof.id);
        setBalanceProofFileName(result.proof.fileName);
        setBalanceProofUrl(result.proof.url);
        setMessage(prepared.compressed ? "Balance proof screenshot uploaded after trimming the file." : "Balance proof screenshot uploaded.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, successMessage: string) {
    if (!activeClient) {
      return;
    }

    setBusy(true);
    try {
      await postAction({ ...action, clientId: activeClient.id }, activeUser.role);
      await refresh(activeClient.id);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadScopedProofs() {
      if (!activeClient || (!activeProposal && !activeCase)) {
        setProofId(""); setProofUrl(""); setProofFileName("");
        setBalanceProofId(""); setBalanceProofUrl(""); setBalanceProofFileName("");
        return;
      }
      const query = new URLSearchParams({ clientId: activeClient.id });
      if (activeProposal) query.set("proposalId", activeProposal.id);
      if (activeCase) query.set("caseId", activeCase.id);
      try {
        const response = await fetch(`/api/payment-proofs?${query.toString()}`, { cache: "no-store" });
        const result = await response.json() as { assets?: PaymentProofRecord[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Payment receipts could not be loaded.");
        if (cancelled) return;
        const advanceProof = result.assets?.find((asset) => asset.key === "advance-proof");
        const balanceProof = result.assets?.find((asset) => asset.key === "balance-proof");
        setProofId(advanceProof?.id ?? ""); setProofUrl(advanceProof?.url ?? ""); setProofFileName(advanceProof?.fileName ?? "");
        setBalanceProofId(balanceProof?.id ?? ""); setBalanceProofUrl(balanceProof?.url ?? ""); setBalanceProofFileName(balanceProof?.fileName ?? "");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Payment receipts could not be loaded.");
      }
    }
    loadScopedProofs().catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeClient?.id, activeProposal?.id, activeCase?.id]);

  return (
    <section className="section-grid" style={{ marginTop: 22 }}>
      <div className="card span-8">
        <div className="eyebrow">Commercial workflow</div>
        <h2>₹51,000 proposal and ₹11,000 advance gate</h2>
        <p className="subtle">
          This panel now handles the real commercial chain: proposal approval, call booking, proof verification, case opening, balance clearance, and the final release gate.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{activeProposal ? formatMoney(activeProposal.amountInr) : "—"}</span>
            <span className="stat-label">proposal amount</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{activeBooking ? activeBooking.status : "Pending"}</span>
            <span className="stat-label">review call state</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{caseGateOpen ? "Open" : "Held"}</span>
            <span className="stat-label">case opening gate</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{verdictReadyByState ? "Ready" : "Blocked"}</span>
            <span className="stat-label">verdict release gate</span>
          </div>
        </div>
        <div className="stepper" style={{ marginTop: 16 }}>
          {journeySteps.map((step, index) => (
            <div key={step.label} className={`stepper-item ${step.done ? "done" : ""}`}>
              <div className={`stepper-dot ${step.done ? "done" : ""}`}>{index + 1}</div>
              <div className="stepper-copy">
                <strong>{step.label}</strong>
                <div className="meta">{step.note}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="field">
              <label>Client</label>
              <select value={selectedClientId} onChange={(event) => {
                setSelectedClientId(event.target.value);
                setProofId(""); setProofUrl(""); setProofFileName("");
                setBalanceProofId(""); setBalanceProofUrl(""); setBalanceProofFileName("");
              }}>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="list" style={{ marginTop: 14 }}>
              <div className="list-item">
                <strong>Proposal</strong>
                <span className="meta">{commercialStatus}</span>
              </div>
              <div className="list-item">
                <strong>Current approval state</strong>
                <span className="meta">{approval?.commercialApproved ? "Approved" : "Pending"}</span>
              </div>
              <div className="list-item">
                <strong>Advance gate</strong>
                <span className="meta">{approval?.advanceApproved ? "Open" : "Closed"}</span>
              </div>
              <div className="list-item">
                <strong>Advance payment</strong>
                <span className="meta">{advancePayment ? `${advancePayment.status} · ${formatMoney(advancePayment.amountInr)}` : "No advance recorded"}</span>
              </div>
              <div className="list-item">
                <strong>Balance payment</strong>
                <span className="meta">{balancePayment ? `${balancePayment.status} · ${formatMoney(balancePayment.amountInr)}` : "No balance recorded"}</span>
              </div>
              <div className="list-item">
                <strong>Verdict gate</strong>
                <span className="meta">{verdictReadyByState ? "Unlocked" : "Blocked"}</span>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Next commercial move</strong>
                <div className="meta">{activeClient?.displayName ?? "No client selected"}</div>
              </div>
              <span className={`tag ${blockers.length ? "warn" : "good"}`}>{blockers.length ? "Action needed" : "Clear"}</span>
            </div>
            <div className="footer-note" style={{ marginTop: 12 }}>
              {nextAction}
            </div>
            <div className="pill-row" style={{ marginTop: 12 }}>
              <span className={`tag ${approval?.commercialApproved ? "good" : "warn"}`}>Proposal {approval?.commercialApproved ? "approved" : "pending"}</span>
              <span className={`tag ${approval?.advanceApproved ? "good" : "bad"}`}>Advance {approval?.advanceApproved ? "open" : "closed"}</span>
              <span className={`tag ${activeBooking ? "good" : "bad"}`}>Call {activeBooking ? "booked" : "pending"}</span>
              <span className={`tag ${activeVerification ? "good" : "bad"}`}>Proof {activeVerification ? "verified" : "pending"}</span>
            </div>
            <div className="workflow" style={{ marginTop: 14 }}>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => refresh(activeClient?.id)}>
                Refresh state
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeClient}
                onClick={() => run({ action: "proposal-create", amountInr: DEFAULT_PROPOSAL_AMOUNT_INR }, "Proposal drafted")}
              >
                Create proposal
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeProposal || activeUser.role !== "SUPER_ADMIN" || activeProposal.status === "APPROVED"}
                onClick={() => run({ action: "proposal-approve", proposalId: activeProposal?.id }, "Proposal approved by Super-Admin")}
              >
                Approve proposal
              </button>
            </div>
            <div className="workflow" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeProposal}
                onClick={() => run({ action: "advance-pay", proposalId: activeProposal?.id, amountInr: MIN_ADVANCE_INR }, "Advance payment approved")}
              >
                Approve advance
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeCase}
                onClick={() => run({ action: "balance-pay", caseId: activeCase?.id, amountInr: 40000 }, "Balance payment approved")}
              >
                Approve balance
              </button>
            </div>
            <div className="workflow" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeProposal || !caseGateOpen || Boolean(activeCase)}
                onClick={() => run({ action: "case-create", clientId: activeClient?.id, proposalId: activeProposal?.id }, "Case created")}
              >
                Create case
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeCase}
                onClick={() => run({ action: "preview-report", caseId: activeCase?.id }, "Preview report generated")}
              >
                Generate preview
              </button>
            </div>
            <div className="workflow" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeCase || !canPrepareFinalReport}
                onClick={() => run({ action: "final-report-prepare", caseId: activeCase?.id }, "Final report prepared")}
              >
                Prepare final report
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={busy || !activeReport || activeReport.isPreview || !canApproveReport(activeUser)}
                onClick={() => run({ action: "report-approve", reportId: activeReport?.id }, "Report approved")}
              >
                Approve report
              </button>
              <button
                type="button"
                className="button"
                disabled={busy || !activeReport || activeReport.isPreview || !verdictReadyByState || !canReleaseVerdict(activeUser)}
                onClick={() => run({ action: "verdict-release", reportId: activeReport?.id }, "Verdict released")}
              >
                Release verdict
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Review call and proof flow</div>
        <h2>Booking and verification</h2>
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <strong>Review call booking</strong>
              <div className="meta">Blocks the calendar and prepares the meeting link.</div>
            </div>
            <span className={`tag ${activeBooking ? "good" : "warn"}`}>{activeBooking ? "Booked" : "Pending"}</span>
          </div>
          <div className="two-col" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Meeting provider</label>
              <select value={meetingProvider} onChange={(event) => setMeetingProvider(event.target.value as ReviewCallBookingRecord["provider"])}>
                <option value="GOOGLE_MEET">Google Meet</option>
                <option value="ZOOM">Zoom</option>
              </select>
            </div>
            <div className="field">
              <label>Scheduled time</label>
              <input type="datetime-local" value={meetingTime} onChange={(event) => setMeetingTime(event.target.value)} />
            </div>
          </div>
          <div className="pill-row" style={{ marginTop: 8 }}>
            <span className={`tag ${activeBooking ? "good" : "bad"}`}>{activeBooking ? "Calendar blocked" : "Not yet booked"}</span>
            <span className="pill">Status {activeBooking?.status ?? "Not booked"}</span>
            <span className="pill">{activeBooking?.meetingLink ?? "Meeting link will be generated on booking"}</span>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Call outcome note</label>
            <textarea value={reviewOutcomeNote} onChange={(event) => setReviewOutcomeNote(event.target.value)} />
          </div>
          <div className="workflow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !activeProposal}
              onClick={() =>
                run(
                  {
                    action: "review-call-book",
                    proposalId: activeProposal?.id,
                    provider: meetingProvider,
                    scheduledAt: new Date(meetingTime).toISOString(),
                    durationMinutes: 30
                  },
                  "Review call booked and meeting link generated"
                )
              }
            >
              Book review call
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !activeBooking}
              onClick={() =>
                run(
                  {
                    action: "review-call-complete",
                    bookingId: activeBooking?.id,
                    outcome: "COMPLETED",
                    note: reviewOutcomeNote
                  },
                  "Review call marked completed"
                )
              }
            >
              Mark completed
            </button>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <strong>Advance proof verification</strong>
              <div className="meta">Upload the reference screenshot, verify the amount, and open the case automatically.</div>
            </div>
            <span className={`tag ${activeVerification ? "good" : "warn"}`}>{activeVerification ? activeVerification.status : "Pending"}</span>
          </div>
          <div className="two-col" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Advance amount</label>
              <input type="number" min={MIN_ADVANCE_INR} value={proofAmount} onChange={(event) => setProofAmount(Number(event.target.value))} />
            </div>
            <div className="field">
              <label>Reference screenshot</label>
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busy} onChange={(event) => uploadProof("advance", event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="pill-row" style={{ marginTop: 8 }}>
            <span className="pill">File {proofFileName || activeVerification?.referenceScreenshotFileName || "not uploaded"}</span>
            <span className="pill">Proof {proofUrl || activeVerification?.referenceScreenshotUrl ? "ready" : "waiting"}</span>
            <span className="pill">Case {activeCase ? activeCase.caseNumber : "will open after verification"}</span>
          </div>
          <div className="workflow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="button"
              disabled={busy || !canVerifyPayments(activeUser) || !activeProposal || !(proofId || activeVerification?.proofAssetId)}
              onClick={() =>
                run(
                  {
                    action: "advance-proof-verify",
                    proposalId: activeProposal?.id,
                    amountInr: proofAmount,
                    proofId: proofId || activeVerification?.proofAssetId
                  },
                  "Advance verified and case opened"
                )
              }
            >
              Verify advance and open case
            </button>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <strong>Balance proof verification</strong>
              <div className="meta">Upload the balance screenshot, verify the amount, and unlock the final report flow.</div>
            </div>
            <span className={`tag ${balancePayment?.verifiedAt ? "good" : "warn"}`}>{balancePayment?.verifiedAt ? "Verified" : "Pending"}</span>
          </div>
          <div className="two-col" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Balance amount</label>
              <input type="number" min={1} value={balanceProofAmount} onChange={(event) => setBalanceProofAmount(Number(event.target.value))} />
            </div>
            <div className="field">
              <label>Reference screenshot</label>
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busy} onChange={(event) => uploadProof("balance", event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="pill-row" style={{ marginTop: 8 }}>
            <span className="pill">File {balanceProofFileName || balancePayment?.referenceScreenshotFileName || "not uploaded"}</span>
            <span className="pill">Proof {balanceProofUrl || balancePayment?.referenceScreenshotUrl ? "ready" : "waiting"}</span>
            <span className="pill">Final report {canPrepareFinalReport ? "unlocked" : "locked"}</span>
          </div>
          <div className="workflow" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="button"
              disabled={busy || !canVerifyPayments(activeUser) || !activeCase || !(balanceProofId || balancePayment?.proofAssetId)}
              onClick={() =>
                run(
                  {
                    action: "balance-proof-verify",
                    caseId: activeCase?.id,
                    amountInr: balanceProofAmount,
                    proofId: balanceProofId || balancePayment?.proofAssetId
                  },
                  "Balance verified and final report flow unlocked"
                )
              }
            >
              Verify balance proof
            </button>
          </div>
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Commercial rules</div>
        <h2>Approval gates at a glance</h2>
        <div className="panel" style={{ marginTop: 14, background: "rgba(255,255,255,0.88)" }}>
          <strong>Current posture</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {activeProposal ? commercialStatus : "Pick a client to inspect the commercial flow."}
          </div>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Default proposal</strong>
            <span className="meta">{formatMoney(DEFAULT_PROPOSAL_AMOUNT_INR)}</span>
          </div>
          <div className="list-item">
            <strong>Minimum advance</strong>
            <span className="meta">{formatMoney(MIN_ADVANCE_INR)}</span>
          </div>
          <div className="list-item">
            <strong>Super-Admin approval</strong>
            <span className="meta">Required for proposal approval</span>
          </div>
          <div className="list-item">
            <strong>Verdict release</strong>
            <span className="meta">Requires balance approval and two report approvals</span>
          </div>
          <div className="list-item">
            <strong>Review call booking</strong>
            <span className="meta">Calendar hold and meeting link before the advance step</span>
          </div>
          <div className="list-item">
            <strong>Advance proof</strong>
            <span className="meta">Requires screenshot upload before case opens</span>
          </div>
          <div className="list-item">
            <strong>Balance proof</strong>
            <span className="meta">Use screenshot verification to unlock the final report flow</span>
          </div>
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <strong>Current blockers</strong>
              <div className="meta">What still needs attention for this client</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {blockers.length ? (
              blockers.map((blocker) => (
                <div key={blocker} className="list-item">
                  <strong>Pending</strong>
                  <span className="meta">{blocker}</span>
                </div>
              ))
            ) : (
              <div className="list-item">
                <strong>No blockers</strong>
                <span className="meta">This client is commercially clear through verdict release.</span>
              </div>
            )}
          </div>
        </div>
        <div className="footer-note" style={{ marginTop: 12 }}>
          {message}
        </div>
      </div>
    </section>
  );
}
