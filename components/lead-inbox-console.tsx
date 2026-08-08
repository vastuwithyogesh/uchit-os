"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import { canTriggerDeliverables } from "@/lib/permissions";
import { buildActionHeaders } from "@/lib/request-helpers";
import type { InboundLeadRecord, LeadQualificationRecord } from "@/lib/domain";

type LeadInboxPayload = {
  leads: InboundLeadRecord[];
  counts: {
    total: number;
    qualified: number;
    new: number;
    filtered: number;
    duplicates: number;
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
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function LeadInboxConsole({ leadQualifications }: { leadQualifications: LeadQualificationRecord[] }) {
  const { activeUser } = useSession();
  const [payload, setPayload] = useState<LeadInboxPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload the CSV export from your website dashboard.");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InboundLeadRecord["status"] | "ALL">("ALL");

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

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-12">
        <div className="eyebrow">Lead inbox</div>
        <h2>Website opt-in CSV to filtered CRM queue</h2>
        <p className="subtle">
          Upload the CSV you download from your website dashboard. The inbox keeps the original CSV dates for first seen and last seen, tracks returning submissions, and lets the team filter or qualify each lead.
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
            <span className="stat-value">{payload?.counts.duplicates ?? 0}</span>
            <span className="stat-label">marked duplicates</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{returningLeadCount}</span>
            <span className="stat-label">returning submissions</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 14 }}>
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => uploadCsv(event.target.files?.[0] ?? null)} />
          <button type="button" className="button-secondary" disabled={busy} onClick={refresh}>
            Refresh inbox
          </button>
        </div>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Total {payload?.counts.total ?? 0}</span>
          <span className="pill">New {payload?.counts.new ?? 0}</span>
          <span className="pill">Qualified {payload?.counts.qualified ?? 0}</span>
          <span className="pill">Filtered {payload?.counts.filtered ?? 0}</span>
          <span className="pill">Duplicates {payload?.counts.duplicates ?? 0}</span>
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
            return (
              <div key={lead.id} className="panel">
                <div className="panel-head">
                  <div>
                    <strong>{lead.fullName}</strong>
                    <div className="meta">
                      {lead.email} · {lead.phone} · {lead.city}
                    </div>
                  </div>
                  <span className={`tag ${lead.status === "QUALIFIED" ? "good" : lead.status === "FILTERED" ? "warn" : lead.status === "DISQUALIFIED" ? "bad" : "neutral"}`}>
                    {lead.status}
                  </span>
                </div>
                <div className="pill-row" style={{ marginTop: 10 }}>
                  <span className="pill">Score {lead.score}</span>
                  <span className="pill">{lead.source}</span>
                  <span className="pill">Client ID {lead.uniqueClientId}</span>
                  <span className="pill">First seen {formatLeadDate(lead.firstSeenAt)}</span>
                  <span className="pill">Last seen {formatLeadDate(lead.lastSeenAt)}</span>
                  <span className="pill">Submissions {lead.submissionCount}</span>
                  <span className="pill">Duplicates {lead.duplicateCount}</span>
                  <span className="pill">{lead.isReturningLead ? "Returning lead" : "First-time lead"}</span>
                  <span className="pill">{qualification ? `Converted to ${qualification.clientId}` : "Not yet converted"}</span>
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
