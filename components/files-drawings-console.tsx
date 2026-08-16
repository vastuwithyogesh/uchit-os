"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppState } from "@/lib/store";
import { documentRevisionStatuses, responsibilityRoles, type DocumentRevisionStatus, type ResponsibilityRole } from "@/lib/domain";
import { getCaseDocumentReadiness } from "@/lib/service-framework";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type CaseFileAsset = { id: string; evidenceRef: string; caseId: string; caseRevisionNumber: number; serviceType: string; floorLabel?: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; status: "IMMUTABLE"; uploadedBy: { name: string; role: string } };
type UploadState = "NOT_SELECTED" | "SELECTED" | "UPLOADING" | "UPLOADED_NOT_RECORDED" | "RECORDED" | "FAILED";
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
  const router = useRouter();
  const [state, setState] = useState<Bootstrap | null>(null);
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
  const [uploadState, setUploadState] = useState<UploadState>("NOT_SELECTED");
  const [uploadError, setUploadError] = useState("");
  const [draftMode, setDraftMode] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [approvalReason, setApprovalReason] = useState("Founder reviewed the original full-colour manual utility sheet for this exact Case and floor.");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const versionRef = useRef<HTMLInputElement>(null);
  const evidenceRefControl = useRef<HTMLSelectElement>(null);
  const ownerNameRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const approvalKey = useRef(crypto.randomUUID());
  const resolutionKey = useRef(crypto.randomUUID());

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const next = await loadState();
      setState(next);
      setMessage("Files and drawings are up to date.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Files and drawings could not be loaded."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const activeCase = state?.vastuCases.find((item) => item.id === requestedCaseId && (!initialClientId || item.clientId === initialClientId));
  const client = state?.clients.find((item) => item.id === activeCase?.clientId);
  const readiness = state && activeCase ? getCaseDocumentReadiness(state, activeCase) : undefined;
  const requestedFloorLabel = state?.floorWorkspaces.find((item) => item.id === requestedFloorId && item.caseId === activeCase?.id)?.floorLabel;
  const requirements = focus === "manual-sheet"
    ? (readiness?.requirements.filter((item) => item.assetType === "MANUAL_UTILITY_SHEET" && (!requestedFloorLabel || item.floorLabel === requestedFloorLabel)) ?? [])
    : (readiness?.requirements ?? []);
  const requirement = requirements[selectedRequirement];
  const currentDocument = requirement?.document;
  const caseDocuments = state?.caseDocuments.filter((item) => item.caseId === activeCase?.id && item.caseRevisionNumber === (activeCase?.revisionNumber ?? 1)) ?? [];
  const approvedDocument = focus === "manual-sheet" ? caseDocuments.find((item) => item.assetType === "MANUAL_UTILITY_SHEET" && item.floorLabel === requestedFloorLabel && item.isCurrent && item.revisionStatus === "VERIFIED" && item.founderApprovalStatus === "APPROVED" && !item.blocker && !item.discrepancy) : undefined;
  const successorDraft = approvedDocument ? caseDocuments.find((item) => item.assetType === "MANUAL_UTILITY_SHEET" && item.floorLabel === requestedFloorLabel && !item.isCurrent && item.revisionStatus !== "SUPERSEDED" && item.successorOfDocumentId === approvedDocument.id) : undefined;
  const editorDocument = successorDraft ?? (!approvedDocument ? currentDocument : undefined);
  const approvalCandidate = editorDocument?.revisionStatus === "VERIFIED" && editorDocument.founderApprovalStatus !== "APPROVED" ? editorDocument : (!approvedDocument && currentDocument?.revisionStatus === "VERIFIED" ? currentDocument : undefined);
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
    setAssets([]); setSelectedFile(null); setUploadState("NOT_SELECTED"); setUploadError("");
    if (!activeCase || !requirement) return;
    void refreshAssets(activeCase.id, requirement.floorLabel).catch((error) => setMessage(error instanceof Error ? error.message : "Protected files could not be loaded."));
  }, [activeCase?.id, requirement?.assetType, requirement?.floorLabel, refreshAssets]);
  useEffect(() => {
    const document = editorDocument;
    setVersionLabel(document?.versionLabel ?? ""); setDocumentDate(document?.documentDate?.slice(0, 10) ?? ""); setEvidenceRef(document?.evidenceRef ?? "");
    setRevisionStatus(document?.revisionStatus ?? "RECEIVED"); setBlocker(document?.blocker ?? false); setDiscrepancy(document?.discrepancy ?? "");
    setReviewObservation(document?.reviewObservation ?? ""); setRequiredChange(document?.requiredChange ?? ""); setPreferredAlternative(document?.preferredAlternative ?? ""); setAcceptableAlternative(document?.acceptableAlternative ?? "");
    setOwnerRole(document?.ownerRole ?? "CONSULTANT"); setOwnerName(document?.ownerName ?? activeUser.fullName); setResolutionNote("");
    setUploadState(document ? "RECORDED" : "NOT_SELECTED"); idempotencyKey.current = crypto.randomUUID(); resolutionKey.current = crypto.randomUUID();
  }, [activeCase?.id, selectedRequirement, editorDocument?.id, editorDocument?.version, activeUser.fullName, draftMode]);
  useEffect(() => {
    if (uploading) return;
    if (selectedFile && uploadState === "NOT_SELECTED") setUploadState("SELECTED");
    if (!selectedFile && uploadState === "SELECTED") setUploadState("NOT_SELECTED");
  }, [selectedFile, uploading, uploadState]);

  async function save() {
    if (!state || !activeCase || !requirement) return;
    const errors: Record<string, string> = {};
    if (!versionLabel.trim()) errors.versionLabel = "Enter a version name for this document.";
    if (!evidenceRef) errors.evidenceRef = "Select the exact protected upload for this version.";
    if (!ownerName.trim()) errors.ownerName = "Enter the person or team responsible for the next action.";
    const savingIssue = blocker || revisionStatus === "CHANGES_REQUIRED";
    if (savingIssue && !discrepancy.trim()) errors.discrepancy = "Describe what does not match.";
    if (savingIssue && !requiredChange.trim()) errors.requiredChange = "Describe the required correction.";
    if (revisionStatus === "VERIFIED" && blocker) errors.blocker = "Use Resolve issue before verification.";
    if (revisionStatus === "VERIFIED" && discrepancy.trim()) errors.discrepancy = "Use Resolve issue to preserve this discrepancy in history before verification.";
    if (revisionStatus === "VERIFIED" && editorDocument?.issueHistory?.some((item) => item.status === "OPEN")) errors.issueHistory = "Resolve the recorded review issue before verification.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setMessage(`${Object.keys(errors).length} required correction${Object.keys(errors).length === 1 ? "" : "s"} needed before recording this document.`);
      queueMicrotask(() => (errors.versionLabel ? versionRef.current : errors.evidenceRef ? evidenceRefControl.current : ownerNameRef.current)?.focus());
      return;
    }
    const isVerify = revisionStatus === "VERIFIED";
    const isSuccessor = Boolean(approvedDocument);
    if (!window.confirm(savingIssue ? "Save this review issue without replacing the approved current version?" : isVerify ? "Verify this exact version? Founder approval is still required before a successor replaces the approved version." : isSuccessor ? "Save this successor draft? It will not replace the approved version." : "Save this document review?")) return;
    setBusy(true);
    try {
      const payload = { action: "case-document-upsert", caseId: activeCase.id, recordId: editorDocument?.id, assetType: requirement.assetType, floorLabel: requirement.floorLabel, versionLabel, documentDate: documentDate || undefined, isCurrent: !approvedDocument, successorOfDocumentId: approvedDocument?.id, evidenceRef, discrepancy: discrepancy || undefined, blocker, reviewObservation: reviewObservation || undefined, requiredChange: requiredChange || undefined, preferredAlternative: preferredAlternative || undefined, acceptableAlternative: acceptableAlternative || undefined, ownerRole, ownerName, revisionStatus, idempotencyKey: idempotencyKey.current, expectedRecordVersion: activeCase.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null };
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The document could not be saved.", response.status);
      idempotencyKey.current = crypto.randomUUID(); setDraftMode(true); await refresh(); router.refresh(); setUploadState("RECORDED"); setMessage(savingIssue ? "Review issue saved. The approved current version remains unchanged." : isVerify ? "Version verified. Founder approval is required before it becomes current." : isSuccessor ? "Successor draft saved. The approved current version remains unchanged." : "Document review saved.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("This case changed while you were working. Reload, review the latest version, then enter your change again. Nothing was saved.");
      else if (error instanceof ActionError && error.status === 428) setMessage("The case version is missing. Reload before saving.");
      else setMessage(error instanceof Error ? error.message : "The document could not be saved.");
    } finally { setBusy(false); }
  }

  async function resolveIssue() {
    if (!state || !activeCase || !editorDocument) return;
    if (resolutionNote.trim().length < 10) { setMessage("Enter a resolution note of at least 10 characters."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: "case-document-issue-resolve", caseId: activeCase.id, recordId: editorDocument.id, resolutionNote, idempotencyKey: resolutionKey.current, expectedRecordVersion: activeCase.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The review issue could not be resolved.", response.status);
      resolutionKey.current = crypto.randomUUID(); await refresh(); router.refresh(); setMessage("Review issue resolved and preserved in history. Choose Verified when this exact version is ready.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("This case changed. Reload the latest version, review the issue history, and retry.");
      else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest case version before resolving this issue.");
      else setMessage(error instanceof Error ? error.message : "The review issue could not be resolved.");
    } finally { setBusy(false); }
  }

  async function uploadFile() {
    if (!activeCase || !requirement || !selectedFile) return;
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(selectedFile.type)) { setUploadState("FAILED"); setUploadError("Choose a PDF, PNG, JPG, or WebP file."); return; }
    if (selectedFile.size < 1 || selectedFile.size > 20 * 1024 * 1024) { setUploadState("FAILED"); setUploadError("Choose a file between 1 byte and 20 MB."); return; }
    setUploading(true); setUploadState("UPLOADING"); setUploadError(""); setMessage("Uploading the protected file...");
    try {
      const body = new FormData(); body.set("file", selectedFile); body.set("caseId", activeCase.id); if (requirement.floorLabel) body.set("floorLabel", requirement.floorLabel);
      const response = await fetch("/api/case-files", { method: "POST", headers: buildUploadHeaders(activeUser.role), body });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "The file could not be uploaded.", response.status);
      const asset = result.asset as CaseFileAsset;
      if (asset.caseId !== activeCase.id || asset.floorLabel !== requirement.floorLabel) throw new Error("The uploaded file did not match this case and floor. It was not selected.");
      setEvidenceRef(asset.evidenceRef); await refreshAssets(activeCase.id, requirement.floorLabel); setUploadState("UPLOADED_NOT_RECORDED"); setMessage("Protected upload complete. Record this exact document version next.");
    } catch (error) { const detail = error instanceof Error ? error.message : "The file could not be uploaded."; setUploadState("FAILED"); setUploadError(detail); setMessage(detail); }
    finally { setUploading(false); }
  }

  async function approveManualSheet() {
    if (!state || !activeCase || !requestedFloorId || !approvalCandidate) return;
    if (approvalReason.trim().length < 20) { setMessage("Explain the Founder approval using at least 20 characters."); return; }
    if (!window.confirm("Founder approve this exact verified manual utility sheet for report inclusion?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
        action: "manual-sheet-approve", caseId: activeCase.id, floorId: requestedFloorId, documentId: approvalCandidate.id, reason: approvalReason,
        idempotencyKey: approvalKey.current, expectedRecordVersion: activeCase.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null
      }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : result.error?.message ?? "Founder approval could not be recorded.", response.status);
      approvalKey.current = crypto.randomUUID(); await refresh(); router.refresh(); setMessage("Manual utility sheet Founder-approved for this exact Case and floor.");
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage("The Case changed while you were reviewing. Reload the exact sheet before approving it.");
      else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest Case before approving this sheet.");
      else setMessage(error instanceof Error ? error.message : "Founder approval could not be recorded.");
    } finally { setBusy(false); }
  }

  const openIssue = editorDocument?.issueHistory?.find((item) => item.status === "OPEN");
  const savingIssue = blocker || revisionStatus === "CHANGES_REQUIRED";
  const verificationBlocked = revisionStatus === "VERIFIED" && (blocker || Boolean(discrepancy.trim()) || Boolean(openIssue));
  const documentUnchanged = Boolean(editorDocument
    && versionLabel.trim() === editorDocument.versionLabel
    && (documentDate || undefined) === editorDocument.documentDate?.slice(0, 10)
    && evidenceRef === editorDocument.evidenceRef
    && revisionStatus === editorDocument.revisionStatus
    && blocker === editorDocument.blocker
    && discrepancy.trim() === (editorDocument.discrepancy ?? "")
    && reviewObservation.trim() === (editorDocument.reviewObservation ?? "")
    && requiredChange.trim() === (editorDocument.requiredChange ?? "")
    && preferredAlternative.trim() === (editorDocument.preferredAlternative ?? "")
    && acceptableAlternative.trim() === (editorDocument.acceptableAlternative ?? "")
    && ownerRole === editorDocument.ownerRole
    && ownerName.trim() === editorDocument.ownerName);
  const issueFieldsValid = !savingIssue || Boolean(discrepancy.trim() && requiredChange.trim() && ownerName.trim());
  const canSave = Boolean(requirement && versionLabel.trim() && evidenceRef && ownerName.trim() && revisionStatus !== "SUPERSEDED" && issueFieldsValid && !verificationBlocked && !documentUnchanged && editorDocument?.founderApprovalStatus !== "APPROVED");
  const recordBlockedReason = !versionLabel.trim() ? "Enter a version name."
    : !evidenceRef ? "Select the exact protected upload."
      : !ownerName.trim() ? "Enter the next responsible person or team."
        : verificationBlocked ? "Clear the blocker and discrepancy before verification."
          : savingIssue && !issueFieldsValid ? "Describe the discrepancy, required correction and responsible person, then save the review issue."
          : editorDocument?.founderApprovalStatus === "APPROVED" ? "This exact version is Founder approved and immutable."
          : documentUnchanged ? "This exact document version is already recorded. Change the review or start a successor version."
            : "Ready to record this document version.";
  const primaryIndex = requirements.findIndex((item) => !item.ready);
  const showEditor = Boolean(requirement && (!approvedDocument || draftMode || successorDraft));
  const issueMode = savingIssue || Boolean(openIssue);
  const primaryLabel = editorDocument?.founderApprovalStatus === "APPROVED"
    ? "Founder approved"
    : editorDocument?.revisionStatus === "VERIFIED" && revisionStatus === "VERIFIED"
      ? "Version verified"
      : savingIssue
        ? "Save review issue"
        : revisionStatus === "VERIFIED"
          ? "Verify this version"
          : editorDocument
            ? "Save review"
            : approvedDocument
              ? "Save successor draft"
              : "Record document";

  const checklist = <><div className="eyebrow">Required checklist</div><h2>What is ready?</h2>{!activeCase ? <p className="subtle">Open a case first.</p> : <div className="list">{requirements.map((item, index) => { const itemStatus = !item.document ? "Missing" : item.ready ? "Verified" : item.document.revisionStatus === "CHANGES_REQUIRED" || item.document.blocker || item.document.discrepancy ? "Needs correction" : "Received"; return <button type="button" className={index === primaryIndex ? "button" : "button-secondary"} key={`${item.assetType}-${item.floorLabel ?? "case"}`} onClick={() => setSelectedRequirement(index)} aria-pressed={index === selectedRequirement}><strong>{label(item.assetType)}{item.floorLabel ? ` · ${item.floorLabel}` : ""}</strong><span>{itemStatus}{item.document ? ` · Next: ${item.document.ownerName}` : " · Next: consultant"}</span></button>; })}</div>}</>;

  return <section className={`section-grid files-workspace files-focus-${focus}`} aria-labelledby="files-title">
    {focus === "manual-sheet" && approvedDocument && <div className="card span-12 status-approved"><div className="eyebrow">Approved current version</div><h2>{approvedDocument.versionLabel}</h2><p className="subtle">Founder approved · Verified · Exact floor/report binding retained. This immutable version remains authoritative until a verified successor receives Founder approval.</p><div className="pill-row"><span className="pill">Version {approvedDocument.version}</span><span className="pill">{approvedDocument.documentDate ?? "Date not recorded"}</span><span className="pill">Founder approved</span></div>{!successorDraft && !draftMode && <button type="button" className="button-secondary" onClick={() => setDraftMode(true)}>Start successor version</button>}</div>}
    {focus === "manual-sheet" && (successorDraft || (approvedDocument && draftMode)) && <div className="card span-12 status-attention" role="status"><div className="eyebrow">Successor draft</div><h2>Does not replace approved {approvedDocument?.versionLabel} until verified and Founder approved</h2><p className="subtle">Draft blockers and corrections apply only to this successor. The approved current version and its report lineage remain valid unless the successor is promoted.</p></div>}
    {focus === "manual-sheet" && approvalCandidate && <div className="card span-12"><div className="eyebrow">Founder approval</div><h2>Approve the verified version</h2><p className="subtle">Verification confirms the file review. Founder approval promotes this exact immutable successor for report inclusion and preserves the prior version as superseded history.</p><label className="field" htmlFor="manual-sheet-approval-reason"><span>Approval reason</span><textarea id="manual-sheet-approval-reason" value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} minLength={20} maxLength={500} disabled={busy} /></label><button type="button" className="button" disabled={busy || approvalReason.trim().length < 20} onClick={() => void approveManualSheet()}>{busy ? "Approving..." : "Founder approve sheet"}</button>{approvalReason.trim().length < 20 && <p className="meta">Approval is disabled until the reason contains at least 20 characters.</p>}</div>}
    <div className="card span-12"><div className="eyebrow">Files and drawings</div><h1 id="files-title">{readiness?.ready ? "All required files are verified" : "Check the next required file"}</h1><p className="subtle">See what is missing, what needs correction, and who acts next.</p><div className="founder-context-bar" aria-label="Locked file context"><span>Case</span><strong>{activeCase?.caseNumber ?? "Unavailable"}</strong><span aria-hidden="true">→</span><span>{client?.displayName ?? "Client unavailable"}</span><span aria-hidden="true">→</span><span>{requestedFloorLabel ?? "Floor unavailable"}</span><button className="button-secondary" type="button" onClick={() => void refresh()} disabled={busy}>Reload</button></div><div className="pill-row"><span className="pill">Revision {activeCase?.revisionNumber ?? 1}</span><span className="pill">{readyCount} of {requirements.length} verified</span></div>{!activeCase && <p role="alert">This route does not contain an authorised Case and Client context. Select the case again.</p>}{activeCase && !requestedFloorLabel && <p role="alert">This route does not contain an authorised floor for the selected case. Select the floor again.</p>}</div>
    {focus === "manual-sheet" ? <details className="card span-12 founder-technical-details"><summary>View other required files</summary><div className="details-body">{checklist}</div></details> : <div className="card span-12">{checklist}</div>}
    {showEditor && <div className="card span-12" aria-live="polite"><div className="eyebrow">Protected upload status</div><div className={`upload-status upload-status-${uploadState.toLowerCase()}`} role={uploadState === "FAILED" ? "alert" : "status"}><strong>{label(uploadState)}</strong>{selectedFile && <span> · {selectedFile.name.replace(/[\r\n]/g, " ")} · {selectedFile.type || "unknown type"} · {Math.ceil(selectedFile.size / 1024)} KB</span>}{uploadError && <span> · {uploadError}</span>}</div>{uploadState === "NOT_SELECTED" && <p className="meta">Upload is disabled until a PDF or supported image is selected.</p>}{uploadState === "FAILED" && selectedFile && <button type="button" className="button-secondary" disabled={uploading} onClick={() => void uploadFile()}>Retry upload</button>}{uploadState === "UPLOADED_NOT_RECORDED" && <p className="meta">The protected upload succeeded. Record this exact version next; it is not verified or current yet.</p>}</div>}
    {showEditor && requirement && <div className="card span-12"><div className="eyebrow">{approvedDocument ? "Successor draft" : "Manual utility sheet"}</div><h2>{label(requirement.assetType)}{requirement.floorLabel ? ` · ${requirement.floorLabel}` : ""}</h2><p className="subtle">Upload or select the original full-colour manually marked utility sheet for this exact floor, name and date it, review it, then verify the immutable version.</p><div className="two-col"><div className="field"><label htmlFor="file-version">Version name</label><input id="file-version" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} maxLength={120} /></div><div className="field"><label htmlFor="file-date">Document date</label><input id="file-date" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></div><div className="field"><label htmlFor="case-file">Upload the protected original sheet</label><input id="case-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} disabled={uploading || Boolean(editorDocument)} /><span className="meta">PDF, PNG, JPG, or WebP · up to 20 MB</span><button type="button" className="button-secondary" disabled={!selectedFile || uploading || Boolean(editorDocument)} onClick={() => void uploadFile()}>{uploading ? "Uploading..." : "Upload securely"}</button></div><div className="field"><label htmlFor="file-evidence">Protected file for this version</label><select id="file-evidence" ref={evidenceRefControl} value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} disabled={Boolean(editorDocument)} aria-invalid={Boolean(fieldErrors.evidenceRef)} aria-describedby={fieldErrors.evidenceRef ? "file-evidence-error" : undefined}><option value="">Choose a matching protected upload</option>{assets.map((asset) => <option value={asset.evidenceRef} key={asset.id}>{asset.fileName}</option>)}</select>{fieldErrors.evidenceRef && <span id="file-evidence-error" className="field-error">{fieldErrors.evidenceRef}</span>}<span className="meta">Only uploads for this case and exact floor are shown. Storage details stay hidden.</span>{selectedAsset && <details><summary>File details</summary><span className="meta">{selectedAsset.fileName} · {selectedAsset.mimeType} · {Math.ceil(selectedAsset.sizeBytes / 1024)} KB · {new Date(selectedAsset.createdAt).toLocaleDateString()}</span></details>}</div><div className="field"><label htmlFor="file-status">Review status</label><select id="file-status" value={revisionStatus} onChange={(event) => { setRevisionStatus(event.target.value as DocumentRevisionStatus); if (event.target.value === "CHANGES_REQUIRED") setBlocker(true); }} disabled={editorDocument?.founderApprovalStatus === "APPROVED"}>{documentRevisionStatuses.filter((status) => status !== "SUPERSEDED").map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></div><label className="list-item"><span><input type="checkbox" checked={blocker} onChange={(event) => setBlocker(event.target.checked)} disabled={editorDocument?.founderApprovalStatus === "APPROVED"} /> This issue blocks this successor version</span></label></div>{issueMode && <div className="panel-grid" aria-label="Review issue details"><div className="field"><label htmlFor="file-discrepancy">What does not match?</label><textarea id="file-discrepancy" value={discrepancy} onChange={(event) => setDiscrepancy(event.target.value)} maxLength={1000} /></div><div className="field"><label htmlFor="required-change">Required correction</label><textarea id="required-change" value={requiredChange} onChange={(event) => setRequiredChange(event.target.value)} maxLength={2000} /></div><div className="two-col"><div className="field"><label htmlFor="file-owner-role">Next owner</label><select id="file-owner-role" value={ownerRole} onChange={(event) => setOwnerRole(event.target.value as ResponsibilityRole)}>{responsibilityRoles.map((role) => <option key={role} value={role}>{label(role)}</option>)}</select></div><div className="field"><label htmlFor="file-owner-name">Person or team</label><input id="file-owner-name" ref={ownerNameRef} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={120} /></div></div><div className="field"><label htmlFor="review-observation">Review observation</label><textarea id="review-observation" value={reviewObservation} onChange={(event) => setReviewObservation(event.target.value)} maxLength={2000} /></div></div>}{openIssue && <div className="panel status-attention"><h3>Resolve the recorded issue</h3><p className="subtle">The original issue remains in append-only history. Explain how it was resolved; the editor will clear the active blocker and return this version to Under review.</p><label className="field" htmlFor="issue-resolution-note"><span>Resolution note</span><textarea id="issue-resolution-note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} minLength={10} maxLength={1000} /></label><button type="button" className="button-secondary" disabled={busy || resolutionNote.trim().length < 10} onClick={() => void resolveIssue()}>{busy ? "Resolving..." : "Resolve issue"}</button>{resolutionNote.trim().length < 10 && <p className="meta">Enter at least 10 characters to enable Resolve issue.</p>}</div>}<details><summary>Advanced review and version history</summary><div className="field"><label htmlFor="preferred-alternative">Preferred alternative</label><textarea id="preferred-alternative" value={preferredAlternative} onChange={(event) => setPreferredAlternative(event.target.value)} maxLength={1000} /></div><div className="field"><label htmlFor="acceptable-alternative">Acceptable alternative</label><textarea id="acceptable-alternative" value={acceptableAlternative} onChange={(event) => setAcceptableAlternative(event.target.value)} maxLength={1000} /></div>{editorDocument && <p className="meta">Record version {editorDocument.version} · Received {editorDocument.received.at} · Updated {editorDocument.updated.at}</p>}{editorDocument?.issueHistory?.length ? <div className="list">{editorDocument.issueHistory.map((issue) => <div className="list-item" key={issue.id}><strong>{issue.status} review issue</strong><span>{issue.discrepancy}</span><span className="meta">Opened {issue.openedAt}{issue.resolvedAt ? ` · Resolved ${issue.resolvedAt}: ${issue.resolutionNote}` : ""}</span></div>)}</div> : null}</details>{verificationBlocked && <p role="alert">Verification is unavailable until the saved review issue is resolved. Use Resolve issue above; the history will be preserved.</p>}<button type="button" className="button" disabled={busy || !canSave} onClick={() => void save()}>{busy ? "Saving..." : primaryLabel}</button>{!canSave && <p className="meta">{recordBlockedReason}</p>}</div>}
    <details className="card span-12 founder-technical-details"><summary>Version history and recovery</summary><div className="details-body">{caseDocuments.length ? <div><p className="meta">{caseDocuments.length} recorded version{caseDocuments.length === 1 ? "" : "s"} for this case.</p><div className="list">{caseDocuments.map((document) => <div className="list-item" key={document.id}><strong>{label(document.assetType)} · {document.versionLabel}</strong><span>{label(document.revisionStatus)} · {document.isCurrent ? "Current" : "Superseded"}</span><span className="meta">Owner: {document.ownerName} · record version {document.version}</span></div>)}</div></div> : <p className="subtle">No document versions recorded yet.</p>}<div className="footer-note" role={message.includes("could not") || message.includes("changed") || message.includes("missing") ? "alert" : "status"} aria-live="polite">{message}</div></div></details>
    {showEditor && <div className={`footer-note ${canSave ? "" : "status-blocked"}`} role={Object.keys(fieldErrors).length ? "alert" : "status"} aria-live="polite">{Object.keys(fieldErrors).length ? Object.values(fieldErrors)[0] : recordBlockedReason}</div>}
  </section>;
}
