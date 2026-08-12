"use client";
import { useState } from "react";
import type { FounderStatutoryDocumentRecord } from "@/lib/domain";

export function FounderStatutoryReadinessCard({ status, blockers, documents, revision }: { status: "READY" | "REVIEW_REQUIRED"; blockers: string[]; documents: FounderStatutoryDocumentRecord[]; revision: number }) {
  const next = blockers[0];
  const actionable=documents.find((item)=>item.status!=="ISSUED"&&item.status!=="VOID"); const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState("");const [serviceSuppliedAt,setServiceSuppliedAt]=useState("");
  async function issue(){if(!actionable||status!=="READY")return;setBusy(true);setError("");setSuccess("");try{const response=await fetch("/api/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"founder-statutory-document-issue",actorRole:"SUPER_ADMIN",documentId:actionable.id,serviceSuppliedAt:actionable.kind==="TAX_INVOICE"&&serviceSuppliedAt?new Date(serviceSuppliedAt).toISOString():undefined,idempotencyKey:`statutory-issue-${actionable.id}-${actionable.recordVersion}`,expectedRecordVersion:actionable.recordVersion,expectedRevision:revision})});const payload=await response.json();if(!response.ok)throw new Error(response.status===409||response.status===428?`${payload.error} Reload the latest version and retry.`:payload.error||"Document issue failed.");setSuccess(`${actionable.kind.replaceAll("_"," ")} issued to private immutable storage. No delivery was claimed.`);}catch(cause){setError(cause instanceof Error?cause.message:"Document issue failed. Retry safely.");}finally{setBusy(false);}}
  return <section className="statutory-readiness-card" aria-labelledby="statutory-readiness-title">
    <div className="statutory-readiness-heading">
      <div><p className="eyebrow">Statutory documents</p><h2 id="statutory-readiness-title">Document readiness</h2></div>
      <span className={`status-pill ${status === "READY" ? "status-ready" : "status-attention"}`}>{status}</span>
    </div>
    <p>Prepare the exact recipient, tax, payment and asset inputs before issuing one immutable document.</p>
    <ol className="statutory-readiness-list">
      <li><strong>Identity</strong><span>Uchit Vastu India · GSTIN configured in the versioned policy</span></li>
      <li><strong>Recipient & billing</strong><span>{blockers.some((item) => item.includes("billing")) ? "Required" : "Complete"}</span></li>
      <li><strong>Tax & place of supply</strong><span>{blockers.some((item) => item.includes("accountant")) ? "Accountant approval required" : "Approved policy active"}</span></li>
      <li><strong>Payment reconciliation</strong><span>{documents.length ? `${documents.length} immutable document task(s)` : "No confirmed-payment document task yet"}</span></li>
      <li><strong>Logo & signature</strong><span>{blockers.some((item) => item.includes("logo") || item.includes("signature")) ? "Approved private assets required" : "Pinned assets ready"}</span></li>
    </ol>
    {next ? <div className="workspace-state workspace-state-attention" role="status"><strong>Next recovery action</strong><p>{next}</p></div> : <div className="statutory-issue-panel"><p className="success-message">All readiness inputs are available. Issue remains Founder-only and server validated.</p>{actionable?.kind==="TAX_INVOICE"?<label>Service supplied at<input type="datetime-local" value={serviceSuppliedAt} onChange={(event)=>setServiceSuppliedAt(event.target.value)} required /></label>:null}<button className="button-primary" type="button" onClick={issue} disabled={busy||!actionable}>{busy?"Issuing…":actionable?.status==="GENERATION_FAILED"?"Retry issue":"Issue document"}</button></div>}
    {error?<p className="error-message" role="alert">{error}</p>:null}{success?<p className="success-message" role="status">{success}</p>:null}
    <details><summary>Technical details</summary><p>Tax Invoice follows confirmed full payment and approved service-supply timing. Advance confirmation creates a GST Receipt Voucher task with a 60-minute deadline. Issued bytes and fiscal-year numbers are immutable.</p></details>
  </section>;
}
