"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppState } from "@/lib/store";
import type { ReportVersionRecord, UtilityRule } from "@/lib/domain";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { isPreviewWatermarked, formatMoney } from "@/lib/workflows";
import { getActiveCaseForClient, getCaseEvaluationBlockers, getServiceReadiness, normalizeCaseService, serviceTypeLabel } from "@/lib/service-framework";

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
    throw new Error(typeof result.error === "string" ? result.error : result.error?.message ?? "The evaluation could not run. Review the readiness steps and try again.");
  }
  return result;
}

export function EvaluationConsole() {
  const { activeUser } = useSession();
  const [rules, setRules] = useState<UtilityRule[]>([]);
  const [state, setState] = useState<AppState | null>(null);
  const [message, setMessage] = useState("Load the master table to inspect the residential rules.");
  const [busy, setBusy] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [snapshotName, setSnapshotName] = useState("Residential tab evaluation");
  const [shaktiValuesText, setShaktiValuesText] = useState("9,8,8,7,6,9,8,7,6,7,8,9,8,7,6,8");

  const clients = state?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const currentCase = state && selectedClient ? getActiveCaseForClient(state, selectedClient.id) : undefined;
  const readiness = currentCase ? getServiceReadiness(currentCase) : null;
  const service = currentCase ? normalizeCaseService(currentCase) : null;
  const evaluationBlockers = currentCase && state ? getCaseEvaluationBlockers(state, currentCase.id) : ["Open a case and save its service setup."];
  const evaluationReady = Boolean(currentCase && evaluationBlockers.length === 0);
  const reports = state?.reportVersions?.filter((item) => item.caseId === currentCase?.id) ?? [];
  const caseAmountInr = state?.commercialProposals.find((item) => item.clientId === selectedClient?.id)?.amountInr
    ?? state?.commercialPolicy.defaultProposalAmountInr;
  const report = (reports.find((item) => item.isPreview) ?? reports[0] ?? null) as ReportVersionRecord | null;
  const evaluationSnapshots = state?.evaluationSnapshots?.filter((item) => item.caseId === currentCase?.id) ?? [];
  const shaktiSnapshots = state?.shaktiSnapshots?.filter((item) => item.caseId === currentCase?.id) ?? [];
  const shaktiValues = useMemo(
    () =>
      shaktiValuesText
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value)),
    [shaktiValuesText]
  );

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

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const [master, bootstrap] = await Promise.all([fetchMaster(), fetchBootstrap()]);
      setRules(master.rules);
      setState(bootstrap);
      setSelectedClientId((current) => preferredClientId ?? current ?? bootstrap.clients?.[0]?.id ?? "");
      setMessage(`Loaded ${master.counts.total} utility rules and refreshed the evaluation state.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      await postAction(action, activeUser.role);
      await refresh(selectedClient?.id);
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

  return (
    <section className="section-grid">
      <div className={`card ${evaluationReady ? "span-8" : "span-12"}`}>
        <div className="eyebrow">Case evaluation</div>
        <h2>{evaluationReady ? "Run the verified case evaluation" : "Complete setup before evaluating"}</h2>
        <p className="subtle">
          Choose a client, complete the required case inputs, then save the two evaluation snapshots.
        </p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{rules.length}</span>
            <span className="stat-label">rules loaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{grouped.GOOD.length}</span>
            <span className="stat-label">good verdict zones</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{evaluationSnapshots.length}</span>
            <span className="stat-label">saved utility snapshots</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{currentCase?.caseNumber ?? "—"}</span>
            <span className="stat-label">active case context</span>
          </div>
        </div>
        <div className="workflow" style={{ marginTop: 14 }}>
          <button type="button" className="button-secondary" onClick={() => refresh()} disabled={busy}>
            Reload master table
          </button>
          <label htmlFor="evaluation-client"><strong>Client</strong></label>
          <select id="evaluation-client" value={selectedClient?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} style={{ minWidth: 220 }}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">GOOD {grouped.GOOD.length}</span>
          <span className="pill">BAD {grouped.BAD.length}</span>
          <span className="pill">OK-OK {grouped["OK-OK"].length}</span>
          <span className="pill">Snapshots {evaluationSnapshots.length}</span>
        </div>
        <div className="panel" style={{ marginTop: 14 }} aria-live="polite"><strong>{evaluationReady ? "Ready to run evaluation" : "Complete the case setup first"}</strong><div className="meta" style={{ marginTop: 6 }}>{service ? `${serviceTypeLabel(service.serviceType)} · ${readiness?.completed ?? 0} of ${readiness?.total ?? 0} required inputs ready.` : "Open a case and save its service setup."}</div>{!evaluationReady ? <><p className="subtle">Evaluation controls stay unavailable until these requirements are complete:</p><ul>{evaluationBlockers.slice(0, 3).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>{evaluationBlockers.length > 3 ? <p className="meta">Case setup shows {evaluationBlockers.length - 3} more requirement{evaluationBlockers.length - 3 === 1 ? "" : "s"}.</p> : null}<a className="button" href="/ops">Complete case setup</a></> : null}</div>
        {evaluationReady ? <><div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="snapshot-name">Snapshot name</label>
          <input id="snapshot-name" value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} />
        </div>
        <button
          type="button"
          className="button-secondary"
          style={{ marginTop: 10 }}
          disabled={busy || !evaluationReady || !snapshotName.trim() || snapshotName.trim().length > 120}
          onClick={() => run({ action: "utility-evaluate", caseId: currentCase?.id, snapshotName }, "Utility evaluation snapshot saved.")}
        >
          Save utility snapshot
        </button>
        </> : null}
        <details style={{ marginTop: 14 }}>
          <summary>View rule master and technical details</summary>
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
        </details>
      </div>

      {evaluationReady ? <div className="card span-4">
        <div className="eyebrow">Shakti engine</div>
        <h2>16-value ranking snapshot</h2>
        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Current case {currentCase?.caseNumber ?? "Not selected"}</span>
          <span className="pill">Snapshots {shaktiSnapshots.length}</span>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="shakti-values">16 values</label>
          <textarea id="shakti-values" value={shaktiValuesText} onChange={(event) => setShaktiValuesText(event.target.value)} />
        </div>
        <button
          type="button"
          className="button-secondary"
          style={{ marginTop: 10 }}
          disabled={busy || !evaluationReady || shaktiValues.length !== 16}
          onClick={() => run({ action: "shakti-rank", caseId: currentCase?.id, values: shaktiValues }, "Shakti snapshot saved.")}
        >
          Save Shakti snapshot
        </button>
        <div className="list" style={{ marginTop: 14 }}>
          <div className="list-item">
            <strong>Current case</strong>
            <span className="meta">{currentCase?.caseNumber ?? "No case selected"}</span>
          </div>
          <div className="list-item">
            <strong>Shakti snapshots</strong>
            <span className="meta">{shaktiSnapshots.length}</span>
          </div>
          <div className="list-item">
            <strong>Expected input</strong>
            <span className="meta">Exactly 16 values with ±2 tie-break support</span>
          </div>
        </div>
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
            <strong>Balance gate</strong>
            <span className="meta">Locked until the balance payment is approved</span>
          </div>
          <div className="list-item">
            <strong>Verdict release</strong>
            <span className="meta">Requires two report approvals</span>
          </div>
          <div className="list-item">
            <strong>Case amount</strong>
            <span className="meta">{caseAmountInr ? formatMoney(caseAmountInr) : "Not set"}</span>
          </div>
        </div>
        <div className="footer-note" role={message.toLowerCase().includes("failed") || message.toLowerCase().includes("could not") ? "alert" : "status"} aria-live="polite">{message}</div>
      </div> : null}
    </section>
  );
}
