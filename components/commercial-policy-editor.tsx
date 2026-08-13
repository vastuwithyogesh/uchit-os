"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };

class ActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function CommercialPolicyEditor() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading commercial policy...");
  const [proposal, setProposal] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [qualificationMinutes, setQualificationMinutes] = useState(0);
  const [dueSoonHours, setDueSoonHours] = useState(0);
  const [reviewMinutes, setReviewMinutes] = useState(0);
  const [reason, setReason] = useState("");
  const key = useRef(crypto.randomUUID());

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Commercial policy could not be loaded.");
      const next = await response.json() as Bootstrap;
      setState(next);
      const policy = next.commercialPolicy;
      setProposal(policy.defaultProposalAmountInr);
      setAdvance(policy.minimumAdvanceInr);
      setQualificationMinutes(policy.qualificationCallTargetMinutes);
      setDueSoonHours(policy.nextActionDueSoonHours);
      setReviewMinutes(policy.defaultReviewCallMinutes);
      setReason("");
      key.current = crypto.randomUUID();
      setMessage("Commercial policy is up to date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commercial policy could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const policy = state?.commercialPolicy;
  const editable = activeUser.role === "SUPER_ADMIN";
  const valid = proposal >= 1 && advance >= 1 && advance <= proposal && qualificationMinutes >= 1 && dueSoonHours >= 1 && reviewMinutes >= 5 && reason.trim().length >= 20 && reason.trim().length <= 500;

  async function save() {
    if (!state || !policy || !editable || !valid) return;
    if (!window.confirm("Publish this commercial policy? It will affect new proposals and calls only.")) return;
    setBusy(true);
    try {
      const payload = {
        action: "commercial-policy-update",
        defaultProposalAmountInr: proposal,
        minimumAdvanceInr: advance,
        qualificationCallTargetMinutes: qualificationMinutes,
        nextActionDueSoonHours: dueSoonHours,
        defaultReviewCallMinutes: reviewMinutes,
        reason,
        idempotencyKey: key.current,
        expectedPolicyVersion: policy.version,
        expectedRevision: state.persistenceRevision ?? null,
      };
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "Policy could not be published.", response.status);
      await refresh();
      setMessage("Commercial policy published.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("The policy changed while you were editing. Your form is still here. Reload, compare the latest version, then save again.");
      else if (error instanceof ActionError && error.status === 428) setMessage("The workspace version is missing. Your form is still here. Reload before saving.");
      else setMessage(error instanceof Error ? error.message : "Policy could not be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card span-12" aria-labelledby="policy-title">
      <div className="eyebrow">Commercial policy</div>
      <h2 id="policy-title">Current policy v{policy?.version ?? "—"}</h2>
      <p className="subtle">Changes affect new proposals and calls only. Existing proposal-specific amounts and terms remain fixed.</p>
      {editable ? <>
        <div className="two-col">
          <div className="field"><label htmlFor="policy-proposal">Default proposal amount (₹)</label><input id="policy-proposal" type="number" min="1" value={proposal} onChange={(event) => setProposal(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="policy-advance">Suggested reference advance (₹)</label><input id="policy-advance" type="number" min="1" value={advance} onChange={(event) => setAdvance(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="policy-qualification">Qualification call target (minutes)</label><input id="policy-qualification" type="number" min="1" max="1440" value={qualificationMinutes} onChange={(event) => setQualificationMinutes(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="policy-due-soon">Next task due-soon window (hours)</label><input id="policy-due-soon" type="number" min="1" max="720" value={dueSoonHours} onChange={(event) => setDueSoonHours(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="policy-review">Review call duration (minutes)</label><input id="policy-review" type="number" min="5" max="480" value={reviewMinutes} onChange={(event) => setReviewMinutes(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="policy-reason">Why is this changing? (20–500 characters)</label><textarea id="policy-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></div>
        </div>
        <div className="workflow"><button type="button" className="button" disabled={busy || !valid} onClick={() => void save()}>Publish policy</button><button type="button" className="button-secondary" disabled={busy} onClick={() => void refresh()}>Reload latest</button></div>
      </> : <div className="panel"><strong>Super-Admin required</strong><p className="meta">Administrators can review policy but cannot change commercial defaults.</p><div className="list"><span>Default proposal: ₹{policy?.defaultProposalAmountInr.toLocaleString("en-IN")}</span><span>Suggested reference advance: ₹{policy?.minimumAdvanceInr.toLocaleString("en-IN")}</span><span>Qualification target: {policy?.qualificationCallTargetMinutes} minutes</span><span>Due-soon window: {policy?.nextActionDueSoonHours} hours</span><span>Review call: {policy?.defaultReviewCallMinutes} minutes</span></div></div>}
      <p className="meta">Updated {policy?.updatedAt ? new Date(policy.updatedAt).toLocaleString() : "not recorded"}</p>
      <details><summary>Recent policy reasons</summary>{(state?.commercialPolicyHistory ?? []).slice(0, 5).map((item) => <p className="meta" key={`${item.version}-${item.updatedAt}`}>v{item.version} · {item.updatedAt.slice(0, 10)} · {item.reason}</p>)}</details>
      <div className="footer-note" role={message.includes("could not") || message.includes("changed") || message.includes("missing") ? "alert" : "status"} aria-live="polite">{message}</div>
    </section>
  );
}
