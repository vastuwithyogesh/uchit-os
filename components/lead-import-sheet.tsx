"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";

type PreviewRow = { rowNumber: number; disposition: "CREATE" | "LINK_EXISTING" | "DUPLICATE_IN_FILE" | "REVIEW_REQUIRED" | "INVALID"; reason: string; name: string; emailMasked: string; phoneMasked: string };
type Preview = { batchHash: string; rows: PreviewRow[]; counts: { total: number; accepted: number; create: number; existingMatch: number; duplicate: number; reviewRequired: number; invalid: number }; canImport: boolean; batchErrors: string[] };
type PreviewResponse = { ok: boolean; error?: string; preview?: Preview; expectedRevision?: number | null; expectedOrganisationVersion?: number };
type ImportResult = { createdClients: number; linkedExistingClients: number; reviewRequired: number; rejected: number; importedLeads?: number };

export function LeadImportSheet({ onImported }: { onImported: () => Promise<void> }) {
  const { activeUser } = useSession();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [revision, setRevision] = useState<number | null | undefined>(undefined);
  const [organisationVersion, setOrganisationVersion] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Select the Uchit CSV template to begin.");
  const [errorKind, setErrorKind] = useState<"none" | "validation" | "conflict" | "network">("none");
  const [result, setResult] = useState<ImportResult | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => fileInput.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  if (activeUser.role !== "SUPER_ADMIN") return null;

  function reset(nextOpen = false) {
    setOpen(nextOpen); setFile(null); setPreview(null); setRevision(undefined); setOrganisationVersion(undefined);
    setResult(null); setErrorKind("none"); setMessage("Select the Uchit CSV template to begin.");
    idempotencyKey.current = crypto.randomUUID();
  }

  async function submit(mode: "preview" | "confirm") {
    if (!file) { setErrorKind("validation"); setMessage("Select one CSV file first."); return; }
    setBusy(true); setErrorKind("none");
    const formData = new FormData(); formData.append("mode", mode); formData.append("file", file);
    if (mode === "confirm") {
      if (!preview || revision === undefined || organisationVersion === undefined) { setBusy(false); setErrorKind("conflict"); setMessage("Preview this exact file again before confirming."); return; }
      formData.append("expectedBatchHash", preview.batchHash);
      formData.append("expectedRevision", revision === null ? "null" : String(revision));
      formData.append("expectedOrganisationVersion", String(organisationVersion));
      formData.append("idempotencyKey", idempotencyKey.current);
    }
    try {
      const response = await fetch("/api/optin-leads", { method: "POST", body: formData });
      const payload = await response.json() as PreviewResponse & { replayed?: boolean; result?: ImportResult };
      if (mode === "preview" && payload.preview) { setPreview(payload.preview); setRevision(payload.expectedRevision); setOrganisationVersion(payload.expectedOrganisationVersion); }
      if (!response.ok || !payload.ok) {
        setErrorKind(response.status === 409 || response.status === 428 ? "conflict" : "validation");
        throw new Error(payload.error ?? (response.status === 413 ? "The selected file is too large." : "The CSV could not be validated."));
      }
      if (mode === "preview") setMessage(payload.preview?.canImport ? "Preview ready. Review every category before confirming the atomic import." : "Preview complete. Resolve invalid rows first; Review Required rows will not be merged automatically.");
      else { setResult(payload.result ?? null); setMessage(payload.replayed ? "This identical import was already completed; no records were duplicated." : "Import complete. Canonical leads and clients are up to date."); await onImported(); }
    } catch (error) {
      if (error instanceof TypeError) setErrorKind("network");
      setMessage(error instanceof Error ? error.message : "The upload failed. Your selected file is still here.");
    } finally { setBusy(false); }
  }

  function downloadIssues() {
    if (!preview) return;
    const rows = preview.rows.filter((row) => row.disposition === "INVALID" || row.disposition === "REVIEW_REQUIRED");
    const csv = ["row,status,reason", ...rows.map((row) => `${row.rowNumber},${row.disposition},"${row.reason.replaceAll('"', '""')}"`)].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "uchit-lead-import-issues.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <>
    <button type="button" className="button-secondary lead-import-trigger" onClick={() => reset(true)}>Upload leads</button>
    {open ? <div className="lead-import-layer"><button type="button" className="lead-import-backdrop" aria-label="Close lead upload" onClick={() => { if (!busy) reset(false); }} />
      <section className="lead-import-sheet" role="dialog" aria-modal="true" aria-labelledby="lead-import-title">
        <header className="lead-import-header"><div><span className="eyebrow">Founder-only import</span><h2 id="lead-import-title">Upload leads</h2><p>Validate the whole batch before Uchit creates or links any permanent client.</p></div><button type="button" className="drawer-close" onClick={() => reset(false)} disabled={busy} aria-label="Close lead upload">×</button></header>
        <div className="lead-import-body">{!result ? <>
          <section className="lead-import-select" aria-labelledby="lead-import-select-title"><div><h3 id="lead-import-select-title">1. Select file</h3><p>CSV only · 2 MB maximum · 1,000 rows. XLSX is deferred.</p></div><a className="button-secondary" href="/api/optin-leads?template=1">Download template</a>
            <label className="lead-file-picker"><span>CSV file</span><input ref={fileInput} type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); setPreview(null); setResult(null); setMessage(next ? `${next.name} selected. Validate it before importing.` : "Select the Uchit CSV template to begin."); idempotencyKey.current = crypto.randomUUID(); }} /><small>{file?.name ?? "No file selected"}</small></label>
          </section>
          {preview ? <section className="lead-import-preview" aria-labelledby="lead-import-preview-title"><header><div><h3 id="lead-import-preview-title">2. Preview rows</h3><p>No data has been changed.</p></div><div className="lead-import-counts"><span className="status-pill status-ready">{preview.counts.accepted} accepted</span><span className="status-pill status-neutral">{preview.counts.existingMatch + preview.counts.duplicate} matches</span><span className="status-pill status-attention">{preview.counts.reviewRequired} review</span><span className="status-pill status-blocked">{preview.counts.invalid} invalid</span></div></header>
            {preview.batchErrors.length ? <div role="alert" className="blocked-note">{preview.batchErrors.join(" ")}</div> : null}
            <div className="lead-import-table-wrap"><table><thead><tr><th>Row</th><th>Lead</th><th>Contact</th><th>Result</th><th>Reason</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.name}</td><td>{row.emailMasked}<br />{row.phoneMasked}</td><td><span className={`status-pill status-${row.disposition === "INVALID" ? "blocked" : row.disposition === "REVIEW_REQUIRED" ? "attention" : row.disposition === "CREATE" ? "ready" : "neutral"}`}>{row.disposition.replaceAll("_", " ")}</span></td><td>{row.reason}</td></tr>)}</tbody></table></div>
            <details><summary>Permitted column mapping</summary><p className="meta">Full name, email, phone, city, service interest, source, received date, message and UTM attribution only. Owner, DOB/numerology, payments, cases, evaluations and reports are rejected.</p></details>
            {preview.counts.invalid || preview.counts.reviewRequired ? <button type="button" className="text-button" onClick={downloadIssues}>Download issue CSV</button> : null}
          </section> : null}</> : <section className="lead-import-result" aria-labelledby="lead-import-result-title"><span className="status-pill status-approved">Complete</span><h3 id="lead-import-result-title">Import summary</h3><dl><div><dt>Permanent clients created</dt><dd>{result.createdClients}</dd></div><div><dt>Existing clients linked</dt><dd>{result.linkedExistingClients}</dd></div><div><dt>Review Required</dt><dd>{result.reviewRequired}</dd></div><div><dt>Rejected</dt><dd>{result.rejected}</dd></div></dl><p>Review Required rows were not auto-merged. No payment, case, evaluation or report state was changed.</p></section>}</div>
        <footer className="lead-import-footer"><div role={errorKind === "none" ? "status" : "alert"} aria-live="polite"><span>{message}</span>{errorKind === "conflict" ? <small>Your file and preview remain here. Reload the lead workspace, then validate again.</small> : errorKind === "network" ? <small>Check the connection and retry; no import was committed.</small> : null}</div>{result ? <button type="button" className="button" onClick={() => reset(false)}>Done</button> : preview ? <button type="button" className="button" disabled={busy || !preview.canImport} onClick={() => void submit("confirm")}>{busy ? "Importing…" : "Confirm import"}</button> : <button type="button" className="button" disabled={busy || !file} onClick={() => void submit("preview")}>{busy ? "Validating…" : "Preview rows"}</button>}</footer>
      </section></div> : null}
  </>;
}
