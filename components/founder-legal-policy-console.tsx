"use client";

import { useState } from "react";
import type { FounderCommercialLegalPolicyRecord } from "@/lib/domain";

const requiredPolicies = [
  { kind: "PROFESSIONAL_BOUNDARIES", label: "P5 · Core Professional Boundaries" },
  { kind: "ACCEPTANCE_DECLARATION", label: "P13 · Client Acceptance Declaration" },
  { kind: "CANCELLATION_REFUND_DELAY", label: "P14 · Cancellation, Refund and Delay Policy" }
] as const;

export function FounderLegalPolicyConsole({ policies, revision }: { policies: FounderCommercialLegalPolicyRecord[]; revision: number }) {
  const [records, setRecords] = useState(policies); const [currentRevision, setCurrentRevision] = useState(revision); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function action(payload: Record<string, unknown>) {
    setBusy(String(payload.action)); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, actorRole: "SUPER_ADMIN", expectedRevision: currentRevision, idempotencyKey: `${String(payload.action)}:${crypto.randomUUID()}` }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "The legal policy action failed.");
      if (body.policy) setRecords((current) => { const next = current.filter((item) => item.id !== body.policy.id); return [...next, body.policy]; }); setCurrentRevision((value) => value + 1);
      setSuccess("Policy state saved. No proposal lifecycle step was advanced.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The legal policy action failed."); }
    finally { setBusy(""); }
  }
  return <section className="commercial-policy-console" aria-labelledby="founder-legal-policy-title">
    <div><span className="eyebrow">Founder governance</span><h2 id="founder-legal-policy-title">Commercial and legal policies</h2><p>Canonical source text is materialised as an immutable reviewable version. Approval and activation remain separate owner actions.</p></div>
    <div className="commercial-policy-list">{requiredPolicies.map(({ kind, label }) => { const versions = records.filter((item) => item.kind === kind).sort((a, b) => b.version - a.version); const policy = versions[0]; const canCreateSuccessor = kind === "CANCELLATION_REFUND_DELAY" && policy?.version === 1 && policy.status !== "ACTIVE"; return <article key={kind} className="commercial-policy-card"><div className="commercial-policy-heading"><div><strong>{label}</strong><span>{policy ? `Version ${policy.version} · ${policy.status.replaceAll("_", " ")}` : "No persisted version"}</span></div>{policy?.status === "ACTIVE" ? <span className="status-pill status-approved">ACTIVE</span> : null}</div>{policy ? <><dl><div><dt>Policy ID</dt><dd>{policy.id}</dd></div><div><dt>Content hash</dt><dd>{policy.contentHash}</dd></div><div><dt>Source</dt><dd>Canonical Uchit product authority</dd></div><div><dt>Created</dt><dd>{policy.createdAt}</dd></div></dl><details><summary>View exact policy wording</summary><pre>{policy.exactText}</pre></details><div className="hero-actions"><button type="button" disabled={Boolean(busy) || policy.status !== "DRAFT"} onClick={() => void action({ action: "founder-legal-policy-approve", policyId: policy.id, reason: "Founder owner reviewed the exact canonical policy text.", expectedRecordVersion: policy.recordVersion })}>Approve exact version</button><button type="button" className="button-secondary" disabled={Boolean(busy) || policy.status !== "FOUNDER_APPROVED"} onClick={() => void action({ action: "founder-legal-policy-activate", policyId: policy.id, reason: "Founder owner activated the approved canonical policy version.", expectedRecordVersion: policy.recordVersion })}>Activate exact version</button>{canCreateSuccessor ? <button type="button" className="button-secondary" disabled={Boolean(busy)} onClick={() => void action({ action: "founder-legal-policy-version-create-from-canonical", kind, reason: "Materialise the owner-approved P14 successor canonical policy source for Founder review.", expectedRecordVersion: policy.recordVersion })}>Materialise P14 successor version</button> : null}</div></> : <button type="button" disabled={Boolean(busy)} onClick={() => void action({ action: "founder-legal-policy-version-create-from-canonical", kind, reason: "Materialise the checked-in canonical policy source for Founder owner review.", expectedRecordVersion: 0 })}>Materialise canonical version</button>}</article>; })}</div>
    {error ? <div className="workspace-state state-error" role="alert"><strong>Nothing else changed</strong><p>{error}</p></div> : null}{success ? <p className="success-text" role="status">{success}</p> : null}
  </section>;
}
