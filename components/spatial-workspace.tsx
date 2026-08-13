"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { projectFounderFloorQueues } from "@/lib/founder-regeneration";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { useRouter } from "next/navigation";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type CaseFileAsset = { id: string; evidenceRef: string; caseId: string; floorLabel?: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
type GoogleUploadState = "NOT_SELECTED" | "SELECTED" | "UPLOADING" | "UPLOADED_NOT_RECORDED" | "RECORDED" | "FAILED";
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const uploadHeaders = (role: string) => typeof window !== "undefined" && window.location.hostname === "localhost" ? { "x-uchit-demo-role": role } : undefined;
const readableFileSize = (size: number) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function SpatialWorkspace({ focus = "all", caseId: requestedCaseId, floorId: requestedFloorId }: { focus?: "all" | "plan" | "orientation" | "gridding"; clientId?: string; caseId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const router = useRouter();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [assets, setAssets] = useState<CaseFileAsset[]>([]);
  const [caseAssets, setCaseAssets] = useState<CaseFileAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [planUploadState, setPlanUploadState] = useState<GoogleUploadState>("NOT_SELECTED");
  const [planUploadError, setPlanUploadError] = useState("");
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
  const [openingErrors, setOpeningErrors] = useState<Record<string, string>>({});
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

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error("Project setup could not be loaded.");
      const next = await response.json() as Bootstrap;
      setState(next);
      setMessage("Project and floor setup is up to date.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Project setup could not be loaded."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  // Founder spatial work is bound to the exact permission-validated route
  // context. Case/floor switching belongs to the global selector; this
  // workspace never chooses the first client, case, or floor.
  const caseRecord = requestedCaseId ? state?.vastuCases.find((item) => item.id === requestedCaseId) : undefined;
  const client = caseRecord ? state?.clients.find((item) => item.id === caseRecord.clientId) : undefined;
  const project = state?.projects.find((item) => item.id === caseRecord?.projectId);
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id && item.projectId === project?.id) ?? [];
  const floor = requestedFloorId ? floors.find((item) => item.id === requestedFloorId) : undefined;
  const plan = state?.planVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.status === "CURRENT");
  const replacingPlan = Boolean(plan && planAssetRef && planAssetRef !== plan.protectedFileRef);
  const selectedPlanIsCurrent = Boolean(plan && planAssetRef === plan.protectedFileRef);
  const markedEvidence = state?.spatialEvidenceVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_32D_CHAKRA_V1" && item.has32SectorChakra === true && item.status === "CURRENT");
  const marked16Evidence = state?.spatialEvidenceVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.kind === "HAND_MARKED_PLAN" && item.classification === "MARKED_16D_MAPPING_V1" && item.has16DirectionMapping === true && item.status === "CURRENT");
  const selectedMarkedIsCurrent = Boolean(markedEvidence && markedAssetRef === markedEvidence.protectedFileRef);
  const selectedMarked16IsCurrent = Boolean(marked16Evidence && marked16AssetRef === marked16Evidence.protectedFileRef);
  const googleEvidence = state?.spatialEvidenceVersions.find((item) => item.caseId === caseRecord?.id && item.kind === "GOOGLE_EARTH_ORIENTATION" && item.status === "CURRENT");
  const replacingGoogleEvidence = Boolean(googleEvidence && googleAssetRef && googleAssetRef !== googleEvidence.protectedFileRef);
  const selectedGoogleEvidenceIsCurrent = Boolean(googleEvidence && googleAssetRef === googleEvidence.protectedFileRef);
  const orientation = state?.orientationVersions.find((item) => item.caseId === caseRecord?.id && item.status === "LOCKED");
  const openings = state?.openingMappings.filter((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id) ?? [];
  const openingCoordinateError = (value: string) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100 ? "Enter a percentage from 0 to 100." : "";
  const openingXError = openingCoordinateError(openingX);
  const openingYError = openingCoordinateError(openingY);
  const openingDuplicate = openings.some((item) => item.kind === openingKind && item.markerX === Number(openingX) / 100 && item.markerY === Number(openingY) / 100);
  const spaces = state?.spaceMappings.filter((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.planVersionId === plan?.id && item.orientationVersionId === orientation?.id) ?? [];
  const readyForMapping = Boolean(plan && markedEvidence && orientation);
  const founderQueues = state && caseRecord ? projectFounderFloorQueues(state, caseRecord.id) : [];

  useEffect(() => {
    if (!orientation) return;
    setDegree(String(orientation.exactDegree));
    setOrientationReason(orientation.lockReason ?? "");
    setGoogleAssetRef(googleEvidence?.protectedFileRef ?? "");
    setGoogleUploadState(googleEvidence ? "RECORDED" : "NOT_SELECTED");
    setCaseFile(null);
  }, [orientation?.id, googleEvidence?.id]);
  useEffect(() => {
    if (!plan) return;
    setPlanVersion(plan.versionLabel);
    setPlanAssetRef(plan.protectedFileRef);
    setPlanUploadState("RECORDED");
    setFile(null);
  }, [plan?.id]);
  useEffect(() => {
    if (markedEvidence) { setMarkedAssetRef(markedEvidence.protectedFileRef); setHas32SectorChakra(true); }
    if (marked16Evidence) { setMarked16AssetRef(marked16Evidence.protectedFileRef); setHas16DirectionMapping(true); }
  }, [markedEvidence?.id, marked16Evidence?.id]);

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
      delete keys.current[action]; await refresh(); router.refresh(); setMessage(success); return true;
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
      // The completed upload is now represented by its protected asset record.
      // Clear the browser File object so the same bytes cannot be uploaded again
      // accidentally; choosing another file is an explicit replacement action.
      if (floorLabel) setFile(null); else setCaseFile(null);
      setMessage("Protected file uploaded. Choose it below to record the version.");
    } catch (error) { const explanation = error instanceof Error ? error.message : "Upload failed."; setMessage(explanation); onFailed?.(explanation); }
    finally { setBusy(false); }
  }

  function degreeValidation(value: string) {
    if (value.trim() === "") return "Enter the exact orientation degree.";
    const numericDegree = Number(value);
    return !Number.isFinite(numericDegree) || numericDegree < 0 || numericDegree >= 360 ? "Enter a degree from 0 inclusive to less than 360." : "";
  }

  function reasonValidation(value: string) {
    return value.trim().length < 20 ? "Explain why this orientation is correct using at least 20 characters." : "";
  }

  const currentDegreeError = degreeValidation(degree);
  const currentReasonError = reasonValidation(orientationReason);
  const orientationUnchanged = Boolean(orientation && googleEvidence?.id === orientation.googleEarthEvidenceVersionId && Number(degree) === orientation.exactDegree && orientationReason.trim() === (orientation.lockReason ?? "").trim());

  function validateOrientation() {
    const errors: Record<string, string> = {};
    if (!googleAssetRef && !googleEvidence) errors.googleEvidence = "Upload and select the Google Earth screenshot before recording orientation evidence.";
    const degreeError = degreeValidation(degree); if (degreeError) errors.degree = degreeError;
    const reasonError = reasonValidation(orientationReason); if (reasonError) errors.reason = reasonError;
    setOrientationErrors(errors);
    return errors;
  }

  function focusFirstOrientationError(errors: Record<string, string>) {
    if (errors.googleEvidence) (googleAssetRef ? googleAssetControlRef : googleFileRef).current?.focus();
    else if (errors.degree) degreeRef.current?.focus();
    else if (errors.reason) reasonRef.current?.focus();
  }

  useEffect(() => {
    const hasUnsavedOrientation = ["SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED"].includes(googleUploadState)
      || degree.trim() !== (orientation ? String(orientation.exactDegree) : "")
      || orientationReason.trim() !== (orientation?.lockReason ?? "");
    const hasUnsavedPlan = ["SELECTED", "UPLOADING", "UPLOADED_NOT_RECORDED"].includes(planUploadState)
      || planVersion.trim() !== (plan?.versionLabel ?? "")
      || planAssetRef !== (plan?.protectedFileRef ?? "");
    if (!hasUnsavedOrientation && !hasUnsavedPlan) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [googleUploadState, degree, orientationReason, planUploadState, planVersion, planAssetRef, orientation?.id, orientation?.exactDegree, orientation?.lockReason, plan?.id, plan?.versionLabel, plan?.protectedFileRef]);

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
    <div className="card span-12"><div className="eyebrow">Project and floor context</div><h1 id="spatial-title">Set up the selected floor</h1><p className="subtle">The project shares the client and orientation. Plans, marked evidence, mappings, evaluations, and reports remain separate for every floor.</p><div className="founder-context-bar" aria-label="Locked spatial context"><span>Case</span><strong>{caseRecord?.caseNumber ?? "Select a case to continue"}</strong><span aria-hidden="true">→</span><span>{client?.displayName ?? "Client unavailable"}</span><span aria-hidden="true">→</span><span>{project?.propertyName ?? "Project unavailable"}</span><span aria-hidden="true">→</span><span>{floor?.floorLabel ?? "Select a floor to continue"}</span></div>{!caseRecord || !floor ? <p className="blocked-note" role="alert">Select an authorised case and floor from the global case selector before editing spatial evidence.</p> : null}<div className="pill-row"><span className="pill">Project {project ? "open" : "not ready"}</span><span className="pill">{floors.length} floor{floors.length === 1 ? "" : "s"}</span><span className="pill">{orientation ? `${orientation.exactDegree}° locked` : "Orientation not locked"}</span></div></div>

    <div className="card span-6"><div className="eyebrow">Step 1</div><h2>Current digital plan</h2><p className="subtle">Upload the clean plan used for computation. A replacement supersedes the old version without deleting it.</p><div className={`founder-flow-status ${planUploadState === "FAILED" ? "status-blocked" : planUploadState === "RECORDED" ? "status-ready" : ""}`} role={planUploadState === "FAILED" ? "alert" : "status"} aria-live="polite"><strong>Plan status: {planUploadState.replaceAll("_", " ")}</strong>{file ? <span className="meta"> {file.name.replace(/[\r\n]/g, " ")} · {file.type || "unknown type"} · {readableFileSize(file.size)}</span> : null}{planUploadState === "UPLOADING" ? <span> Uploading securely…</span> : null}{planUploadState === "UPLOADED_NOT_RECORDED" ? <span> Uploaded securely; record the plan version next.</span> : null}{planUploadState === "RECORDED" ? <span> Protected floor plan uploaded securely and recorded.</span> : null}{planUploadError ? <p>{planUploadError}</p> : null}</div><div className="field"><label htmlFor="plan-file">Plan file</label><input id="plan-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setPlanUploadError(""); setPlanUploadState(selected ? "SELECTED" : "NOT_SELECTED"); }} /><button className="button-secondary" type="button" disabled={!file || busy || !floor} onClick={() => { if (!file) return; setPlanUploadState("UPLOADING"); setPlanUploadError(""); void upload(file, floor?.floorLabel, (asset) => { setPlanAssetRef(asset.evidenceRef); setPlanUploadState("UPLOADED_NOT_RECORDED"); }, (error) => { setPlanUploadState("FAILED"); setPlanUploadError(error); }); }}>{planUploadState === "FAILED" ? "Retry protected plan upload" : "Upload protected plan"}</button><p className="meta">{file ? "Selected file is ready to upload." : "Upload is disabled until a file is selected."}</p></div><div className="field"><label htmlFor="plan-version">Version name</label><input id="plan-version" value={planVersion} onChange={(event) => setPlanVersion(event.target.value)} placeholder="Example: Architect plan 03" maxLength={80} /></div><div className="field"><label htmlFor="plan-asset">Uploaded plan</label><select id="plan-asset" value={planAssetRef} onChange={(event) => { const nextRef = event.target.value; setPlanAssetRef(nextRef); setPlanUploadState(nextRef ? nextRef === plan?.protectedFileRef ? "RECORDED" : "UPLOADED_NOT_RECORDED" : "NOT_SELECTED"); }}><option value="">Choose a file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><button className="button" type="button" disabled={busy || !floor || !planVersion.trim() || !planAssetRef || selectedPlanIsCurrent} onClick={() => { if (replacingPlan && !window.confirm("Record this as a new floor plan version? The current plan remains in immutable history and dependent work will require regeneration.")) return; void (async () => { const recorded = await run("plan-version-create", { floorId: floor?.id, versionLabel: planVersion, evidenceRef: planAssetRef }, replacingPlan ? "Replacement floor plan recorded as a new immutable version." : "Current plan version recorded."); if (recorded) setPlanUploadState("RECORDED"); })(); }}>{selectedPlanIsCurrent ? "Current plan recorded" : replacingPlan ? "Record replacement plan" : "Record current plan"}</button><p className="meta">{selectedPlanIsCurrent ? "This exact protected file is already the current plan." : !planAssetRef ? "Record is disabled until a protected upload is selected." : !planVersion.trim() ? "Record is disabled until a version name is entered." : replacingPlan ? "Recording creates a new immutable plan version after confirmation." : "Ready to record this protected plan."}</p>{plan && <p className="meta">Current: {plan.versionLabel}</p>}</div>

    <div className="card span-6"><div className="eyebrow">Step 2</div><h2>Original hand-marked evidence · 32-sector chakra</h2><p className="subtle">Select the original full-colour hand-marked evidence scan and confirm that the 32-sector chakra overlay is visibly present. No sector labels or geometry are inferred by the system.</p><div className="field"><label htmlFor="marked-asset">Full-colour 32-sector marked scan</label><select id="marked-asset" value={markedAssetRef} onChange={(event) => setMarkedAssetRef(event.target.value)}><option value="">Choose a protected file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><label className="check-row" htmlFor="has-32-sector-chakra"><input id="has-32-sector-chakra" type="checkbox" checked={has32SectorChakra} onChange={(event) => setHas32SectorChakra(event.target.checked)} /> Founder confirmation: the 32-sector chakra overlay is visibly present.</label><button className="button" type="button" disabled={busy || !floor || !plan || !markedAssetRef || !has32SectorChakra || selectedMarkedIsCurrent} onClick={() => void run("spatial-evidence-create", { floorId: floor?.id, planVersionId: plan?.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, evidenceRef: markedAssetRef, fullColourConfirmed: true }, "32-sector chakra evidence recorded and Founder-confirmed.")}>{selectedMarkedIsCurrent ? "32D evidence recorded" : markedEvidence ? "Record replacement 32D evidence" : "Confirm 32D evidence"}</button><p className="meta">{selectedMarkedIsCurrent ? "This exact protected file is already the current immutable 32D evidence." : !markedAssetRef ? "Choose the protected 32D evidence file." : !has32SectorChakra ? "Confirm that the 32-sector chakra overlay is visibly present." : markedEvidence ? "Ready to record a replacement immutable version." : "Ready to confirm the 32D evidence."}</p></div>

    <div className="card span-6"><div className="eyebrow">Step 3</div><h2>16-direction marked mapping</h2><p className="subtle">Select a separate manually prepared 16-direction marked mapping for this exact floor and plan. Computed 16D geometry and sector labels remain deferred.</p><div className="field"><label htmlFor="marked-16-asset">Full-colour 16-direction marked mapping</label><select id="marked-16-asset" value={marked16AssetRef} onChange={(event) => setMarked16AssetRef(event.target.value)}><option value="">Choose a protected file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><label className="check-row" htmlFor="has-16-direction-mapping"><input id="has-16-direction-mapping" type="checkbox" checked={has16DirectionMapping} onChange={(event) => setHas16DirectionMapping(event.target.checked)} /> Founder confirmation: this 16-direction mapping belongs to this floor and plan.</label><button className="button" type="button" disabled={busy || !floor || !plan || !marked16AssetRef || !has16DirectionMapping || selectedMarked16IsCurrent} onClick={() => void run("spatial-evidence-create", { floorId: floor?.id, planVersionId: plan?.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_16D_MAPPING_V1", has16DirectionMapping: true, evidenceRef: marked16AssetRef, fullColourConfirmed: true }, "16-direction marked mapping recorded and Founder-confirmed.")}>{selectedMarked16IsCurrent ? "16D evidence recorded" : marked16Evidence ? "Record replacement 16D evidence" : "Confirm 16D evidence"}</button><p className="meta">{selectedMarked16IsCurrent ? "This exact protected file is already the current immutable 16D evidence." : !marked16AssetRef ? "Choose the protected 16D mapping file." : !has16DirectionMapping ? "Confirm that this mapping belongs to the selected floor and plan." : marked16Evidence ? "Ready to record a replacement immutable version." : "Ready to confirm the 16D evidence."}</p></div>

    <div className="card span-12"><div className="eyebrow">Step 4</div><h2>Google Earth evidence and exact orientation</h2><p className="subtle">Upload the Google Earth screenshot at project level, record it, then deliberately lock the exact degree. Direction boundaries are not guessed here.</p>
      <div className={`founder-flow-status ${googleUploadState === "FAILED" ? "status-blocked" : googleUploadState === "RECORDED" ? "status-ready" : ""}`} role={googleUploadState === "FAILED" ? "alert" : "status"} aria-live="polite"><strong>Evidence status: {googleUploadState.replaceAll("_", " ")}</strong>{caseFile && <span className="meta"> {caseFile.name.replace(/[\r\n]/g, " ")} · {caseFile.type || "unknown type"} · {readableFileSize(caseFile.size)}</span>}{googleUploadState === "UPLOADING" && <span> Uploading securely…</span>}{googleUploadState === "UPLOADED_NOT_RECORDED" && <span> Uploaded securely; record it before locking.</span>}{googleUploadState === "RECORDED" && <span> Google Earth screenshot uploaded securely and recorded.</span>}{googleUploadError && <p>{googleUploadError}</p>}</div>
      <div className="two-col"><div className="field"><label htmlFor="google-file">Google Earth screenshot</label><input ref={googleFileRef} id="google-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" aria-invalid={Boolean(orientationErrors.googleEvidence)} aria-describedby={orientationErrors.googleEvidence ? "google-file-error" : undefined} onChange={(event) => { const selected = event.target.files?.[0] ?? null; setCaseFile(selected); setGoogleUploadError(""); setGoogleUploadState(selected ? "SELECTED" : "NOT_SELECTED"); setOrientationErrors((current) => ({ ...current, googleEvidence: "" })); }} />{orientationErrors.googleEvidence && <p id="google-file-error" className="field-error">{orientationErrors.googleEvidence}</p>}<button className="button-secondary" type="button" disabled={!caseFile || busy} onClick={() => { if (!caseFile) return; setGoogleUploadState("UPLOADING"); setGoogleUploadError(""); void upload(caseFile, undefined, (asset) => { setGoogleAssetRef(asset.evidenceRef); setGoogleUploadState("UPLOADED_NOT_RECORDED"); }, (error) => { setGoogleUploadState("FAILED"); setGoogleUploadError(error); }); }}>{googleUploadState === "FAILED" ? "Retry upload" : "Upload screenshot"}</button><p className="meta">{caseFile ? "Selected file is ready to upload." : "Upload is disabled until a file is selected."}</p></div>
      <div className="field"><label htmlFor="google-asset">Uploaded screenshot</label><select ref={googleAssetControlRef} id="google-asset" value={googleAssetRef} aria-invalid={Boolean(orientationErrors.googleEvidence)} aria-describedby={orientationErrors.googleEvidence ? "google-file-error" : undefined} onChange={(event) => { const nextRef = event.target.value; setGoogleAssetRef(nextRef); if (nextRef) { setGoogleUploadState(nextRef === googleEvidence?.protectedFileRef ? "RECORDED" : "UPLOADED_NOT_RECORDED"); setOrientationErrors((current) => ({ ...current, googleEvidence: "" })); } else setGoogleUploadState("NOT_SELECTED"); }}><option value="">Choose a project file</option>{caseAssets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select><button className="button-secondary" type="button" disabled={busy || !googleAssetRef || selectedGoogleEvidenceIsCurrent} onClick={() => { if (replacingGoogleEvidence && !window.confirm("Record this as a new Google Earth evidence version? The current version remains in immutable history.")) return; void (async () => { const recorded = await run("spatial-evidence-create", { kind: "GOOGLE_EARTH_ORIENTATION", evidenceRef: googleAssetRef, fullColourConfirmed: true }, replacingGoogleEvidence ? "Replacement Google Earth orientation evidence recorded as a new version." : "Google Earth orientation evidence recorded."); if (recorded) setGoogleUploadState("RECORDED"); })(); }}>{selectedGoogleEvidenceIsCurrent ? "Current file recorded" : replacingGoogleEvidence ? "Record replacement file" : "Record orientation evidence"}</button><p className="meta">{selectedGoogleEvidenceIsCurrent ? "This exact protected file is already the current recorded evidence." : googleAssetRef ? replacingGoogleEvidence ? "Recording creates a new immutable evidence version after confirmation." : "Record is available after upload completes." : "Record is disabled until an uploaded file is selected."}</p></div>
      <div className={`field ${orientationErrors.degree ? "field-invalid" : ""}`}><label htmlFor="orientation-degree">Exact degree (0 to less than 360)</label><input ref={degreeRef} id="orientation-degree" type="number" min="0" max="359.9999" step="0.0001" value={degree} aria-invalid={Boolean(orientationErrors.degree)} aria-describedby={orientationErrors.degree ? "orientation-degree-error" : undefined} onBlur={(event) => { const error = degreeValidation(event.currentTarget.value); setOrientationErrors((current) => ({ ...current, degree: error })); }} onChange={(event) => { setDegree(event.target.value); setOrientationErrors((current) => ({ ...current, degree: "" })); }} />{orientationErrors.degree && <p id="orientation-degree-error" className="field-error" role="alert">{orientationErrors.degree}</p>}</div>
      <div className={`field ${orientationErrors.reason ? "field-invalid" : ""}`}><label htmlFor="orientation-reason">Why this orientation is correct</label><textarea ref={reasonRef} id="orientation-reason" value={orientationReason} aria-invalid={Boolean(orientationErrors.reason)} aria-describedby={orientationErrors.reason ? "orientation-reason-error" : undefined} onBlur={(event) => { const error = reasonValidation(event.currentTarget.value); setOrientationErrors((current) => ({ ...current, reason: error })); }} onChange={(event) => { setOrientationReason(event.target.value); setOrientationErrors((current) => ({ ...current, reason: "" })); }} minLength={20} maxLength={500} />{orientationErrors.reason && <p id="orientation-reason-error" className="field-error" role="alert">{orientationErrors.reason}</p>}</div></div>
      <button className="button" type="button" disabled={busy || !googleEvidence || Boolean(currentDegreeError) || Boolean(currentReasonError) || orientationUnchanged} onClick={() => { const errors = validateOrientation(); if (Object.keys(errors).length) { focusFirstOrientationError(errors); return; } if (window.confirm("Lock this exact orientation? Changing it later requires new evidence and regenerates dependent work.")) void run("orientation-version-lock", { exactDegree: Number(degree), googleEarthEvidenceVersionId: googleEvidence?.id, reason: orientationReason }, "Exact orientation locked with immutable evidence."); }}>{orientationUnchanged ? "Orientation locked" : orientation ? "Create a new orientation version" : "Lock exact orientation"}</button><p className="meta">{!googleEvidence ? "Lock is disabled until evidence is recorded." : currentDegreeError ? `Lock is disabled: ${currentDegreeError}` : currentReasonError ? `Lock is disabled: ${currentReasonError}` : orientationUnchanged ? "This exact evidence, degree and rationale are already locked." : "Ready to lock the exact orientation."}</p></div>

    <div className="card span-6"><div className="eyebrow">Step 4 · 32 directions</div><h2>Entrances and windows</h2><p className="subtle">Place verified markers using percentages from the left and top of the current plan. Automatic direction naming remains blocked until its methodology version is approved.</p><div className="field"><label htmlFor="opening-kind">Opening type</label><select id="opening-kind" value={openingKind} onChange={(event) => setOpeningKind(event.target.value)}><option value="MAIN_ENTRANCE">Main entrance</option><option value="ENTRANCE">Other entrance</option><option value="WINDOW">Window</option></select></div><div className="two-col"><div className={`field ${openingErrors.x ? "field-invalid" : ""}`}><label htmlFor="opening-x">From left (%)</label><input id="opening-x" type="number" min="0" max="100" value={openingX} aria-invalid={Boolean(openingErrors.x)} aria-describedby={openingErrors.x ? "opening-x-error" : undefined} onBlur={() => setOpeningErrors((current) => ({ ...current, x: openingXError }))} onChange={(event) => { setOpeningX(event.target.value); setOpeningErrors((current) => ({ ...current, x: "" })); }} />{openingErrors.x ? <p id="opening-x-error" className="field-error" role="alert">{openingErrors.x}</p> : null}</div><div className={`field ${openingErrors.y ? "field-invalid" : ""}`}><label htmlFor="opening-y">From top (%)</label><input id="opening-y" type="number" min="0" max="100" value={openingY} aria-invalid={Boolean(openingErrors.y)} aria-describedby={openingErrors.y ? "opening-y-error" : undefined} onBlur={() => setOpeningErrors((current) => ({ ...current, y: openingYError }))} onChange={(event) => { setOpeningY(event.target.value); setOpeningErrors((current) => ({ ...current, y: "" })); }} />{openingErrors.y ? <p id="opening-y-error" className="field-error" role="alert">{openingErrors.y}</p> : null}</div></div><button className="button" type="button" disabled={busy || !readyForMapping || Boolean(openingXError) || Boolean(openingYError) || openingDuplicate} onClick={() => void run("opening-mapping-create", { floorId: floor?.id, planVersionId: plan?.id, orientationVersionId: orientation?.id, evidenceVersionId: markedEvidence?.id, kind: openingKind, markerX: Number(openingX) / 100, markerY: Number(openingY) / 100, verified: true }, "Verified opening marker saved. Direction classification awaits approved methodology.")}>{openingDuplicate ? "Marker already recorded" : "Save verified marker"}</button><p className="meta">{!readyForMapping ? "Marker saving is disabled until the current plan, locked orientation and 32D evidence are ready." : openingXError ? `Marker saving is disabled: ${openingXError}` : openingYError ? `Marker saving is disabled: ${openingYError}` : openingDuplicate ? "This exact opening type and position are already recorded." : `Ready to save. ${openings.length} marker${openings.length === 1 ? "" : "s"} currently belong to this floor version.`}</p></div>

    <div className="card span-6"><div className="eyebrow">Step 5 · 16 directions</div><h2>Mapped spaces (V4 deferred)</h2><p className="subtle">Computed 16-direction geometry, sector labels, and space findings are deferred to V4. The separate manually prepared 16-direction marked mapping above remains the authoritative evidence record.</p><p className="meta">{spaces.length} historical computed mapping record{spaces.length === 1 ? "" : "s"} remain read-only.</p><button className="button-secondary" type="button" disabled>Computed 16D mapping is deferred</button></div>

    <div className="card span-12"><div className="eyebrow">Next step</div><h2>{readyForMapping && openings.some((item) => item.kind === "MAIN_ENTRANCE") ? "Spatial evidence is recorded" : "Finish the missing spatial step"}</h2><p className="subtle">Evaluation stays blocked until every floor has a current plan, full-colour marked evidence, the exact orientation is locked, and a main entrance is verified. Direction classifications stay blocked until Yogesh approves the methodology boundaries.</p><a className="button-secondary" href="/founder/continue">Continue to evaluation readiness</a><div className="footer-note" role={/could not|failed|changed|required|blocked/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div></div>

    <div className="card span-12"><div className="eyebrow">Founder floor queues</div><h2>Resolve one floor without changing another</h2><p className="subtle">Each blocker names the exact next action. A blocker clears only after a new valid version is bound and verified.</p><div className="field"><label htmlFor="regeneration-reason">Reason for this regeneration step</label><textarea id="regeneration-reason" value={regenerationReason} onChange={(event) => setRegenerationReason(event.target.value)} minLength={20} maxLength={500} placeholder="Explain the evidence or version change and what was checked." /></div>{founderQueues.map((queue) => <article className="next-step-card" key={queue.floorId}><div className="pill-row"><span className="pill">{queue.floorLabel}</span><span className="pill">{queue.category.replaceAll("_", " ")}</span></div><h3>{queue.nextAction}</h3><p className="subtle">{queue.blockerReason}</p>{queue.invalidations.map((item) => { const options = replacementOptions(item.targetType); const nextStatus = item.status === "NEEDS_REGENERATION" ? "REPLACEMENT_REQUIRED" : item.status === "REPLACEMENT_REQUIRED" ? "REGENERATED" : "READY_FOR_REVIEW"; return <div className="field" key={item.id}><strong>{item.targetType.replaceAll("_", " ")}</strong><span className="meta">Current state: {item.status.replaceAll("_", " ")}</span>{item.status === "REPLACEMENT_REQUIRED" ? <><label htmlFor={`replacement-${item.id}`}>New valid version</label><select id={`replacement-${item.id}`} value={replacementVersionId[item.id] ?? ""} onChange={(event) => setReplacementVersionId((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose the exact replacement</option>{options.filter((option) => option.id !== item.targetId).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></> : null}<button className="button-secondary" type="button" disabled={busy || regenerationReason.trim().length < 20 || (item.status === "REPLACEMENT_REQUIRED" && !replacementVersionId[item.id])} onClick={() => void run("regeneration-transition", { floorId: queue.floorId, invalidationId: item.id, toStatus: nextStatus, replacementVersionId: replacementVersionId[item.id], reason: regenerationReason }, `${item.targetType.replaceAll("_", " ")} moved to ${nextStatus.replaceAll("_", " ")}.`, item.recordVersion)}>{nextStatus === "REPLACEMENT_REQUIRED" ? "Require replacement" : nextStatus === "REGENERATED" ? "Bind regenerated version" : "Verify and mark ready"}</button></div>; })}</article>)}</div>
    {focus !== "all" ? <div className="footer-note spatial-focused-message" role={/could not|failed|changed|required|blocked/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div> : null}
  </section>;
}
