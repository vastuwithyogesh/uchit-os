"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PaymentProofRecord, PaymentProofKey } from "@/lib/payment-proof-types";
import { prepareImageUpload } from "@/lib/image-upload";
import type { AppState } from "@/lib/store";
import { FounderStepCard } from "@/components/founder-step-card";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

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

export function PaymentProofConsole({ focus = "all", clientId: initialClientId, caseId: requestedCaseId }: { focus?: "all" | "balance"; clientId?: string; caseId?: string }) {
  const { activeUser } = useSession();
  const router = useRouter();
  const [appState, setAppState] = useState<AppState | null>(null);
  const [payload, setPayload] = useState<PaymentProofPayload | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<PaymentProofKey, File | null>>({
    "advance-proof": null,
    "balance-proof": null
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Choose a payment receipt, then upload it.");
  const [balanceAmount, setBalanceAmount] = useState(0);
  const verificationKey = useRef(crypto.randomUUID());

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

  const activeCase = appState?.vastuCases.find((item) => item.id === requestedCaseId && (!initialClientId || item.clientId === initialClientId));
  const activeClient = appState?.clients.find((item) => item.id === activeCase?.clientId);
  const activeProposal = appState?.commercialProposals.find((item) => item.clientId === activeClient?.id);
  const advancePayment = appState?.payments.find((item) => item.clientId === activeClient?.id && item.type === "ADVANCE");
  const balancePayment = appState?.payments.find((item) => item.caseId === activeCase?.id && item.type === "BALANCE");
  const context = activeClient ? { clientId: activeClient.id, proposalId: activeProposal?.id, caseId: activeCase?.id } : null;
  const balanceConfirmed = balancePayment?.status === "APPROVED";

  useEffect(() => {
    const fee = activeProposal?.amountInr ?? appState?.commercialPolicy.defaultProposalAmountInr ?? 0;
    const advance = advancePayment?.amountInr ?? activeProposal?.minAdvanceInr ?? appState?.commercialPolicy.minimumAdvanceInr ?? 0;
    setBalanceAmount(Math.max(0, fee - advance));
  }, [activeClient?.id, activeProposal?.id, activeProposal?.amountInr, advancePayment?.amountInr, appState?.commercialPolicy]);

  async function refresh() {
    setBusy(true);
    try {
      const stateResponse = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!stateResponse.ok) throw new Error("Failed to load clients and cases");
      const nextState = await stateResponse.json() as AppState;
      setAppState(nextState);
      const caseRecord = nextState.vastuCases.find((item) => item.id === requestedCaseId && (!initialClientId || item.clientId === initialClientId));
      const client = nextState.clients.find((item) => item.id === caseRecord?.clientId);
      const proposal = nextState.commercialProposals.find((item) => item.clientId === client?.id);
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
      await refresh();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyBalance() {
    const proof = assetsByKey["balance-proof"];
    if (!appState || !activeClient || !activeCase || !proof || balanceAmount < 1) {
      setMessage("Upload the exact balance proof and enter the reconciled amount before verification.");
      return;
    }
    if (!window.confirm("Confirm this balance payment? This immutable approval unlocks the official report gates for this case.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "balance-proof-verify", clientId: activeClient.id, caseId: activeCase.id, amountInr: balanceAmount, proofId: proof.id,
        idempotencyKey: verificationKey.current, expectedRecordVersion: activeCase.recordVersion ?? 0, expectedRevision: appState.persistenceRevision ?? null,
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "Balance verification failed.");
      verificationKey.current = crypto.randomUUID();
      setMessage("Balance confirmed. The Founder report gates can now continue.");
      await refresh();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Balance verification failed. Your selected proof remains available.");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
  }, []);

  const proofKeys = (focus === "balance" ? ["balance-proof"] : Object.keys(uploadLabels)) as PaymentProofKey[];

  return (
    <section className={`section-grid payment-proof-workspace payment-focus-${focus}`}>
      <div className="card span-8 founder-work-surface">
        <div className="founder-context-bar" aria-label="Current payment context"><span>Payments</span><span aria-hidden="true">→</span><strong>{activeClient?.displayName ?? "Choose a client"}</strong><span aria-hidden="true">→</span><span>{payload?.summary.complete ? "Complete" : "Receipts"}</span></div>
        <FounderStepCard
          step="Current payment task"
          title={focus === "balance" ? balanceConfirmed ? "Full balance is confirmed" : "Confirm the full balance" : payload?.summary.complete ? "Receipts are complete" : activeProposal ? "Secure the next payment checkpoint" : "Start with the advance receipt"}
          description="Upload immutable evidence for one payment checkpoint at a time. Verification remains a separate protected action."
          tone={focus === "balance" ? balanceConfirmed ? "approved" : "attention" : payload?.summary.complete ? "approved" : payload?.summary.uploaded ? "attention" : "neutral"}
          status={focus === "balance" ? balanceConfirmed ? "Complete" : "Payment gate" : payload?.summary.complete ? "Complete" : `${payload?.summary.pending ?? 0} pending`}
          className="founder-step-card-primary"
        >
        <div className="founder-context-bar" style={{ marginTop: 16 }} aria-label="Locked payment context"><strong>{activeCase?.caseNumber ?? "Case unavailable"}</strong><span>{activeClient?.displayName ?? "Client unavailable"}</span><button type="button" className="button-secondary" onClick={() => void refresh()} disabled={busy}>Refresh proofs</button></div>
        {(!activeCase || !activeClient) && <p role="alert">The authorised Case and Client context is unavailable. Re-select the case before handling payment evidence.</p>}
        {focus === "balance" ? <details className="founder-technical-details"><summary>Payment status details</summary><div className="stat-grid details-body">{[
          [payload?.summary.required ?? 0, "receipts needed"],
          [payload?.summary.uploaded ?? 0, "receipts uploaded"],
          [payload?.summary.pending ?? 0, "still needed"],
          [payload?.summary.complete ? "Yes" : "No", "all uploaded"]
        ].map(([value, labelText]) => <div className="stat-card" key={labelText}><span className="stat-value">{value}</span><span className="stat-label">{labelText}</span></div>)}</div></details> : <div className="stat-grid" style={{ marginTop: 18 }}>
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
        </div>}
        <div className="hero-actions" style={{ marginTop: 16 }} hidden={focus !== "all"}>
          <a href="/crm" className="button-secondary">
            Open CRM
          </a>
          <a href="/clients-cases" className="button-secondary">
            Open Clients &amp; Cases
          </a>
          <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={busy}>
            Refresh proofs
          </button>
        </div>

        <div className="two-col" style={{ marginTop: 16 }}>
          {proofKeys.map((key) => {
            const asset = assetsByKey[key];
            const file = selectedFiles[key];
            const confirmedPayment = key === "balance-proof" ? balancePayment : advancePayment;
            const isVerified = Boolean(confirmedPayment?.status === "APPROVED" || (asset?.id && boundProofIds.has(asset.id)));
            return (
              <div key={key} className="panel">
                <div className="panel-head">
                  <div>
                    <strong>{uploadLabels[key]}</strong>
                    <div className="meta">{isVerified ? "Confirmed payment evidence is locked" : asset ? `Uploaded ${new Date(asset.uploadedAt).toLocaleString()}` : "Waiting for upload"}</div>
                  </div>
                  <span className={`tag ${isVerified || asset ? "good" : "warn"}`}>{isVerified ? "Verified" : asset ? "Ready" : "Pending"}</span>
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
                    {isVerified ? "Confirmed receipt remains in the immutable payment record" : "No screenshot uploaded yet"}
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
        {focus === "balance" ? <div className="focused-payment-verification"><label className="field"><span>Reconciled balance amount</span><input type="number" min={1} value={balanceAmount} onChange={(event) => setBalanceAmount(Number(event.target.value))} disabled={busy || balanceConfirmed} /></label><button type="button" className="button" disabled={busy || balanceConfirmed || !assetsByKey["balance-proof"] || activeCase?.stageAVerdictStatus !== "PRESENTED"} onClick={() => void verifyBalance()}>{busy ? "Confirming…" : balanceConfirmed ? "Balance confirmed" : "Confirm full balance"}</button><div className="footer-note" role={!balanceConfirmed && /failed|could not|upload|before/i.test(message) ? "alert" : "status"} aria-live="polite">{balanceConfirmed ? "Full balance confirmation is immutable and already bound to this exact Case." : message}</div></div> : null}
        </FounderStepCard>
      </div>

      <div className="card span-4 founder-support-surface">
        <div className="eyebrow">Your next step</div>
        <h2>{focus === "balance" && balanceConfirmed ? "Balance confirmation is complete" : payload?.summary.complete ? "Receipts are complete" : "Upload the missing receipt"}</h2>
        <p className="meta">Founder Edition permits the organisation owner to upload and confirm this checkpoint; the immutable approval remains auditable.</p>
        {focus === "balance" ? <details className="founder-technical-details"><summary>Receipt history and gate context</summary><div className="details-body"><div className="list">{proofKeys.map((key) => {
          const asset = assetsByKey[key];
          const confirmed = key === "balance-proof" ? balanceConfirmed : advancePayment?.status === "APPROVED";
          return <div key={key} className="list-item"><strong>{uploadLabels[key]}</strong><span className={`tag ${asset || confirmed ? "good" : "warn"}`}>{confirmed ? "Verified" : asset ? "Uploaded" : "Missing"}</span><span className="meta">{asset ? asset.fileName : confirmed ? "Immutable confirmed payment record" : "No proof uploaded yet"}</span></div>;
        })}</div><div className="panel"><strong>Why this is needed</strong><div className="meta" style={{ marginTop: 6 }}>The advance receipt opens the case. The balance receipt lets the report move to final approval.</div></div></div></details> : <><div className="list" style={{ marginTop: 14 }}>
          {proofKeys.map((key) => {
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
        </div></>}
        <div className="footer-note" role="status" aria-live="polite">{message}</div>
      </div>
    </section>
  );
}
