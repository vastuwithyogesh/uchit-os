"use client";
import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/store";
import { ENERGY_BAR_DIRECTIONS } from "@/lib/energy-bar-state-v1";
import type { EnergyBarState } from "@/lib/elemental-evaluation-v1";
import { NATURAL_LIGHT_STATES, POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER, POST_SITE_METHODOLOGY_VERSION, VENTILATION_STATES } from "@/lib/post-site-observations-v1";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type UploadedArtifact = { id: string; evidenceRef: string; caseId: string; floorLabel?: string; fileName: string; mimeType: string; sizeBytes: number; status?: string };
type SiteEvidenceRecord = AppState["siteEvaluationEvidenceVersions"][number];
type PostSiteRecord = AppState["postSiteElementalObservations"][number];
const buildUploadHeaders = (role: string) => typeof window !== "undefined" && window.location.hostname === "localhost" ? { "x-uchit-demo-role": role } : undefined;

export function V1SiteElementalWorkspace({ focus, caseId, projectId, floorId }: { focus: "site" | "post-site"; caseId?: string; projectId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [mode, setMode] = useState("LIVE_VIDEO");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [artifact, setArtifact] = useState<UploadedArtifact | null>(null);
  const [light, setLight] = useState("BALANCED");
  const [ventilation, setVentilation] = useState("BALANCED");
  const [energyRef, setEnergyRef] = useState("");
  const [energyHash, setEnergyHash] = useState("");
  const [states, setStates] = useState<Record<string, EnergyBarState>>(() => Object.fromEntries(ENERGY_BAR_DIRECTIONS.map((direction) => [direction, "WITHIN_BAND"] as const)));
  const [message, setMessage] = useState("Loading V1 structured workspace…");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const actionKeys = useRef<Record<string, string>>({});

  async function refresh() {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    const next = await response.json() as Bootstrap;
    setState(next);
    const postDraft = next.postSiteElementalObservations
      .filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "DRAFT")
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (postDraft) { setLight(postDraft.naturalLight); setVentilation(postDraft.ventilation); }
    const energyEvidence = next.energyBarEvidenceVersions
      .filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && ["DRAFT", "FINALIZED"].includes(item.status))
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (energyEvidence) { setEnergyRef(energyEvidence.evidenceRef); setEnergyHash(energyEvidence.artifactHash); }
    const energyState = next.energyBarStateSetVersions
      .filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && ["DRAFT", "FINALIZED"].includes(item.status))
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (energyState) setStates(Object.fromEntries(energyState.directions.map((item) => [item.direction, item.state])) as Record<string, EnergyBarState>);
    const floor = floorId ? next.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId) : undefined;
    const draft = next.siteEvaluationEvidenceVersions
      .filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "DRAFT")
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    if (caseId && floor?.floorLabel && draft) {
      try {
        const files = await fetch(`/api/case-files?caseId=${encodeURIComponent(caseId)}&floorLabel=${encodeURIComponent(floor.floorLabel)}`, { cache: "no-store", headers: buildUploadHeaders(activeUser.role) });
        const result = await files.json() as { assets?: UploadedArtifact[] };
        const bound = (result.assets ?? []).find((item) => item.status === "IMMUTABLE" && item.caseId === caseId && item.floorLabel === floor.floorLabel
          && item.evidenceRef === draft.evidenceRef && item.fileName === draft.fileName && item.sizeBytes === draft.fileSize);
        setArtifact(bound ?? null);
      } catch { setArtifact(null); }
    } else setArtifact(null);
    setMessage("V1 structured workspace is ready.");
  }
  useEffect(() => { void refresh().catch(() => setMessage("V1 workspace could not be loaded.")); }, []);

  async function uploadSiteEvidence() {
    if (!selectedFile || !caseId || !floorId) return;
    setUploading(true); setArtifact(null); setMessage("Uploading protected Site Evidence…");
    try {
      const floorLabel = state?.floorWorkspaces.find((item) => item.id === floorId)?.floorLabel ?? "";
      const body = new FormData(); body.set("file", selectedFile); body.set("caseId", caseId); body.set("floorLabel", floorLabel);
      const response = await fetch("/api/case-files", { method: "POST", headers: buildUploadHeaders(activeUser.role), body });
      const result = await response.json(); if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "The protected file could not be uploaded.");
      const uploaded = result.asset as UploadedArtifact;
      if (uploaded.caseId !== caseId || uploaded.floorLabel !== floorLabel) throw new Error("The uploaded file did not match this case and floor.");
      setArtifact(uploaded); setMessage("Protected upload complete. The server will verify its hash and scope when Site Evidence is saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The protected file could not be uploaded."); }
    finally { setUploading(false); }
  }

  async function run(action: string, fields: Record<string, unknown>) {
    if (!state || state.persistenceRevision == null || !caseId || !projectId || !floorId) return;
    if (action === "site-evaluation-evidence-draft-v1" && !artifact) { setMessage("Upload a protected evidence file before saving Site Evidence."); return; }
    const scopedRecord = <T extends { caseId: string; projectId: string; floorId: string; recordVersion?: number; version?: number; status?: string }>(items: T[], status?: string) => items.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && (!status || item.status === status)).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
    const scoped = (items: Array<{ caseId: string; projectId: string; floorId: string; recordVersion?: number; version?: number; status?: string }>, status?: string) => scopedRecord(items, status)?.recordVersion;
    const scopedCase = state.vastuCases.find((item) => item.id === caseId && item.projectId === projectId);
    const currentSiteDraft = scopedRecord(state.siteEvaluationEvidenceVersions, "DRAFT");
    const currentSiteVersion = scoped(state.siteEvaluationEvidenceVersions, "FINALIZED");
    const currentPostSiteDraft = scopedRecord(state.postSiteElementalObservations, "DRAFT");
    const currentPostSiteVersion = scoped(state.postSiteElementalObservations, "FINALIZED");
    const currentEnergyEvidenceVersion = scoped(state.energyBarEvidenceVersions, "FINALIZED");
    const currentEnergyStateVersion = scoped(state.energyBarStateSetVersions, "FINALIZED");
    const currentEnergyEvidenceDraft = scopedRecord(state.energyBarEvidenceVersions, "DRAFT");
    const currentEnergyStateDraft = scopedRecord(state.energyBarStateSetVersions, "DRAFT");
    const currentEvaluation = scopedRecord(state.elementalEvaluationSnapshots);
    const currentReport = scopedRecord(state.elementalReportSnapshots);
    const expectedRecordVersion = action === "site-evaluation-evidence-draft-v1" ? scopedCase?.recordVersion : action === "site-evaluation-evidence-finalize-v1" ? currentSiteDraft?.recordVersion : action === "post-site-observation-draft-v1" ? currentSiteVersion : action === "post-site-observation-finalize-v1" ? currentPostSiteDraft?.recordVersion : action === "energy-bar-evidence-draft-v1" ? currentPostSiteVersion : action === "energy-bar-evidence-finalize-v1" ? currentEnergyEvidenceDraft?.recordVersion : action === "energy-bar-state-draft-v1" ? currentEnergyEvidenceVersion : action === "energy-bar-state-finalize-v1" ? currentEnergyStateDraft?.recordVersion : action === "elemental-evaluation-finalize-v1" ? currentEnergyStateVersion : action === "elemental-evaluation-successor-v1" ? currentEvaluation?.recordVersion : action === "elemental-report-draft-v1" ? currentEvaluation?.recordVersion : action === "elemental-report-finalize-v1" ? currentReport?.recordVersion : scoped(state.siteEvaluationEvidenceVersions);
    const idempotencyKey = actionKeys.current[action] ??= crypto.randomUUID();
    setBusy(true);
    try {
      const context = ["site-evaluation-evidence-finalize-v1", "post-site-observation-finalize-v1", "energy-bar-evidence-finalize-v1", "energy-bar-state-finalize-v1", "elemental-evaluation-successor-v1", "elemental-report-finalize-v1"].includes(action) ? {} : { caseId, projectId, floorId };
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action, actorRole: activeUser.role, ...fields, ...context, ...(action === "site-evaluation-evidence-draft-v1" ? { evidenceRef: artifact?.evidenceRef } : {}), ...(expectedRecordVersion === undefined ? {} : { expectedRecordVersion }), idempotencyKey, expectedRevision: state.persistenceRevision }) });
      const result = await response.json(); if (!response.ok || result.ok === false) throw new Error(result.error?.message ?? result.error ?? "Action failed."); delete actionKeys.current[action]; setMessage("Saved. Refreshing the authoritative V1 record…"); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed."); } finally { setBusy(false); }
  }

  const currentSiteDraft: SiteEvidenceRecord | undefined = state?.siteEvaluationEvidenceVersions.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "DRAFT").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  if (focus === "site") return <section className="focused-step-form" aria-label="V1 Site Evaluation Evidence"><div className="focused-summary-card"><strong>SITE EVALUATION EVIDENCE · V1</strong><span>Upload-only protected evidence. No narrative methodology fields, OCR, parsing or AI.</span></div><label className="field"><span>Site mode</span><select value={mode} onChange={(e) => setMode(e.target.value)}><option>PHYSICAL_VISIT</option><option>LIVE_VIDEO</option><option>CLIENT_SUPPLIED_VIDEO</option></select></label><label className="field"><span>Protected evidence file</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" disabled={uploading || busy} onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setArtifact(null); }} /><span className="footer-note">PDF, PNG, JPG, or WebP · up to 20 MB. Upload-only; no OCR or interpretation.</span></label><button className="button-secondary" type="button" disabled={!selectedFile || uploading || busy} onClick={() => void uploadSiteEvidence()}>{uploading ? "Uploading…" : "Upload securely"}</button>{artifact ? <div className="footer-note" role="status">Uploaded: {artifact.fileName} · {artifact.mimeType} · {artifact.sizeBytes} bytes · protected reference ready</div> : null}<div className="secondary-inline-actions"><button className="button" disabled={busy || uploading || !artifact} onClick={() => void run("site-evaluation-evidence-draft-v1", { mode })}>Save evidence draft</button><button className="button-secondary" disabled={busy || uploading || !currentSiteDraft || !artifact || currentSiteDraft.status !== "DRAFT"} onClick={() => void run("site-evaluation-evidence-finalize-v1", { recordId: currentSiteDraft?.id })}>Finalize selected draft after refresh</button></div><div className="footer-note" role="status">{message}</div></section>;
  const currentPostDraft: PostSiteRecord | undefined = state?.postSiteElementalObservations.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "DRAFT").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentPostFinalized: PostSiteRecord | undefined = state?.postSiteElementalObservations.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentEnergyEvidenceDraft = state?.energyBarEvidenceVersions.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "DRAFT").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentEnergyEvidenceFinalized = state?.energyBarEvidenceVersions.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentEnergyStateDraft = state?.energyBarStateSetVersions.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "DRAFT").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentEnergyStateFinalized = state?.energyBarStateSetVersions.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "FINALIZED").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentEvaluation = state?.elementalEvaluationSnapshots.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && ["COMPLETE", "SUPERSEDED"].includes(item.status)).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentCanonicalEvaluation = state?.elementalEvaluationSnapshots.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status === "COMPLETE" && item.methodologyVersionId === "UCHIT_OS_EVALUATION_METHODOLOGY_V1.1_ELEMENTAL" && item.methodologyContentHash !== "pending-approved-methodology").sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  const currentElementalReport = state?.elementalReportSnapshots.filter((item) => item.caseId === caseId && item.projectId === projectId && item.floorId === floorId && item.status !== "SUPERSEDED").sort((a, b) => (b.snapshotVersion ?? 0) - (a.snapshotVersion ?? 0))[0];
  const evaluationReady = Boolean(currentEnergyEvidenceFinalized && currentEnergyStateFinalized);
  return <section className="focused-step-form" aria-label="V1 Post-Site structured evaluation"><div className="focused-summary-card"><strong>POST-SITE STRUCTURED INPUTS · V1</strong><span>Natural Light and Ventilation are explicit structured observations. Energy controls unlock only after Post-Site finalization.</span></div><div className="two-column-form"><label className="field"><span>Natural Light</span><select value={light} onChange={(e) => setLight(e.target.value)}>{NATURAL_LIGHT_STATES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field"><span>Ventilation</span><select value={ventilation} onChange={(e) => setVentilation(e.target.value)}>{VENTILATION_STATES.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="secondary-inline-actions"><button className="button" disabled={busy || Boolean(currentPostDraft || currentPostFinalized)} onClick={() => void run("post-site-observation-draft-v1", { naturalLight: light, ventilation, methodologyVersionId: POST_SITE_METHODOLOGY_VERSION, methodologyContentHash: POST_SITE_METHODOLOGY_CONTENT_IDENTIFIER })}>Save Light / Ventilation draft</button><button className="button-secondary" disabled={busy || !currentPostDraft || currentPostDraft.status !== "DRAFT"} onClick={() => void run("post-site-observation-finalize-v1", { recordId: currentPostDraft?.id })}>Finalize Post-Site</button></div>{currentPostDraft ? <div className="footer-note" role="status">Post-Site DRAFT · {currentPostDraft.id} · record version {currentPostDraft.recordVersion}</div> : currentPostFinalized ? <div className="footer-note" role="status">Post-Site FINALIZED · {currentPostFinalized.id} · Energy phase ready</div> : null}{currentPostFinalized ? <><label className="field"><span>External Energy Bar evidence reference</span><input value={energyRef} onChange={(e) => setEnergyRef(e.target.value)} /></label><label className="field"><span>Energy Bar checksum</span><input value={energyHash} onChange={(e) => setEnergyHash(e.target.value)} /></label><div className="secondary-inline-actions"><button className="button-secondary" disabled={busy || Boolean(currentEnergyEvidenceDraft || currentEnergyEvidenceFinalized) || !energyRef || !energyHash} onClick={() => void run("energy-bar-evidence-draft-v1", { evidenceRef: energyRef, artifactHash: energyHash })}>Save Energy Bar evidence draft</button><button className="button-secondary" disabled={busy || !currentEnergyEvidenceDraft || currentEnergyEvidenceDraft.status !== "DRAFT"} onClick={() => void run("energy-bar-evidence-finalize-v1", { recordId: currentEnergyEvidenceDraft?.id })}>Finalize Energy Bar evidence</button></div>{currentEnergyEvidenceDraft ? <div className="footer-note" role="status">Energy Evidence DRAFT · {currentEnergyEvidenceDraft.id} · record version {currentEnergyEvidenceDraft.recordVersion}</div> : currentEnergyEvidenceFinalized ? <div className="footer-note" role="status">Energy Evidence FINALIZED · {currentEnergyEvidenceFinalized.id} · state set ready</div> : null}{currentEnergyEvidenceFinalized ? <><fieldset><legend>16-direction Energy Bar states</legend>{ENERGY_BAR_DIRECTIONS.map((direction) => <label className="field" key={direction}><span>{direction}</span><select value={states[direction]} onChange={(e) => setStates((current) => ({ ...current, [direction]: e.target.value as EnergyBarState }))}><option>ABOVE_RED</option><option>WITHIN_BAND</option><option>BELOW_BLUE</option></select></label>)}</fieldset><p className="footer-note">Touching Red / Blue is recorded as WITHIN_BAND. No numeric Shakti input or rank controls are used.</p><div className="secondary-inline-actions"><button className="button-secondary" disabled={busy || Boolean(currentEnergyStateDraft || currentEnergyStateFinalized)} onClick={() => void run("energy-bar-state-draft-v1", { evidenceVersionId: currentEnergyEvidenceFinalized.id, directions: ENERGY_BAR_DIRECTIONS.map((direction) => ({ direction, state: states[direction] })) , methodologyVersionId: "energy-bar-v1", methodologyContentHash: "energy-bar-v1" })}>Save 16-zone Energy states</button><button className="button-secondary" disabled={busy || !currentEnergyStateDraft || currentEnergyStateDraft.status !== "DRAFT"} onClick={() => void run("energy-bar-state-finalize-v1", { recordId: currentEnergyStateDraft?.id })}>Finalize 16-zone Energy states</button></div>{currentEnergyStateDraft ? <div className="footer-note" role="status">Energy State Set DRAFT · {currentEnergyStateDraft.id} · record version {currentEnergyStateDraft.recordVersion}</div> : currentEnergyStateFinalized ? <div className="footer-note" role="status">Energy State Set FINALIZED · {currentEnergyStateFinalized.id} · deterministic evaluation available</div> : null}</> : null}{!currentCanonicalEvaluation ? <button className="button" disabled={busy || !evaluationReady || !currentEvaluation || currentEvaluation.status === "SUPERSEDED"} onClick={() => currentEvaluation ? void run("elemental-evaluation-successor-v1", { predecessorId: currentEvaluation.id }) : void run("elemental-evaluation-finalize-v1", {})}>{currentEvaluation ? "Certify canonical Elemental Evaluation" : "Run deterministic Elemental Evaluation"}</button> : <div className="footer-note" role="status">Canonical Elemental Evaluation COMPLETE · {currentCanonicalEvaluation.id}</div>}{currentCanonicalEvaluation && !currentElementalReport ? <button className="button" disabled={busy} onClick={() => void run("elemental-report-draft-v1", {})}>Create Elemental Report draft</button> : null}{currentElementalReport?.status === "DRAFT" ? <button className="button" disabled={busy} onClick={() => void run("elemental-report-finalize-v1", { snapshotId: currentElementalReport.id })}>Finalize Elemental Report</button> : null}{currentElementalReport ? <div className="footer-note" role="status">Elemental Report {currentElementalReport.status} · {currentElementalReport.id} · record version {currentElementalReport.recordVersion}</div> : null}</> : null}<div className="footer-note" role="status">{message}</div></section>;
}
