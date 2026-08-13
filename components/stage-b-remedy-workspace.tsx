"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StageBRemedyType, StageBRenderManifest } from "@/lib/domain";
import type { AppState } from "@/lib/store";
import { automaticCallout, pointFromRect } from "@/lib/stage-b-workspace-geometry";
import { eligibleRemediesForPage, implementationRowsForPage, livePagePlacements, liveRemediationPlacements, STAGE_B_WORKSPACE_PAGES } from "@/lib/stage-b-workspace-view";
import { buildActionHeaders } from "@/lib/request-helpers";
import { canEvaluateCases } from "@/lib/permissions";
import { useSession } from "@/components/session-provider";
import { PlacementImplementationSheet as ImplementationSheet, PlacementLayer, placementCanvasDraft as placementDraft, type PlacementCanvasDraft as CanvasDraft } from "@/components/remediation-workspace-primitives";

type Bootstrap = AppState & { persistenceRevision?: number | null };
type Tool = "select" | "place" | "move-anchor" | "move-callout" | "pan";
type CaseAsset = { id: string; evidenceRef: string; mimeType: string };
type UploadScope = "CASE_ONLY" | "PERMANENT" | null;
type WorkspaceView = "canvas" | "implementation";

class WorkspaceActionError extends Error { constructor(message: string, readonly status: number) { super(message); } }

function UploadRemedyDialog({ scope, onScope, onClose }: { scope: UploadScope; onScope: (scope: UploadScope) => void; onClose: () => void }) {
  return <div className="stage-b-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="stage-b-upload-title">
    <article className="stage-b-upload-dialog">
      <header><div><div className="eyebrow">Custom remedy entry</div><h2 id="stage-b-upload-title">+ Upload Remedy</h2></div><button aria-label="Close remedy upload" onClick={onClose}>×</button></header>
      {!scope ? <><p>Choose how this remedy may be used before supplying its details.</p><div className="stage-b-upload-choices">
        <button onClick={() => onScope("CASE_ONLY")}><strong>One-Time Use — This Case</strong><span>Available only in this case and hidden from reusable remedy pools.</span></button>
        <button onClick={() => onScope("PERMANENT")}><strong>Permanent Scope</strong><span>Starts the full metadata and approval path for future eligible use.</span></button>
      </div></> : <div className="stage-b-upload-entry">
        <button className="text-link" onClick={() => onScope(null)}>← Change scope</button>
        <h3>{scope === "CASE_ONLY" ? "One-Time Use — This Case" : "Permanent Scope"}</h3>
        <p>{scope === "CASE_ONLY" ? "Supply the remedy image, name and attribute or purpose for this case." : "Supply the complete remedy metadata and evidence for the existing approval workflow."}</p>
        <label>Remedy image<input type="file" accept="image/*" /></label>
        <label>Remedy name<input type="text" autoComplete="off" /></label>
        <label>Attribute / purpose<textarea rows={3} /></label>
        <p className="stage-b-upload-boundary" role="note">This shared workspace collects the entry choice and details only. Publishing remains behind the existing approved remedy workflow.</p>
      </div>}
    </article>
  </div>;
}

function StageBPageNavigation({ state, remediationId, activeType, onSelect }: { state: Bootstrap; remediationId: string; activeType: StageBRemedyType; onSelect: (pageType: StageBRemedyType) => void }) {
  const livePlacements = liveRemediationPlacements(state.physicalPlacements, remediationId);
  return <nav className="stage-b-page-nav" aria-label="Stage B remedy pages">
    {STAGE_B_WORKSPACE_PAGES.map((configuration) => {
      const page = state.reportPlacementPages.find((item) => item.remediationId === remediationId && item.pageType === configuration.pageType);
      const numbers = page ? livePlacements.filter((placement) => placement.pageId === page.id).map((placement) => placement.masterNumber).filter((number): number is number => typeof number === "number").sort((left, right) => left - right) : [];
      return <button key={configuration.pageType} type="button" className={activeType === configuration.pageType ? "is-active" : ""} aria-current={activeType === configuration.pageType ? "page" : undefined} onClick={() => onSelect(configuration.pageType)}>
        <span className="stage-b-page-index">{configuration.shortLabel}</span><span><strong>{configuration.label}</strong><small>Page {configuration.ordinal} · {page?.state === "FINALISED" ? "Finalised" : "Draft"}</small></span>
        <em>{numbers.length ? `Nos. ${numbers.join(", ")}` : "No placements"}</em>
      </button>;
    })}
  </nav>;
}

function StageBManifestPreview({ manifest, onClose }: { manifest: StageBRenderManifest; onClose: () => void }) {
  const liveIds = new Set(manifest.pages.flatMap((page) => page.placements.filter((placement) => placement.state !== "DELETED").map((placement) => placement.id)));
  return <div className="stage-b-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="stage-b-preview-title"><article className="stage-b-preview stage-b-preview-multipage">
    <header><div><div className="eyebrow">Backend v5 render manifest</div><h2 id="stage-b-preview-title">Report Preview</h2></div><button aria-label="Close report preview" onClick={onClose}>×</button></header>
    <div className="stage-b-preview-document"><div className="stage-b-preview-summary"><strong>Five-page remedy sequence</strong><span>Final Revised Layout {manifest.baseLayout.versionId}</span><span className="status-approved">Integrity {manifest.integrityStatus}</span></div>
      {manifest.pages.map((page) => {
        const configuration = STAGE_B_WORKSPACE_PAGES.find((item) => item.pageType === page.pageType) ?? STAGE_B_WORKSPACE_PAGES[0];
        const placements = page.placements.filter((placement) => placement.state !== "DELETED"); const placementIds = new Set(placements.map((placement) => placement.id));
        const rows = page.implementationRows.filter((row) => placementIds.has(row.placementId));
        return <section className="stage-b-preview-section" key={page.pageId} data-preview-page={configuration.pageType}><header><div><span>Page {page.ordinal}</span><h3>{configuration.label}</h3></div><small>{page.finalisationHash}</small></header>
          {rows.length ? rows.map((row) => <div className="stage-b-preview-row" key={row.id}><span>{row.masterNumber}</span><strong>{row.itemNameSnapshot}</strong><span>{row.attributePurposeSnapshot}</span><span>Implemented: ______</span><span>Date: ______</span><span>Alternative Needed: ______</span></div>) : <p>No physical placements on this finalised remedy page.</p>}
        </section>;
      })}
      <section className="stage-b-preview-section"><header><h3>Master Appendix</h3></header>{manifest.appendixRows.filter((row) => liveIds.has(row.placementId)).map((row) => <div className="stage-b-preview-row" key={row.id}><span>{row.masterNumber}</span><strong>{row.itemNameSnapshot}</strong><span>{row.attributePurposeSnapshot}</span></div>)}</section>
      <small>Deterministic {manifest.schemaVersion} · {manifest.integrityScopeHash}</small>
    </div>
  </article></div>;
}

