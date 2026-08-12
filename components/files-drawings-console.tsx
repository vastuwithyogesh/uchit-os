"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { documentRevisionStatuses, responsibilityRoles, type DocumentRevisionStatus, type ResponsibilityRole } from "@/lib/domain";
import { getActiveCaseForClient, getCaseDocumentReadiness } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type CaseFileAsset = { id: string; evidenceRef: string; caseId: string; caseRevisionNumber: number; serviceType: string; floorLabel?: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; status: "IMMUTABLE"; uploadedBy: { name: string; role: string } };
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
const buildUploadHeaders = (role: string) => typeof window !== "undefined" && window.location.hostname === "localhost" ? { "x-uchit-demo-role": role } : undefined;

async function loadState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) throw new Error("Files and drawings could not be loaded. Try again.");
  return response.json() as Promise<Bootstrap>;
}

export function FilesDrawingsConsole({ focus = "all", clientId: initialClientId, caseId: requestedCaseId, floorId: requestedFloorId }: { focus?: "all" | "manual-sheet"; clientId?: string; caseId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(initialClientId ?? "");
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
  const [assets, setAssets] = useState<CaseFileAsset[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
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
  const activeCase = state?.vastuCases.find((item) => item.id === requestedCaseId && item.clientId === client?.id)
    ?? (state && client ? getActiveCaseForClient(state, client.id) : undefined);
  const readiness = state && activeCase ? getCaseDocumentReadiness(state, activeCase) : undefined;
  const requestedFloorLabel = state?.floorWorkspaces.find((item) => item.id === requestedFloorId && item.caseId === activeCase?.id)?.floorLabel;
  const requirements = focus === "manual-sheet"
    ? (readiness?.requirements.filter((item) => item.assetType === "MANUAL_UTILITY_SHEET" && (!requestedFloorLabel || item.floorLabel === requestedFloorLabel)) ?? [])
    : (readiness?.requirements ?? []);
  const requirement = requirements[selectedRequirement];
  const currentDocument = requirement?.document;
  const caseDocuments = state?.caseDocuments.filter((item) => item.caseId === activeCase?.id && item.caseRevisionNumber === (activeCase?.revisionNumber ?? 1)) ?? [];
  const selectedAsset = useMemo(() => assets.find((asset) => asset.evidenceRef === evidenceRef), [assets, evidenceRef]);
  const readyCount = requirements.filter((item) => item.ready).length;

  useEffect(() => { setSelectedRequirement(0); }, [activeCase?.id]);
  const refreshAssets = useCallback(async (caseId: string, floorLabel?: string) => {
    const query = new URLSearchParams({ caseId }); if (floorLabel) query.set("floorLabel", floorLabel);
    const response = await fetch(`/api/case-files?${query}`, { cache: "no-store", headers: buildUploadHeaders(activeUser.role) });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "Protected files could not be loaded.", response.status);
    setAssets((result.assets as CaseFileAsset[]).filter((asset) => asset.caseId === caseId && asset.floorLabel === floorLabel));
  }, [activeUser.role]);
  useEffect(() => {
    setAssets([]); setSelectedFile(null);
    if (!activeCase || !requirement) return;
    void refreshAssets(activeCase.id, requirement.floorLabel).catch((error) => setMessage(error instanceof Error ? error.message : "Protected files could not be loaded."));
  }, [activeCase?.id, requirement?.assetType, requirement?.floorLabel, refreshAssets]);
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

  async function uploadFile() {
    if (!activeCase || !requirement || !selectedFile) return;
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(selectedFile.type)) { setMessage("Choose a PDF, PNG, JPG, or WebP file."); return; }
    if (selectedFile.size < 1 || selectedFile.size > 20 * 1024 * 1024) { setMessage("Choose a file between 1 byte and 20 MB."); return; }
    setUploading(true); setMessage("Uploading the protected file...");
    try {
      const body = new FormData(); body.set("file", selectedFile); body.set("caseId", activeCase.id); if (requirement.floorLabel) body.set("floorLabel", requirement.floorLabel);
      const response = await fetch("/api/case-files", { method: "POST", headers: buildUploadHeaders(activeUser.role), body });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The file could not be uploaded.", response.status);
      const asset = result.asset as CaseFileAsset;
      if (asset.caseId !== activeCase.id || asset.floorLabel !== requirement.floorLabel) throw new Error("The uploaded file did not match this case and floor. It was not selected.");
      setEvidenceRef(asset.evidenceRef); setSelectedFile(null); await refreshAssets(activeCase.id, requirement.floorLabel); setMessage("Upload complete. Now record this document version.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The file could not be uploaded."); }
    finally { setUploading(false); }
  }

  const verificationBlocked = revisionStatus === "VERIFIED" && (blocker || Boolean(discrepancy.trim()));
  const canSave = Boolean(requirement && versionLabel.trim() && evidenceRef && ownerName.trim() && revisionStatus !== "SUPERSEDED" && !verificationBlocked);
  const primaryIndex = requirements.findIndex((item) => !item.ready);

  return <section className={`section-grid files-workspace files-focus-${focus}`} aria-labelledby="files-title">
    <div className="card span-12"><div className="eyebrow">Files and drawings</div><h1 id="files-title">{readiness?.ready ? "All required files are verified" : "Check the next required file"}</h1><p className="subtle">See what is missing, what needs correction, and who acts next.</p><div className="workflow"><label htmlFor="files-client"><strong>Client</strong></label><select id="files-client" value={client?.id ?? ""} onChange={(event) => setSelectedClientId(event.target.value)} disabled={busy}>{clients.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select><button className="button-secondary" type="button" onClick={() => void refresh(client?.id)} disabled={busy}>Reload</button></div><div className="pill-row"><span className="pill">Case {activeCase?.caseNumber ?? "not open"}</span><span className="pill">Revision {activeCase?.revisionNumber ?? 1}</span><span className="pill">{readyCount} of {requirements.length} verified</span></div></div>
    <div className="card span-12"><div className="eyebrow">Required checklist</div><h2>What is ready?</h2>{!activeCase ? <p className="subtle">Open a case first.</p> : <div className="list">{requirements.map((item, index) => { const itemStatus = !item.document ? "Missing" : item.ready ? "Verified" : item.document.revisionStatus === "CHANGES_REQUIRED" || item.document.blocker || item.document.discrepancy ? "Needs correction" : "Received"; return <button type="button" className={index === primaryIndex ? "button" : "button-secondary"} key={`${item.assetType}-${item.floorLabel ?? "case"}`} onClick={() => setSelectedRequirement(index)} aria-pressed={index === selectedRequirement}><strong>{label(item.assetType)}{item.floorLabel ? ` · ${item.floorLabel}` : ""}</strong><span>{itemStatus}{item.document ? ` · Next: ${item.document.ownerName}` : " · Next: consultant"}</span></button>; })}</div>}</div>
    {requirement && <div className="card span-12"><div className="eyebrow">Current selection</div><h2>{label(requirement.assetType)}{requirement.floorLabel ? ` · ${requirement.floorLabel}` : ""}</h2><div className="two-col"><div className="field"><label htmlFor="file-version">Version name</label><input id="file-version" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="file-date">Document date</label><input id="file-date" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></div><div className="field"><label htmlFor="case-file">Upload a protected file</label><input id="case-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} disabled={uploading} /><span className="meta">PDF, PNG, JPG, or WebP · up to 20 MB</span><button type="button" className="button-secondary" disabled={!selectedFile || uploading} onClick={() => void uploadFile()}>{uploading ? "Uploading..." : "Upload file"}</button></div><div className="field"><label htmlFor="file-evidence">Protected file for this version</label><select id="file-evidence" value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} disabled={Boolean(currentDocument && versionLabel === currentDocument.versionLabel)}><option value="">Choose a matching protected upload</option>{assets.map((asset) => <option value={asset.evidenceRef} key={asset.id}>{asset.fileName}</option>)}</select><span className="meta">Only uploads for this case and exact floor are shown. Storage details stay hidden.</span>{selectedAsset && <details><summary>File details</summary><span className="meta">{selectedAsset.fileName} · {selectedAsset.mimeType} · {Math.ceil(selectedAsset.sizeBytes / 1024)} KB · {new Date(selectedAsset.createdAt).toLocaleDateString()}</span></details>}</div><div className="field"><label htmlFor="file-status">Review status</label><select id="file-status" value={revisionStatus} onChange={(event) => setRevisionStatus(event.target.value as DocumentRevisionStatus)}>{documentRevisionStatuses.filter((status) => status !== "SUPERSEDED").map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div><label className="list-item"><span><input type="checkbox" checked={blocker} onChange={(event) => setBlocker(event.target.checked)} /> This issue blocks the next step</span></label><div className="field"><label htmlFor="file-discrepancy">What does not match?</label><textarea id="file-discrepancy" value={discrepancy} onChange={(event) => setDiscrepancy(event.target.value)} maxLength={1000} /></div><div className="field"><label htmlFor="file-owner-role">Next owner</label><select id="file-owner-role" value={ownerRole} onChange={(event) => setOwnerRole(event.target.value as ResponsibilityRole)}>{responsibilityRoles.map((role) => <option key={role} value={role}>{label(role)}</option>)}</select></div><div className="field"><label htmlFor="file-owner-name">Person or team</label><input id="file-owner-name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={120} /></div></div><div className="field"><label htmlFor="review-observation">Review observation</label><textarea id="review-observation" value={reviewObservation} onChange={(event) => setReviewObservation(event.target.value)} maxLength={2000} /></div><div className="field"><label htmlFor="required-change">Required correction</label><textarea id="required-change" value={requiredChange} onChange={(event) => setRequiredChange(event.target.value)} maxLength={2000} /></div><details><summary>Alternatives and technical details</summary><div className="field"><label htmlFor="preferred-alternative">Preferred alternative</label><textarea id="preferred-alternative" value={preferredAlternative} onChange={(event) => setPreferredAlternative(event.target.value)} maxLength={1000} /></div><div className="field"><label htmlFor="acceptable-alternative">Acceptable alternative</label><textarea id="acceptable-alternative" value={acceptableAlternative} onChange={(event) => setAcceptableAlternative(event.target.value)} maxLength={1000} /></div>{currentDocument && <p className="meta">Record version {currentDocument.version} · Received {currentDocument.received.at} · Updated {currentDocument.updated.at}</p>}</details>{verificationBlocked && <p role="alert">Resolve the blocker and discrepancy before verifying.</p>}<button type="button" className="button" disabled={busy || !canSave} onClick={() => void save()}>{revisionStatus === "VERIFIED" ? "Verify document" : currentDocument ? "Save review" : "Record document"}</button></div>}
    <div className="card span-12"><h2>Version history</h2>{caseDocuments.length ? <details><summary>Show {caseDocuments.length} recorded versions</summary><div className="list">{caseDocuments.map((document) => <div className="list-item" key={document.id}><strong>{label(document.assetType)} · {document.versionLabel}</strong><span>{label(document.revisionStatus)} · {document.isCurrent ? "Current" : "Superseded"}</span><span className="meta">Owner: {document.ownerName} · record version {document.version}</span></div>)}</div></details> : <p className="subtle">No document versions recorded yet.</p>}<div className="footer-note" role={message.includes("could not") || message.includes("changed") || message.includes("missing") ? "alert" : "status"} aria-live="polite">{message}</div></div>
  </section>;
}
