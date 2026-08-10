"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { documentRevisionStatuses, responsibilityRoles, type DocumentRevisionStatus, type ResponsibilityRole } from "@/lib/domain";
import { getActiveCaseForClient, getCaseDocumentReadiness } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());

async function loadState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) throw new Error("Files and drawings could not be loaded. Try again.");
  return response.json() as Promise<Bootstrap>;
}

export function FilesDrawingsConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedRequirement, setSelectedRequirement] = useState(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading files and drawings...");
  const [versionLabel, setVersionLabel] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [revisionStatus, setRevisionStatus] = useState<DocumentRevisionStatus>("RECEIVED");
  const [blocker, setBlocker] = useState(false);
  const [discrepancy, setDiscrepancy] = useState("");
  const [reviewObservation, setReviewObservation] = useState("");
  const [requiredChange, setRequiredChange] = useState("");
  const [preferredAlternative, setPreferredAlternative] = useState("");
  const [acceptableAlternative, setAcceptableAlternative] = useState("");
  const [ownerRole, setOwnerRole] = useState<ResponsibilityRole>("CONSULTANT");
  const [ownerName, setOwnerName] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());

  const refresh = useCallback(async (preferredClientId?: string) => {
    setBusy(true);
    try {
      const next = await loadState();
      setState(next);
      setSelectedClientId((current) => (preferredClientId ?? current) || next.clients[0]?.id || "");
      setMessage("Files and drawings are up to date.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Files and drawings could not be loaded."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const clients = state?.clients ?? [];
  const client = clients.find((item) => item.id === selectedClientId) ?? clients[0];
  const activeCase = state && client ? getActiveCaseForClient(state, client.id) : undefined;
  const readiness = state && activeCase ? getCaseDocumentReadiness(state, activeCase) : undefined;
  const requirement = readiness?.requirements[selectedRequirement];
  const currentDocument = requirement?.document;
  const caseDocuments = state?.caseDocuments.filter((item) => item.caseId === activeCase?.id && item.caseRevisionNumber === (activeCase?.revisionNumber ?? 1)) ?? [];
  const evidenceOptions = useMemo(() => Array.from(new Set((state?.floorWorkspaces ?? []).filter((floor) => floor.caseId === activeCase?.id).flatMap((floor) => floor.evidenceUploads))), [state, activeCase?.id]);
  const readyCount = readiness?.requirements.filter((item) => item.ready).length ?? 0;

  useEffect(() => { setSelectedRequirement(0); }, [activeCase?.id]);
  useEffect(() => {
    setVersionLabel(currentDocument?.versionLabel ?? ""); setDocumentDate(currentDocument?.documentDate?.slice(0, 10) ?? ""); setEvidenceRef(currentDocument?.evidenceRef ?? "");
    setRevisionStatus(currentDocument?.revisionStatus ?? "RECEIVED"); setBlocker(currentDocument?.blocker ?? false); setDiscrepancy(currentDocument?.discrepancy ?? "");
    setReviewObservation(currentDocument?.reviewObservation ?? ""); setRequiredChange(currentDocument?.requiredChange ?? ""); setPreferredAlternative(currentDocument?.preferredAlternative ?? ""); setAcceptableAlternative(currentDocument?.acceptableAlternative ?? "");
    setOwnerRole(currentDocument?.ownerRole ?? "CONSULTANT"); setOwnerName(currentDocument?.ownerName ?? ""); idempotencyKey.current = crypto.randomUUID();
  }, [activeCase?.id, selectedRequirement, currentDocument?.id, currentDocument?.version]);

  async function save() {
    if (!state || !activeCase || !requirement) return;
    const isVerify = revisionStatus === "VERIFIED";
    const isReplacement = Boolean(currentDocument && versionLabel.trim() !== currentDocument.versionLabel);
    if (!window.confirm(isVerify ? "Verify this version? Confirm that the file is correct and has no unresolved issue." : isReplacement ? "Save this as the current version? The previous current version will be superseded." : "Save this document review?")) return;
    setBusy(true);
    try {
      const payload = { action: "case-document-upsert", caseId: activeCase.id, recordId: isReplacement ? undefined : currentDocument?.id, assetType: requirement.assetType, floorLabel: requirement.floorLabel, versionLabel, documentDate: documentDate || undefined, isCurrent: true, evidenceRef, discrepancy: discrepancy || undefined, blocker, reviewObservation: reviewObservation || undefined, requiredChange: requiredChange || undefined, preferredAlternative: preferredAlternative || undefined, acceptableAlternative: acceptableAlternative || undefined, ownerRole, ownerName, revisionStatus, idempotencyKey: idempotencyKey.current, expectedRecordVersion: activeCase.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null };
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The document could not be saved.", response.status);
      idempotencyKey.current = crypto.randomUUID(); await refresh(client?.id); setMessage(isVerify ? "Document verified." : "Document review saved.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("This case changed while you were working. Reload, review the latest version, then enter your change again. Nothing was saved.");
      else if (error instanceof ActionError && error.status === 428) setMessage("The case version is missing. Reload before saving.");
      else setMessage(error instanceof Error ? error.message : "The document could not be saved.");
    } finally { setBusy(false); }
  }

  const verificationBlocked = revisionStatus === "VERIFIED" && (blocker || Boolean(discrepancy.trim()));
  const canSave = Boolean(requirement && versionLabel.trim() && evidenceRef && ownerName.trim() && revisionStatus !== "SUPERSEDED" && !verificationBlocked);
  const primaryIndex = readiness?.requirements.findIndex((item) => !item.ready) ?? -1;

  return <section className="section-grid" aria-labelledby="files-title">
    <div className="card span-12"><div className="eyebrow">Files and drawings</div><h1 id="files-title">{readiness?.ready ? "All required files are verified" : "Check the next required file"}</h1><p className="subtle">See what is missing, what needs correction, and who acts next.</p><div className="workflow"><label htmlFor="files-client"><strong>Client</strong></label><select id="files-client" value={client?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} disabled={busy}>{clients.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select><button className="button-secondary" type="button" onClick={() => void refresh(client?.id)} disabled={busy}>Reload</button></div><div className="pill-row"><span className="pill">Case {activeCase?.caseNumber ?? "not open"}</span><span className="pill">Revision {activeCase?.revisionNumber ?? 1}</span><span className="pill">{readyCount} of {readiness?.requirements.length ?? 0} verified</span></div></div>
    <div className="card span-12"><div className="eyebrow">Required checklist</div><h2>What is ready?</h2>{!activeCase ? <p className="subtle">Open a case first.</p> : <div className="list">{readiness?.requirements.map((item, index) => { const status = !item.document ? "Missing" : item.ready ? "Verified" : item.document.revisionStatus === "CHANGES_REQUIRED" || item.document.blocker || item.document.discrepancy ? "Needs correction" : "Received"; return <button type="button" className={index === primaryIndex ? "button" : "button-secondary"} key={`${item.assetType}-${item.floorLabel ?? "case"}`} onClick={() => setSelectedRequirement(index)} aria-pressed={index === selectedRequirement}><strong>{label(item.assetType)}{item.floorLabel ? ` · ${item.floorLabel}` : ""}</strong><span>{status}{item.document ? ` · Next: ${item.document.ownerName}` : " · Next: consultant"}</span></button>; })}</div>}</div>
    {requirement && <div className="card span-12"><div className="eyebrow">Current selection</div><h2>{label(requirement.assetType)}{requirement.floorLabel ? ` · ${requirement.floorLabel}` : ""}</h2><div className="two-col"><div className="field"><label htmlFor="file-version">Version name</label><input id="file-version" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="file-date">Document date</label><input id="file-date" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></div><div className="field"><label htmlFor="file-evidence">Protected file</label><select id="file-evidence" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} disabled={Boolean(currentDocument && versionLabel === currentDocument.versionLabel)}><option value="">Choose an existing protected upload</option>{evidenceOptions.map((ref, index) => <option value={ref} key={ref}>Evidence {index + 1}</option>)}</select><span className="meta">Add uploads in the floor workspace. File paths stay hidden here.</span></div><div className="field"><label htmlFor="file-status">Review status</label><select id="file-status" value={revisionStatus} onChange={(event) => setRevisionStatus(event.target.value as DocumentRevisionStatus)}>{documentRevisionStatuses.filter((status) => status !== "SUPERSEDED").map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div><label className="list-item"><span><input type="checkbox" checked={blocker} onChange={(event) => setBlocker(event.target.checked)} /> This issue blocks the next step</span></label><div className="field"><label htmlFor="file-discrepancy">What does not match?</label><textarea id="file-discrepancy" value={discrepancy} onChange={(event) => setDiscrepancy(event.target.value)} maxLength={1000} /></div><div className="field"><label htmlFor="file-owner-role">Next owner</label><select id="file-owner-role" value={ownerRole} onChange={(event) => setOwnerRole(event.target.value as ResponsibilityRole)}>{responsibilityRoles.map((role) => <option key={role} value={role}>{label(role)}</option>)}</select></div><div className="field"><label htmlFor="file-owner-name">Person or team</label><input id="file-owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={120} /></div></div><div className="field"><label htmlFor="review-observation">Review observation</label><textarea id="review-observation" value={reviewObservation} onChange={(event) => setReviewObservation(event.target.value)} maxLength={2000} /></div><div className="field"><label htmlFor="required-change">Required correction</label><textarea id="required-change" value={requiredChange} onChange={(event) => setRequiredChange(event.target.value)} maxLength={2000} /></div><details><summary>Alternatives and technical details</summary><div className="field"><label htmlFor="preferred-alternative">Preferred alternative</label><textarea id="preferred-alternative" value={preferredAlternative} onChange={(event) => setPreferredAlternative(event.target.value)} maxLength={1000} /></div><div className="field"><label htmlFor="acceptable-alternative">Acceptable alternative</label><textarea id="acceptable-alternative" value={acceptableAlternative} onChange={(event) => setAcceptableAlternative(event.target.value)} maxLength={1000} /></div>{currentDocument && <p className="meta">Record version {currentDocument.version} · Received {currentDocument.received.at} · Updated {currentDocument.updated.at}</p>}</details>{verificationBlocked && <p role="alert">Resolve the blocker and discrepancy before verifying.</p>}<button type="button" className="button" disabled={busy || !canSave} onClick={() => void save()}>{revisionStatus === "VERIFIED" ? "Verify document" : currentDocument ? "Save review" : "Record document"}</button></div>}
    <div className="card span-12"><h2>Version history</h2>{caseDocuments.length ? <details><summary>Show {caseDocuments.length} recorded versions</summary><div className="list">{caseDocuments.map((document) => <div className="list-item" key={document.id}><strong>{label(document.assetType)} · {document.versionLabel}</strong><span>{label(document.revisionStatus)} · {document.isCurrent ? "Current" : "Superseded"}</span><span className="meta">Owner: {document.ownerName} · record version {document.version}</span></div>)}</div></details> : <p className="subtle">No document versions recorded yet.</p>}<div className="footer-note" role={message.includes("could not") || message.includes("changed") || message.includes("missing") ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
