"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AouReferenceRowRecord } from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
const fields = ["attributes", "directions", "colours", "shapes", "metals", "activities", "utilities", "objects"] as const;

function sourceValue(row: AouReferenceRowRecord, field: typeof fields[number]) {
  const sourceKey = (field === "utilities" ? "Utilites" : `${field[0].toUpperCase()}${field.slice(1)}`) as keyof AouReferenceRowRecord["sourceCells"];
  return row.sourceCells[sourceKey] ?? "";
}

export function AouMethodologyConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("Founder review of canonical AOU source and display copy.");
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store", headers: buildActionHeaders(activeUser.role) });
    if (!response.ok) throw new Error("AOU methodology could not be loaded.");
    setState(await response.json() as Bootstrap);
  }, [activeUser]);

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "AOU methodology could not be loaded.")); }, [load]);
  const version = state?.aouMethodologyVersions?.find((item) => item.lifecycleStatus === "ACTIVE");
  const rows = useMemo(() => (state?.aouReferenceRows ?? []).filter((item) => item.methodologyVersionId === version?.id).sort((left, right) => left.sourceRowNumber - right.sourceRowNumber), [state, version]);

  async function act(action: string, body: Record<string, unknown>) {
    if (!state) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json", ...buildActionHeaders(activeUser.role) }, body: JSON.stringify({ action, actorRole: activeUser.role, expectedRevision: state.persistenceRevision, ...body }) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { setMessage(response.status === 409 || response.status === 428 ? `${payload.error ?? "The saved version changed."} Reload and review your draft; it was not silently retried.` : payload.error ?? "AOU action failed."); return; }
    setMessage(action === "aou-display-approve" ? "Display copy approved and audit recorded." : action === "aou-display-draft" ? "Display draft saved for Founder approval." : "Canonical AOU source initialized from the approved workbook hashes.");
    await load();
  }

  function exportReview() {
    const safe = rows.map((row) => ({ element: row.element, sourceRowNumber: row.sourceRowNumber, sourceCells: row.sourceCells, directionScope: row.directionScope, displayCopy: row.displayCopy ? { version: row.displayCopy.version, status: row.displayCopy.status, fields: Object.fromEntries(fields.map((field) => [field, row.displayCopy?.[field] ?? ""])) } : null, sourceHash: row.contentHash }));
    const blob = new Blob([JSON.stringify({ sourceVersion: version?.label, sourceWorkbookHash: version?.sourceWorkbookHash, sourceRangeHash: version?.sourceRangeHash, rows: safe }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "uchit-aou-founder-review.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <section className="section-grid aou-review" aria-labelledby="aou-heading">
    <div className="card span-12"><div className="eyebrow">AOU reference · separate from Utility</div><h2 id="aou-heading">Founder AOU source and display-copy review</h2><p className="subtle">Raw workbook text is immutable. Proposed display wording may correct spelling, punctuation, spacing and grammar only; it does not change Utility outcomes, Shakti calculations or remedies.</p>{!version ? <button className="button" type="button" disabled={busy} onClick={() => void act("aou-source-initialize", { expectedRecordVersion: 0, reason, idempotencyKey: `aou-source-${crypto.randomUUID()}` })}>Initialize approved workbook source</button> : <><p className="meta">{version.label} · source hash {version.sourceRangeHash} · display copy remains Founder-controlled</p><button className="button-secondary" type="button" onClick={exportReview}>Export Founder review JSON</button></>}</div>
    {version && <div className="card span-12"><div className="field"><label htmlFor="aou-reason">Review or approval reason</label><textarea id="aou-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></div><label className="checkbox-row"><input type="checkbox" checked={cleanupConfirmed} onChange={(event) => setCleanupConfirmed(event.target.checked)} /> I confirm proposed copy is grammar/format cleanup only and does not change meaning.</label></div>}
    {rows.map((row) => {
      const currentDraft = drafts[row.id] ?? Object.fromEntries(fields.map((field) => [field, row.displayCopy?.[field] ?? sourceValue(row, field)]));
      return <article className="card span-12" key={row.id}><div className="eyebrow">{row.element} · {row.directionScope?.join(", ")}</div><h3>Raw source beside proposed display copy</h3><div className="two-col"><div><h4>Immutable source</h4>{fields.map((field) => <div key={field} className="summary"><strong>{field}</strong><br />{sourceValue(row, field)}</div>)}</div><div><h4>Proposed display copy · {row.displayCopy?.status ?? "DRAFT"}</h4>{fields.map((field) => <div className="field" key={field}><label htmlFor={`${row.id}-${field}`}>{field}</label><textarea id={`${row.id}-${field}`} value={currentDraft[field] ?? ""} onChange={(event) => setDrafts((existing) => ({ ...existing, [row.id]: { ...currentDraft, [field]: event.target.value } }))} /></div>)}</div></div><div className="button-row"><button className="button-secondary" type="button" disabled={busy || !cleanupConfirmed || reason.trim().length < 20} onClick={() => void act("aou-display-draft", { rowId: row.id, fields: currentDraft, cleanupOnlyConfirmed: true, meaningChangeConfirmed: false, reason, idempotencyKey: `aou-draft-${row.id}-${crypto.randomUUID()}`, expectedRecordVersion: row.recordVersion ?? 0 })}>Save display draft</button><button className="button" type="button" disabled={busy || row.displayCopy?.status !== "DRAFT" || reason.trim().length < 20} onClick={() => window.confirm(`Approve display copy for ${row.element}? This creates immutable Founder audit evidence.`) && void act("aou-display-approve", { rowId: row.id, reason, idempotencyKey: `aou-approve-${row.id}-${crypto.randomUUID()}`, expectedRecordVersion: row.recordVersion ?? 0 })}>Founder approve display copy</button></div></article>;
    })}
    <p className="status-line span-12" aria-live="polite">{message}</p>
  </section>;
}
