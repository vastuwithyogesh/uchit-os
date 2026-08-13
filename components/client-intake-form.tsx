"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import type { DecisionMakerStatus, VastuServiceType } from "@/lib/domain";
import { getClientIntakeCompleteness } from "@/lib/client-intake";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { FounderStepCard } from "@/components/founder-step-card";

type Bootstrap = AppState & { persistenceRevision?: number | null };

class ActionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function ClientIntakeForm({ clientId: initialClientId, caseId, projectId }: { clientId?: string; caseId?: string; projectId?: string } = {}) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading intake...");
  const [whatsapp, setWhatsapp] = useState("");
  const [language, setLanguage] = useState("");
  const [windowText, setWindowText] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [designation, setDesignation] = useState("");
  const [vision, setVision] = useState("");
  const [decision, setDecision] = useState<DecisionMakerStatus | "">("");
  const [others, setOthers] = useState("");
  const [service, setService] = useState<VastuServiceType | "">("");
  const [propertyType, setPropertyType] = useState("");
  const [propertyStatus, setPropertyStatus] = useState("");
  const [areaValue, setAreaValue] = useState("");
  const [areaUnit, setAreaUnit] = useState("");
  const [cityCountry, setCityCountry] = useState("");
  const [constraints, setConstraints] = useState("");
  const [challenge, setChallenge] = useState("");
  const [outcome, setOutcome] = useState("");
  const [urgency, setUrgency] = useState("");
  const [floorCount, setFloorCount] = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const key = useRef(crypto.randomUUID());

  const refresh = useCallback(async (preferred?: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Intake could not be loaded.");
      const next = await response.json() as Bootstrap;
      setState(next);
      const selectedCase = caseId ? next.vastuCases.find((item) => item.id === caseId) : undefined;
      setClientId((current) => selectedCase?.clientId ?? initialClientId ?? preferred ?? current);
      setMessage("Intake is up to date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Intake could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, [caseId, initialClientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const clients = state?.clients ?? [];
  const selectedCase = state?.vastuCases.find((item) => item.id === caseId && item.clientId === clientId);
  const project = state?.projects.find((item) => item.id === (projectId ?? selectedCase?.projectId));
  const client = clients.find((item) => item.id === clientId);
  const profile = state?.clientIntakeProfiles.find((item) => item.clientId === client?.id);
  const completeness = getClientIntakeCompleteness(profile);
  const caseService = selectedCase?.serviceType;
  const serviceConflict = Boolean(profile?.propertyContext?.serviceInterest && caseService && profile.propertyContext.serviceInterest !== caseService);
  const actualFloorCount = selectedCase ? (state?.floorWorkspaces.filter((item) => item.caseId === selectedCase.id).length ?? 0) : 0;
  const floorMismatch = Boolean(floorCount && actualFloorCount && Number(floorCount) !== actualFloorCount);

  useEffect(() => {
    setWhatsapp(profile?.contactPreference?.whatsapp ?? "");
    setLanguage(profile?.contactPreference?.preferredLanguage ?? "");
    setWindowText(profile?.contactPreference?.preferredContactWindow ?? "");
    setCompany(profile?.businessContext?.company ?? "");
    setIndustry(profile?.businessContext?.industry ?? "");
    setDesignation(profile?.businessContext?.designation ?? "");
    setVision(profile?.businessContext?.vision ?? "");
    setDecision(profile?.decisionMakerStatus ?? "");
    setOthers(profile?.otherDecisionMakers ?? "");
    setService(profile?.propertyContext?.serviceInterest ?? caseService ?? "");
    setPropertyType(profile?.propertyContext?.propertyType ?? "");
    setPropertyStatus(profile?.propertyContext?.propertyStatus ?? "");
    setAreaValue(profile?.propertyContext?.areaValue?.toString() ?? "");
    setAreaUnit(profile?.propertyContext?.areaUnit ?? "");
    setCityCountry(profile?.propertyContext?.cityCountry ?? client?.city ?? "");
    setConstraints(profile?.propertyContext?.constraints ?? "");
    setChallenge(profile?.needs?.mainChallenge ?? "");
    setOutcome(profile?.needs?.desiredOutcome ?? "");
    setUrgency(profile?.needs?.urgency ?? "");
    setFloorCount(profile?.propertyContext?.floorCount?.toString() ?? "");
    setLocationLink(profile?.propertyContext?.locationLink ?? "");
    setLatitude(profile?.propertyContext?.latitude?.toString() ?? "");
    setLongitude(profile?.propertyContext?.longitude?.toString() ?? "");
    key.current = crypto.randomUUID();
  }, [client?.id, client?.city, profile?.version, caseService]);

  async function save() {
    if (!state || !client) return;
    if (serviceConflict) { setMessage("Review Required: saved intake service conflicts with this case. Review case setup before saving."); return; }
    if (floorMismatch) { setMessage("Review Required: floor count differs from Floor setup. Review floor setup; no history changed."); return; }
    setBusy(true);
    try {
      const payload = {
        action:"client-intake-upsert",
        clientId: client.id, caseId, projectId: project?.id,
        contactPreference: { whatsapp: whatsapp || undefined, preferredLanguage: language || undefined, preferredContactWindow: windowText || undefined },
        businessContext: { company: company || undefined, industry: industry || undefined, designation: designation || undefined, vision: vision || undefined },
        decisionMakerStatus: decision || undefined,
        otherDecisionMakers: others || undefined,
        propertyContext: { serviceInterest: service || undefined, propertyType: propertyType || undefined, propertyStatus: propertyStatus || undefined, areaValue: areaValue ? Number(areaValue) : undefined, areaUnit: areaUnit || undefined, cityCountry: cityCountry || undefined, constraints: constraints || undefined, floorCount: floorCount ? Number(floorCount) : undefined, locationLink: locationLink || undefined, latitude: latitude ? Number(latitude) : undefined, longitude: longitude ? Number(longitude) : undefined },
        needs: { mainChallenge: challenge || undefined, desiredOutcome: outcome || undefined, urgency: urgency || undefined },
        consent: { version: "uchit-intake/v1", contact: profile?.consent.contact, accuracy: profile?.consent.accuracy, confidentiality: profile?.consent.confidentiality },
        idempotencyKey: key.current,
        expectedRecordVersion: client.recordVersion ?? 0,
        expectedRevision: state.persistenceRevision ?? null,
      };
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "Intake could not be saved.", response.status);
      await refresh(client.id);
      setMessage("Intake saved.");
    } catch (error) {
      if (error instanceof ActionError && error.status===409) setMessage("This client changed while you were editing. Your draft is still here. Reload, compare, then save again.");
      else if (error instanceof ActionError && error.status===428) setMessage("The client or workspace version is missing. Your draft is still here. Reload before saving.");
      else setMessage(error instanceof Error ? error.message : "Intake could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const messageIsError = message.includes("could not") || message.includes("changed") || message.includes("missing");
  const completionTone = completeness.completed === completeness.total ? "ready" : completeness.completed ? "attention" : "neutral";

  return (
    <section className="card span-12 founder-work-surface" aria-labelledby="intake-title">
      <div className="founder-context-bar" aria-label="Locked intake context"><span>Case</span><span aria-hidden="true">→</span><strong>{selectedCase?.caseNumber ?? "Select a case to continue"}</strong><span aria-hidden="true">→</span><span>{project?.propertyName ?? "Project pending"}</span><span aria-hidden="true">→</span><span>{client ? `${client.displayName} · ${client.id}` : "Client unavailable"}</span></div>
      <FounderStepCard step="Step 1 · context" title="Capture the decision that matters" description="Start with the client’s challenge and desired outcome. Complete the property context before saving the profile." tone={completionTone} status={`${completeness.completed}/${completeness.total} complete`} className="founder-step-card-primary">
        <p className="meta">Client is locked to this Case and Project. Switch the full context from the case selector, not from intake.</p>
        <p className="meta">Known values are prefilled from intake, then case setup, then the permanent client profile. Conflicting source values require review; nothing is silently overwritten.</p>
        {serviceConflict ? <p className="blocked-note" role="alert">Review Required: intake service conflicts with the selected case. Review case setup before saving.</p> : null}
        {floorMismatch ? <p className="blocked-note" role="alert">Review Required: Floor setup has {actualFloorCount} floor(s), while intake says {floorCount}. Review floor setup; existing floor history is preserved.</p> : null}
        <div className="founder-step-grid founder-intake-grid">
          <div className="field"><label htmlFor="intake-challenge">Main challenge</label><textarea id="intake-challenge" value={challenge} onChange={(e) => setChallenge(e.target.value)} disabled={busy} placeholder="What needs attention?" /></div>
          <div className="field"><label htmlFor="intake-outcome">Desired outcome</label><textarea id="intake-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} disabled={busy} placeholder="What would a useful outcome look like?" /></div>
          <div className="field"><label htmlFor="intake-urgency">Urgency <span className="label-note">optional</span></label><input id="intake-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)} disabled={busy} /></div>
        </div>
      </FounderStepCard>

      <FounderStepCard step="Step 2 · property" title="Set the project context" description="These fields carry forward into project and floor setup. Leave optional detail for the disclosure below." tone={service && propertyType && cityCountry ? "ready" : "attention"} status={service && propertyType ? "Ready to save" : "Needs detail"}>
        <div className="founder-step-grid founder-intake-grid">
          <div className="field"><label htmlFor="intake-service">Service interest</label><select id="intake-service" value={service} onChange={(e) => setService(e.target.value as VastuServiceType | "")} disabled={busy}><option value="">Choose</option><option value="EXISTING_SPACE">Existing space</option><option value="NEW_CONSTRUCTION">New construction</option></select></div>
          <div className="field"><label htmlFor="intake-property-type">Property type</label><select id="intake-property-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} disabled={busy}><option value="">Choose</option>{["Residential", "Commercial", "Factory", "Shop", "Hospital", "Hotel", "Temple"].map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="field"><label htmlFor="intake-property-status">Property status</label><input id="intake-property-status" value={propertyStatus} onChange={(e) => setPropertyStatus(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-city-country">City and country</label><input id="intake-city-country" value={cityCountry} onChange={(e) => setCityCountry(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-area-value">Area <span className="label-note">optional</span></label><input id="intake-area-value" value={areaValue} onChange={(e) => setAreaValue(e.target.value)} disabled={busy} inputMode="decimal" /></div>
          <div className="field"><label htmlFor="intake-area-unit">Area unit <span className="label-note">optional</span></label><input id="intake-area-unit" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-floor-count">Number of floors <span className="label-note">Add later if unknown</span></label><input id="intake-floor-count" value={floorCount} onChange={(e) => setFloorCount(e.target.value)} disabled={busy} inputMode="numeric" /></div>
          <div className="field field-span-full"><label htmlFor="intake-location-link">Location link <span className="label-note">HTTPS map link optional</span></label><input id="intake-location-link" value={locationLink} onChange={(e) => setLocationLink(e.target.value)} disabled={busy} placeholder="https://maps.example/..." /></div>
          <div className="field"><label htmlFor="intake-latitude">Latitude <span className="label-note">optional</span></label><input id="intake-latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} disabled={busy} inputMode="decimal" /></div>
          <div className="field"><label htmlFor="intake-longitude">Longitude <span className="label-note">optional</span></label><input id="intake-longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} disabled={busy} inputMode="decimal" /></div>
          <div className="field field-span-full"><label htmlFor="intake-constraints">Constraints <span className="label-note">optional</span></label><textarea id="intake-constraints" value={constraints} onChange={(e) => setConstraints(e.target.value)} disabled={busy} /></div>
        </div>
      </FounderStepCard>

      <details className="founder-technical-details founder-intake-more">
        <summary>More options · contact, business and decision details</summary>
        <div className="details-body founder-step-grid founder-intake-grid">
          <div className="field"><label htmlFor="intake-whatsapp">WhatsApp <span className="label-note">optional</span></label><input id="intake-whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-language">Preferred language <span className="label-note">optional</span></label><input id="intake-language" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-window">Contact window <span className="label-note">optional</span></label><input id="intake-window" value={windowText} onChange={(e) => setWindowText(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-company">Company <span className="label-note">optional</span></label><input id="intake-company" value={company} onChange={(e) => setCompany(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-industry">Industry <span className="label-note">optional</span></label><input id="intake-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-designation">Designation <span className="label-note">optional</span></label><input id="intake-designation" value={designation} onChange={(e) => setDesignation(e.target.value)} disabled={busy} /></div>
          <div className="field field-span-full"><label htmlFor="intake-vision">Business vision <span className="label-note">optional</span></label><textarea id="intake-vision" value={vision} onChange={(e) => setVision(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-others">Other decision-makers <span className="label-note">optional</span></label><input id="intake-others" value={others} onChange={(e) => setOthers(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="intake-decision">Decision-maker status <span className="label-note">optional</span></label><select id="intake-decision" value={decision} onChange={(e) => setDecision(e.target.value as DecisionMakerStatus | "")} disabled={busy}><option value="">Not recorded</option><option value="SOLE">Sole</option><option value="JOINT">Joint</option><option value="NOT_DECISION_MAKER">Not the decision-maker</option></select></div>
        </div>
      </details>

      <FounderStepCard step="Save intake" title="Confirm the project context" description="Known client consent remains in its original source record. Missing consent blocks only the relevant outbound communication, not this intake save." tone="ready" status="Ready to save">
        <div className="workflow founder-primary-actions"><button className="button founder-action-primary" type="button" disabled={busy || !client} onClick={() => void save()}>Save intake</button><button className="button-secondary" type="button" disabled={busy} onClick={() => void refresh(client?.id)}>Reload latest</button></div>
      </FounderStepCard>
      <div className="footer-note" role={messageIsError ? "alert" : "status"} aria-live="polite">{message}</div>
    </section>
  );
}
