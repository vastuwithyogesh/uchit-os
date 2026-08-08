"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import type { CommercialProposalRecord, InboundLeadRecord, LeadQualificationRecord, ReviewCallBookingRecord } from "@/lib/domain";
import { canTriggerDeliverables } from "@/lib/permissions";
import { buildActionHeaders } from "@/lib/request-helpers";
import { formatShortDate } from "@/lib/format";

type LeadInboxPayload = {
  leads: InboundLeadRecord[];
  counts: {
    total: number;
    qualified: number;
    new: number;
    filtered: number;
  };
};

async function fetchLeads() {
  const response = await fetch("/api/optin-leads", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load opt-in leads");
  }
  return response.json() as Promise<LeadInboxPayload>;
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

function formatLeadDate(value: string) {
  if (!value) {
    return "—";
  }

  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) {
    return isoDate[1];
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatShortDate(parsed.toISOString());
}

function getLeadNextAction(input: {
  lead: InboundLeadRecord;
  qualification?: LeadQualificationRecord;
  proposal?: CommercialProposalRecord;
  booking?: ReviewCallBookingRecord;
}) {
  const { lead, qualification, proposal, booking } = input;

  if (lead.status === "QUALIFIED") {
    if (!qualification) {
      return { label: "Check qualification record", tone: "warn" as const };
    }
    if (!proposal) {
      return { label: "Create proposal next", tone: "good" as const };
    }
    if (!booking) {
      return { label: "Book review call", tone: "good" as const };
    }
    if (booking.status === "BOOKED") {
      return { label: "Review call booked", tone: "neutral" as const };
    }
    return { label: "Continue CRM handoff", tone: "neutral" as const };
  }

  if (lead.status === "DUPLICATE") {
    return { label: "Check existing client history", tone: "warn" as const };
  }

  if (lead.status === "FILTERED") {
    return { label: "Hold for later follow-up", tone: "neutral" as const };
  }

  if (lead.status === "DISQUALIFIED") {
    return { label: "Closed for now", tone: "bad" as const };
  }

  if (lead.isReturningLead) {
    return { label: "Review refill quickly", tone: "warn" as const };
  }

  if (lead.score >= 80) {
    return { label: "Qualify now", tone: "good" as const };
  }

  if (lead.score >= 60) {
    return { label: "Review and filter", tone: "warn" as const };
  }

  return { label: "Filter or disqualify", tone: "bad" as const };
}

export function LeadInboxConsole({
  leadQualifications,
  proposals,
  reviewCallBookings
}: {
  leadQualifications: LeadQualificationRecord[];
  proposals: CommercialProposalRecord[];
  reviewCallBookings: ReviewCallBookingRecord[];
}) {
  const { activeUser } = useSession();
  const [payload, setPayload] = useState<LeadInboxPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload the CSV export from your website dashboard.");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InboundLeadRecord["status"] | "ALL">("ALL");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  async function refresh() {
    setBusy(true);
    try {
      setPayload(await fetchLeads());
      setMessage("Opt-in leads refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCsv(file: File | null) {
    if (!file) {
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/optin-leads", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error ?? "Upload failed");
      }
      setMessage(`Imported ${result.created} new lead(s) and updated ${result.updated} returning lead(s).`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function qualifyLead(leadId: string) {
    setBusy(true);
    try {
      const result = await postAction({ action: "lead-qualify", leadId }, activeUser.role);
      setMessage(`Qualified ${result.result.lead.fullName}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Qualification failed");
    } finally {
      setBusy(false);
    }
  }

  async function setLeadStatus(leadId: string, status: InboundLeadRecord["status"], statusLabel: string) {
    setBusy(true);
    try {
      await postAction({ action: "lead-status-set", leadId, status }, activeUser.role);
      setMessage(`Lead marked ${statusLabel}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  }

  async function createProposalForLead(lead: InboundLeadRecord) {
    const clientId = lead.convertedClientId ?? lead.uniqueClientId;
    setBusy(true);
    try {
      await postAction({ action: "proposal-create", clientId, amountInr: 51000 }, activeUser.role);
      setMessage(`Proposal created for ${lead.fullName}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proposal creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function bookReviewCallForLead(lead: InboundLeadRecord) {
    const clientId = lead.convertedClientId ?? lead.uniqueClientId;
    const proposal = proposals.find((item) => item.clientId === clientId);
    if (!proposal) {
      setMessage("Create the proposal first so the review call can be booked.");
      return;
    }

    setBusy(true);
    try {
      await postAction(
        {
          action: "review-call-book",
          clientId,
          proposalId: proposal.id,
          provider: "GOOGLE_MEET",
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          durationMinutes: 30
        },
        activeUser.role
      );
      setMessage(`Review call booked for ${lead.fullName}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review call booking failed");
    } finally {
      setBusy(false);
    }
  }

  async function runBulkAction(actionLabel: string, operation: (leadId: string) => Promise<void>) {
    if (!selectedLeadIds.length) {
      setMessage("Select at least one lead first.");
      return;
    }

    setBusy(true);
    try {
      for (const leadId of selectedLeadIds) {
        await operation(leadId);
      }
      const processedCount = selectedLeadIds.length;
      setSelectedLeadIds([]);
      setMessage(`${actionLabel} completed for ${processedCount} lead${processedCount === 1 ? "" : "s"}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${actionLabel} failed`);
    } finally {
      setBusy(false);
    }
  }

  const visibleLeads = useMemo(() => {
    const leads = payload?.leads ?? [];
    return leads.filter((lead) => {
      const matchesQuery =
        !query ||
        lead.fullName.toLowerCase().includes(query.toLowerCase()) ||
        lead.email.toLowerCase().includes(query.toLowerCase()) ||
        lead.phone.toLowerCase().includes(query.toLowerCase()) ||
        lead.city.toLowerCase().includes(query.toLowerCase()) ||
        lead.source.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || lead.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [payload, query, statusFilter]);

  const returningLeadCount = useMemo(() => (payload?.leads ?? []).filter((lead) => lead.isReturningLead).length, [payload]);
  const hotLeadCount = useMemo(() => visibleLeads.filter((lead) => lead.status === "NEW" && lead.score >= 80).length, [visibleLeads]);
  const selectedVisibleCount = useMemo(
    () => visibleLeads.filter((lead) => selectedLeadIds.includes(lead.id)).length,
    [selectedLeadIds, visibleLeads]
  );

  function toggleLeadSelection(leadId: string, checked: boolean) {
    setSelectedLeadIds((current) => (checked ? Array.from(new Set([...current, leadId])) : current.filter((id) => id !== leadId)));
  }

  function selectVisibleLeads() {
    setSelectedLeadIds(Array.from(new Set(visibleLeads.map((lead) => lead.id))));
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Lead inbox</div>
        <h2>Website opt-in CSV to filtered CRM queue</h2>
        <p className="subtle">
          Upload the CSV you download from your website dashboard. The inbox keeps the original CSV dates for first seen and last seen, shows whether a lead is returning, and keeps the submission count visible while the full repeat history stays in the timeline.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.total ?? 0}</span>
            <span className="stat-label">total imported leads</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.counts.qualified ?? 0}</span>
            <span className="stat-label">qualified in inbox</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{returningLeadCount}</span>
            <span className="stat-label">returning submissions</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{hotLeadCount}</span>
            <span className="stat-label">high-priority new leads</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 14 }}>
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => uploadCsv(event.target.files?.[0] ?? null)} />
          <button type="button" className="button-secondary" disabled={busy} onClick={refresh}>
            Refresh inbox
          </button>
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <strong>Bulk queue actions</strong>
              <div className="meta">Filter the queue, select the visible set, and process the batch in one pass.</div>
            </div>
            <span className="pill">Selected {selectedVisibleCount}</span>
          </div>
          <div className="workflow" style={{ marginTop: 12 }}>
            <button type="button" className="button-secondary" disabled={busy || !visibleLeads.length} onClick={selectVisibleLeads}>
              Select visible
            </button>
            <button type="button" className="button-secondary" disabled={busy || !selectedLeadIds.length} onClick={() => setSelectedLeadIds([])}>
              Clear selection
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !canTriggerDeliverables(activeUser) || !selectedLeadIds.length}
              onClick={() =>
                runBulkAction("Bulk qualify", async (leadId) => {
                  await postAction({ action: "lead-qualify", leadId }, activeUser.role);
                }).catch(() => undefined)
              }
            >
              Bulk qualify
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !canTriggerDeliverables(activeUser) || !selectedLeadIds.length}
              onClick={() =>
                runBulkAction("Bulk filter", async (leadId) => {
                  await postAction({ action: "lead-status-set", leadId, status: "FILTERED" }, activeUser.role);
                }).catch(() => undefined)
              }
            >
              Bulk filter
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !canTriggerDeliverables(activeUser) || !selectedLeadIds.length}
              onClick={() =>
                runBulkAction("Bulk disqualify", async (leadId) => {
                  await postAction({ action: "lead-status-set", leadId, status: "DISQUALIFIED" }, activeUser.role);
                }).catch(() => undefined)
              }
            >
              Bulk disqualify
            </button>
          </div>
        </div>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Total {payload?.counts.total ?? 0}</span>
          <span className="pill">New {payload?.counts.new ?? 0}</span>
          <span className="pill">Qualified {payload?.counts.qualified ?? 0}</span>
          <span className="pill">Filtered {payload?.counts.filtered ?? 0}</span>
        </div>
        <div className="two-col" style={{ marginTop: 14 }}>
          <div className="field">
            <label>Search leads</label>
            <input
              placeholder="Search name, email, phone, city, source"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="field">
            <label>Status filter</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as InboundLeadRecord["status"] | "ALL")}>
              <option value="ALL">All statuses</option>
              <option value="NEW">New</option>
              <option value="FILTERED">Filtered</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="DISQUALIFIED">Disqualified</option>
              <option value="DUPLICATE">Duplicate</option>
            </select>
          </div>
        </div>
        <div className="list" style={{ marginTop: 16 }}>
          {visibleLeads.map((lead) => {
            const qualification = leadQualifications.find((item) => item.clientId === lead.convertedClientId);
            const proposal = proposals.find((item) => item.clientId === lead.convertedClientId);
            const booking = reviewCallBookings.find((item) => item.clientId === lead.convertedClientId);
            const nextAction = getLeadNextAction({ lead, qualification, proposal, booking });

            return (
              <div key={lead.id} className="panel">
                <div className="panel-head">
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${lead.fullName}`}
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={(event) => toggleLeadSelection(lead.id, event.target.checked)}
                      disabled={busy}
                    />
                    <div>
                      <strong>{lead.fullName}</strong>
                      <div className="meta">
                        {lead.email} · {lead.phone} · {lead.city}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span className={`tag ${nextAction.tone === "good" ? "good" : nextAction.tone === "bad" ? "bad" : nextAction.tone === "warn" ? "warn" : "neutral"}`}>
                      {nextAction.label}
                    </span>
                    <span className={`tag ${lead.status === "QUALIFIED" ? "good" : lead.status === "FILTERED" ? "warn" : lead.status === "DISQUALIFIED" ? "bad" : "neutral"}`}>
                      {lead.status}
                    </span>
                  </div>
                </div>
                <div className="pill-row" style={{ marginTop: 10 }}>
                  <span className="pill">Score {lead.score}</span>
                  <span className="pill">{lead.source}</span>
                  <span className="pill">Client ID {lead.uniqueClientId}</span>
                  <span className="pill">Last seen {formatLeadDate(lead.lastSeenAt)}</span>
                  <span className="pill">Submissions {lead.submissionCount}</span>
                  <span className="pill">{lead.isReturningLead ? "Returning lead: Yes" : "Returning lead: No"}</span>
                  <span className="pill">{qualification ? `Converted to ${qualification.clientId}` : "Not yet converted"}</span>
                  <span className="pill">{proposal ? `Proposal ${proposal.status}` : "No proposal yet"}</span>
                  <span className="pill">{booking ? `Review call ${booking.status}` : "No review call yet"}</span>
                </div>
                <p className="subtle" style={{ marginTop: 10 }}>
                  {lead.message || lead.notes || "No lead note supplied."}
                </p>
                <div className="meta" style={{ marginTop: 8 }}>
                  Identity: {lead.email || lead.phone || lead.fullName} · {lead.statusLabel || "no inbound status"} · {lead.utmSource || "no utm source"}
                </div>
                <div className="workflow" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || !canTriggerDeliverables(activeUser) || lead.status === "QUALIFIED"}
                    onClick={() => qualifyLead(lead.id)}
                  >
                    Qualify lead
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || !canTriggerDeliverables(activeUser) || lead.status === "FILTERED"}
                    onClick={() => setLeadStatus(lead.id, "FILTERED", "filtered")}
                  >
                    Mark filtered
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || !canTriggerDeliverables(activeUser) || lead.status === "DISQUALIFIED"}
                    onClick={() => setLeadStatus(lead.id, "DISQUALIFIED", "disqualified")}
                  >
                    Disqualify
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || !canTriggerDeliverables(activeUser) || lead.status === "NEW"}
                    onClick={() => setLeadStatus(lead.id, "NEW", "reset to new")}
                  >
                    Reset to new
                  </button>
                </div>
                <div className="workflow" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || !canTriggerDeliverables(activeUser) || Boolean(proposals.find((item) => item.clientId === (lead.convertedClientId ?? lead.uniqueClientId)))}
                    onClick={() => createProposalForLead(lead)}
                  >
                    Create proposal
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy || !canTriggerDeliverables(activeUser) || !proposals.find((item) => item.clientId === (lead.convertedClientId ?? lead.uniqueClientId))}
                    onClick={() => bookReviewCallForLead(lead)}
                  >
                    Book review call
                  </button>
                </div>
              </div>
            );
          })}
          {!visibleLeads.length ? (
            <div className="list-item">
              <strong>No leads found</strong>
              <span className="meta">Upload the CSV export to populate the inbox</span>
            </div>
          ) : null}
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
