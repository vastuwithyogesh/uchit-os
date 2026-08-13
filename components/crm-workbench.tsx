"use client";

import { useMemo, useState } from "react";
import {
  ClientRecord,
  CommercialPolicy,
  CommercialProposalRecord,
  FloorWorkspaceRecord,
  LeadQualificationRecord,
  PaymentRecord,
  ReportVersionRecord,
  UserRole,
  UtilityRule,
  VastuCaseRecord,
  WhatsAppTemplateRecord
} from "@/lib/domain";
import { useSession } from "@/components/session-provider";
import { getActiveCaseForClient } from "@/lib/service-framework";
import {
  approvalSummary,
  buildPermanentTimeline,
  canReleaseOfficialVerdict,
  describeApprovalPath,
  formatMoney,
  generateUtilityEvaluation,
  lockWorkspace,
  qualifyLead,
  rankShakti
} from "@/lib/workflows";
import { formatTimeStamp } from "@/lib/format";
import { buildActionHeaders } from "@/lib/request-helpers";

interface CrmWorkbenchProps {
  commercialPolicy: CommercialPolicy;
  clients: ClientRecord[];
  leads: LeadQualificationRecord[];
  proposals: CommercialProposalRecord[];
  payments: PaymentRecord[];
  cases: VastuCaseRecord[];
  floors: FloorWorkspaceRecord[];
  reports: ReportVersionRecord[];
  utilityRules: UtilityRule[];
  templates: WhatsAppTemplateRecord[];
  timeline: Array<{
    id: string;
    clientId: string;
    category: string;
    headline: string;
    details: string;
    happenedAt: string;
  }>;
}

