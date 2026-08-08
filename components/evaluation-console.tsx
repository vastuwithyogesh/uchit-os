"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReportVersionRecord, UtilityRule } from "@/lib/domain";
import { isPreviewWatermarked, formatMoney } from "@/lib/workflows";

async function fetchMaster() {
  const response = await fetch("/api/utility/master", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load utility master");
  }
  return response.json();
}

async function fetchBootstrap() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load bootstrap state");
  }
  return response.json();
}

export function EvaluationConsole() {
  const [rules, setRules] = useState<UtilityRule[]>([]);
  const [report, setReport] = useState<ReportVersionRecord | null>(null);
  const [message, setMessage] = useState("Load the master table to inspect the residential rules.");
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(
    () =>
      rules.reduce(
        (acc, rule) => {
          acc[rule.verdict].push(rule);
          return acc;
        },
        { GOOD: [] as UtilityRule[], BAD: [] as UtilityRule[], "OK-OK": [] as UtilityRule[] }
      ),
    [rules]
  );

  async function refresh() {
    setBusy(true);
    try {
      const [master, bootstrap] = await Promise.all([fetchMaster(), fetchBootstrap()]);
      setRules(master.rules);
      setReport((bootstrap.reportVersions?.[0] as ReportVersionRecord | undefined) ?? null);
      setMessage(`Loaded ${master.counts.total} utility rules from the CSV and refreshed the report context.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-8">
        <div className="eyebrow">Utility-evaluation master</div>
        <h2>Residential tab CSV</h2>
        <p className="subtle">
          This view is the source of truth for the GOOD / BAD / OK-OK matrix. It reads the CSV directly so the report template can mirror the same rule set.
        </p>
        <div className="workflow" style={{ marginTop: 14 }}>
          <button type="button" className="button" onClick={refresh} disabled={busy}>
            Reload master table
          </button>
        </div>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">GOOD {grouped.GOOD.length}</span>
          <span className="pill">BAD {grouped.BAD.length}</span>
          <span className="pill">OK-OK {grouped["OK-OK"].length}</span>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          {rules.map((rule) => (
            <div key={rule.id} className="list-item">
              <strong>{rule.zoneCode}</strong>
              <span className="meta">{rule.description}</span>
              <div className="pill-row">
                <span className={`tag ${rule.verdict === "GOOD" ? "good" : rule.verdict === "BAD" ? "bad" : "warn"}`}>{rule.verdict}</span>
                <span className="pill">{rule.tabName}</span>
                <span className="pill">Confidence {rule.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Report template</div>
        <h2>Stage-A preview context</h2>
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <div>
              <strong>{report?.versionLabel ?? "Stage-A Preview"}</strong>
              <div className="meta">{report ? report.status : "PAYMENT_BLOCKED"}</div>
            </div>
            <span className={`tag ${report && isPreviewWatermarked(report) ? "warn" : "good"}`}>
              {report && isPreviewWatermarked(report) ? "Watermarked" : "Official"}
            </span>
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>
            {report?.watermarkText ?? "Preview only. Balance pending."}
          </p>
        </div>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Preview status</strong>
            <span className="meta">{report?.status ?? "PAYMENT_BLOCKED"}</span>
          </div>
          <div className="list-item">
            <strong>Balance gate</strong>
            <span className="meta">Locked until the balance payment is approved</span>
          </div>
          <div className="list-item">
            <strong>Verdict release</strong>
            <span className="meta">Requires two report approvals</span>
          </div>
          <div className="list-item">
            <strong>Case amount</strong>
            <span className="meta">{formatMoney(51000)}</span>
          </div>
        </div>
        <div className="footer-note">{message}</div>
      </div>
    </section>
  );
}