function buildVisualBootstrap(scenario: string): Bootstrap {
  const pages = STAGE_B_WORKSPACE_PAGES.map((configuration) => ({ id: `visual-page-${configuration.pageType}`, organisationId: "visual-org", remediationId: "visual-remediation", reportId: "visual-stage-a", caseId: "visual-case", floorId: "visual-floor", section: "B", pageType: configuration.pageType, ordinal: configuration.ordinal,
    state: scenario === "preview" || (scenario === "implementation" && configuration.pageType === "TATTAV_BALANCER") || (scenario === "zero-finalised" && configuration.pageType === "TATTAV_ACTIVATION") ? "FINALISED" : "DRAFT",
    baseLayoutVersionId: "visual-base", finalisationHash: `final-${configuration.pageType}`, recordVersion: 2 })) as any[];
  const remedies = STAGE_B_WORKSPACE_PAGES.flatMap((configuration, pageIndex) => configuration.pageType === "TATTAV_ACTIVATION" ? [] : Array.from({ length: configuration.pageType === "DISHA_BALANCER" || configuration.pageType === "TATTAV_BALANCER" ? 2 : 1 }, (_, remedyIndex) => ({
    id: `visual-remedy-${configuration.pageType}-${remedyIndex + 1}`, organisationId: "visual-org", remedialType: configuration.pageType, name: `${configuration.label} ${remedyIndex + 1}`,
    attributePurpose: `${configuration.label} approved placement purpose ${remedyIndex + 1}`, elements: ["Earth"], directions: ["SW"], preferredAssetId: `asset-${pageIndex}-${remedyIndex}`, preferredAssetVersionId: `asset-version-${pageIndex}-${remedyIndex}`, status: "APPROVED", recordVersion: 1
  }))) as any[];
  const resolutions = remedies.map((remedy, index) => ({ id: `visual-resolution-${index + 1}`, organisationId: "visual-org", remediationId: "visual-remediation", caseId: "visual-case", floorId: "visual-floor", verdictId: `visual-verdict-${remedy.remedialType}`, verdictContentHash: `verdict-${index}`, methodologyVersionId: "visual-methodology", methodologyContentHash: "methodology-hash", resolverVersion: "stage-b-remedy-resolver/v1", remedialType: remedy.remedialType, remedyId: remedy.id, remedyRecordVersion: 1, remedyAssetVersionId: remedy.preferredAssetVersionId, eligibilityRuleIds: [`rule-${remedy.remedialType}`], explanationCodes: ["SOLUTION_FRAMING_MATCH"], resolvedAt: "2026-08-13T09:00:00.000Z", resolutionHash: `resolution-hash-${index}`, status: "ELIGIBLE", idempotencyKey: `visual-${index}`, requestHash: `request-${index}`, recordVersion: 1 })) as any[];
  const placementSpecs: Array<[string, number, number, number, number]> = [["DISHA_BALANCER", 1, .28, .32, .55], ["DISHA_BALANCER", 2, .68, .36, .16], ["DISHA_ACTIVATION", 3, .46, .62, .66], ["TATTAV_BALANCER", 4, .31, .69, .58], ["TATTAV_BALANCER", 5, .72, .68, .14], ["EQUALISER", 6, .52, .46, .7]];
  const placements = placementSpecs.map(([pageType, masterNumber, anchorX, anchorY, calloutX], index) => {
    const sameType = remedies.filter((item) => item.remedialType === pageType); const selectedRemedy = sameType[index % Math.max(1, sameType.length)] ?? remedies[0];
    const resolution = resolutions.find((item) => item.remedyId === selectedRemedy.id)!;
    return { id: `visual-placement-${masterNumber}`, organisationId: "visual-org", remediationId: "visual-remediation", caseId: "visual-case", floorId: "visual-floor", reportId: "visual-stage-a", pageId: `visual-page-${pageType}`,
      baseLayoutVersionId: "visual-base", placementType: "REMEDY", eligibilityResolutionId: resolution.id, remedyId: selectedRemedy.id, masterNumber, anchorX, anchorY, anchorLocked: true,
      calloutX, calloutY: masterNumber % 2 ? .16 : .7, calloutWidth: .25, calloutHeight: .14, imageAssetId: selectedRemedy.preferredAssetId, imageAssetVersionId: selectedRemedy.preferredAssetVersionId,
      imageAssetSnapshotId: `snapshot-${masterNumber}`, nameSnapshot: selectedRemedy.name, attributePurposeSnapshot: selectedRemedy.attributePurpose, locationReference: masterNumber % 2 ? "Approved wall reference" : undefined,
      showCircle: true, showFrame: true, showHighlight: true, state: "LOCKED", dependencyReviewState: "CURRENT", idempotencyKey: `placement-${masterNumber}`, requestHash: `placement-hash-${masterNumber}`, recordVersion: 2 };
  }) as any[];
  placements.push({ ...placements[2], id: "visual-placement-deleted", nameSnapshot: "Deleted activation marker", masterNumber: 3, state: "DELETED", deletedAt: "2026-08-13T10:00:00.000Z", deletionIdempotencyKey: "visual-delete" });
  if (scenario === "deleted") placements.find((placement) => placement.id === "visual-placement-3")!.state = "DELETED";
  const rows = placements.filter((placement) => placement.state !== "DELETED").map((placement) => ({ id: `visual-row-${placement.id}`, organisationId: "visual-org", remediationId: "visual-remediation", reportId: "visual-stage-a", pageId: placement.pageId, placementId: placement.id, masterNumber: placement.masterNumber,
    imageAssetSnapshotId: placement.imageAssetSnapshotId, itemNameSnapshot: placement.nameSnapshot, attributePurposeSnapshot: placement.attributePurposeSnapshot, locationReference: placement.locationReference, recordVersion: 1 })) as any[];
  const appendix = rows.map((row) => ({ ...row, id: `visual-appendix-${row.placementId}`, caseId: "visual-case", floorId: "visual-floor", sourcePageId: row.pageId, baseLayoutVersionId: "visual-base" })) as any[];
  const manifest = { schemaVersion: "stage-b-render-manifest/v1", organisationId: "visual-org", caseId: "visual-case", floorId: "visual-floor", reportId: "visual-stage-a",
    existingLayout: { assetId: "visual-existing.pdf", versionId: "visual-existing-v1", snapshotId: "existing-snapshot", contentHash: "existing-hash" }, baseLayout: { versionId: "visual-base", snapshotId: "base-snapshot", contentHash: "base-hash" },
    pages: pages.map((page) => ({ pageId: page.id, pageType: page.pageType, ordinal: page.ordinal, finalisationHash: page.finalisationHash, provenance: [], placements: placements.filter((placement) => placement.pageId === page.id && placement.state !== "DELETED"),
      implementationRows: rows.filter((row) => row.pageId === page.id).map((row) => ({ ...row, implemented: null, implementationDate: null, alternativeNeeded: null })) })),
    appendixRows: appendix.map((row) => ({ ...row, implemented: null, implementationDate: null, alternativeNeeded: null })), integrityRunId: "visual-integrity", integrityScopeHash: "visual-five-page-integrity-hash", integrityStatus: "PASS" } as StageBRenderManifest;
  const hasFinalisedPage = pages.some((page) => page.state === "FINALISED");
  const displayedPlacements = placements.filter((placement) => placement.state !== "DELETED"); displayedPlacements.sort((left, right) => left.masterNumber - right.masterNumber).forEach((placement, index) => { placement.masterNumber = index + 1; });
  rows.forEach((row) => { const placement = displayedPlacements.find((item) => item.id === row.placementId); if (placement) row.masterNumber = placement.masterNumber; }); appendix.forEach((row) => { const placement = displayedPlacements.find((item) => item.id === row.placementId); if (placement) row.masterNumber = placement.masterNumber; });
  return { persistenceRevision: 42, clients: [{ id: "visual-client", displayName: "Priya Nair" }], projects: [{ id: "visual-project", clientId: "visual-client", activeCaseId: "visual-case" }],
    vastuCases: [{ id: "visual-case", clientId: "visual-client", projectId: "visual-project", caseNumber: "UV-2026-001", recordVersion: 8 }], floorWorkspaces: [{ id: "visual-floor", caseId: "visual-case", projectId: "visual-project", floorLabel: "Ground floor" }],
    remedialWorkflowReservations: [{ id: "visual-reservation", caseId: "visual-case", floorId: "visual-floor", stageAReportId: "visual-stage-a", status: "READY_FOR_CONFIGURATION" }],
    stageBRemediations: [{ id: "visual-remediation", organisationId: "visual-org", caseId: "visual-case", floorId: "visual-floor", projectId: "visual-project", reportId: "visual-stage-a", baseLayoutVersionId: "visual-base", state: scenario === "preview" ? "PAGE_FINALISED" : "EDITING", recordVersion: 17 }],
    reportVersions: [{ id: "visual-stage-a", caseId: "visual-case", floorId: "visual-floor", isPreview: true, artifact: { utilityVerdictIds: STAGE_B_WORKSPACE_PAGES.map((page) => `visual-verdict-${page.pageType}`) } }, ...(scenario === "preview" ? [{ id: "visual-final", caseId: "visual-case", floorId: "visual-floor", isPreview: false, artifact: { templateVersion: "uchit-verdict/v5", stageBRenderManifest: manifest } }] : [])],
    reportPlacementPages: pages, remediationBaseLayoutVersions: [{ id: "visual-base", remediationId: "visual-remediation", candidateId: "visual-candidate", state: hasFinalisedPage ? "LOCKED" : "SELECTED" }], revisedLayoutCandidates: [{ id: "visual-candidate", caseId: "visual-case", floorId: "visual-floor", label: "Option B · Consultant revision", evidenceRef: "visual/revised-layout.png", checksumSha256: "6d2d0fa79a81c412", status: "AVAILABLE" }],
    physicalPlacements: placements, remedyEligibilityResolutions: resolutions, remedyRepositoryRecords: remedies, placementImplementationRows: rows, masterAppendixRows: appendix,
    utilityVerdicts: STAGE_B_WORKSPACE_PAGES.map((page) => ({ id: `visual-verdict-${page.pageType}`, caseId: "visual-case", floorId: "visual-floor", status: "APPROVED", solutionFraming: page.sourceFraming })), dependencyInvalidations: []
  } as unknown as Bootstrap;
}

