"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentProofRecord, PaymentProofKey } from "@/lib/payment-proof-types";
import { prepareImageUpload } from "@/lib/image-upload";

type PaymentProofPayload = {
  assets: PaymentProofRecord[];
  summary: {
    required: number;
    uploaded: number;
    pending: number;
    complete: boolean;
    missingKeys: PaymentProofKey[];
  };
};

const uploadLabels: Record<PaymentProofKey, string> = {
  "advance-proof": "Advance proof",
  "balance-proof": "Balance proof"
};

async function fetchProofs() {
  const response = await fetch("/api/payment-proofs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load payment proofs");
  }
  return response.json() as Promise<PaymentProofPayload>;
}

async function uploadProof(key: PaymentProofKey, file: File) {
  const formData = new FormData();
  formData.append("key", key);
  formData.append("file", file);
  const response = await fetch("/api/payment-proofs", {
    method: "POST",
    body: formData
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Upload failed");
  }
  return result as { ok: true; proof: PaymentProofRecord };
}

export function PaymentProofConsole() {
  const [payload, setPayload] = useState<PaymentProofPayload | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<PaymentProofKey, File | null>>({
    "advance-proof": null,
    "balance-proof": null
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose a payment receipt, then upload it.");

  const assetsByKey = useMemo(
    () => Object.fromEntries((payload?.assets ?? []).map((asset) => [asset.key, asset])) as Record<PaymentProofKey, PaymentProofRecord | undefined>,
    [payload]
  );

  async function refresh() {
    setBusy(true);
    try {
      const nextPayload = await fetchProofs();
      setPayload(nextPayload);
      setMessage(nextPayload.summary.complete ? "Both payment receipts are uploaded." : "Upload the missing payment receipt shown below.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(key: PaymentProofKey) {
    const file = selectedFiles[key];
    if (!file) {
      setMessage(`Choose an image for ${uploadLabels[key].toLowerCase()} first.`);
      return;
    }

    setBusy(true);
    try {
      const prepared = await prepareImageUpload(file);
      const result = await uploadProof(key, prepared.file);
      setSelectedFiles((current) => ({ ...current, [key]: null }));
      setMessage(
        prepared.compressed
          ? `${result.proof.label} uploaded after trimming the image for a safer upload.`
          : `${result.proof.label} uploaded.`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
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
        <div className="eyebrow">Payment receipts</div>
        <h2>Upload proof of payment</h2>
        <p className="subtle">First upload the advance receipt. After the final payment, upload the balance receipt.</p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.required ?? 2}</span>
            <span className="stat-label">receipts needed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.uploaded ?? 0}</span>
            <span className="stat-label">receipts uploaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.pending ?? 2}</span>
            <span className="stat-label">still needed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.complete ? "Yes" : "No"}</span>
            <span className="stat-label">all uploaded</span>
          </div>
        </div>
        <div className="hero-actions" style={{ marginTop: 16 }}>
          <a href="/crm" className="button">
            Open CRM
          </a>
          <a href="/ops" className="button-secondary">
            Open ops console
          </a>
          <button type="button" className="button-secondary" onClick={refresh} disabled={busy}>
            Refresh proofs
          </button>
        </div>

        <div className="two-col" style={{ marginTop: 16 }}>
          {(Object.keys(uploadLabels) as PaymentProofKey[]).map((key) => {
            const asset = assetsByKey[key];
            const file = selectedFiles[key];
            return (
              <div key={key} className="panel">
                <div className="panel-head">
                  <div>
                    <strong>{uploadLabels[key]}</strong>
                    <div className="meta">{asset ? `Uploaded ${new Date(asset.uploadedAt).toLocaleString()}` : "Waiting for upload"}</div>
                  </div>
                  <span className={`tag ${asset ? "good" : "warn"}`}>{asset ? "Ready" : "Pending"}</span>
                </div>
                {asset?.url && asset.mimeType !== "application/pdf" ? (
                  <img
                    src={asset.url}
                    alt={asset.label}
                    style={{ width: "100%", marginTop: 12, borderRadius: 16, border: "1px solid var(--line)" }}
                  />
                ) : asset?.url ? (
                  <a className="button-secondary" href={asset.url} target="_blank" rel="noreferrer" style={{ marginTop: 12 }}>Open uploaded PDF</a>
                ) : (
                  <div
                    style={{
                      marginTop: 12,
                      minHeight: 180,
                      border: "1px dashed var(--line-strong)",
                      borderRadius: 16,
                      display: "grid",
                      placeItems: "center",
                      padding: 20,
                      color: "var(--muted)",
                      background: "rgba(255,255,255,0.54)",
                      textAlign: "center"
                    }}
                  >
                    No screenshot uploaded yet
                  </div>
                )}
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor={`proof-${key}`}>Choose {uploadLabels[key].toLowerCase()}</label>
                  <input
                    id={`proof-${key}`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    disabled={busy}
                    onChange={(event) => setSelectedFiles((current) => ({ ...current, [key]: event.target.files?.[0] ?? null }))}
                  />
                </div>
                <div className="workflow" style={{ marginTop: 10 }}>
                  <button type="button" className="button-secondary" onClick={() => handleUpload(key)} disabled={busy || !file}>
                    {asset ? "Replace receipt" : "Upload receipt"}
                  </button>
                  {file ? <span className="pill">Selected: {file.name}</span> : null}
                </div>
                {asset ? <details style={{ marginTop: 10 }}><summary>File details</summary><span className="meta">{asset.fileName}{asset.sizeBytes ? ` · ${Math.ceil(asset.sizeBytes / 1024)} KB` : ""}</span>{asset.checksumSha256 ? <span className="meta">File fingerprint: {asset.checksumSha256}</span> : null}</details> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card span-4">
        <div className="eyebrow">Your next step</div>
        <h2>{payload?.summary.complete ? "Receipts are complete" : "Upload the missing receipt"}</h2>
        <div className="list" style={{ marginTop: 14 }}>
          {(Object.keys(uploadLabels) as PaymentProofKey[]).map((key) => {
            const asset = assetsByKey[key];
            return (
              <div key={key} className="list-item">
                <strong>{uploadLabels[key]}</strong>
                <span className={`tag ${asset ? "good" : "warn"}`}>{asset ? "Uploaded" : "Missing"}</span>
                <span className="meta">{asset ? asset.fileName : "No proof uploaded yet"}</span>
              </div>
            );
          })}
        </div>
        <div className="panel" style={{ marginTop: 14 }}>
          <strong>Why this is needed</strong>
          <div className="meta" style={{ marginTop: 6 }}>
            The advance receipt opens the case. The balance receipt lets the report move to final approval.
          </div>
        </div>
        <div className="footer-note" role="status" aria-live="polite">{message}</div>
      </div>
    </section>
  );
}
