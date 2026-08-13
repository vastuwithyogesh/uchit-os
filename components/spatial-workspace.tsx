"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { projectFounderFloorQueues } from "@/lib/founder-regeneration";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type CaseFileAsset = { id: string; evidenceRef: string; caseId: string; floorLabel?: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
type GoogleUploadState = "NOT_SELECTED" | "SELECTED" | "UPLOADING" | "UPLOADED_NOT_RECORDED" | "RECORDED" | "FAILED";
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const uploadHeaders = (role: string) => typeof window !== "undefined" && window.location.hostname === "localhost" ? { "x-uchit-demo-role": role } : undefined;
const readableFileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function SpatialWorkspace({ focus = "all", clientId: initialClientId, caseId: requestedCaseId, floorId: initialFloorId }: { focus?: "all" | "plan" | "orientation" | "gridding"; clientId?: string; caseId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [floorId, setFloorId] = useState(initialFloorId ?? "");
  const [assets, setAssets] = useState<CaseFileAsset[]>([]);
  const [caseAssets, setCaseAssets] = useState<CaseFileAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caseFile, setCaseFile] = useState<File | null>(null);
  const [planVersion, setPlanVersion] = useState("");
  const [planAssetRef, setPlanAssetRef] = useState("");
  const [markedAssetRef, setMarkedAssetRef] = useState("");
  const [marked16AssetRef, setMarked16AssetRef] = useState("");
  const [has32SectorChakra, setHas32SectorChakra] = useState(false);
  const [has16DirectionMapping, setHas16DirectionMapping] = useState(false);
  const [googleAssetRef, setGoogleAssetRef] = useState("");
  const [googleUploadState, setGoogleUploadState] = useState<GoogleUploadState>("NOT_SELECTED");
  const [googleUploadError, setGoogleUploadError] = useState("");
  const [orientationErrors, setOrientationErrors] = useState<Record<string, string>>({});
  const [degree, setDegree] = useState("");
  const [orientationReason, setOrientationReason] = useState("");
  const [openingKind, setOpeningKind] = useState("MAIN_ENTRANCE");
  const [openingX, setOpeningX] = useState("50");
  const [openingY, setOpeningY] = useState("50");
  const [spaceLabel, setSpaceLabel] = useState("");
  const [polygonText, setPolygonText] = useState("");
  const [regenerationReason, setRegenerationReason] = useState("");
  const [replacementVersionId, setReplacementVersionId] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("Loading project and floor setup...");
  const keys = useRef<Record<string, string>>({});
  const googleFileRef = useRef<HTMLInputElement>(null);
  const googleAssetControlRef = useRef<HTMLSelectElement>(null);
  const degreeRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async (preferredClientId?: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Project setup could not be loaded.");
      const next = await response.json() as Bootstrap;
      setState(next);
      setClientId((current) => preferredClientId ?? (current || next.clients[0]?.id || ""));
      setMessage("Project and floor setup is up to date.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Project setup could not be loaded."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const requestedCase = requestedCaseId ? state?.vastuCases.find((item) => item.id === requestedCaseId) : undefined;
  const selectedClient = state?.clients.find((item) => item.id === clientId) ?? state?.clients[0];
  // A Founder step is bound to its exact case. Never fall back to another
  // client or active case when a case context was supplied by the route.
  const client = requestedCase ? state?.clients.find((item) => item.id === requestedCase.clientId) : selectedClient;
  const caseRecord = requestedCase ?? (state && client ? getActiveCaseForClient(state, client.id) : undefined);
  const project = state?.projects.find((item) => item.id === caseRecord?.projectId);
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id && item.projectId === project?.id) ?? [];
  const floor = floors.find((item) => item.id === floorId) ?? floors[0];
  const plan = state?.planVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.status === "CURRENT");
  const markedEvidence = state?.spatialEvidenceVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT");
  const marked16Evidence = state?.spatialEvidenceVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1" && item.has16DirectionMapping === true && item.status === "CURRENT");
  const googleEvidence = state?.spatialEvidenceVersions.find((item) => item.caseId === caseRecord?.id && item.kind === "GOOGLE_EARTH_ORIENTATION" && item.status === "CURRENT");
  const orientation = state?.orientationVersions.find((item) => item.caseId === caseRecord?.id && item.status === "LOCKED");
  const openings = state?.openingMappings.filter((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id) ?? [];
  const spaces = state?.spaceMappings.filter((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id) ?? [];
  const readyForMapping = Boolean(plan && markedEvidence && orientation);
  const founderQueues = state && caseRecord ? projectFounderFloorQueues(state, caseRecord.id) : [];

  useEffect(() => { if (floors.length && !floors.some((item) => item.id === floorId)) setFloorId(floors[0].id); }, [floors, floorId]);

  const loadAssets = useCallback(async (activeCaseId: string, floorLabel?: string) => {
    const query = new URLSearchParams({ caseId: activeCaseId }); if (floorLabel) query.set("floorLabel", floorLabel);
    const response = await fetch(`/api/case-files?${query}`, { cache: "no-store", headers: uploadHeaders(activeUser.role) });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : "Protected files could not be loaded.", response.status);
    return result.assets as CaseFileAsset[];
  }, [activeUser.role]);

  useEffect(() => {
    setAssets([]); setCaseAssets([]);
    if (!caseRecord || !floor) return;
    void Promise.all([loadAssets(caseRecord.id, floor.floorLabel), loadAssets(caseRecord.id)]).then(([floorFiles, projectFiles]) => { setAssets(floorFiles); setCaseAssets(projectFiles); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Protected files could not be loaded."));
  }, [caseRecord?.id, floor?.id, floor?.floorLabel, loadAssets]);

  function key(action: string) { keys.current[action] ??= crypto.randomUUID(); return keys.current[action]; }
  async function run(action: string, fields: Record<string, unknown>, success: string, recordVersion = caseRecord?.recordVersion ?? 0) {
    if (!state || !caseRecord) return false;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action, caseId: caseRecord.id,
        ...fields, idempotencyKey: key(action), expectedRecordVersion: recordVersion, expectedRevision: state.persistenceRevision ?? null }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : "The step could not be saved.", response.status);
      delete keys.current[action]; await refresh(client?.id); setMessage(success); return true;
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage(`${error.message} Reload and review the current version. Nothing was silently retried.`);
      else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest case before saving this protected step.");
      else setMessage(error instanceof Error ? error.message : "The step could not be saved.");
    } finally { setBusy(false); }
    return false;
  }

  async function upload(selected: File | null, floorLabel?: string, onUploaded?: (asset: CaseFileAsset) => void, onFailed?: (error: string) => void) {
    if (!selected || !caseRecord) return;
    if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(selected.type) || selected.size < 1 || selected.size > 20 * 1024 * 1024) {
      setMessage("Choose a PDF, PNG, JPG, or WebP file up to 20 MB."); return;
    }
    setBusy(true);
    try {
      const body = new FormData(); body.set("file", selected); body.set("caseId", caseRecord.id); if (floorLabel) body.set("floorLabel", floorLabel);
      const response = await fetch("/api/case-files", { method: "POST", headers: uploadHeaders(activeUser.role), body });
      const result = await response.json(); if (!response.ok || result.ok === false) throw new Error(typeof result.error === "string" ? result.error : "Upload failed.");
      const refreshed = await loadAssets(caseRecord.id, floorLabel); if (floorLabel) setAssets(refreshed); else setCaseAssets(refreshed);
      const uploaded = result.asset as CaseFileAsset;
      if (uploaded) onUploaded?.(uploaded);
      setMessage("Protected file uploaded. Choose it below to record the version.");
    } catch (error) { const explanation = error instanceof Error ? error.message : "Upload failed."; setMessage(explanation); onFailed?.(explanation); }
    finally { setBusy(false); }
  }

  function validateOrientation() {
    const errors: Record<string, string> = {};
    const numericDegree = Number(degree);
    if (!googleAssetRef && !googleEvidence) errors.googleEvidence = "Upload and select the Google Earth screenshot before recording orientation evidence.";
    if (degree.trim() === "") errors.degree = "Enter the exact orientation degree.";
    else if (!Number.isFinite(numericDegree) || numericDegree < 0 || numericDegree >= 360) errors.degree = "Enter a degree from 0 inclusive to less than 360.";
    if (orientationReason.trim().length < 20) errors.reason = "Explain why this orientation is correct using at least 20 characters.";
    setOrientationErrors(errors);
    return errors;
  }

  function focusFirstOrientationError(errors: Record<string, string>) {
    if (errors.googleEvidence) (googleAssetRef ? googleAssetControlRef : googleFileRef).current?.focus();
    else if (errors.degree) degreeRef.current?.focus();
    else if (errors.reason) reasonRef.current?.focus();
  }

  useEffect(() => {
    const hasUnsavedOrientation = ["SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED"].includes(googleUploadState) || Boolean(degree.trim() || orientationReason.trim());
    if (!hasUnsavedOrientation) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [googleUploadState, degree, orientationReason]);

  const polygon = useMemo(() => polygonText.split(";").map((pair) => pair.trim()).filter(Boolean).map((pair) => {
    const [x, y] = pair.split(",").map(Number); return { x: x / 100, y: y / 100 };
  }), [polygonText]);

  function replacementOptions(targetType: string) {
    if (!state || !caseRecord || !floor || !plan || !orientation) return [] as Array<{ id: string; label: string }>;
    if (targetType === "OPENING_MAPPING") return state.openingMappings.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id).map((item) => ({ id: item.id, label: `${item.kind.replaceAll("_", " ")} · ${item.createdAt}` }));
    if (targetType === "SPACE_MAPPING") return state.spaceMappings.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id).map((item) => ({ id: item.id, label: `${item.spaceLabel} · ${item.createdAt}` }));
    if (targetType === "UTILITY_EVALUATION") return state.evaluationSnapshots.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id).map((item) => ({ id: item.id, label: item.snapshotName }));
    if (targetType === "SHAKTI_EVALUATION") return state.shaktiSnapshots.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.planVersionId === plan.id && item.orientationVersionId === orientation.id).map((item) => ({ id: item.id, label: `Shakti evaluation · ${item.id.slice(-8)}` }));
    if (targetType === "FINDING") return state.assessmentObservations.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id).map((item) => ({ id: item.id, label: item.title }));
    return state.reportVersions.filter((item) => item.caseId === caseRecord.id && item.floorId === floor.id && item.artifact?.templateVersion === "uchit-verdict/v3").map((item) => ({ id: item.id, label: item.versionLabel }));
  }

  return <section className={`section-grid spatial-workspace spatial-focus-${focus}`} aria-labelledby="spatial-title">
    <div className="card span-12"><div className="eyebrow">Project and floors</div><h1 id="spatial-title">Set up the property one floor at a time</h1><p className="subtle">The project shares the client and orientation. Plans, marked evidence, mappings, evaluations, and reports remain separate for every floor.</p><div className="two-col"><div className="field"><label htmlFor="spatial-client">Client</label><select id="spatial-client" value={client?.id ?? ""} onChange={(event) => setClientId(event.target.value)}>{state?.clients.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></div><div className="field"><label htmlFor="spatial-floor">Floor</label><select id="spatial-floor" value={floor?.id ?? ""} onChange={(event) => setFloorId(event.target.value)}>{floors.map((item) => <option key={item.id} value={item.id}>{item.floorLabel}</option>)}</select></div></div><div className="pill-row"><span className="pill">Project {project ? "open" : "not ready"}</span><span className="pill">{floors.length} floor{floors.length === 1 ? "" : "s"}</span><span className="pill">{orientation ? `${orientation.exactDegree}° locked` : "Orientation not locked"}</span></div></div>

    <div className="card span-6"><div className="eyebrow">Step 1</div><h2>Current digital plan</h2><p className="subtle">Upload the clean plan used for computation. A replacement supersedes the old version without deleting it.</p><div className="field"><label htmlFor="plan-file">Plan file</label><input id="plan-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><button className="button-secondary" type="button" disabled={!file || busy || !floor} onClick={() => void upload(file, floor?.floorLabel)}>Upload protected plan</button></div><div className="field"><label htmlFor="plan-version">Version name</label><input id="plan-version" value={planVersion} onChange={(event) => setPlanVersion(event.target.value)} placeholder="Example: Architect plan 03" maxLength={80} /></div><div className="field"><label htmlFor="plan-asset">Uploaded plan</label><select id="plan-asset" value={planAssetRef} onChange={(event) => setPlanAssetRef(event.target.value)}><option value="">Choose a file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><button className="button" type="button" disabled={busy || !floor || !planVersion.trim() || !planAssetRef} onClick={() => void run("plan-version-create", { floorId: floor?.id, versionLabel: planVersion, evidenceRef: planAssetRef }, "Current plan version recorded.")}>{plan ? "Record replacement plan" : "Record current plan"}</button>{plan && <p className="meta">Current: {plan.versionLabel}</p>}</div>

    <div className="card span-6"><div className="eyebrow">Step 2</div><h2>Original hand-marked evidence · 32-sector chakra</h2><p className="subtle">Select the original full-colour hand-marked evidence scan and confirm that the 32-sector chakra overlay is visibly present. No sector labels or geometry are inferred by the system.</p><div className="field"><label htmlFor="marked-asset">Full-colour 32-sector marked scan</label><select id="marked-asset" value={markedAssetRef} onChange={(event) => setMarkedAssetRef(event.target.value)}><option value="">Choose a protected file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><label className="check-row" htmlFor="has-32-sector-chakra"><input id="has-32-sector-chakra" type="checkbox" checked={has32SectorChakra} onChange={(event) => setHas32SectorChakra(event.target.checked)} /> Founder confirmation: the 32-sector chakra overlay is visibly present.</label><button className="button" type="button" disabled={busy || !floor || !plan || !markedAssetRef || !has32SectorChakra} onClick={() => void run("spatial-evidence-create", { floorId: floor?.id, planVersionId: plan?.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, evidenceRef: markedAssetRef, fullColourConfirmed: true }, "32-sector chakra evidence recorded and Founder-confirmed.")}>{markedEvidence ? "Record replacement 32D evidence" : "Confirm 32D evidence"}</button><p className="meta">{markedEvidence ? "Current 32D evidence is immutable and confirmed." : "Required before spatial evaluation can proceed."}</p></div>

    <div className="card span-6"><div className="eyebrow">Step 3</div><h2>16-direction marked mapping</h2><p className="subtle">Select a separate manually prepared 16-direction marked mapping for this exact floor and plan. Computed 16D geometry and sector labels remain deferred.</p><div className="field"><label htmlFor="marked-16-asset">Full-colour 16-direction marked mapping</label><select id="marked-16-asset" value={marked16AssetRef} onChange={(event) => setMarked16AssetRef(event.target.value)}><option value="">Choose a protected file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><label className="check-row" htmlFor="has-16-direction-mapping"><input id="has-16-direction-mapping" type="checkbox" checked={has16DirectionMapping} onChange={(event) => setHas16DirectionMapping(event.target.checked)} /> Founder confirmation: this 16-direction mapping belongs to this floor and plan.</label><button className="button" type="button" disabled={busy || !floor || !plan || !marked16AssetRef || !has16DirectionMapping} onClick={() => void run("spatial-evidence-create", { floorId: floor?.id, planVersionId: plan?.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_16D_MAPPING_V1", has16DirectionMapping: true, evidenceRef: marked16AssetRef, fullColourConfirmed: true }, "16-direction marked mapping recorded and Founder-confirmed.")}>{marked16Evidence ? "Record replacement 16D evidence" : "Confirm 16D evidence"}</button><p className="meta">{marked16Evidence ? "Current 16D evidence is immutable and confirmed." : "Required separately; it never substitutes for 32D evidence."}</p></div>

    <div className="card span-12"><div className="eyebrow">Step 4</div><h2>Google Earth evidence and exact orientation</h2><p className="subtle">Upload the Google Earth screenshot at project level, record it, then deliberately lock the exact degree. Direction boundaries are not guessed here.</p>
      <div className={`founder-flow-status ${googleUploadState === "FAILED" ? "status-blocked" : googleUploadState === "RECORDED" ? "status-ready" : ""}`} role={googleUploadState === "FAILED" ? "alert" : "status"} aria-live="polite"><strong>Evidence status: {googleUploadState.replaceAll("_", " ")}</strong>{caseFile && <span className="meta"> {caseFile.name.replace(/[\\r\\n]/g, " ")} · {caseFile.type || "unknown type"} · {readableFileSize(caseFile.size)}</span>}{googleUploadState === "UPLOADING" && <span> Uploading securely…</span>}{googleUploadState === "UPLOADED_NOT_RECORDED" && <span> Uploaded securely; record it before locking.</span>}{googleUploadState === "RECORDED" && <span> Google Earth screenshot uploaded securely and recorded.</span>}{googleUploadError && <p>{googleUploadError}</p>}</div>
      <div className="two-col"><div className="field"><label htmlFor="google-file">Google Earth screenshot</label><input ref={googleFileRef} id="google-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-invalid={Boolean(orientationErrors.googleEvidence)} aria-describedby={orientationErrors.googleEvidence ? "google-file-error" : undefined} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setCaseFile(selected); setGoogleUploadError(""); setGoogleUploadState(selected ? "SELECTED" : "NOT_SELECTED"); setOrientationErrors((current) => ({ ...current, googleEvidence: "" })); }} />{orientationErrors.googleEvidence && <p id="google-file-error" className="field-error">{orientationErrors.googleEvidence}</p>}<button className="button-secondary" type="button" disabled={!caseFile || busy} onClick={() => { if (!caseFile) return; setGoogleUploadState("UPLOADING"); setGoogleUploadError(""); void upload(caseFile, undefined, (asset) => { setGoogleAssetRef(asset.evidenceRef); setGoogleUploadState("UPLOADED_NOT_RECORDED"); }, (error) => { setGoogleUploadState("FAILED"); setGoogleUploadError(error); }); }}>{googleUploadState === "FAILED" ? "Retry upload" : "Upload screenshot"}</button><p className="meta">{caseFile ? "Selected file is ready to upload." : "Upload is disabled until a file is selected."}</p></div>
      <div className="field"><label htmlFor="google-asset">Uploaded screenshot</label><select ref={googleAssetControlRef} id="google-asset" value={googleAssetRef} aria-invalid={Boolean(orientationErrors.googleEvidence)} aria-describedby={orientationErrors.googleEvidence ? "google-file-error" : undefined} onChange={(event) => { setGoogleAssetRef(event.target.value); if (event.target.value) { setGoogleUploadState("UPLOADED_NOT_RECORDED"); setOrientationErrors((current) => ({ ...current, googleEvidence: "" })); } }}><option value="">Choose a project file</option>{caseAssets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select><button className="button-secondary" type="button" disabled={busy || !googleAssetRef} onClick={() => { void (async () => { const recorded = await run("spatial-evidence-create", { kind: "GOOGLE_EARTH_ORIENTATION", evidenceRef: googleAssetRef, fullColourConfirmed: true }, "Google Earth orientation evidence recorded."); if (recorded) setGoogleUploadState("RECORDED"); })(); }}>{googleEvidence ? "Replace file" : "Record orientation evidence"}</button><p className="meta">{googleAssetRef ? "Record is available after upload completes." : "Record is disabled until an uploaded file is selected."}</p></div>
      <div className="field"><label htmlFor="orientation-degree">Exact degree (0 to less than 360)</label><input ref={degreeRef} id="orientation-degree" type="number" min="0" max="359.9999" step="0.0001" value={degree} aria-invalid={Boolean(orientationErrors.degree)} aria-describedby={orientationErrors.degree ? "orientation-degree-error" : undefined} onBlur={() => validateOrientation()} onChange={(event) => { setDegree(event.target.value); setOrientationErrors((current) => ({ ...current, degree: "" })); }} />{orientationErrors.degree && <p id="orientation-degree-error" className="field-error">{orientationErrors.degree}</p>}</div>
      <div className="field"><label htmlFor="orientation-reason">Why this orientation is correct</label><textarea ref={reasonRef} id="orientation-reason" value={orientationReason} aria-invalid={Boolean(orientationErrors.reason)} aria-describedby={orientationErrors.reason ? "orientation-reason-error" : undefined} onBlur={() => validateOrientation()} onChange={(event) => { setOrientationReason(event.target.value); setOrientationErrors((current) => ({ ...current, reason: "" })); }} minLength={20} maxLength={500} />{orientationErrors.reason && <p id="orientation-reason-error" className="field-error">{orientationErrors.reason}</p>}</div></div>
      <button className="button" type="button" disabled={busy || !googleEvidence || !degree || orientationReason.trim().length < 20} onClick={() => { const errors = validateOrientation(); if (Object.keys(errors).length) { focusFirstOrientationError(errors); return; } if (window.confirm("Lock this exact orientation? Changing it later requires new evidence and regenerates dependent work.")) void run("orientation-version-lock", { exactDegree: Number(degree), googleEarthEvidenceVersionId: googleEvidence?.id, reason: orientationReason }, "Exact orientation locked with immutable evidence."); }}>{orientation ? "Create a new orientation version" : "Lock exact orientation"}</button><p className="meta">{!googleEvidence ? "Lock is disabled until evidence is recorded." : !degree ? "Lock is disabled until a valid degree is entered." : orientationReason.trim().length < 20 ? "Lock is disabled until the rationale is complete." : "Ready to lock the exact orientation."}</p></div>

    <div className="card span-6"><div className="eyebrow">Step 4 · 32 directions</div><h2>Entrances and windows</h2><p className="subtle">Place verified markers using percentages from the left and top of the current plan. Automatic direction naming remains blocked until its methodology version is approved.</p><div className="field"><label htmlFor="opening-kind">Opening type</label><select id="opening-kind" value={openingKind} onChange={(event) => setOpeningKind(event.target.value)}><option value="MAIN_ENTRANCE">Main entrance</option><option value="ENTRANCE">Other entrance</option><option value="WINDOW">Window</option></select></div><div className="two-col"><div className="field"><label htmlFor="opening-x">From left (%)</label><input id="opening-x" type="number" min="0" max="100" value={openingX} onChange={(event) => setOpeningX(event.target.value)} /></div><div className="field"><label htmlFor="opening-y">From top (%)</label><input id="opening-y" type="number" min="0" max="100" value={openingY} onChange={(event) => setOpeningY(event.target.value)} /></div></div><button className="button" type="button" disabled={busy || !readyForMapping} onClick={() => void run("opening-mapping-create", { floorId: floor?.id, planVersionId: plan?.id, orientationVersionId: orientation?.id, evidenceVersionId: markedEvidence?.id, kind: openingKind, markerX: Number(openingX) / 100, markerY: Number(openingY) / 100, verified: true }, "Verified opening marker saved. Direction classification awaits approved methodology.")}>Save verified marker</button><p className="meta">{openings.length} marker{openings.length === 1 ? "" : "s"} on this floor version.</p></div>

    <div className="card span-6"><div className="eyebrow">Step 5 · 16 directions</div><h2>Mapped spaces (V4 deferred)</h2><p className="subtle">Computed 16-direction geometry, sector labels, and space findings are deferred to V4. The separate manually prepared 16-direction marked mapping above remains the authoritative evidence record.</p><p className="meta">{spaces.length} historical computed mapping record{spaces.length === 1 ? "" : "s"} remain read-only.</p><button className="button-secondary" type="button" disabled>Computed 16D mapping is deferred</button></div>

    <div className="card span-12"><div className="eyebrow">Next step</div><h2>{readyForMapping && openings.some((item) => item.kind === "MAIN_ENTRANCE") ? "Spatial evidence is recorded" : "Finish the missing spatial step"}</h2><p className="subtle">Evaluation stays blocked until every floor has a current plan, full-colour marked evidence, the exact orientation is locked, and a main entrance is verified. Direction classifications stay blocked until Yogesh approves the methodology boundaries.</p><a className="button-secondary" href="/founder/continue">Continue to evaluation readiness</a><div className="footer-note" role={/could not|failed|changed|required|blocked/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div></div>

    <div className="card span-12"><div className="eyebrow">Founder floor queues</div><h2>Resolve one floor without changing another</h2><p className="subtle">Each blocker names the exact next action. A blocker clears only after a new valid version is bound and verified.</p><div className="field"><label htmlFor="regeneration-reason">Reason for this regeneration step</label><textarea id="regeneration-reason" value={regenerationReason} onChange={(event) => setRegenerationReason(event.target.value)} minLength={20} maxLength={500} placeholder="Explain the evidence or version change and what was checked." /></div>{founderQueues.map((queue) => <article className="next-step-card" key={queue.floorId}><div className="pill-row"><span className="pill">{queue.floorLabel}</span><span className="pill">{queue.category.replaceAll("_", " ")}</span></div><h3>{queue.nextAction}</h3><p className="subtle">{queue.blockerReason}</p>{queue.invalidations.map((item) => { const options = replacementOptions(item.targetType); const nextStatus = item.status === "NEEDS_REGENERATION" ? "REPLACEMENT_REQUIRED" : item.status === "REPLACEMENT_REQUIRED" ? "REGENERATED" : "READY_FOR_REVIEW"; return <div className="field" key={item.id}><strong>{item.targetType.replaceAll("_", " ")}</strong><span className="meta">Current state: {item.status.replaceAll("_", " ")}</span>{item.status === "REPLACEMENT_REQUIRED" ? <><label htmlFor={`replacement-${item.id}`}>New valid version</label><select id={`replacement-${item.id}`} value={replacementVersionId[item.id] ?? ""} onChange={(event) => setReplacementVersionId((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose the exact replacement</option>{options.filter((option) => option.id !== item.targetId).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></> : null}<button className="button-secondary" type="button" disabled={busy || regenerationReason.trim().length < 20 || (item.status === "REPLACEMENT_REQUIRED" && !replacementVersionId[item.id])} onClick={() => void run("regeneration-transition", { floorId: queue.floorId, invalidationId: item.id, toStatus: nextStatus, replacementVersionId: replacementVersionId[item.id], reason: regenerationReason }, `${item.targetType.replaceAll("_", " ")} moved to ${nextStatus.replaceAll("_", " ")}.`, item.recordVersion)}>{nextStatus === "REPLACEMENT_REQUIRED" ? "Require replacement" : nextStatus === "REGENERATED" ? "Bind regenerated version" : "Verify and mark ready"}</button></div>; })}</article>)}</div>
    {focus !== "all" ? <div className="footer-note spatial-focused-message" role={/could not|failed|changed|required|blocked/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div> : null}
  </section>;
}
