"use client";

import { useState } from "react";
import type { ClientRecord, AppUser } from "@/lib/domain";
import { buildActionHeaders } from "@/lib/request-helpers";

type ScopeResult = { project?: { id: string }; client?: { recordVersion?: number } };

export function FounderProjectScopeSheet({ client, leadId, user, revision, onClose, onSaved }: { client: ClientRecord; leadId: string; user: AppUser; revision?: number | null; onClose: () => void; onSaved: (result: ScopeResult) => void }) {
  const [serviceType, setServiceType] = useState<"EXISTING_SPACE" | "NEW_CONSTRUCTION">("EXISTING_SPACE");
  const [propertyType, setPropertyType] = useState<"Residential" | "Commercial" | "Factory" | "Shop" | "Hospital" | "Hotel" | "Temple">("Residential");
  const [displayName, setDisplayName] = useState("");
  const [propertyLocation, setPropertyLocation] = useState("");
  const [floorCount, setFloorCount] = useState("");
  const [importantNotes, setImportantNotes] = useState("");
  const [snapshot, setSnapshot] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!displayName.trim() || !propertyLocation.trim()) { setMessage("Project name and property location are required."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(user.role), body: JSON.stringify({ action: "founder-project-scope-save", clientId: client.id, serviceType, propertyType, displayName, propertyLocation, floorCount: floorCount ? Number(floorCount) : undefined, importantNotes: importantNotes || undefined, idempotencyKey: `founder:project-scope:${client.id}:${crypto.randomUUID()}`, expectedRecordVersion: client.recordVersion ?? 0, expectedRevision: revision ?? null }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "The project scope could not be saved.");
      const saved = result.result ?? result;
      if (snapshot && saved.project?.id) {
        const form = new FormData(); form.set("file", snapshot); form.set("clientId", client.id); form.set("leadId", leadId); form.set("prospectiveProjectId", saved.project.id);
        const upload = await fetch("/api/pre-case-evidence", { method: "POST", body: form }); const uploadResult = await upload.json();
        if (!upload.ok || uploadResult.ok === false) throw new Error(uploadResult.error ?? "The optional questionnaire snapshot could not be saved.");
      }
      onSaved(saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The project scope could not be saved."); }
    finally { setBusy(false); }
  }
  return <div className="lead-move-layer"><button className="lead-drawer-backdrop" type="button" onClick={onClose} aria-label="Cancel project scope" /><section className="lead-move-sheet" role="dialog" aria-modal="true" aria-labelledby="project-scope-title"><span className="eyebrow">Contacted → Review</span><h2 id="project-scope-title">Capture project scope</h2><p>Save the existing prospective project context before the lead enters Review. This does not create a Case.</p><label>Service path<select value={serviceType} onChange={(event) => setServiceType(event.target.value as typeof serviceType)}><option value="EXISTING_SPACE">Existing Space</option><option value="NEW_CONSTRUCTION">New Construction</option></select></label><label>Property / use type<select value={propertyType} onChange={(event) => setPropertyType(event.target.value as typeof propertyType)}>{["Residential", "Commercial", "Factory", "Shop", "Hospital", "Hotel", "Temple"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Project name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={160} /></label><label>Property location / address<input value={propertyLocation} onChange={(event) => setPropertyLocation(event.target.value)} maxLength={240} /></label><label>Number of floors (optional)<input type="number" min="1" max="200" value={floorCount} onChange={(event) => setFloorCount(event.target.value)} /></label><label>Important notes (optional)<textarea value={importantNotes} onChange={(event) => setImportantNotes(event.target.value)} maxLength={1200} /></label><label>Qualification Questionnaire Snapshot (optional)<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setSnapshot(event.target.files?.[0])} /></label><p className="meta">Supporting evidence only. No OCR, answer extraction, or project-scope inference is performed.</p>{message ? <p className="blocked-note" role="alert">{message}</p> : null}<div className="lead-move-actions"><button type="button" className="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving scope…" : "Save scope and continue"}</button><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Cancel</button></div></section></div>;
}