export function CrmWorkbench(props: CrmWorkbenchProps) {
  const { clients, leads, proposals, payments, cases, floors, reports, utilityRules, templates, timeline, commercialPolicy } = props;
  const { activeUser, availableUsers, isLocalDemo } = useSession();
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [selectedRole, setSelectedRole] = useState<UserRole>("SUPER_ADMIN");
  const [conversationStep, setConversationStep] = useState(0);
  const [intakeQuestionIndex, setIntakeQuestionIndex] = useState(0);
  const [intakeAnswers, setIntakeAnswers] = useState([
    "Owned apartment",
    "3BHK",
    "Bedroom placement and mirror energies",
    "Yes, today"
  ]);
  const [intakeScore, setIntakeScore] = useState(86);
  const [intakeNotes, setIntakeNotes] = useState("Ready for a full vastu walkthrough.");
  const [intakeCallCompleted, setIntakeCallCompleted] = useState(true);
  const [intakeMessage, setIntakeMessage] = useState("Submit a new lead to write it into the live action layer.");
  const [workflowMessage, setWorkflowMessage] = useState("Use the commercial gate actions to move the case forward.");
  const [busy, setBusy] = useState(false);
  const [manualInputs, setManualInputs] = useState<number[]>([9, 8, 8, 7, 6, 9, 8, 7, 6, 7, 8, 9, 8, 7, 6, 8]);
  const actorRole = isLocalDemo ? selectedRole : activeUser.role;
  const actingUser = isLocalDemo ? availableUsers.find((user) => user.role === selectedRole) ?? activeUser : activeUser;

  const activeClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const activeLead = leads.find((lead) => lead.clientId === activeClient?.id) ?? leads[0];
  const activeProposal = proposals.find((proposal) => proposal.clientId === activeClient?.id);
  const activeCase = activeClient ? getActiveCaseForClient({ vastuCases: cases }, activeClient.id) : cases[0];
  const activeFloor = floors.find((item) => item.caseId === activeCase?.id) ?? floors[0];
  const activeReport = reports.find((item) => item.caseId === activeCase?.id) ?? reports[0];
  const activePayments = payments.filter((payment) => payment.clientId === activeClient?.id);
  const clientPhoneDigits = (activeClient?.phone ?? "").replace(/\D/g, "");
  const clientEmail = activeClient?.email ?? "";
  const commercialStatus = useMemo(() => {
    if (!activeProposal) {
      return "No proposal is loaded for this client yet.";
    }
    return `${activeProposal.status} · ${formatMoney(activeProposal.amountInr)} · reference advance ${formatMoney(activeProposal.minAdvanceInr)}`;
  }, [activeProposal]);

  const utilityMatrix = useMemo(
    () => generateUtilityEvaluation(utilityRules, utilityRules.map((rule) => ({ zoneCode: rule.zoneCode }))),
    [utilityRules]
  );
  const shakti = useMemo(() => rankShakti(manualInputs), [manualInputs]);
  const leadQualification = activeLead ? qualifyLead(activeLead) : null;
  const approval = activeCase && activeProposal ? approvalSummary(activeCase, activeProposal, activePayments) : null;
  const readyForVerdict = activeCase && activeReport && canReleaseOfficialVerdict(activeCase, activePayments.find((payment) => payment.type === "BALANCE"));
  const lockedFloor = activeFloor ? lockWorkspace(activeFloor) : null;
  const clientTimeline = buildPermanentTimeline(timeline, activeClient?.id);
  const bookingEvent = clientTimeline.find((event) => event.category === "Booking");
  const outreachTimeline = clientTimeline.filter((event) => event.category === "Outreach");
  const permanentTimeline = clientTimeline.filter((event) => event.category !== "Outreach");
  const clientJourney = useMemo(
    () => [
      {
        label: "Lead quality",
        value: leadQualification?.scoreBand ?? "new",
        note: leadQualification ? `${leadQualification.completedInMinutes ?? 0} min qualification call` : "No qualification yet"
      },
      {
        label: "Review call",
        value: bookingEvent ? "booked" : "pending",
        note: bookingEvent ? `${bookingEvent.category} · ${formatTimeStamp(bookingEvent.happenedAt)}` : "Calendar not held yet"
      },
      {
        label: "Commercial",
        value: approval?.commercialApproved ? "approved" : "pending",
        note: activeProposal ? commercialStatus : "Awaiting proposal"
      },
      {
        label: "Advance",
        value: approval?.advanceApproved ? "approved" : "pending",
        note: approval?.advanceApproved ? "Advance gate open" : "Waiting on payment proof"
      },
      {
        label: "Verdict",
        value: readyForVerdict ? "ready" : "blocked",
        note: readyForVerdict ? "All release gates cleared" : "Still held by balance/report approvals"
      }
    ],
    [approval?.advanceApproved, approval?.commercialApproved, activeProposal, bookingEvent, commercialStatus, leadQualification, readyForVerdict]
  );
  const outreachSteps = [
    {
      key: "vsl",
      title: "1) VSL + review call",
      description: "Use this to move the lead to uchitvastu.com/join and book the review call.",
      subject: "Book your Uchit Vastu review call",
      emailBody: `Hi ${activeClient?.displayName ?? "there"},\n\nHere is the link to join our VSL and book your review call:\nhttps://uchitvastu.com/join\n\nIf you want, reply here and we’ll help you get it scheduled.`,
      whatsappBody: `Hi ${activeClient?.displayName ?? "there"}, here is the link to join our VSL and book your review call: https://uchitvastu.com/join`
    },
    {
      key: "questionnaire",
      title: "2) Questionnaire + Prakriti chart",
      description: "Use this as the qualification step to understand intent.",
      subject: "Questionnaire and Prakriti chart",
      emailBody: `Hi ${activeClient?.displayName ?? "there"},\n\nPlease complete the questionnaire and Prakriti chart so we can understand your intent and prepare the right guidance.\n\nOnce done, we’ll review it right away.`,
      whatsappBody: `Hi ${activeClient?.displayName ?? "there"}, please complete the questionnaire and Prakriti chart so we can understand your intent and prepare the right guidance.`
    },
    {
      key: "deliverable",
      title: "3) Deliverable of service",
      description: "Send the brochure, commitment of service, and quotation together.",
      subject: "Deliverable of service and quotation",
      emailBody: `Hi ${activeClient?.displayName ?? "there"},\n\nSharing the deliverable of service, brochure, commitment of service, and quotation for your review.\n\nHappy to walk you through it point by point.`,
      whatsappBody: `Hi ${activeClient?.displayName ?? "there"}, sharing the deliverable of service, brochure, commitment of service, and quotation for your review.`
    },
    {
      key: "payment",
      title: "4) Payment link/details",
      description: "Use this for the payment handoff step.",
      subject: "Payment link and details",
      emailBody: `Hi ${activeClient?.displayName ?? "there"},\n\nHere are the payment link/details for the next step.\n\nIf needed, we can also confirm the amount and due date on call.`,
      whatsappBody: `Hi ${activeClient?.displayName ?? "there"}, here are the payment link/details for the next step.`
    }
  ] as const;

  const outreachProgress = useMemo(
    () =>
      outreachSteps.map((step) => ({
        ...step,
        emailSent: outreachTimeline.some((event) => event.details.includes(`step=${step.key}`) && event.details.includes("channel=email")),
        whatsappSent: outreachTimeline.some((event) => event.details.includes(`step=${step.key}`) && event.details.includes("channel=whatsapp"))
      })),
    [outreachSteps, outreachTimeline]
  );

  const nextRecommendedStep = useMemo(() => {
    const firstPending = outreachProgress.find((step) => !step.emailSent || !step.whatsappSent);
    if (firstPending) {
      if (!firstPending.emailSent) {
        return `${firstPending.title} — send the email draft first.`;
      }
      return `${firstPending.title} — send the WhatsApp follow-up.`;
    }

    if (!activeProposal) {
      return "All outreach is done. Move to proposal creation.";
    }
    if (!approval?.commercialApproved) {
      return "Outreach is complete. Await commercial approval.";
    }
    if (!bookingEvent) {
      return "Commercial approval is done. Book the review call and block the calendar.";
    }
    if (!approval?.advanceApproved) {
      return "Commercial approval is done. Send advance payment details.";
    }
    if (!activeCase) {
      return "Advance is approved. Create the case now.";
    }
    if (!activeReport || activeReport.isPreview) {
      return "Case is live. Generate the official report flow once the balance is approved.";
    }
    if (!canReleaseOfficialVerdict(activeCase, activePayments.find((payment) => payment.type === "BALANCE"))) {
      return "Report is moving. Approve the balance to unlock verdict release.";
    }
    return "Verdict is ready to release or already released.";
  }, [activeCase, activePayments, activeProposal, activeReport, approval?.advanceApproved, approval?.commercialApproved, bookingEvent, outreachProgress]);

  function openDraft(channel: "email" | "whatsapp", step: (typeof outreachSteps)[number]) {
    if (!activeClient) {
      return;
    }

    const draftText =
      channel === "email"
        ? `Subject: ${step.subject}\nTo: ${clientEmail || "n/a"}\n\n${step.emailBody}`
        : `To: ${clientPhoneDigits || "n/a"}\n\n${step.whatsappBody}`;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(draftText).catch(() => undefined);
    }

    setWorkflowMessage(`${channel === "email" ? "Email" : "WhatsApp"} draft prepared for ${step.title}.`);
  }

  function sendOutreach(channel: "email" | "whatsapp", step: (typeof outreachSteps)[number]) {
    if (!activeClient) {
      return;
    }

    openDraft(channel, step);
    void runWorkflowAction(
      {
        action: "client-outreach-send",
        stepKey: step.key,
        channel,
        title: step.title
      },
      `${channel === "email" ? "Email" : "WhatsApp"} logged for ${step.title}.`
    );
  }

  const intakeQuestions = [
    { label: "Property type", options: ["Owned apartment", "Independent home", "Rented apartment"] },
    { label: "Home size", options: ["2BHK", "3BHK", "4BHK+"] },
    { label: "Primary concern", options: ["Main door alignment", "Kitchen and utilities", "Bedroom placement"] },
    { label: "Call readiness", options: ["Yes, today", "Within 2-3 days", "Just exploring"] }
  ] as const;

  const conversation = activeLead?.conversationalForm ?? [];
  const currentPrompt = conversation[conversationStep] ?? conversation[conversation.length - 1];
  const currentQuestion = intakeQuestions[intakeQuestionIndex];
  const projectedScore = useMemo(() => {
    const scoreMap: Record<string, number> = {
      "Owned apartment": 24,
      "Independent home": 28,
      "Rented apartment": 18,
      "2BHK": 12,
      "3BHK": 22,
      "4BHK+": 28,
      "Main door alignment": 24,
      "Kitchen and utilities": 22,
      "Bedroom placement": 18,
      "Yes, today": 24,
      "Within 2-3 days": 15,
      "Just exploring": 8
    };

    return Math.min(100, intakeAnswers.reduce((total, answer) => total + (scoreMap[answer] ?? 10), 0));
  }, [intakeAnswers]);

  async function submitLead() {
    if (!activeClient) {
      return;
    }

    setBusy(true);
    setIntakeMessage("Writing lead into the workflow engine...");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: buildActionHeaders(isLocalDemo ? selectedRole : undefined),
        body: JSON.stringify({
          action: "lead",
          actorRole: isLocalDemo ? selectedRole : undefined,
          clientId: activeClient.id,
          score: intakeScore,
          notes: intakeNotes,
          conversationalForm: intakeQuestions.map((question, index) => ({
            label: question.label,
            answer: intakeAnswers[index] ?? ""
          })),
          qualificationCallCompletedAt: intakeCallCompleted ? new Date().toISOString() : undefined
        })
      });

      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error ?? "Lead submission failed");
      }

      setIntakeMessage(`Lead saved for ${activeClient.displayName}. Refreshing the live view now.`);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflowAction(action: Record<string, unknown>, successMessage: string) {
    if (!activeClient) {
      return;
    }

    setBusy(true);
    setWorkflowMessage("Sending action...");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: buildActionHeaders(isLocalDemo ? selectedRole : undefined),
        body: JSON.stringify({
          ...action,
          clientId: activeClient.id,
          actorRole: isLocalDemo ? selectedRole : undefined
        })
      });

      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error ?? "Action failed");
      }

      setWorkflowMessage(successMessage);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-grid">
      <section className="card span-12">
        <div className="eyebrow">Client cockpit</div>
        <h2>Selected client at a glance</h2>
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{activeClient?.displayName}</strong>
                <div className="meta">
                  {activeClient?.city} · {activeClient?.source}
                </div>
              </div>
              <span className={`tag ${leadQualification?.callSlaMet ? "good" : "warn"}`}>{leadQualification?.scoreBand ?? "new"}</span>
            </div>
            <div className="pill-row" style={{ marginTop: 12 }}>
              <span className="pill">Email {activeClient?.email || "n/a"}</span>
              <span className="pill">Phone {activeClient?.phone || "n/a"}</span>
              <span className="pill">Lead score {activeLead?.score ?? "n/a"}</span>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Journey pulse</strong>
                <div className="meta">Five checkpoints that tell us where this client stands right now.</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {clientJourney.map((item) => (
                <div key={item.label} className="list-item">
                  <div className="panel-head">
                    <div>
                      <strong>{item.label}</strong>
                      <div className="meta">{item.note}</div>
                    </div>
                    <span className={`tag ${item.value === "approved" || item.value === "booked" || item.value === "ready" || item.value === "hot" || item.value === "warm" ? "good" : item.value === "pending" || item.value === "blocked" ? "warn" : "neutral"}`}>{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card span-8">
        <div className="eyebrow">ScoreApp-style intake</div>
        <h2>Conversational lead qualification</h2>
        <p className="subtle">
          The setter can move through a structured conversation, keep the {commercialPolicy.qualificationCallTargetMinutes}-minute qualification call honest, and trigger the first deliverable as soon as the lead crosses the acceptance bar.
        </p>
        <div className="two-col" style={{ marginTop: 18 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{activeClient?.displayName}</strong>
                <div className="meta">{activeClient?.city} · {activeClient?.source}</div>
              </div>
              <span className={`tag ${leadQualification?.callSlaMet ? "good" : "warn"}`}>{leadQualification?.scoreBand ?? "warm"} lead</span>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="field">
                <label>Client</label>
                <select value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Question {intakeQuestionIndex + 1} of {intakeQuestions.length}</label>
                <select
                  value={intakeAnswers[intakeQuestionIndex]}
                  onChange={(event) =>
                    setIntakeAnswers((previous) => previous.map((answer, index) => (index === intakeQuestionIndex ? event.target.value : answer)))
                  }
                >
                  {currentQuestion.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Current prompt</label>
                <textarea value={`${currentQuestion.label}\n${intakeAnswers[intakeQuestionIndex]}`} readOnly />
              </div>
              <div className="field">
                <label>Qualification note</label>
                <textarea value={intakeNotes} onChange={(event) => setIntakeNotes(event.target.value)} />
              </div>
              <div className="field">
                <label>Score preview</label>
                <input type="range" min={0} max={100} value={intakeScore} onChange={(event) => setIntakeScore(Number(event.target.value))} />
              </div>
              <div className="pill-row" style={{ marginTop: 12 }}>
                <span className="pill">Qualification score {intakeScore}</span>
                <span className="pill">Projected score {projectedScore}</span>
                <span className="pill">{commercialPolicy.qualificationCallTargetMinutes}-minute target · {leadQualification?.completedInMinutes ?? 0} min</span>
                <span className="pill">Deliverable {leadQualification?.triggerDeliverable ? "triggered" : "pending"}</span>
              </div>
              <div className="workflow" style={{ marginTop: 12 }}>
                <button type="button" className="button-secondary" onClick={() => setIntakeQuestionIndex((step) => Math.max(0, step - 1))}>
                  Previous question
                </button>
                <button type="button" className="button-secondary" onClick={() => setIntakeQuestionIndex((step) => Math.min(intakeQuestions.length - 1, step + 1))}>
                  Next question
                </button>
                <button type="button" className="button" onClick={() => submitLead().catch((error) => setIntakeMessage(error instanceof Error ? error.message : "Lead submission failed"))}>
                  Submit lead
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="field">
              <label>{isLocalDemo ? "Setter role view" : "Signed-in actor"}</label>
              {isLocalDemo ? (
                <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as UserRole)}>
                  {availableUsers.map((user) => (
                    <option key={user.role} value={user.role}>
                      {user.role}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="panel" style={{ marginTop: 8 }}>
                  <strong>{actingUser.fullName}</strong>
                  <div className="meta">
                    {actingUser.role} · {actingUser.email}
                  </div>
                </div>
              )}
            </div>
            <p className="subtle" style={{ marginTop: 12 }}>
              {describeApprovalPath({
                id: actingUser.id,
                fullName: actingUser.fullName,
                email: actingUser.email,
                role: actorRole,
                color: actingUser.color
              })}
            </p>
            <div className="workflow" style={{ marginTop: 12 }}>
              <button type="button" className="button-secondary" onClick={() => setConversationStep((step) => Math.max(0, step - 1))}>
                Previous prompt
              </button>
              <button type="button" className="button" onClick={() => setConversationStep((step) => Math.min(conversation.length - 1, step + 1))}>
                Advance prompt
              </button>
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
              <input type="checkbox" checked={intakeCallCompleted} onChange={(event) => setIntakeCallCompleted(event.target.checked)} />
              {commercialPolicy.qualificationCallTargetMinutes}-minute qualification call completed
            </label>
            <div className="pill-row" style={{ marginTop: 14 }}>
              <span className="pill">Conversation step {conversationStep + 1}</span>
              <span className="pill">Call {intakeCallCompleted ? "completed" : "pending"}</span>
            </div>
            <div className="panel" style={{ marginTop: 14 }}>
              <strong>Live prompt</strong>
              <div className="meta">{currentPrompt?.label ?? "Lead question"}</div>
              <p className="subtle" style={{ marginTop: 8 }}>
                {currentPrompt?.answer ?? "Waiting for input."}
              </p>
            </div>
            <div className="footer-note">{intakeMessage}</div>
          </div>
        </div>
      </section>

      <section className="card span-4">
        <div className="eyebrow">Commercial gate</div>
        <h3>₹51,000 default package</h3>
        <div className="list">
          <div className="list-item">
            <strong>Suggested reference advance</strong>
            <span className="meta">{formatMoney(activeProposal?.minAdvanceInr ?? commercialPolicy.minimumAdvanceInr)}</span>
          </div>
          <div className="list-item">
            <strong>Proposal amount</strong>
            <span className="meta">{formatMoney(activeProposal?.amountInr ?? commercialPolicy.defaultProposalAmountInr)}</span>
          </div>
          <div className="list-item">
            <strong>Commercial approval</strong>
            <span className={`tag ${actorRole === "SUPER_ADMIN" ? "good" : "warn"}`}>{actorRole === "SUPER_ADMIN" ? "Allowed" : "Blocked"}</span>
          </div>
        </div>
      </section>

      <section className="card span-6">
        <div className="eyebrow">Approval chain</div>
        <h3>Payments, case creation, and verdict release</h3>
        <div className="workflow">
          <div className="workflow-step">
            <div className="workflow-index">1</div>
            <div>
              <strong>Advance payment gate</strong>
              <div className="meta">{activePayments.find((payment) => payment.type === "ADVANCE") ? "Advance is approved and case creation can proceed." : "Advance still needs approval."}</div>
            </div>
            <span className={`tag ${approval?.advanceApproved ? "good" : "bad"}`}>{approval?.advanceApproved ? "Open" : "Closed"}</span>
          </div>
          <div className="workflow-step">
            <div className="workflow-index">2</div>
            <div>
              <strong>Case creation</strong>
              <div className="meta">
                {activeCase?.caseNumber ? `${activeCase.caseNumber} · ${activeCase.status}` : "Case not opened yet"}
              </div>
            </div>
            <span className={`tag ${activeCase?.status === "VERDICT_RELEASED" ? "good" : "neutral"}`}>{activeCase?.orientationLocked ? "Locked" : "Draft"}</span>
          </div>
          <div className="workflow-step">
            <div className="workflow-index">3</div>
            <div>
              <strong>Verdict release</strong>
              <div className="meta">{readyForVerdict ? "Balance approved and two-person review completed." : "Waiting on balance or report approvals."}</div>
            </div>
            <span className={`tag ${readyForVerdict ? "good" : "warn"}`}>{readyForVerdict ? "Unlocked" : "Blocked"}</span>
          </div>
        </div>
        <p className="footer-note">The Super-Admin remains the only person who can approve the commercial proposal. The final verdict only opens after balance approval plus two report approvals.</p>
      </section>

      <section className="card span-6">
        <div className="eyebrow">Workspace control</div>
        <h3>Orientation lock and regeneration flag</h3>
        <div className="panel-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>{activeFloor?.floorLabel}</strong>
                <div className="meta">{activeFloor?.status}</div>
              </div>
              <span className={`tag ${lockedFloor?.locked ? "good" : "warn"}`}>{lockedFloor?.locked ? "Locked" : "Mutable"}</span>
            </div>
            <p className="subtle">{lockedFloor?.regenerationReason ?? "No regeneration request yet."}</p>
            <div className="pill-row">
              {(activeFloor?.evidenceUploads ?? []).map((item) => (
                <span key={item} className="pill">{item}</span>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Preview watermark</strong>
                <div className="meta">{activeReport?.versionLabel}</div>
              </div>
              <span className={`tag ${activeReport?.isPreview ? "warn" : "good"}`}>{activeReport?.isPreview ? "Watermarked" : "Official"}</span>
            </div>
            <p className="subtle">{activeReport?.watermarkText ?? "Balance approved preview."}</p>
            <div className="pill-row">
              {(activeReport?.approvals ?? []).map((item) => (
                <span key={item} className="pill">{item}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card span-12">
        <div className="eyebrow">Client outreach</div>
        <h3>One-click send panel</h3>
        <p className="subtle">
          Red means not yet sent. Green means that channel has already been sent and logged.
        </p>
        <div className="panel" style={{ marginTop: 14, background: "rgba(255,255,255,0.9)" }}>
          <strong>Next recommended step</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            {nextRecommendedStep}
          </div>
          <div className="meta" style={{ marginTop: 6 }}>
            {workflowMessage}
          </div>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          {outreachProgress.map((step) => (
            <div key={step.key} className="panel">
              <div className="panel-head">
                <div>
                  <strong>{step.title}</strong>
                  <div className="meta">{step.description}</div>
                </div>
              </div>
              <div className="pill-row" style={{ marginTop: 10 }}>
                <span className={`tag ${step.emailSent ? "good" : "bad"}`}>Email {step.emailSent ? "sent" : "pending"}</span>
                <span className={`tag ${step.whatsappSent ? "good" : "bad"}`}>WhatsApp {step.whatsappSent ? "sent" : "pending"}</span>
              </div>
              <div className="workflow" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={step.emailSent ? "button-success" : "button-danger"}
                  onClick={() => sendOutreach("email", step)}
                >
                  {step.emailSent ? "Email sent" : "Send email"}
                </button>
                <button
                  type="button"
                  className={step.whatsappSent ? "button-success" : "button-danger"}
                  onClick={() => sendOutreach("whatsapp", step)}
                >
                  {step.whatsappSent ? "WhatsApp sent" : "Send WhatsApp"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card span-12">
        <div className="eyebrow">Outreach lane</div>
        <h3>Sent and tracked messages</h3>
        <p className="subtle">
          This lane shows the outreach messages already sent for this client. It stays separate from the general timeline so it’s easy to review.
        </p>
        <div className="timeline" style={{ marginTop: 14 }}>
          {outreachTimeline.length ? (
            outreachTimeline.map((event) => (
              <div key={event.id} className="timeline-item" style={{ borderColor: "rgba(15, 157, 88, 0.3)" }}>
                <header>
                  <div>
                    <strong>{event.headline}</strong>
                    <div className="meta">{formatTimeStamp(event.happenedAt)}</div>
                  </div>
                  <span className="tag good">Sent</span>
                </header>
                <p className="subtle">{event.details}</p>
              </div>
            ))
          ) : (
            <div className="list-item">
              <strong>No outreach sent yet</strong>
              <span className="meta">Use the red buttons above to send the first message for this client.</span>
            </div>
          )}
        </div>
      </section>

      <section className="card span-12">
        <div className="eyebrow">Evaluation engine</div>
        <h3>Utility rules and Shakti ranking</h3>
        <div className="two-col">
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Residential master rule table</strong>
                <div className="meta">GOOD / BAD / OK-OK generated from the CSV-seeded rules.</div>
              </div>
              <span className="tag neutral">{utilityMatrix.length} zones</span>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {utilityMatrix.map((entry) => (
                <div key={entry.zoneCode} className="list-item">
                  <strong>{entry.zoneCode}</strong>
                  <span className="meta">{entry.description}</span>
                  <div className="pill-row">
                    <span className={`tag ${entry.verdict === "GOOD" ? "good" : entry.verdict === "BAD" ? "bad" : "warn"}`}>{entry.verdict}</span>
                    <span className="pill">Confidence {entry.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Shakti engine</strong>
                <div className="meta">16 values, element averages, unique ranking, and plus/minus 2 tie-break support.</div>
              </div>
              <span className={`tag ${shakti.tieBreakUsed ? "warn" : "good"}`}>{shakti.tieBreakUsed ? "Tie-break used" : "Clear ranking"}</span>
            </div>
            <div className="two-col" style={{ marginTop: 12 }}>
              {Object.entries(shakti.averages).map(([element, score]) => (
                <div key={element} className="list-item">
                  <strong>{element}</strong>
                  <span className="meta">{score.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {shakti.ranked.map((entry, index) => (
                <div key={entry.element} className="list-item">
                  <strong>#{index + 1} {entry.element}</strong>
                  <span className="meta">Average score {entry.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card span-12">
        <div className="eyebrow">Permanent timeline</div>
        <h3>Client-wide activity log</h3>
        <div className="timeline">
          {permanentTimeline.map((event) => (
            <div key={event.id} className="timeline-item">
              <header>
                <div>
                  <strong>{event.headline}</strong>
                  <div className="meta">{event.category} · {formatTimeStamp(event.happenedAt)}</div>
                </div>
                <span className="tag neutral">{event.actorRole ?? "SYSTEM"}</span>
              </header>
              <p className="subtle">{event.details}</p>
            </div>
          ))}
        </div>
        <div className="footer-note">
          Templates in use: {templates.filter((template) => template.active).length}. Latest case status: {activeCase?.status}. Report gate: {activeCase?.reportStatus}.
        </div>
      </section>
    </div>
  );
}