function visualPageType(scenario: string): StageBRemedyType {
  if (["disha-activation", "deleted"].includes(scenario)) return "DISHA_ACTIVATION";
  if (["tattav-balancer", "multi-saved", "implementation"].includes(scenario)) return "TATTAV_BALANCER";
  if (["tattav-activation", "zero", "zero-finalised"].includes(scenario)) return "TATTAV_ACTIVATION";
  if (scenario === "equaliser") return "EQUALISER";
  return "DISHA_BALANCER";
}

export function StageBRemedyWorkspaceVisualPreview() {
  return <StageBRemedyWorkspace caseId="visual-case" floorId="visual-floor" visualFixture />;
}

export function StageBRemedyWorkspace({ caseId, floorId, visualFixture = false, activePageType: controlledPageType, onActivePageTypeChange, hideNavigation = false }: { caseId?: string; floorId?: string; visualFixture?: boolean; activePageType?: StageBRemedyType; onActivePageTypeChange?: (pageType: StageBRemedyType) => void; hideNavigation?: boolean }) {
  const { activeUser, sessionStatus } = useSession();
  const [state, setState] = useState<Bootstrap | null>(() => visualFixture ? buildVisualBootstrap("navigation") : null);
  const [assets, setAssets] = useState<CaseAsset[]>([]); const [busy, setBusy] = useState(!visualFixture); const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState("Loading Stage B workspace…"); const [loadError, setLoadError] = useState(""); const [conflict, setConflict] = useState(false);
  const [internalPageType, setInternalPageType] = useState<StageBRemedyType>("DISHA_BALANCER"); const activePageType = controlledPageType ?? internalPageType; const [attemptedTypes, setAttemptedTypes] = useState<Set<StageBRemedyType>>(new Set());
  const [selectedResolutionId, setSelectedResolutionId] = useState(""); const [activePlacementId, setActivePlacementId] = useState(""); const [editingPlacementId, setEditingPlacementId] = useState("");
  const [swapMode, setSwapMode] = useState(false); const [draft, setDraft] = useState<CanvasDraft | null>(null); const [dirty, setDirty] = useState(false); const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const [grid, setGrid] = useState(false); const [awaitingPlacement, setAwaitingPlacement] = useState(false);
  const [cleanView, setCleanView] = useState(false); const [view, setView] = useState<WorkspaceView>("canvas"); const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false); const [uploadScope, setUploadScope] = useState<UploadScope>(null); const [manifestPreview, setManifestPreview] = useState<StageBRenderManifest | null>(null); const [previewOpen, setPreviewOpen] = useState(false);
  const [layoutObjectUrl, setLayoutObjectUrl] = useState(""); const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null); const actionKeys = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (visualFixture) return;
    setBusy(true); setConflict(false); setLoadError("");
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your role cannot open this workspace." : "Stage B data could not be loaded.");
      const next = await response.json() as Bootstrap; setState(next);
      const exactFloor = next.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseId);
      if (caseId && exactFloor) { const query = new URLSearchParams({ caseId, floorLabel: exactFloor.floorLabel }); const files = await fetch(`/api/case-files?${query}`, { cache: "no-store" }); if (files.ok) setAssets(((await files.json()) as { assets?: CaseAsset[] }).assets ?? []); }
    } catch (cause) { const error = cause instanceof Error ? cause.message : "Stage B data could not be loaded."; setLoadError(error); setMessage(error); }
    finally { setBusy(false); }
  }, [caseId, floorId, visualFixture]);

  useEffect(() => { if (!visualFixture) void refresh(); }, [refresh, visualFixture]);
  useEffect(() => {
    if (!visualFixture) return;
    const scenario = new URLSearchParams(window.location.search).get("stageBVisual") ?? "navigation"; const next = buildVisualBootstrap(scenario); const nextType = visualPageType(scenario);
    setState(next); setInternalPageType(nextType); setBusy(false); setView(scenario === "implementation" ? "implementation" : "canvas"); setPreviewOpen(scenario === "preview");
    setManifestPreview(scenario === "preview" ? next.reportVersions.find((report) => report.artifact?.templateVersion === "uchit-verdict/v5")?.artifact?.stageBRenderManifest ?? null : null);
    setAttemptedTypes(new Set(["TATTAV_ACTIVATION"]));
    setMessage(scenario === "deleted" ? "Saved placement deleted. Server numbering refreshed; tombstone hidden from every projection." : scenario === "numbering" ? "Continuous master numbers are server-owned across all five remedy pages." : "Stage B workspace is up to date.");
  }, [visualFixture]);

  const caseRecord = state?.vastuCases.find((item) => item.id === caseId); const client = state?.clients.find((item) => item.id === caseRecord?.clientId); const floor = state?.floorWorkspaces.find((item) => item.id === floorId && item.caseId === caseRecord?.id);
  const reservation = state?.remedialWorkflowReservations.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id); const remediation = state?.stageBRemediations.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id);
  const report = state?.reportVersions.find((item) => item.id === (remediation?.reportId ?? reservation?.stageAReportId)); const activeConfiguration = STAGE_B_WORKSPACE_PAGES.find((item) => item.pageType === activePageType) ?? STAGE_B_WORKSPACE_PAGES[0];
  const page = state?.reportPlacementPages.find((item) => item.remediationId === remediation?.id && item.pageType === activeConfiguration.pageType); const baseLayout = state?.remediationBaseLayoutVersions.find((item) => item.id === remediation?.baseLayoutVersionId && ["SELECTED", "LOCKED"].includes(item.state));
  const candidate = state?.revisedLayoutCandidates.find((item) => item.id === baseLayout?.candidateId); const candidates = state?.revisedLayoutCandidates.filter((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && item.status === "AVAILABLE") ?? [];
  const placements = state && remediation && page ? livePagePlacements(state.physicalPlacements, remediation.id, page.id) : []; const activePlacement = placements.find((item) => item.id === activePlacementId) ?? placements[0];
  const editingPlacement = placements.find((item) => item.id === editingPlacementId); const occupiedCallouts = placements.filter((item) => item.id !== editingPlacementId).map((item) => ({ x: item.calloutX, y: item.calloutY, width: item.calloutWidth, height: item.calloutHeight }));
  const eligible = useMemo(() => state && remediation ? eligibleRemediesForPage(state.remedyEligibilityResolutions, state.remedyRepositoryRecords, remediation.id, activeConfiguration.pageType) : [], [state, remediation?.id, activeConfiguration.pageType]);
  const filteredEligible = eligible.filter(({ remedy }) => `${remedy.name} ${remedy.attributePurpose}`.toLowerCase().includes(search.trim().toLowerCase())); const selected = eligible.find((item) => item.resolution.id === selectedResolutionId) ?? eligible.find((item) => item.resolution.id === activePlacement?.eligibilityResolutionId) ?? eligible[0];
  const verdict = state?.utilityVerdicts.find((item) => report?.artifact?.utilityVerdictIds?.includes(item.id) && item.solutionFraming === activeConfiguration.sourceFraming);
  const implementationRows = state && remediation && page ? implementationRowsForPage(state.placementImplementationRows, state.physicalPlacements, remediation.id, page.id) : [];
  const finalReport = state?.reportVersions.find((item) => item.caseId === caseRecord?.id && item.floorId === floor?.id && !item.isPreview && item.artifact?.templateVersion === "uchit-verdict/v5");
  const exactAsset = assets.find((item) => item.evidenceRef === candidate?.evidenceRef); const assetUrl = exactAsset && caseRecord && floor ? `/api/case-files/${encodeURIComponent(exactAsset.id)}?caseId=${encodeURIComponent(caseRecord.id)}&floorLabel=${encodeURIComponent(floor.floorLabel)}` : undefined;
  const permitted = visualFixture || (sessionStatus === "ready" && canEvaluateCases(activeUser)); const focusMode = Boolean(awaitingPlacement || dirty || tool === "move-callout"); const eligibilityAttempted = attemptedTypes.has(activeConfiguration.pageType) || eligible.length > 0;

  useEffect(() => {
    const first = placements[0]; setActivePlacementId(first?.id ?? ""); setEditingPlacementId(""); setSwapMode(false); setDraft(null); setDirty(false); setAwaitingPlacement(false); setTool("select"); setSearch("");
    setSelectedResolutionId(first?.eligibilityResolutionId ?? eligible[0]?.resolution.id ?? "");
  }, [page?.id]);
  useEffect(() => { if (activePlacementId && !placements.some((item) => item.id === activePlacementId)) setActivePlacementId(placements[0]?.id ?? ""); }, [placements, activePlacementId]);
  useEffect(() => { if (finalReport?.artifact?.stageBRenderManifest) setManifestPreview(finalReport.artifact.stageBRenderManifest); }, [finalReport]);
  useEffect(() => {
    let disposed = false; let objectUrl = ""; setLayoutObjectUrl(""); if (!assetUrl || !exactAsset) return;
    void fetch(assetUrl, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("The selected layout asset could not be displayed."); objectUrl = URL.createObjectURL(await response.blob()); if (disposed) URL.revokeObjectURL(objectUrl); else setLayoutObjectUrl(objectUrl); })
      .catch(() => { if (!disposed) setMessage("The selected layout asset could not be displayed; using its checksum-bound fallback."); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetUrl, exactAsset]);

  async function action(name: string, fields: Record<string, unknown>, expectedRecordVersion: number) {
    if (visualFixture) throw new Error("The visual review fixture is read-only."); if (!state) throw new Error("Reload the workspace first."); setBusy(true); setConflict(false);
    try {
      actionKeys.current[name] ??= crypto.randomUUID(); const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: name, ...fields, idempotencyKey: actionKeys.current[name], expectedRecordVersion, expectedRevision: state.persistenceRevision }) });
      const body = await response.json(); if (!response.ok || body.ok === false) throw new WorkspaceActionError(typeof body.error === "string" ? body.error : body.error?.message ?? "The Stage B action failed.", response.status); delete actionKeys.current[name]; return body.result;
    } catch (cause) { if (cause instanceof WorkspaceActionError && [409, 428].includes(cause.status)) { setConflict(true); throw new Error("This workspace changed. Your canvas draft is still here; reload and reconcile before saving."); } throw cause; }
    finally { setBusy(false); }
  }

  async function initialise() {
    if (!caseRecord || !floor || !report) return; try { await action("stage-b-remediation-initialise", { caseId: caseRecord.id, floorId: floor.id, reportId: report.id }, caseRecord.recordVersion ?? 0); await refresh(); setMessage("Stage B workspace opened from authoritative Existing Layout evidence."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Stage B could not be opened."); }
  }
  async function selectLayout(candidateId: string) {
    if (!remediation) return; try { await action("stage-b-final-layout-select", { remediationId: remediation.id, candidateId }, remediation.recordVersion ?? 0); await refresh(); setMessage("Final Revised Layout selected. Existing placement coordinates are never remapped automatically."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "The layout could not be selected."); }
  }
  async function loadEligible() {
    if (!remediation || !verdict) return; setResolving(true);
    try { const result = await action("stage-b-remedy-resolve", { remediationId: remediation.id, verdictId: verdict.id, remedialType: activeConfiguration.pageType }, remediation.recordVersion ?? 0); setAttemptedTypes((current) => new Set(current).add(activeConfiguration.pageType)); await refresh(); setMessage(result.eligible.length ? `${result.eligible.length} eligible ${activeConfiguration.label} remed${result.eligible.length === 1 ? "y" : "ies"} loaded.` : `No approved ${activeConfiguration.label} remedy is eligible for this verdict.`); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Eligibility could not be resolved."); } finally { setResolving(false); }
  }
  async function savePlacement(completePlacement = true) {
    if (!remediation || !page || !baseLayout || !selected || !draft) return false;
    try {
      const saved = await action("stage-b-remedy-placement-upsert", { remediationId: remediation.id, pageId: page.id, ...(editingPlacementId ? { placementId: editingPlacementId } : {}), eligibilityResolutionId: selected.resolution.id, baseLayoutVersionId: baseLayout.id, placementType: "REMEDY",
        anchorX: draft.anchor.x, anchorY: draft.anchor.y, calloutX: draft.callout.x, calloutY: draft.callout.y, calloutWidth: draft.callout.width, calloutHeight: draft.callout.height, showCircle: true, showFrame: true, showHighlight: true, completePlacement,
        ...(editingPlacement?.dependencyReviewState === "NEEDS_REVIEW" ? { reconcileInvalidationId: state?.dependencyInvalidations.find((item) => item.targetId === editingPlacement.id && item.status === "NEEDS_REGENERATION")?.id } : {}) }, remediation.recordVersion ?? 0);
      setDirty(false); setAwaitingPlacement(false); setTool("select"); setSwapMode(false); setEditingPlacementId(""); setActivePlacementId(saved.id); await refresh(); setMessage(completePlacement ? "Placement and callout saved with a locked anchor. Server master numbers refreshed." : "Draft placement saved."); return true;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Placement could not be saved."); return false; }
  }
  async function chooseRemedy(resolutionId: string) {
    if (page?.state === "FINALISED") return; if (dirty && !(await savePlacement(true))) return; setSelectedResolutionId(resolutionId);
    if (swapMode && editingPlacement) { setDraft(placementDraft(editingPlacement)); setDirty(true); setAwaitingPlacement(false); setTool("move-callout"); setMessage("Remedy swapped on the fixed placement anchor. Save to commit the replacement."); return; }
    setEditingPlacementId(""); setDraft(null); setAwaitingPlacement(true); setTool("place"); setMessage("Click the exact placement point on the Final Revised Layout.");
  }
  async function switchPage(pageType: StageBRemedyType) {
    if (pageType === activePageType) return; if (dirty && !(await savePlacement(true))) return; setInternalPageType(pageType); onActivePageTypeChange?.(pageType); setView("canvas"); setMessage(`${STAGE_B_WORKSPACE_PAGES.find((item) => item.pageType === pageType)?.label} workspace opened on the same Final Revised Layout.`);
  }
  async function deleteSavedPlacement() {
    if (!remediation || !page || !activePlacement || page.state === "FINALISED") return;
    if (!window.confirm(`Delete saved placement ${activePlacement.masterNumber ?? ""}: ${activePlacement.nameSnapshot}? The server will preserve an audit tombstone and resequence editable master numbers.`)) return;
    try { await action("stage-b-remedy-placement-delete", { remediationId: remediation.id, pageId: page.id, placementId: activePlacement.id }, remediation.recordVersion ?? 0); setDraft(null); setEditingPlacementId(""); setActivePlacementId(""); await refresh(); setMessage("Saved placement deleted. Server numbering refreshed; tombstone hidden from canvas, sheets, preview and appendix."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Saved placement could not be deleted."); }
  }
  function placeAt(event: React.PointerEvent<HTMLDivElement>) {
    if (!selected || cleanView || !["place", "move-anchor"].includes(tool) || page?.state === "FINALISED") return; const anchor = pointFromRect(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()); const callout = automaticCallout(anchor, occupiedCallouts);
    setDraft({ anchor, callout }); setAwaitingPlacement(false); setDirty(true); setTool("move-callout"); setMessage("Anchor set. Drag the callout if needed, then save the locked placement.");
  }
  async function finalise() {
    if (!remediation || !page) return; if (dirty) { if (await savePlacement(true)) setMessage("Placement saved and locked. Select Finalise page again after the authoritative refresh."); return; }
    try { const result = await action("stage-b-page-finalise", { remediationId: remediation.id, pageId: page.id }, remediation.recordVersion ?? 0); if (result.manifest) setManifestPreview(result.manifest); await refresh(); setMessage(result.sequenceFinalised ? "All five remedy pages finalised with integrity PASS. The v5 preview is ready." : `${activeConfiguration.label} finalised on the locked Final Revised Layout.`); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "The page could not be finalised."); }
  }

  if (busy && !state) return <section className="stage-b-state" aria-busy="true"><div className="stage-b-loader" /><h2>Loading remedy workspace</h2><p>Resolving case, floor, report and layout lineage…</p></section>;
  if (!permitted) return <section className="stage-b-state" role="alert"><h2>Stage B access is restricted</h2><p>A Consultant, Administrator or Super Administrator is required.</p><button className="button-secondary" onClick={() => void refresh()}>Retry access</button></section>;
  if (loadError) return <section className="stage-b-state" role="alert"><h2>Stage B could not be loaded</h2><p>{loadError}</p><button className="button-secondary" onClick={() => void refresh()}>Retry loading</button></section>;
  if (!state || !caseRecord || !floor) return <section className="stage-b-state" role="alert"><h2>Select an exact case and floor</h2><p>Stage B never falls back to another project or floor.</p></section>;
  if (!reservation) return <section className="stage-b-state" role="alert"><h2>Stage B is not ready</h2><p>Approved Post-Site Findings and balance clearance are required before the reservation is created.</p><button className="button-secondary" onClick={() => void refresh()}>Check again</button></section>;
  if (!remediation) return <section className="stage-b-state"><h2>Open the Stage B remedy workspace</h2><p>The Existing Layout will be derived server-side from report evidence. No layout reference is sent by this screen.</p><button className="button" disabled={busy} onClick={() => void initialise()}>Open Stage B workspace</button><p role="status">{message}</p></section>;
  if (!baseLayout) return <section className="stage-b-state"><h2>Select the Final Revised Layout</h2><p>Choose one approved candidate. Draft placement coordinates will require explicit review after any later selection change.</p><div className="stage-b-candidate-list">{candidates.map((item) => <button key={item.id} className="stage-b-candidate" disabled={busy} onClick={() => void selectLayout(item.id)}><strong>{item.label}</strong><span>{item.checksumSha256.slice(0, 12)}…</span></button>)}</div>{!candidates.length && <p role="alert">No revised-layout candidate is available for this floor.</p>}</section>;

  function renderPlacement(canvasDraft: CanvasDraft, name: string, purpose: string | undefined, key: string, options: { prior?: boolean; interactive?: boolean; selected?: boolean; masterNumber?: number; onSelect?: () => void } = {}) {
    const { prior = false, interactive = false, selected: isSelected = false, masterNumber, onSelect } = options;
    return <PlacementLayer key={key} draft={canvasDraft} name={name} purpose={purpose} layerKey={key} prior={prior} interactive={interactive} selected={isSelected} masterNumber={masterNumber}
      occupiedCallouts={occupiedCallouts} onSelect={onSelect} onDraftChange={(next) => { setTool("move-callout"); setDraft(next); setDirty(true); }} onInteractionMessage={setMessage} />;
  }

  return <section className={`stage-b-workspace${focusMode ? " is-focus" : ""}${cleanView ? " is-clean" : ""}`} aria-labelledby="stage-b-workspace-title">
    {!hideNavigation && <StageBPageNavigation state={state} remediationId={remediation.id} activeType={activeConfiguration.pageType} onSelect={(pageType) => void switchPage(pageType)} />}
    <header className="stage-b-context-header"><div><div className="eyebrow">Stage B · {activeConfiguration.label}</div><h2 id="stage-b-workspace-title">{client?.displayName ?? "Client"} · {caseRecord.caseNumber} · {floor.floorLabel}</h2><p>{candidate?.label ?? "Final Revised Layout"} · Base {baseLayout.state === "LOCKED" ? "locked" : "selected"} · Page {page?.state ?? "DRAFT"}</p></div>
      <div className="stage-b-header-actions">{focusMode && <span className="stage-b-focus-badge" role="status">Focus · active remedy</span>}<button className="button-secondary" aria-pressed={cleanView} onClick={() => setCleanView((value) => !value)}>Clean View</button><button className="button-secondary" aria-pressed={view === "implementation"} onClick={() => setView((current) => current === "canvas" ? "implementation" : "canvas")}>{view === "canvas" ? "Implementation Sheet" : "Placement Canvas"}</button>
        <button className="button" disabled={page?.state === "FINALISED" || busy} onClick={() => void finalise()}>{page?.state === "FINALISED" ? "Page finalised" : "Finalise page"}</button><button className="button-secondary" disabled={!manifestPreview} title={!manifestPreview ? "Available after the full five-page sequence is finalised" : undefined} onClick={() => setPreviewOpen(true)}>Report Preview</button></div>
    </header>
    {conflict && <div className="stage-b-conflict" role="alert"><strong>Workspace changed.</strong> Your canvas draft is preserved. <button onClick={() => void refresh()}>Reload latest</button></div>}
    {view === "implementation" ? <ImplementationSheet pageLabel={activeConfiguration.label} pageState={page?.state ?? "DRAFT"} rows={implementationRows} /> : <>
      <div className="stage-b-main"><div className="stage-b-canvas-column"><div className="stage-b-canvas-toolbar" aria-label="Canvas controls"><button aria-pressed={tool === "select"} onClick={() => setTool("select")}>Select</button><button aria-pressed={tool === "pan"} onClick={() => setTool("pan")}>Pan</button><button onClick={() => setZoom((value) => Math.min(2.5, value + .2))}>Zoom +</button><button onClick={() => setZoom((value) => Math.max(.5, value - .2))}>Zoom −</button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button><button aria-pressed={grid} onClick={() => setGrid((value) => !value)}>Grid</button><span>{Math.round(zoom * 100)}%</span></div>
        <div className="stage-b-canvas-viewport" onPointerDown={(event) => { if (tool === "pan") panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; }} onPointerMove={(event) => { if (panStart.current && tool === "pan") setPan({ x: panStart.current.panX + event.clientX - panStart.current.x, y: panStart.current.panY + event.clientY - panStart.current.y }); }} onPointerUp={() => { panStart.current = null; }} onPointerLeave={() => { panStart.current = null; }}>
          <div className={`stage-b-print-sheet${grid ? " has-grid" : ""}${awaitingPlacement ? " is-awaiting-placement" : ""}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} onPointerDown={placeAt} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && selected && ["place", "move-anchor"].includes(tool) && page?.state !== "FINALISED") { event.preventDefault(); const anchor = { x: .5, y: .5 }; setDraft({ anchor, callout: automaticCallout(anchor, occupiedCallouts) }); setAwaitingPlacement(false); setDirty(true); setTool("move-callout"); setMessage("Keyboard placement set at the printable centre. Move the callout with arrow keys if needed."); } }} tabIndex={0} role="application" aria-label={`${activeConfiguration.label} Final Revised Layout placement canvas. Press Enter to place at the centre when placement mode is active.`}>
            {layoutObjectUrl && exactAsset?.mimeType.startsWith("image/") ? <img className="stage-b-layout-media" src={layoutObjectUrl} alt={`Final Revised Layout: ${candidate?.label}`} /> : layoutObjectUrl && exactAsset?.mimeType === "application/pdf" ? <iframe className="stage-b-layout-media" src={`${layoutObjectUrl}#toolbar=0&navpanes=0&scrollbar=0`} title={`Final Revised Layout: ${candidate?.label}`} /> : <div className="stage-b-layout-fallback" aria-label={`Final Revised Layout ${candidate?.label}`}><span>FINAL REVISED LAYOUT</span><strong>{candidate?.label}</strong><div className="stage-b-plan-lines"><i /><i /><i /><i /><i /></div><small>Immutable candidate · {candidate?.checksumSha256.slice(0, 16)}</small></div>}
            {!cleanView && <>{placements.filter((placement) => !(placement.id === editingPlacementId && draft)).map((placement) => renderPlacement(placementDraft(placement), placement.nameSnapshot, placement.attributePurposeSnapshot, placement.id, { prior: focusMode, selected: !focusMode && placement.id === activePlacement?.id, masterNumber: placement.masterNumber, onSelect: () => { setActivePlacementId(placement.id); setSelectedResolutionId(placement.eligibilityResolutionId ?? ""); } }))}
              {draft && (editingPlacementId || dirty) && renderPlacement(draft, selected?.remedy.name ?? editingPlacement?.nameSnapshot ?? activeConfiguration.label, selected?.remedy.attributePurpose ?? editingPlacement?.attributePurposeSnapshot, `draft-${editingPlacementId || "new"}`, { interactive: true, masterNumber: editingPlacement?.masterNumber })}
              {awaitingPlacement && selected && <div className="stage-b-placement-prompt"><span className="stage-b-remedy-thumb">{activeConfiguration.shortLabel}</span><div><strong>{selected.remedy.name} selected</strong><small>Click the exact placement point on the printable layout.</small></div></div>}</>}
          </div>
        </div><div className="stage-b-canvas-status" role="status"><span className={dirty || awaitingPlacement ? "status-attention" : "status-approved"}>{awaitingPlacement ? "Awaiting exact point" : dirty ? "Unsaved canvas change" : placements.length ? `${placements.length} saved placement${placements.length === 1 ? "" : "s"}` : "Choose a remedy and placement point"}</span><p>{focusMode ? "Focus is automatic; completed work is faded and noninteractive until the active remedy is saved." : message}</p></div></div>
        <aside className="stage-b-toolkit" aria-label="Common placement toolkit"><h3>Common toolkit</h3><button disabled={!activePlacement || page?.state === "FINALISED" || busy} onClick={() => { if (!activePlacement) return; setEditingPlacementId(activePlacement.id); setSelectedResolutionId(activePlacement.eligibilityResolutionId ?? ""); setDraft(placementDraft(activePlacement)); setSwapMode(false); setTool("move-callout"); setMessage("Callout editing active. The placement anchor remains fixed."); }}>Edit callout</button>
          <button disabled={!activePlacement || eligible.length < 2 || page?.state === "FINALISED" || busy} onClick={() => { if (!activePlacement) return; setEditingPlacementId(activePlacement.id); setSelectedResolutionId(activePlacement.eligibilityResolutionId ?? ""); setDraft(placementDraft(activePlacement)); setSwapMode(true); setTool("move-callout"); setSearch(""); setMessage("Choose another eligible remedy below. Its saved anchor remains fixed."); }}>Swap remedy</button>
          <button disabled={!activePlacement || page?.state === "FINALISED" || busy} onClick={() => { if (!activePlacement) return; setEditingPlacementId(activePlacement.id); setSelectedResolutionId(activePlacement.eligibilityResolutionId ?? ""); setDraft(null); setSwapMode(false); setAwaitingPlacement(true); setTool("move-anchor"); setMessage("Click the new exact placement point. The callout will stay print-safe."); }}>Move Placement Point</button>
          {dirty && !editingPlacementId ? <button onClick={() => { setDraft(null); setAwaitingPlacement(false); setDirty(false); setTool("select"); setMessage("Unsaved placement draft deleted."); }}>Delete draft</button> : <button disabled={!activePlacement || page?.state === "FINALISED" || busy} onClick={() => void deleteSavedPlacement()}>Delete</button>}
          <hr /><label className="check-row"><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Alignment grid</label><button className="button" disabled={!dirty || page?.state === "FINALISED" || busy} onClick={() => void savePlacement(true)}>Save & lock</button>
          {activePlacement && <div className="stage-b-lock-summary"><strong>Master No. {activePlacement.masterNumber ?? "Pending"}</strong><span>Anchor {activePlacement.anchorX.toFixed(3)}, {activePlacement.anchorY.toFixed(3)}</span><small>Server-owned number · callout movable while page is draft.</small></div>}
        </aside></div>
      <footer className="stage-b-remedy-bar" aria-label={`Eligible ${activeConfiguration.label} remedies`}><div className="stage-b-remedy-bar-heading"><div><strong>Remedy Bar · {activeConfiguration.label}</strong><span>{resolving ? "Resolving approved methodology…" : `${eligible.length} eligible`}</span></div><label><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search eligible remedies" disabled={!eligible.length} /></label></div>
        {!eligible.length && !eligibilityAttempted && <button className="button stage-b-load-remedies" disabled={!verdict || resolving || busy || page?.state === "FINALISED"} onClick={() => void loadEligible()}>{resolving ? "Loading…" : "Load eligible remedies"}</button>}
        <div className="stage-b-remedy-items">{filteredEligible.map(({ resolution, remedy }) => <button key={resolution.id} disabled={page?.state === "FINALISED"} className={`${selected?.resolution.id === resolution.id ? "is-selected" : ""}${awaitingPlacement && selected?.resolution.id === resolution.id ? " is-awaiting-placement" : ""}`} aria-pressed={selected?.resolution.id === resolution.id} onClick={() => void chooseRemedy(resolution.id)}><span className="stage-b-remedy-thumb">{activeConfiguration.shortLabel}</span><strong>{remedy.name}</strong><small>{remedy.attributePurpose}</small></button>)}<button className="stage-b-upload-button" onClick={() => { setUploadScope(null); setUploadOpen(true); }}>+ Upload Remedy</button></div>
        {eligibilityAttempted && !eligible.length && verdict && <p className="stage-b-remedy-empty" role="status">No standard remedies available for this section</p>}{eligible.length > 0 && !filteredEligible.length && <p className="stage-b-remedy-empty" role="status">No eligible remedies match this search.</p>}{!verdict && <p className="stage-b-remedy-empty" role="alert">No immutable {activeConfiguration.label} verdict is bound to this Stage A report.</p>}
      </footer>
    </>}
    {previewOpen && manifestPreview && <StageBManifestPreview manifest={manifestPreview} onClose={() => setPreviewOpen(false)} />}
    {uploadOpen && <UploadRemedyDialog scope={uploadScope} onScope={setUploadScope} onClose={() => { setUploadOpen(false); setUploadScope(null); }} />}
  </section>;
}
