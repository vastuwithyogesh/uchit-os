"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppState } from "@/lib/store";
import { buildActionHeaders } from "@/lib/request-helpers";
import { useSession } from "@/components/session-provider";
import { FounderStepCard } from "@/components/founder-step-card";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type Asset = { evidenceRef: string; fileName: string; floorLabel?: string; mimeType: string };
const observationFields = ["site", "entrance", "surroundings", "light", "ventilation", "airflow", "neighbouringEffects", "relevantObservations"] as const;
const labels: Record<(typeof observationFields)[number], string> = { site: "Site", entrance: "Entrance", surroundings: "Surroundings", light: "Light", ventilation: "Ventilation", airflow: "Airflow", neighbouringEffects: "Neighbouring effects", relevantObservations: "Relevant observations" };

export function SiteAnalysisConsole({ focus = "all", clientId: initialClientId, caseId: requestedCaseId, floorId: initialFloorId }: { focus?: "all" | "site" | "post-site"; clientId?: string; caseId?: string; floorId?: string }) {
  const { activeUser } = useSession();
  const router = useRouter();
  const [state, setState] = useState<Bootstrap | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [evidenceRef, setEvidenceRef] = useState("");
  const [evidenceType, setEvidenceType] = useState("VIDEO_ANALYSIS");
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 16));
  const [visitMetadata, setVisitMetadata] = useState("");
  const [observations, setObservations] = useState<Record<string, string>>({});
  const [differences, setDifferences] = useState("");
  const [corrections, setCorrections] = useState("");
  const [newFindings, setNewFindings] = useState("");
  const [additionalObservations, setAdditionalObservations] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading the Site Analysis workspace…");

  const refresh = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const next = await response.json() as Bootstrap;
      if (!response.ok) throw new Error("Workspace could not be loaded.");
      setState(next);
      setMessage("Select the exact floor and presented Stage A verdict.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Workspace could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const caseRecord = state?.vastuCases.find((item) => item.id === requestedCaseId && (!initialClientId || item.clientId === initialClientId));
  const client = state?.clients.find((item) => item.id === caseRecord?.clientId);
  const project = state?.projects.find((item) => item.id === caseRecord?.projectId);
  const floors = state?.floorWorkspaces.filter((item) => item.caseId === caseRecord?.id && item.projectId === project?.id) ?? [];
  const floor = floors.find((item) => item.id === initialFloorId);
  const analysis = state?.siteAnalyses?.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id);
  const findings = state?.postSiteFindings?.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id);
  const previews = useMemo(() => state?.reportVersions.filter((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.isPreview && (item.artifact?.immutable || item.id === analysis?.stageAVerdictReportId)) ?? [], [state, caseRecord?.id, floor?.id, analysis?.stageAVerdictReportId]);
  const [stageAVerdictReportId, setStageAVerdictReportId] = useState("");

  useEffect(() => { if (analysis) setStageAVerdictReportId(analysis.stageAVerdictReportId); else if (previews[0]) setStageAVerdictReportId(previews[0].id); }, [analysis?.id, previews]);
  useEffect(() => {
    if (!analysis) return;
    setEvidenceType(analysis.evidenceType);
    setEvidenceRef(analysis.evidenceRefs[0] ?? "");
    setCapturedAt(analysis.capturedAt.slice(0, 16));
    setVisitMetadata(typeof analysis.visitMetadata === "string" ? analysis.visitMetadata : "");
    setObservations(Object.fromEntries(observationFields.map((field) => [field, analysis.observations[field] ?? ""])));
  }, [analysis?.id, analysis?.version]);
  useEffect(() => {
    if (!findings) return;
    setDifferences(findings.differences);
    setCorrections(findings.corrections);
    setNewFindings(findings.newFindings);
    setAdditionalObservations(findings.additionalObservations);
  }, [findings?.id, findings?.version]);
  useEffect(() => {
    if (!caseRecord || !floor) return;
    void fetch(`/api/case-files?caseId=${encodeURIComponent(caseRecord.id)}&floorLabel=${encodeURIComponent(floor.floorLabel)}`, { cache: "no-store" }).then((response) => response.json()).then((value) => setAssets(value.assets ?? [])).catch(() => setAssets([]));
  }, [caseRecord?.id, floor?.id, floor?.floorLabel]);

  const run = async (action: string, fields: Record<string, unknown>, success: string) => {
    if (!state || !caseRecord) return;
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action, ...fields, caseId: caseRecord.id, floorId: floor?.id, idempotencyKey: crypto.randomUUID(), expectedRecordVersion: caseRecord.recordVersion ?? 0, expectedRevision: state.persistenceRevision ?? null }) });
      const value = await response.json();
      if (!response.ok || value.ok === false) throw new Error(value.error ?? "The protected step could not be saved.");
      setMessage(success);
      await refresh();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The protected step could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const observationValues = Object.fromEntries(observationFields.map((field) => [field, observations[field] ?? ""]));
  const messageIsError = message.includes("could not") || message.includes("failed") || message.includes("missing");
  const siteLocked = analysis?.status === "FOUNDER_APPROVED";
  const findingsLocked = findings?.status === "FOUNDER_APPROVED";
  const statusMessage = !busy && focus === "site" && siteLocked ? "Founder-approved Site Analysis loaded for this exact floor."
    : !busy && focus === "post-site" && findingsLocked ? "Founder-approved Post-Site Findings loaded for this exact floor."
      : message;

  return (
    <section className={`stack founder-work-surface site-analysis-workspace site-focus-${focus}`} aria-label="Site Analysis and Post-Site Findings">
      <div className="founder-context-bar" aria-label="Current site context"><span>Evaluation</span><span aria-hidden="true">→</span><strong>{client?.displayName ?? "Choose a client"}</strong><span aria-hidden="true">→</span><span>{floor?.floorLabel ?? "Floor"}</span><span aria-hidden="true">→</span><span>Site review</span></div>
      {focus !== "post-site" ? <FounderStepCard step="Step 1 · site analysis" title="Record what was observed on this floor" description="Begin only after the exact Stage A verdict is presented. Observations are human-entered evidence; this step never reruns evaluation or invents a score." tone={analysis?.status === "FOUNDER_APPROVED" ? "approved" : stageAVerdictReportId && evidenceRef ? "ready" : "attention"} status={analysis?.status?.replaceAll("_", " ") ?? "Awaiting input"} className="founder-step-card-primary">
        <div className="founder-step-grid">
          <div className="field"><span>Locked Case and Client</span><strong>{caseRecord?.caseNumber ?? "Case unavailable"} · {client?.displayName ?? "Client unavailable"}</strong></div>
          <div className="field"><span>Locked floor</span><strong>{floor?.floorLabel ?? "Floor unavailable"}</strong></div>
          <label className="field"><span>Presented Stage A verdict</span><select value={stageAVerdictReportId} onChange={(event) => setStageAVerdictReportId(event.target.value)} disabled={busy || siteLocked}><option value="">Select the exact presented preview</option>{previews.map((item) => <option key={item.id} value={item.id}>{item.versionLabel}</option>)}</select></label>
          <label className="field"><span>Evidence type</span><select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} disabled={busy || siteLocked}><option value="VIDEO_ANALYSIS">Video analysis</option><option value="PHYSICAL_VISIT">Physical visit</option></select></label>
          <label className="field"><span>Protected evidence</span><select value={evidenceRef} onChange={(event) => setEvidenceRef(event.target.value)} disabled={busy || siteLocked}><option value="">Select an uploaded protected file</option>{evidenceRef && !assets.some((item) => item.evidenceRef === evidenceRef) ? <option value={evidenceRef}>Recorded protected evidence</option> : null}{assets.map((item) => <option key={item.evidenceRef} value={item.evidenceRef}>{item.fileName} · {item.mimeType}</option>)}</select></label>
          <label className="field"><span>Captured at</span><input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} disabled={busy || siteLocked} /></label>
          <label className="field field-span-full"><span>Visit metadata <span className="label-note">optional</span></span><input value={visitMetadata} onChange={(event) => setVisitMetadata(event.target.value)} disabled={busy || siteLocked} /></label>
        </div>
        <div className="founder-step-grid founder-intake-grid">{observationFields.map((field) => <label className="field" key={field}><span>{labels[field]}</span><textarea value={observations[field] ?? ""} onChange={(event) => setObservations((current) => ({ ...current, [field]: event.target.value }))} disabled={busy || siteLocked} /></label>)}</div>
        <div className="workflow founder-primary-actions"><button className="button founder-action-primary" disabled={busy || siteLocked || !floor || !stageAVerdictReportId || !evidenceRef} onClick={() => void run("site-analysis-upsert", { stageAVerdictReportId, evidenceType, evidenceRefs: [evidenceRef], capturedAt: new Date(capturedAt).toISOString(), visitMetadata: visitMetadata || undefined, ...observationValues }, "Site Analysis saved as a draft.")}>{siteLocked ? "Site Analysis approved" : "Save Site Analysis"}</button>{analysis && <><button className="button-secondary" disabled={busy || analysis.status !== "DRAFT"} onClick={() => void run("site-analysis-checkpoint", { recordId: analysis.id, checkpoint: "FOUNDER_REVIEWED", reason: "Founder reviewed the floor Site Analysis observations and evidence." }, "Site Analysis marked Founder reviewed.")}>Founder review</button><button className="button-secondary" disabled={busy || analysis.status !== "FOUNDER_REVIEWED"} onClick={() => void run("site-analysis-checkpoint", { recordId: analysis.id, checkpoint: "FOUNDER_APPROVED", reason: "Founder approved the floor Site Analysis for Post-Site Findings." }, "Site Analysis approved.")}>Founder approve</button></>}</div>
        <p className="meta">{siteLocked ? "This exact Site Analysis version is Founder-approved and read-only. A changed upstream lineage requires a deliberate successor workflow." : !stageAVerdictReportId ? "Select the exact presented Stage A preview before saving." : !evidenceRef ? "Select one protected evidence file before saving." : "Save the draft, then complete the distinct Founder review and approval checkpoints."}</p>
      </FounderStepCard> : null}

      {focus !== "site" ? <FounderStepCard step="Step 2 · post-site review" title="Capture differences and corrections" description="This summary is linked to the approved Site Analysis. It does not redesign the layout or rerun the evaluation engine." tone={findings?.status === "FOUNDER_APPROVED" ? "approved" : analysis?.status === "FOUNDER_APPROVED" ? "attention" : "blocked"} status={findings?.status?.replaceAll("_", " ") ?? "Waiting for Site Analysis"}>
        <div className="founder-step-grid">{([['differences', differences, setDifferences], ['corrections', corrections, setCorrections], ['newFindings', newFindings, setNewFindings], ['additionalObservations', additionalObservations, setAdditionalObservations]] as const).map(([key, value, setter]) => <label className="field" key={key}><span>{key === "newFindings" ? "New findings" : key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span><textarea value={value} onChange={(event) => setter(event.target.value)} disabled={busy || findingsLocked} /></label>)}</div>
        <div className="workflow founder-primary-actions"><button className="button founder-action-primary" disabled={busy || findingsLocked || !analysis || analysis.status !== "FOUNDER_APPROVED"} onClick={() => void run("post-site-findings-upsert", { siteAnalysisId: analysis?.id, reportId: analysis?.stageAVerdictReportId, upstreamEvaluationVersionId: analysis?.upstreamEvaluationVersionId, differences, corrections, newFindings, additionalObservations }, "Post-Site Findings saved as a draft.")}>{findingsLocked ? "Post-Site Findings approved" : "Save Post-Site Findings"}</button>{findings && <><button className="button-secondary" disabled={busy || findings.status !== "DRAFT"} onClick={() => void run("post-site-findings-checkpoint", { recordId: findings.id, checkpoint: "FOUNDER_REVIEWED", reason: "Founder reviewed the Post-Site Findings against the approved Site Analysis." }, "Post-Site Findings marked Founder reviewed.")}>Founder review</button><button className="button-secondary" disabled={busy || findings.status !== "FOUNDER_REVIEWED"} onClick={() => void run("post-site-findings-checkpoint", { recordId: findings.id, checkpoint: "FOUNDER_APPROVED", reason: "Founder approved the Post-Site Findings for report assembly." }, "Post-Site Findings approved.")}>Founder approve</button></>}</div>
        <p className="meta">{findingsLocked ? "This exact Post-Site Findings version is Founder-approved and read-only." : analysis?.status !== "FOUNDER_APPROVED" ? "Founder-approve the Site Analysis before saving Post-Site Findings." : "Save the draft, then complete the distinct review and approval checkpoints."}</p>
      </FounderStepCard> : null}
      <div className="footer-note" role={messageIsError ? "alert" : "status"} aria-live="polite">{statusMessage}</div>
    </section>
  );
}
