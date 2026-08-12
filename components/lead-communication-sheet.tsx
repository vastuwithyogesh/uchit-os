"use client";

import { useMemo, useState } from "react";
import { APPROVED_BROCHURE_TITLES, renderFounderTemplate, type FounderTemplateKey, type TemplateValues } from "@/lib/founder-communication-templates";
import { buildGmailComposeUrl, buildMailtoComposeUrl, normaliseManualEmail } from "@/lib/founder-manual-compose";

type Prepared = { id: string; recordVersion: number };
export type CommunicationContext = { valuesPatch?: TemplateValues; assetVersionIds?: string[]; formDefinitionId?: string; grantIds?: string[] };
type Props = {
  leadName: string; email?: string; phone?: string; templateKey: FounderTemplateKey;
  serviceType?: keyof typeof APPROVED_BROCHURE_TITLES; secureBrochureLink?: string;
  qualificationTitle?: string; secureOnlineFormLink?: string; securePdfLink?: string;
  qualificationKind?: "RESIDENTIAL" | "COMMERCIAL" | "HYBRID";
  onClose: () => void; onPrepareContext: (idempotencyKey: string, qualificationKind?: "RESIDENTIAL" | "COMMERCIAL" | "HYBRID") => Promise<CommunicationContext>;
  onPrepare: (channel: "WHATSAPP" | "EMAIL", values: TemplateValues, idempotencyKey: string, context?: CommunicationContext) => Promise<Prepared>;
  onOpened: (record: Prepared) => Promise<void>;
};

