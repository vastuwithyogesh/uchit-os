"use client";

import { useMemo, useState } from "react";
import { APPROVED_BROCHURE_TITLES, renderFounderTemplate, type FounderTemplateKey, type TemplateValues } from "@/lib/founder-communication-templates";

type Prepared = { id: string; recordVersion: number };
type Props = {
  leadName: string; email?: string; phone?: string; templateKey: FounderTemplateKey;
  serviceType?: keyof typeof APPROVED_BROCHURE_TITLES; secureBrochureLink?: string;
  qualificationTitle?: string; secureOnlineFormLink?: string; securePdfLink?: string;
  onClose: () => void; onPrepare: (channel: "WHATSAPP" | "EMAIL", values: TemplateValues, idempotencyKey: string) => Promise<Prepared>;
  onOpened: (record: Prepared) => Promise<void>;
};

export function LeadCommunicationSheet(props: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Review both channels before opening your logged-in app.");
  const [prepared, setPrepared] = useState<{ WHATSAPP?: Prepared; EMAIL?: Prepared }>({});
  const [idempotencyKeys] = useState(() => ({ WHATSAPP: crypto.randomUUID(), EMAIL: crypto.randomUUID() }));
  const values = useMemo(() => ({
    "First Name": props.leadName.trim().split(/\s+/)[0] || props.leadName,
    "Service Title": props.serviceType ? APPROVED_BROCHURE_TITLES[props.serviceType] : "",
    "Secure Brochure Link": props.secureBrochureLink ?? "[Activate the approved brochure to create a secure 30-day link]",
    "Qualification Form Title": props.qualificationTitle ?? "[Choose the approved Residential, Commercial or Hybrid form]",
    "Secure Online Form Link": props.secureOnlineFormLink ?? "[Create a secure 14-day online-form link]",
    "Secure PDF Link": props.securePdfLink ?? "[Create a secure 14-day PDF link]",
  }), [props]);
  const rendered = useMemo(() => renderFounderTemplate(props.templateKey, values), [props.templateKey, values]);
  const blocked = props.templateKey === "BROCHURE" ? !props.secureBrochureLink : props.templateKey === "QUALIFICATION" ? !props.secureOnlineFormLink || !props.securePdfLink || !props.qualificationTitle : false;

  async function prepareBoth() {
    setBusy(true);
    try {
      const [whatsapp, email] = await Promise.allSettled([
        props.onPrepare("WHATSAPP", values, idempotencyKeys.WHATSAPP),
        props.onPrepare("EMAIL", values, idempotencyKeys.EMAIL),
      ]);
      setPrepared((current) => ({ ...current, ...(whatsapp.status === "fulfilled" ? { WHATSAPP: whatsapp.value } : {}), ...(email.status === "fulfilled" ? { EMAIL: email.value } : {}) }));
      if (whatsapp.status === "fulfilled" && email.status === "fulfilled") setMessage("Both channel drafts are PREPARED. Uchit has not sent either message.");
      else setMessage("One or more drafts could not be prepared. The successful channel is preserved; retry safely.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The message drafts could not be prepared."); }
    finally { setBusy(false); }
  }
  async function openChannel(channel: "WHATSAPP" | "EMAIL") {
    const record = prepared[channel]; if (!record || busy) return;
    setBusy(true);
    try {
      const url = channel === "WHATSAPP"
        ? `https://wa.me/${(props.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(rendered.whatsapp)}`
        : `mailto:${props.email ?? ""}?subject=${encodeURIComponent(rendered.emailSubject)}&body=${encodeURIComponent(rendered.email)}`;
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) throw new Error("The compose window was blocked. Allow pop-ups and retry; no OPENED state was recorded.");
      await props.onOpened(record);
      setMessage(`${channel === "WHATSAPP" ? "WhatsApp" : "Email"} was OPENED. Yogesh must review and press Send manually.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The compose action was not recorded. Retry safely.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="lead-move-layer"><button className="lead-drawer-backdrop" type="button" onClick={props.onClose} aria-label="Close communication review" />
    <section className="lead-communication-sheet" role="dialog" aria-modal="true" aria-labelledby="communication-review-title">
      <header><span className="eyebrow">Manual communication · template v1</span><h2 id="communication-review-title">Review both messages</h2><p>No message is sent automatically. OPENED only means the compose window was opened.</p></header>
      {blocked ? <div className="blocked-note" role="alert"><strong>Preparation blocked</strong><p>Activate the exact approved asset/form version and create the scoped secure link first.</p></div> : null}
      <div className="communication-previews"><details open><summary>WhatsApp · {prepared.WHATSAPP ? "PREPARED" : "NOT PREPARED"}</summary><pre>{rendered.whatsapp}</pre></details><details><summary>Email · {prepared.EMAIL ? "PREPARED" : "NOT PREPARED"}</summary><strong>{rendered.emailSubject}</strong><pre>{rendered.email}</pre></details></div>
      <p className="meta" role="status" aria-live="polite">{message}</p>
      <footer><button type="button" className="button" disabled={busy || blocked} onClick={() => void prepareBoth()}>{busy ? "Preparing…" : "Prepare WhatsApp & email"}</button>
        <button type="button" className="button-secondary" disabled={busy || !prepared.WHATSAPP || !props.phone} onClick={() => void openChannel("WHATSAPP")}>Open WhatsApp</button>
        <button type="button" className="button-secondary" disabled={busy || !prepared.EMAIL || !props.email} onClick={() => void openChannel("EMAIL")}>Open Email</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={props.onClose}>Close</button></footer>
    </section></div>;
}
