"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { getActiveCaseForClient } from "@/lib/service-framework";
import { projectFounderFloorQueues } from "@/lib/founder-regeneration";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type CaseFileAsset = { id: string; evidenceRef: string; caseId: string; floorLabel?: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
class ActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const uploadHeaders = (role: string) => typeof window !== "undefined" && window.location.hostname === "localhost" ? { "x-uchit-demo-role": role } : undefined;

export function SpatialWorkspace() {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [clientId, setClientId] = useState("");
  const [floorId, setFloorId] = useState("");
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
  const client = state?.clients.find((item) => item.id === clientId) ?? state?.clients[0];
  const caseRecord = state && client ? getActiveCaseForClient(state, client.id) : undefined;
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
    if (!state || !caseRecord) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action, caseId: caseRecord.id,
        ...fields, idempotencyKey: key(action), expectedRecordVersion: recordVersion, expectedRevision: state.persistenceRevision ?? null }) });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new ActionError(typeof result.error === "string" ? result.error : "The step could not be saved.", response.status);
      delete keys.current[action]; await refresh(client?.id); setMessage(success);
    } catch (error) {
      if (error instanceof ActionError && error.status === 409) setMessage(`${error.message} Reload and review the current version. Nothing was silently retried.`);
      else if (error instanceof ActionError && error.status === 428) setMessage("Reload the latest case before saving this protected step.");
      else setMessage(error instanceof Error ? error.message : "The step could not be saved.");
    } finally { setBusy(false); }
  }

  async function upload(selected: File | null, floorLabel?: string) {
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
      setMessage("Protected file uploaded. Choose it below to record the version.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

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

  return <section className="section-grid" aria-labelledby="spatial-title">
    <div className="card span-12"><div className="eyebrow">Project and floors</div><h1 id="spatial-title">Set up the property one floor at a time</h1><p className="subtle">The project shares the client and orientation. Plans, marked evidence, mappings, evaluations, and reports remain separate for every floor.</p><div className="two-col"><div className="field"><label htmlFor="spatial-client">Client</label><select id="spatial-client" value={client?.id ?? ""} onChange={(event) => setClientId(event.target.value)}>{state?.clients.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></div><div className="field"><label htmlFor="spatial-floor">Floor</label><select id="spatial-floor" value={floor?.id ?? ""} onChange={(event) => setFloorId(event.target.value)}>{floors.map((item) => <option key={item.id} value={item.id}>{item.floorLabel}</option>)}</select></div></div><div className="pill-row"><span className="pill">Project {project ? "open" : "not ready"}</span><span className="pill">{floors.length} floor{floors.length === 1 ? "" : "s"}</span><span className="pill">{orientation ? `${orientation.exactDegree}° locked` : "Orientation not locked"}</span></div></div>

    <div className="card span-6"><div className="eyebrow">Step 1</div><h2>Current digital plan</h2><p className="subtle">Upload the clean plan used for computation. A replacement supersedes the old version without deleting it.</p><div className="field"><label htmlFor="plan-file">Plan file</label><input id="plan-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><button className="button-secondary" type="button" disabled={!file || busy || !floor} onClick={() => void upload(file, floor?.floorLabel)}>Upload protected plan</button></div><div className="field"><label htmlFor="plan-version">Version name</label><input id="plan-version" value={planVersion} onChange={(event) => setPlanVersion(event.target.value)} placeholder="Example: Architect plan 03" maxLength={80} /></div><div className="field"><label htmlFor="plan-asset">Uploaded plan</label><select id="plan-asset" value={planAssetRef} onChange={(event) => setPlanAssetRef(event.target.value)}><option value="">Choose a file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><button className="button" type="button" disabled={busy || !floor || !planVersion.trim() || !planAssetRef} onClick={() => void run("plan-version-create", { floorId: floor?.id, versionLabel: planVersion, evidenceRef: planAssetRef }, "Current plan version recorded.")}>{plan ? "Record replacement plan" : "Record current plan"}</button>{plan && <p className="meta">Current: {plan.versionLabel}</p>}</div>

    <div className="card span-6"><div className="eyebrow">Step 2</div><h2>Original hand-marked evidence · 32-sector chakra</h2><p className="subtle">Select the original full-colour hand-marked evidence scan and confirm that the 32-sector chakra overlay is visibly present. No sector labels or geometry are inferred by the system.</p><div className="field"><label htmlFor="marked-asset">Full-colour 32-sector marked scan</label><select id="marked-asset" value={markedAssetRef} onChange={(event) => setMarkedAssetRef(event.target.value)}><option value="">Choose a protected file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><label className="check-row" htmlFor="has-32-sector-chakra"><input id="has-32-sector-chakra" type="checkbox" checked={has32SectorChakra} onChange={(event) => setHas32SectorChakra(event.target.checked)} /> Founder confirmation: the 32-sector chakra overlay is visibly present.</label><button className="button" type="button" disabled={busy || !floor || !plan || !markedAssetRef || !has32SectorChakra} onClick={() => void run("spatial-evidence-create", { floorId: floor?.id, planVersionId: plan?.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, evidenceRef: markedAssetRef, fullColourConfirmed: true }, "32-sector chakra evidence recorded and Founder-confirmed.")}>{markedEvidence ? "Record replacement 32D evidence" : "Confirm 32D evidence"}</button><p className="meta">{markedEvidence ? "Current 32D evidence is immutable and confirmed." : "Required before spatial evaluation can proceed."}</p></div>

    <div className="card span-6"><div className="eyebrow">Step 3</div><h2>16-direction marked mapping</h2><p className="subtle">Select a separate manually prepared 16-direction marked mapping for this exact floor and plan. Computed 16D geometry and sector labels remain deferred.</p><div className="field"><label htmlFor="marked-16-asset">Full-colour 16-direction marked mapping</label><select id="marked-16-asset" value={marked16AssetRef} onChange={(event) => setMarked16AssetRef(event.target.value)}><option value="">Choose a protected file</option>{assets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select></div><label className="check-row" htmlFor="has-16-direction-mapping"><input id="has-16-direction-mapping" type="checkbox" checked={has16DirectionMapping} onChange={(event) => setHas16DirectionMapping(event.target.checked)} /> Founder confirmation: this 16-direction mapping belongs to this floor and plan.</label><button className="button" type="button" disabled={busy || !floor || !plan || !marked16AssetRef || !has16DirectionMapping} onClick={() => void run("spatial-evidence-create", { floorId: floor?.id, planVersionId: plan?.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_16D_MAPPING_V1", has16DirectionMapping: true, evidenceRef: marked16AssetRef, fullColourConfirmed: true }, "16-direction marked mapping recorded and Founder-confirmed.")}>{marked16Evidence ? "Record replacement 16D evidence" : "Confirm 16D evidence"}</button><p className="meta">{marked16Evidence ? "Current 16D evidence is immutable and confirmed." : "Required separately; it never substitutes for 32D evidence."}</p></div>

    <div className="card span-12"><div className="eyebrow">Step 4</div><h2>Google Earth evidence and exact orientation</h2><p className="subtle">Upload the Google Earth screenshot at project level, record it, then deliberately lock the exact degree. Direction boundaries are not guessed here.</p><div className="two-col"><div className="field"><label htmlFor="google-file">Google Earth screenshot</label><input id="google-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setCaseFile(event.target.files?.[0] ?? null)} /><button className="button-secondary" type="button" disabled={!caseFile || busy} onClick={() => void upload(caseFile)}>Upload screenshot</button></div><div className="field"><label htmlFor="google-asset">Uploaded screenshot</label><select id="google-asset" value={googleAssetRef} onChange={(event) => setGoogleAssetRef(event.target.value)}><option value="">Choose a project file</option>{caseAssets.map((asset) => <option key={asset.id} value={asset.evidenceRef}>{asset.fileName}</option>)}</select><button className="button-secondary" type="button" disabled={busy || !googleAssetRef} onClick={() => void run("spatial-evidence-create", { kind: "GOOGLE_EARTH_ORIENTATION", evidenceRef: googleAssetRef, fullColourConfirmed: true }, "Google Earth orientation evidence recorded.")}>{googleEvidence ? "Record replacement evidence" : "Record orientation evidence"}</button></div><div className="field"><label htmlFor="orientation-degree">Exact degree (0 to less than 360)</label><input id="orientation-degree" type="number" min="0" max="359.9999" step="0.0001" value={degree} onChange={(event) => setDegree(event.target.value)} /></div><div className="field"><label htmlFor="orientation-reason">Why this orientation is correct</label><textarea id="orientation-reason" value={orientationReason} onChange={(event) => setOrientationReason(event.target.value)} minLength={20} maxLength={500} /></div></div><button className="button" type="button" disabled={busy || !googleEvidence || !degree || orientationReason.trim().length < 20} onClick={() => { if (window.confirm("Lock this exact orientation? Changing it later requires new evidence and regenerates dependent work.")) void run("orientation-version-lock", { exactDegree: Number(degree), googleEarthEvidenceVersionId: googleEvidence?.id, reason: orientationReason }, "Exact orientation locked with immutable evidence."); }}>{orientation ? "Create a new orientation version" : "Lock exact orientation"}</button></div>

    <div className="card span-6"><div className="eyebrow">Step 4 · 32 directions</div><h2>Entrances and windows</h2><p className="subtle">Place verified markers using percentages from the left and top of the current plan. Automatic direction naming remains blocked until its methodology version is approved.</p><div className="field"><label htmlFor="opening-kind">Opening type</label><select id="opening-kind" value={openingKind} onChange={(event) => setOpeningKind(event.target.value)}><option value="MAIN_ENTRANCE">Main entrance</option><option value="ENTRANCE">Other entrance</option><option value="WINDOW">Window</option></select></div><div className="two-col"><div className="field"><label htmlFor="opening-x">From left (%)</label><input id="opening-x" type="number" min="0" max="100" value={openingX} onChange={(event) => setOpeningX(event.target.value)} /></div><div className="field"><label htmlFor="opening-y">From top (%)</label><input id="opening-y" type="number" min="0" max="100" value={openingY} onChange={(event) => setOpeningY(event.target.value)} /></div></div><button className="button" type="button" disabled={busy || !readyForMapping} onClick={() => void run("opening-mapping-create", { floorId: floor?.id, planVersionId: plan?.id, orientationVersionId: orientation?.id, evidenceVersionId: markedEvidence?.id, kind: openingKind, markerX: Number(openingX) / 100, markerY: Number(openingY) / 100, verified: true }, "Verified opening marker saved. Direction classification awaits approved methodology.")}>Save verified marker</button><p className="meta">{openings.length} marker{openings.length === 1 ? "" : "s"} on this floor version.</p></div>

    <div className="card span-6"><div className="eyebrow">Step 5 · 16 directions</div><h2>Mapped spaces (V4 deferred)</h2><p className="subtle">Computed 16-direction geometry, sector labels, and space findings are deferred to V4. The separate manually prepared 16-direction marked mapping above remains the authoritative evidence record.</p><p className="meta">{spaces.length} historical computed mapping record{spaces.length === 1 ? "" : "s"} remain read-only.</p><button className="button-secondary" type="button" disabled>Computed 16D mapping is deferred</button></div>

    <div className="card span-12"><div className="eyebrow">Next step</div><h2>{readyForMapping && openings.some((item) => item.kind === "MAIN_ENTRANCE") ? "Spatial evidence is recorded" : "Finish the missing spatial step"}</h2><p className="subtle">Evaluation stays blocked until every floor has a current plan, full-colour marked evidence, the exact orientation is locked, and a main entrance is verified. Direction classifications stay blocked until Yogesh approves the methodology boundaries.</p><a className="button-secondary" href="/evaluation">Check evaluation readiness</a><div className="footer-note" role={/could not|failed|changed|required|blocked/i.test(message) ? "alert" : "status"} aria-live="polite">{message}</div></div>

    <div className="card span-12"><div className="eyebrow">Founder floor queues</div><h2>Resolve one floor without changing another</h2><p className="subtle">Each blocker names the exact next action. A blocker clears only after a new valid version is bound and verified.</p><div className="field"><label htmlFor="regeneration-reason">Reason for this regeneration step</label><textarea id="regeneration-reason" value={regenerationReason} onChange={(event) => setRegenerationReason(event.target.value)} minLength={20} maxLength={500} placeholder="Explain the evidence or version change and what was checked." /></div>{founderQueues.map((queue) => <article className="next-step-card" key={queue.floorId}><div className="pill-row"><span className="pill">{queue.floorLabel}</span><span className="pill">{queue.category.replaceAll("_", " ")}</span></div><h3>{queue.nextAction}</h3><p className="subtle">{queue.blockerReason}</p>{queue.invalidations.map((item) => { const options = replacementOptions(item.targetType); const nextStatus = item.status === "NEEDS_REGENERATION" ? "REPLACEMENT_REQUIRED" : item.status === "REPLACEMENT_REQUIRED" ? "REGENERATED" : "READY_FOR_REVIEW"; return <div className="field" key={item.id}><strong>{item.targetType.replaceAll("_", " ")}</strong><span className="meta">Current state: {item.status.replaceAll("_", " ")}</span>{item.status === "REPLACEMENT_REQUIRED" ? <><label htmlFor={`replacement-${item.id}`}>New valid version</label><select id={`replacement-${item.id}`} value={replacementVersionId[item.id] ?? ""} onChange={(event) => setReplacementVersionId((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose the exact replacement</option>{options.filter((option) => option.id !== item.targetId).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></> : null}<button className="button-secondary" type="button" disabled={busy || regenerationReason.trim().length < 20 || (item.status === "REPLACEMENT_REQUIRED" && !replacementVersionId[item.id])} onClick={() => void run("regeneration-transition", { floorId: queue.floorId, invalidationId: item.id, toStatus: nextStatus, replacementVersionId: replacementVersionId[item.id], reason: regenerationReason }, `${item.targetType.replaceAll("_", " ")} moved to ${nextStatus.replaceAll("_", " ")}.`, item.recordVersion)}>{nextStatus === "REPLACEMENT_REQUIRED" ? "Require replacement" : nextStatus === "REGENERATED" ? "Bind regenerated version" : "Verify and mark ready"}</button></div>; })}</article>)}</div>
  </section>;
}
