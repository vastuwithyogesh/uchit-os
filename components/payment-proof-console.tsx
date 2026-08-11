"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentProofRecord, PaymentProofKey } from "@/lib/payment-proof-types";
import { prepareImageUpload } from "@/lib/image-upload";
import type { AppState } from "@/lib/store";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { FounderStepCard } from "@/components/founder-step-card";

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

type PaymentContext = { clientId: string; proposalId?: string; caseId?: string };

async function fetchProofs(context: PaymentContext) {
  const query = new URLSearchParams({ clientId: context.clientId });
  if (context.proposalId) query.set("proposalId", context.proposalId);
  if (context.caseId) query.set("caseId", context.caseId);
  const response = await fetch(`/api/payment-proofs?${query.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load payment proofs");
  }
  return response.json() as Promise<PaymentProofPayload>;
}

async function uploadProof(key: PaymentProofKey, file: File, context: PaymentContext) {
  const formData = new FormData();
  formData.append("key", key);
  formData.append("file", file);
  formData.append("clientId", context.clientId);
  if (key === "advance-proof" && context.proposalId) formData.append("proposalId", context.proposalId);
  if (key === "balance-proof" && context.caseId) formData.append("caseId", context.caseId);
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
  const [appState, setAppState] = useState<AppState | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
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
  const boundProofIds = useMemo(
    () => new Set([
      ...(appState?.payments ?? []).map((payment) => payment.proofAssetId),
      ...(appState?.advanceVerifications ?? []).map((verification) => verification.proofAssetId)
    ].filter(Boolean)),
    [appState]
  );

  const activeClient = appState?.clients.find((item) => item.id === selectedClientId) ?? appState?.clients[0];
  const activeProposal = appState?.commercialProposals.find((item) => item.clientId === activeClient?.id);
  const activeCase = appState && activeClient ? getActiveCaseForClient(appState, activeClient.id) : undefined;
  const context = activeClient ? { clientId: activeClient.id, proposalId: activeProposal?.id, caseId: activeCase?.id } : null;

  async function refresh(preferredClientId?: string) {
    setBusy(true);
    try {
      const stateResponse = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!stateResponse.ok) throw new Error("Failed to load clients and cases");
      const nextState = await stateResponse.json() as AppState;
      const nextClientId = preferredClientId || selectedClientId || nextState.clients[0]?.id || "";
      setAppState(nextState);
      setSelectedClientId(nextClientId);
      const client = nextState.clients.find((item) => item.id === nextClientId) ?? nextState.clients[0];
      const proposal = nextState.commercialProposals.find((item) => item.clientId === client?.id);
      const caseRecord = client ? getActiveCaseForClient(nextState, client.id) : undefined;
      if (!client || (!proposal && !caseRecord)) {
        setPayload({ assets: [], summary: { required: 0, uploaded: 0, pending: 0, complete: false, missingKeys: [] } });
        setMessage("Open a proposal or case before uploading payment receipts.");
        return;
      }
      const nextPayload = await fetchProofs({ clientId: client.id, proposalId: proposal?.id, caseId: caseRecord?.id });
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
    if (!file || !context || (key === "advance-proof" && !context.proposalId) || (key === "balance-proof" && !context.caseId)) {
      setMessage(`Choose an image for ${uploadLabels[key].toLowerCase()} first.`);
      return;
    }

    setBusy(true);
    try {
      const prepared = await prepareImageUpload(file);
      const result = await uploadProof(key, prepared.file, context);
      setSelectedFiles((current) => ({ ...current, [key]: null }));
      setMessage(
        prepared.compressed
          ? `${result.proof.label} uploaded after trimming the image for a safer upload.`
          : `${result.proof.label} uploaded.`
      );
      await refresh(context.clientId);
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
      <div className="card span-8 founder-work-surface">
        <div className="founder-context-bar" aria-label="Current payment context"><span>Payments</span><span aria-hidden="true">→</span><strong>{activeClient?.displayName ?? "Choose a client"}</strong><span aria-hidden="true">→</span><span>{payload?.summary.complete ? "Complete" : "Receipts"}</span></div>
        <FounderStepCard
          step="Current payment task"
          title={payload?.summary.complete ? "Receipts are complete" : activeProposal ? "Secure the next payment checkpoint" : "Start with the advance receipt"}
          description="Upload immutable evidence for one payment checkpoint at a time. Verification remains a separate protected action."
          tone={payload?.summary.complete ? "approved" : payload?.summary.uploaded ? "attention" : "neutral"}
          status={payload?.summary.complete ? "Complete" : `${payload?.summary.pending ?? 0} pending`}
          className="founder-step-card-primary"
        >
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="payment-proof-client">Client</label>
          <select id="payment-proof-client" value={activeClient?.id ?? ""} onChange={(event) => {
            setSelectedFiles({ "advance-proof": null, "balance-proof": null });
            void refresh(event.target.value);
          }}>
            {(appState?.clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.displayName}</option>)}
          </select>
        </div>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.required ?? 0}</span>
            <span className="stat-label">receipts needed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.uploaded ?? 0}</span>
            <span className="stat-label">receipts uploaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.pending ?? 0}</span>
            <span className="stat-label">still needed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{payload?.summary.complete ? "Yes" : "No"}</span>
            <span className="stat-label">all uploaded</span>
          </div>
        </div>
        <div className="hero-actions" style={{ marginTop: 16 }}>
          <a href="/crm" className="button-secondary">
            Open CRM
          </a>
          <a href="/ops" className="button-secondary">
            Open ops console
          </a>
          <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={busy}>
            Refresh proofs
          </button>
        </div>

        <div className="two-col" style={{ marginTop: 16 }}>
          {(Object.keys(uploadLabels) as PaymentProofKey[]).map((key) => {
            const asset = assetsByKey[key];
            const file = selectedFiles[key];
            const isVerified = Boolean(asset?.id && boundProofIds.has(asset.id));
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
                    disabled={busy || isVerified || (key === "advance-proof" ? !activeProposal : !activeCase)}
                    onChange={(event) => setSelectedFiles((current) => ({ ...current, [key]: event.target.files?.[0] ?? null }))}
                  />
                </div>
                <div className="workflow" style={{ marginTop: 10 }}>
                  <button type="button" className="button-secondary" onClick={() => handleUpload(key)} disabled={busy || isVerified || !file || (key === "advance-proof" ? !activeProposal : !activeCase)}>
                    {isVerified ? "Verified receipt locked" : asset ? "Replace receipt" : "Upload receipt"}
                  </button>
                  {file ? <span className="pill">Selected: {file.name}</span> : null}
                </div>
                {asset ? <details style={{ marginTop: 10 }}><summary>File details</summary><span className="meta">{asset.fileName}{asset.sizeBytes ? ` · ${Math.ceil(asset.sizeBytes / 1024)} KB` : ""}</span></details> : null}
              </div>
            );
          })}
        </div>
        </FounderStepCard>
      </div>

      <div className="card span-4 founder-support-surface">
        <div className="eyebrow">Your next step</div>
        <h2>{payload?.summary.complete ? "Receipts are complete" : "Upload the missing receipt"}</h2>
        <p className="meta">For safety, the person who uploads a receipt must be different from the administrator who verifies it.</p>
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