export function LeadCommunicationSheet(props: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Review both channels before opening your logged-in app.");
  const [prepared, setPrepared] = useState<{ WHATSAPP?: Prepared; EMAIL?: Prepared }>({});
  const [context, setContext] = useState<CommunicationContext>();
  const [qualificationKind, setQualificationKind] = useState<Props["qualificationKind"]>(props.qualificationKind);
  const [idempotencyKeys] = useState(() => ({ WHATSAPP: crypto.randomUUID(), EMAIL: crypto.randomUUID() }));
  const values = useMemo(() => ({
    "First Name": props.leadName.trim().split(/\s+/)[0] || props.leadName,
    "Service Title": props.serviceType ? APPROVED_BROCHURE_TITLES[props.serviceType] : "",
    "Secure Brochure Link": props.secureBrochureLink ?? "[Activate the approved brochure to create a secure 30-day link]",
    "Qualification Form Title": props.qualificationTitle ?? "[Choose the approved Residential, Commercial or Hybrid form]",
    "Secure Online Form Link": props.secureOnlineFormLink ?? "[Create a secure 14-day online-form link]",
    "Secure PDF Link": props.securePdfLink ?? "[Create a secure 14-day PDF link]",
    ...context?.valuesPatch,
  }), [props, context]);
  const rendered = useMemo(() => renderFounderTemplate(props.templateKey, values), [props.templateKey, values]);
  function normaliseWhatsAppPhone(value?: string) {
    const raw = (value ?? "").trim(); if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+") && digits.length >= 8) return digits;
    if (/^\d{10}$/.test(digits)) return `91${digits}`;
    if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`;
    return digits.length >= 8 ? digits : "";
  }
  const emailRecipient = normaliseManualEmail(props.email);
  const blocked = props.templateKey === "BROCHURE" ? !context && !props.secureBrochureLink : props.templateKey === "QUALIFICATION" ? !qualificationKind || (!context && (!props.secureOnlineFormLink || !props.securePdfLink || !props.qualificationTitle)) : false;

  async function prepareBoth() {
    setBusy(true);
    try {
      const resolvedContext = context ?? await props.onPrepareContext(`context-${crypto.randomUUID()}`, qualificationKind);
      setContext(resolvedContext);
      const resolvedValues = { ...values, ...resolvedContext.valuesPatch };
      // Each preparation is a protected, revisioned server mutation. Preparing in
      // parallel makes the second request stale as soon as the first persists.
      // Keep the channel records independent, but serialize this small pair so
      // onPrepare can obtain the latest revision before each mutation.
      let whatsapp: Prepared | undefined;
      let email: Prepared | undefined;
      let emailFailure: string | undefined;
      try {
        whatsapp = await props.onPrepare("WHATSAPP", resolvedValues, idempotencyKeys.WHATSAPP, resolvedContext);
        setPrepared((current) => ({ ...current, WHATSAPP: whatsapp }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : "WhatsApp could not be prepared.";
        setMessage(`WhatsApp draft could not be prepared: ${detail} Reload and retry.`);
        return;
      }
      try {
        email = await props.onPrepare("EMAIL", resolvedValues, idempotencyKeys.EMAIL, resolvedContext);
        setPrepared((current) => ({ ...current, EMAIL: email }));
      } catch (error) {
        emailFailure = error instanceof Error ? error.message : "Email could not be prepared.";
      }
      if (email) setMessage("Both channel drafts are PREPARED. Uchit has not sent either message.");
      else setMessage(`WhatsApp is PREPARED. Email is not ready: ${emailFailure} Reload and retry email preparation.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The message drafts could not be prepared."); }
    finally { setBusy(false); }
  }
  async function openChannel(channel: "WHATSAPP" | "EMAIL", emailMode: "GMAIL" | "MAILTO" = "GMAIL") {
    const record = prepared[channel]; if (!record || busy) return;
    setBusy(true);
    try {
      const url = channel === "WHATSAPP"
        ? `https://wa.me/${normaliseWhatsAppPhone(props.phone)}?text=${encodeURIComponent(rendered.whatsapp)}`
        : emailMode === "GMAIL"
          ? buildGmailComposeUrl({ email: emailRecipient, subject: rendered.emailSubject, body: rendered.email })
          : buildMailtoComposeUrl({ email: emailRecipient, subject: rendered.emailSubject, body: rendered.email });
      if (!url) throw new Error("A valid email address is required before a draft can be opened. Correct the lead profile and retry.");
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        if (channel !== "EMAIL") throw new Error("The compose window was blocked. Allow pop-ups and retry; no OPENED state was recorded.");
        // The authenticated in-app browser blocks secondary windows. This is still
        // a user-initiated compose action, so record OPENED and hand the draft to
        // the configured compose target in the current tab instead of leaving an
        // apparently dead button. Returning with Back restores this review sheet.
        await props.onOpened(record);
        setMessage("The compose pop-up was blocked, so the email draft is opening in this tab. Review it and press Send manually, or return here to retry.");
        window.location.assign(url);
        return;
      }
      await props.onOpened(record);
      setMessage(`${channel === "WHATSAPP" ? "WhatsApp" : emailMode === "GMAIL" ? "Gmail draft" : "Email draft"} was OPENED. Yogesh must review and press Send manually.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The compose action was not recorded. Retry safely.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="lead-move-layer"><button className="lead-drawer-backdrop" type="button" onClick={props.onClose} aria-label="Close communication review" />
    <section className="lead-communication-sheet" role="dialog" aria-modal="true" aria-labelledby="communication-review-title">
      <header><span className="eyebrow">Manual communication · template v1</span><h2 id="communication-review-title">Review both messages</h2><p>No message is sent automatically. OPENED only means the compose window was opened.</p></header>
      {props.templateKey === "QUALIFICATION" ? <label className="communication-kind"><span>Qualification type</span><select value={qualificationKind ?? ""} onChange={(event) => setQualificationKind((event.target.value || undefined) as Props["qualificationKind"])}><option value="">Choose type</option><option value="RESIDENTIAL">Residential</option><option value="COMMERCIAL">Commercial</option><option value="HYBRID">Hybrid</option></select></label> : null}
      {blocked ? <div className="blocked-note" role="alert"><strong>Preparation blocked</strong><p>{props.templateKey === "QUALIFICATION" && !qualificationKind ? "Choose Residential, Commercial or Hybrid; Uchit will not guess." : "Activate the exact approved asset/form version and create the scoped secure link first."}</p></div> : null}
      <div className="communication-previews"><details open><summary>WhatsApp · {prepared.WHATSAPP ? "PREPARED" : "NOT PREPARED"}</summary><pre>{rendered.whatsapp}</pre></details><details><summary>Email · {prepared.EMAIL ? "PREPARED" : "NOT PREPARED"}</summary><strong>{rendered.emailSubject}</strong><pre>{rendered.email}</pre></details></div>
      <p className="meta" role="status" aria-live="polite">{message}</p>
      <footer><button type="button" className="button" disabled={busy || blocked} onClick={() => void prepareBoth()}>{busy ? "Preparing…" : "Prepare WhatsApp & email"}</button>
        <button type="button" className="button-secondary" disabled={busy || !prepared.WHATSAPP || !normaliseWhatsAppPhone(props.phone)} onClick={() => void openChannel("WHATSAPP")}>Open WhatsApp</button>
        <button type="button" className="button-secondary" disabled={busy || !prepared.EMAIL || !emailRecipient} onClick={() => void openChannel("EMAIL", "GMAIL")}>Open Gmail draft</button>
        <button type="button" className="button-secondary" disabled={busy || !prepared.EMAIL || !emailRecipient} onClick={() => void openChannel("EMAIL", "MAILTO")}>Use default email app</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={props.onClose}>Close</button></footer>
    </section></div>;
}
