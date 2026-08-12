"use client";

import { useEffect, useState } from "react";
import type { FounderProposalClientProjection } from "@/lib/commercial-document-renderer";

type Loaded = { proposal: FounderProposalClientProjection; acceptanceDeclaration: { exactText: string; checkboxLabel?: string; typedConfirmationPhrase?: string } };
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);

export function CommercialProposalClient({ token }: { token: string }) {
  const [loaded, setLoaded] = useState<Loaded>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(true); const [result, setResult] = useState("");
  const [response, setResponse] = useState<"ACCEPTED" | "CHANGES_REQUESTED" | "DECLINED">("ACCEPTED");
  async function load() { setBusy(true); setError(""); try { const request = await fetch(`/api/public/proposals/${encodeURIComponent(token)}`, { cache: "no-store" }); const body = await request.json(); if (!request.ok) throw new Error(body.error); setLoaded(body); } catch (caught) { setError(caught instanceof Error ? caught.message : "This proposal is unavailable."); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, [token]);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); try { const request = await fetch(`/api/public/proposals/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response, fullName: form.get("fullName"), acceptanceChecked: form.get("acceptanceChecked") === "on", typedConfirmation: form.get("typedConfirmation"), organisationName: form.get("organisationName"), designation: form.get("designation"), requestedChanges: form.get("requestedChanges"), idempotencyKey: `proposal-response:${crypto.randomUUID()}` }) }); const body = await request.json(); if (!request.ok) throw new Error(body.error); setResult(`Your response ${body.response.response.replaceAll("_", " ").toLowerCase()} was recorded against the exact proposal version.`); } catch (caught) { setError(caught instanceof Error ? caught.message : "Your response was not recorded. Retry safely."); } finally { setBusy(false); } }
  if (busy && !loaded) return <section className="public-proposal-state" role="status"><h1>Opening your proposal…</h1><p>The secure version is being verified.</p></section>;
  if (error && !loaded) return <section className="public-proposal-state" role="alert"><h1>Proposal unavailable</h1><p>{error}</p><button type="button" onClick={load}>Try again</button></section>;
  if (!loaded) return null;
  const { proposal, acceptanceDeclaration } = loaded;
  return <article className="public-proposal-surface">
    <header><span>UCHIT VASTU INDIA</span><h1>Commercial proposal</h1><p>Version {proposal.proposalVersion} · {proposal.client.name}</p></header>
    <section><h2>Client and project</h2><p>{proposal.client.permanentClientId} · {proposal.project.kind.replaceAll("_", " ")} · {proposal.project.serviceType.replaceAll("_", " ")}</p></section>
    <section><h2>Scope</h2><ol>{proposal.scopeItems.map((item) => <li key={`${item.order}-${item.title}`}><strong>{item.title}</strong> <span>{item.status.replaceAll("_", " ")}</span></li>)}</ol></section>
    <section><h2>Commercials</h2><dl><div><dt>Professional fee</dt><dd>{money(proposal.commercial.professionalFeePaise)}</dd></div><div><dt>GST</dt><dd>{(proposal.commercial.gstAppliedBasisPoints / 100).toFixed(2)}% · {money(proposal.commercial.gstAmountPaise)}</dd></div><div><dt>Total payable</dt><dd>{money(proposal.commercial.totalPayablePaise)}</dd></div><div><dt>Agreed advance</dt><dd>{money(proposal.commercial.agreedAdvancePaise)}</dd></div></dl></section>
    <section><h2>Professional boundaries</h2><p>{proposal.professionalBoundaries}</p><h2>Cancellation, refund and delay policy</h2><p>{proposal.cancellationRefundDelayPolicy}</p></section>
    <a className="button-secondary" href={`/api/public/proposals/${encodeURIComponent(token)}/pdf`}>Download proposal PDF</a>
    <form onSubmit={submit} className="proposal-response-form">
      <h2>Your response</h2>
      <div className="proposal-response-choice"><label><input type="radio" name="response" checked={response === "ACCEPTED"} onChange={() => setResponse("ACCEPTED")} /> Accept proposal</label><label><input type="radio" name="response" checked={response === "CHANGES_REQUESTED"} onChange={() => setResponse("CHANGES_REQUESTED")} /> Request changes</label><label><input type="radio" name="response" checked={response === "DECLINED"} onChange={() => setResponse("DECLINED")} /> Decline</label></div>
      <label>Full name<input name="fullName" required /></label>
      {response === "ACCEPTED" ? <><p>{acceptanceDeclaration.exactText}</p><label className="checkbox-row"><input type="checkbox" name="acceptanceChecked" required /> {acceptanceDeclaration.checkboxLabel}</label><label>Type the approved confirmation phrase<input name="typedConfirmation" required autoComplete="off" /></label>{proposal.project.kind === "COMMERCIAL" ? <><label>Organisation<input name="organisationName" required /></label><label>Designation<input name="designation" required /></label></> : null}</> : null}
      {response === "CHANGES_REQUESTED" ? <label>Requested changes<textarea name="requestedChanges" required /></label> : null}
      {error ? <p role="alert" className="error-text">{error}</p> : null}{result ? <p role="status" className="success-text">{result}</p> : null}
      <button type="submit" disabled={busy}>{busy ? "Recording…" : "Record response"}</button>
    </form>
  </article>;
}
