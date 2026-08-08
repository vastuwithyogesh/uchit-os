"use client";

import { useMemo, useState } from "react";
import {
  AppUser,
  ClientRecord,
  CommercialProposalRecord,
  FloorWorkspaceRecord,
  LeadQualificationRecord,
  PaymentRecord,
  ReportVersionRecord,
  UtilityRule,
  VastuCaseRecord,
  WhatsAppTemplateRecord
} from "@/lib/domain";
import {
  DEFAULT_PROPOSAL_AMOUNT_INR,
  MIN_ADVANCE_INR,
  approvalSummary,
  buildPermanentTimeline,
  canReleaseOfficialVerdict,
  describeApprovalPath,
  formatMoney,
  generateUtilityEvaluation,
  lockWorkspace,
  qualifyLead,
  rankShakti,
  timelineHeadlineForLead
} from "@/lib/workflows";
import { formatTimeStamp } from "@/lib/format";

interface CrmWorkbenchProps {
  users: AppUser[];
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
  const { clients, leads, proposals, payments, cases, floors, reports, utilityRules, templates, timeline } = props;
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [selectedRole, setSelectedRole] = useState<AppUser["role"]>("SUPER_ADMIN");
  const [conversationStep, setConversationStep] = useState(0);
  const [manualInputs, setManualInputs] = useState<number[]>([9, 8, 8, 7, 6, 9, 8, 7, 6, 7, 8, 9, 8, 7, 6, 8]);

  const activeClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const activeLead = leads.find((lead) => lead.clientId === activeClient?.id) ?? leads[0];
  const activeProposal = proposals.find((proposal) => proposal.clientId === activeClient?.id) ?? proposals[0];
  const activeCase = cases.find((item) => item.clientId === activeClient?.id) ?? cases[0];
  const activeFloor = floors.find((item) => item.caseId === activeCase?.id) ?? floors[0];
  const activeReport = reports.find((item) => item.caseId === activeCase?.id) ?? reports[0];
  const activePayments = payments.filter((payment) => payment.clientId === activeClient?.id);
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

  const conversation = activeLead?.conversationalForm ?? [];
  const currentPrompt = conversation[conversationStep] ?? conversation[conversation.length - 1];

  return (
    <div className="section-grid">
      <section className="card span-8">
        <div className="eyebrow">ScoreApp-style intake</div>
        <h2>Conversational lead qualification</h2>
        <p className="subtle">
          The setter can move through a structured conversation, keep the 2-minute qualification call honest, and trigger the first deliverable as soon as the lead crosses the acceptance bar.
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
                <label>Current prompt</label>
                <textarea value={`${currentPrompt?.label ?? "Lead question"}\n${currentPrompt?.answer ?? "Waiting for input."}`} readOnly />
              </div>
              <div className="pill-row" style={{ marginTop: 12 }}>
                <span className="pill">Qualification score {activeLead?.score ?? 0}</span>
                <span className="pill">2-minute SLA {leadQualification?.completedInMinutes ?? 0} min</span>
                <span className="pill">Deliverable {leadQualification?.triggerDeliverable ? "triggered" : "pending"}</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="field">
              <label>Setter role view</label>
              <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as AppUser["role"])}>
                {props.users.map((user) => (
                  <option key={user.id} value={user.role}>
                    {user.role}
                  </option>
                ))}
              </select>
            </div>
            <p className="subtle" style={{ marginTop: 12 }}>
              {describeApprovalPath({ id: "demo", fullName: "Demo", email: "demo@example.com", role: selectedRole, color: "#000" })}
            </p>
            <div className="workflow" style={{ marginTop: 12 }}>
              <button type="button" className="button-secondary" onClick={() => setConversationStep((step) => Math.max(0, step - 1))}>
                Previous prompt
              </button>
              <button type="button" className="button" onClick={() => setConversationStep((step) => Math.min(conversation.length - 1, step + 1))}>
                Advance prompt
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card span-4">
        <div className="eyebrow">Commercial gate</div>
        <h3>₹51,000 default package</h3>
        <div className="list">
          <div className="list-item">
            <strong>Minimum advance</strong>
            <span className="meta">{formatMoney(MIN_ADVANCE_INR)}</span>
          </div>
          <div className="list-item">
            <strong>Proposal amount</strong>
            <span className="meta">{formatMoney(activeProposal?.amountInr ?? DEFAULT_PROPOSAL_AMOUNT_INR)}</span>
          </div>
          <div className="list-item">
            <strong>Commercial approval</strong>
            <span className={`tag ${selectedRole === "SUPER_ADMIN" ? "good" : "warn"}`}>{selectedRole === "SUPER_ADMIN" ? "Allowed" : "Blocked"}</span>
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
              <div className="meta">{activeCase?.caseNumber} · {activeCase?.status}</div>
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
                <div className="meta">16 values, element averages, unique ranking, and ±2 tie-break support.</div>
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
          {clientTimeline.map((event) => (
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
