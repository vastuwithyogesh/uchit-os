"use client";

import { useRef, useState } from "react";
import type { AppUser, ClientRecord } from "@/lib/domain";
import { buildActionHeaders } from "@/lib/request-helpers";

const types = ["Residential", "Commercial", "Factory", "Shop", "Hospital", "Hotel", "Temple"] as const;
type FieldErrors = Partial<Record<"name" | "location" | "floors", string>>;

export function FounderOpenCaseSheet({ client, user, revision, onClose, onCreated }: { client: ClientRecord; user: AppUser; revision?: number | null; onClose: () => void; onCreated: () => void }) {
  const [serviceType, setServiceType] = useState<"EXISTING_SPACE" | "NEW_CONSTRUCTION">("EXISTING_SPACE");
  const [propertyType, setPropertyType] = useState<(typeof types)[number]>("Residential");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [floors, setFloors] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [validationSummary, setValidationSummary] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const key = useRef(crypto.randomUUID());
  const nameRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const floorsRef = useRef<HTMLInputElement>(null);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Enter a project or case name.";
    if (!location.trim()) next.location = "Enter the property location or address.";
    if (floors.trim()) {
      const count = Number(floors);
      if (!Number.isInteger(count) || count < 1 || count > 200) next.floors = "Enter a whole number from 1 to 200, or leave it blank to add later.";
    }
    return next;
  }

  function showFieldErrors(next: FieldErrors) {
    setFieldErrors(next);
    const count = Object.keys(next).length;
    setValidationSummary(count ? `${count} required correction${count === 1 ? "" : "s"} before opening this project.` : "");
    const first = next.name ? nameRef : next.location ? locationRef : next.floors ? floorsRef : null;
    queueMicrotask(() => first?.current?.focus());
  }

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setValidationSummary("");
  }

  async function submit() {
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      showFieldErrors(nextErrors);
      return;
    }
    const floorCount = floors.trim() ? Number(floors) : undefined;
    setBusy(true);
    setServerError("");
    setValidationSummary("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: buildActionHeaders(user.role),
        body: JSON.stringify({ action: "founder-case-intent-create", clientId: client.id, serviceType, propertyType, displayName: name, propertyLocation: location, floorCount, importantNotes: notes || undefined, confirmPossibleDuplicate: confirmed, idempotencyKey: key.current, expectedRecordVersion: client.recordVersion, expectedRevision: revision ?? null })
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) {
        if (response.status === 409 && /similar active project/i.test(result.error ?? "")) {
          setServerError("A similar active case exists. Review it and explicitly confirm if this is independent.");
          return;
        }
        throw new Error(result.error ?? "The case could not be opened.");
      }
      onCreated();
    } catch (cause) {
      setServerError(cause instanceof Error ? cause.message : "The case could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  const fieldProps = (field: keyof FieldErrors) => ({
    "aria-invalid": Boolean(fieldErrors[field]),
    "aria-describedby": fieldErrors[field] ? `open-case-${field}-error` : undefined
  });
  const duplicateWarning = /similar active case/i.test(serverError);

  return <div className="lead-move-layer">
    <button className="lead-drawer-backdrop" type="button" aria-label="Close new case" onClick={onClose} />
    <section className="lead-move-sheet" role="dialog" aria-modal="true" aria-labelledby="open-case-title">
      <span className="eyebrow">New independent project</span>
      <h2 id="open-case-title">Open new case</h2>
      <p>A permanent Case ID is created only after accepted commercial clearance: confirmed advance, or an approved INTERNAL_COMPLIMENTARY exception.</p>
      <label>Service path<select value={serviceType} onChange={(event) => setServiceType(event.target.value as typeof serviceType)}><option value="EXISTING_SPACE">Existing Space</option><option value="NEW_CONSTRUCTION">New Construction</option></select></label>
      <label>Property / use type<select value={propertyType} onChange={(event) => setPropertyType(event.target.value as typeof propertyType)}>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className={fieldErrors.name ? "field-invalid" : ""}>Project / case name<input ref={nameRef} value={name} onChange={(event) => { setName(event.target.value); clearFieldError("name"); }} onBlur={() => showFieldErrors(validate())} maxLength={160} {...fieldProps("name")} />{fieldErrors.name ? <span id="open-case-name-error" className="field-error" role="alert">{fieldErrors.name}</span> : null}</label>
      <label className={fieldErrors.location ? "field-invalid" : ""}>Property location / address<input ref={locationRef} value={location} onChange={(event) => { setLocation(event.target.value); clearFieldError("location"); }} onBlur={() => showFieldErrors(validate())} maxLength={240} {...fieldProps("location")} />{fieldErrors.location ? <span id="open-case-location-error" className="field-error" role="alert">{fieldErrors.location}</span> : null}</label>
      <label className={fieldErrors.floors ? "field-invalid" : ""}>Number of floors <span className="label-note">optional — add later</span><input ref={floorsRef} value={floors} onChange={(event) => { setFloors(event.target.value); clearFieldError("floors"); }} onBlur={() => showFieldErrors(validate())} inputMode="numeric" {...fieldProps("floors")} />{fieldErrors.floors ? <span id="open-case-floors-error" className="field-error" role="alert">{fieldErrors.floors}</span> : null}</label>
      <label>Important notes &amp; updates <span className="label-note">optional</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1200} /></label>
      {validationSummary ? <p role="alert" className="blocked-note">{validationSummary}</p> : null}
      {serverError ? <p role="alert" className="blocked-note">{serverError}</p> : null}
      {duplicateWarning ? <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> This is an independent case.</label> : null}
      <div className="lead-move-actions"><button type="button" className="button" disabled={busy} onClick={() => void submit()}>{busy ? "Opening…" : "Open prospective case"}</button><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Cancel</button></div>
    </section>
  </div>;
}
