"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import { buildActionHeaders } from "@/lib/request-helpers";
import type {
  ImageDerivativePurpose, ImageDerivativeRecord, ImageOutputFormat, ImageProcessingBatchRecord,
  ImageProcessingTaskRecord, ImageTransformationType, ImageUtilityAuditEventRecord, MediaAssetRecord,
  MediaAssetVersionRecord
} from "@/lib/domain";

type SafeVersion = Omit<MediaAssetVersionRecord, "privateObjectKey"> & {
  privateObjectKey?: undefined; derivative?: ImageDerivativeRecord; referenceCount: number;
};
type ImageAssetView = MediaAssetRecord & { versions: SafeVersion[] };
type RepositoryReference = { id: string; category: string; name: string; status: string; preferredAssetId: string; preferredAssetVersionId: string; recordVersion: number; caseUsed: boolean };
type ImageUtilityView = {
  ok: true; revision: number | null; assets: ImageAssetView[]; tasks: ImageProcessingTaskRecord[];
  batches: ImageProcessingBatchRecord[]; auditEvents: ImageUtilityAuditEventRecord[]; repositoryRecords: RepositoryReference[];
  storage: { originalCount: number; originalBytes: number; derivativeCount: number; derivativeBytes: number; availableCount: number; retiredCount: number; unusedCount: number; unusedBytes: number; taskCounts: Record<string, number> };
};
type Tool = ImageTransformationType | "SELECT";
type CompareMode = "BEFORE" | "AFTER" | "SPLIT";

const TOOLS: Array<{ id: Tool; label: string; hint: string }> = [
  { id: "SELECT", label: "Inspect", hint: "Source and lineage" }, { id: "BACKGROUND_REMOVE", label: "Background", hint: "Uniform edge removal" },
  { id: "CROP", label: "Crop / Trim", hint: "Free crop boundary" }, { id: "RESIZE", label: "Resize", hint: "Pixels and aspect" },
  { id: "UPSCALE", label: "Upscale", hint: "Bounded 2× / 4×" }, { id: "TYPE_CONVERT", label: "Convert", hint: "PNG · JPEG · WebP" },
  { id: "ROTATE", label: "Rotate", hint: "90° or straighten" }, { id: "BRIGHTNESS", label: "Brightness", hint: "Bounded adjustment" },
  { id: "CONTRAST", label: "Contrast", hint: "Bounded adjustment" }, { id: "WHITESPACE_TRIM", label: "Auto Trim", hint: "Exterior whitespace" }
];
const IMAGE_FORMATS: ImageOutputFormat[] = ["PNG", "JPEG", "WEBP"];
const PURPOSES: Array<{ value: ImageDerivativePurpose; label: string }> = [
  { value: "CANONICAL", label: "Canonical derivative" }, { value: "WEB_EDITOR", label: "Web / editor use" }, { value: "PRINT_REPORT", label: "Print / report use" }
];
export const IMAGE_UTILITY_VISUAL_SCENARIOS = ["entry","default","transparency","before","after","crop","crop-result","resize","resize-result","aspect-lock","rotate","rotate-90","straighten","brightness","contrast","trim","convert","convert-warning","background","background-result","upscale","processing","failure","retry","save","history","lineage","preferred","preferred-repository","batch-selection","batch-queue","partial-batch","dedup","usage","unused","cleanup","storage","case-used","case-used-remains","future-workspace","frozen-report","mobile"] as const;
const formatBytes = (value: number) => value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
const toolLabel = (tool: Tool) => TOOLS.find((item) => item.id === tool)?.label ?? tool;

const visualArt = (transparent = false) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
${transparent ? "" : '<rect width="960" height="720" fill="#f8f1e4"/>'}<circle cx="480" cy="360" r="230" fill="#2f443d" opacity=".12"/>
<path d="M480 98 745 570H215Z" fill="#c59342" stroke="#604521" stroke-width="14"/><path d="M480 188 653 500H307Z" fill="#f7e6b7" stroke="#82602e" stroke-width="8"/>
<circle cx="480" cy="356" r="92" fill="#9f3429"/><circle cx="480" cy="356" r="56" fill="#f6ce72"/><path d="M480 280v152M404 356h152" stroke="#fff8dc" stroke-width="17" stroke-linecap="round"/>
<text x="480" y="645" font-family="Georgia,serif" font-size="38" text-anchor="middle" fill="#352a20">Uchit Remedy Asset</text></svg>`)}`;

function visualFixtureState(): ImageUtilityView {
  const owned = { organisationId: "visual-org", createdByActorUserId: "visual-admin", updatedByActorUserId: "visual-admin", recordVersion: 1 };
  const asset: MediaAssetRecord = { id: "visual-asset", category: "OTHER", audience: "FOUNDER_PRIVATE", serviceApplicability: [], title: "Disha Copper Pyramid", description: "Approved repository image", tags: ["remedy", "transparent-ready"], activeVersionId: "visual-original", createdAt: "2026-08-12T09:00:00.000Z", ...owned };
  const base = { assetId: asset.id, pageCount: 1, clientSendable: false, uploadedByActorUserId: "visual-admin", uploadedAt: "2026-08-12T09:00:00.000Z", approvedByActorUserId: "visual-admin", approvedAt: "2026-08-12T09:03:00.000Z", reason: "visual-review", registrationHash: "visual-hash", ...owned };
  const original = { id: "visual-original", version: 1, filename: "disha-copper-pyramid-original.png", mimeType: "image/png", sizeBytes: 384_000, checksumSha256: "A".repeat(64), status: "ACTIVE", widthPixels: 960, heightPixels: 720, hasAlphaChannel: false, referenceCount: 3, ...base } as SafeVersion;
  const cropDerivative = { id: "visual-crop-v2", version: 2, filename: "disha-copper-pyramid-crop-a1b2c3d4.png", mimeType: "image/png", sizeBytes: 298_000, checksumSha256: "B".repeat(64), status: "FOUNDER_APPROVED", widthPixels: 820, heightPixels: 620, hasAlphaChannel: false, referenceCount: 0,
    derivative: { id: "derivative-crop", sourceVersionId: original.id, parentVersionId: original.id, rootVersionId: original.id, outputAssetId: asset.id, outputVersionId: "visual-crop-v2", taskId: "task-crop", transformationType: "CROP", normalizedParameters: { x: 70, y: 45, width: 820, height: 620 }, implementationVersion: "uchit-image-photon/v1", purpose: "CANONICAL", outputFormat: "PNG", outputMimeType: "image/png", widthPixels: 820, heightPixels: 620, hasAlphaChannel: false, checksumSha256: "B".repeat(64), sizeBytes: 298_000, deduplicationKey: "sha256:crop", status: "AVAILABLE", createdAt: "2026-08-13T10:20:00.000Z", ...owned }, ...base } as SafeVersion;
  const transparent = { id: "visual-transparent-v3", version: 3, filename: "disha-copper-pyramid-background-remove-c4d5e6f7.png", mimeType: "image/png", sizeBytes: 244_000, checksumSha256: "C".repeat(64), status: "FOUNDER_APPROVED", widthPixels: 820, heightPixels: 620, hasAlphaChannel: true, referenceCount: 1,
    derivative: { id: "derivative-transparent", sourceVersionId: cropDerivative.id, parentVersionId: cropDerivative.id, rootVersionId: original.id, outputAssetId: asset.id, outputVersionId: "visual-transparent-v3", taskId: "task-background", transformationType: "BACKGROUND_REMOVE", normalizedParameters: { tolerance: 24, mode: "UNIFORM_EDGE_FLOOD_FILL" }, implementationVersion: "uchit-image-photon/v1", purpose: "WEB_EDITOR", outputFormat: "PNG", outputMimeType: "image/png", widthPixels: 820, heightPixels: 620, hasAlphaChannel: true, checksumSha256: "C".repeat(64), sizeBytes: 244_000, deduplicationKey: "sha256:bg", status: "AVAILABLE", createdAt: "2026-08-13T11:05:00.000Z", ...owned }, ...base } as SafeVersion;
  const webp = { id: "visual-webp-v4", version: 4, filename: "disha-copper-pyramid-type-convert-e8f9a0b1.webp", mimeType: "image/webp", sizeBytes: 102_000, checksumSha256: "D".repeat(64), status: "FOUNDER_APPROVED", widthPixels: 820, heightPixels: 620, hasAlphaChannel: true, referenceCount: 0,
    derivative: { id: "derivative-webp", sourceVersionId: transparent.id, parentVersionId: transparent.id, rootVersionId: original.id, outputAssetId: asset.id, outputVersionId: "visual-webp-v4", taskId: "task-webp", transformationType: "TYPE_CONVERT", normalizedParameters: { outputFormat: "WEBP" }, implementationVersion: "uchit-image-photon/v1", purpose: "WEB_EDITOR", outputFormat: "WEBP", outputMimeType: "image/webp", widthPixels: 820, heightPixels: 620, hasAlphaChannel: true, checksumSha256: "D".repeat(64), sizeBytes: 102_000, deduplicationKey: "sha256:webp", status: "AVAILABLE", createdAt: "2026-08-13T11:20:00.000Z", ...owned }, ...base } as SafeVersion;
  const tasks: ImageProcessingTaskRecord[] = [
    { id: "task-webp", sourceVersionId: transparent.id, sourceAssetId: asset.id, transformationType: "TYPE_CONVERT", normalizedParameters: { outputFormat: "WEBP" }, outputFormat: "WEBP", purpose: "WEB_EDITOR", implementationVersion: "uchit-image-photon/v1", status: "SUCCEEDED", attempt: 1, derivativeId: "derivative-webp", requestedAt: "2026-08-13T11:19:58.000Z", completedAt: "2026-08-13T11:20:00.000Z", requestedByActorUserId: "visual-admin", idempotencyKey: "visual-webp", requestHash: "sha256:webp", deduplicationKey: "sha256:webp", ...owned },
    { id: "task-failed", sourceVersionId: original.id, sourceAssetId: asset.id, transformationType: "RESIZE", normalizedParameters: { width: 9000, height: 9000 }, outputFormat: "PNG", purpose: "PRINT_REPORT", implementationVersion: "uchit-image-photon/v1", status: "FAILED", attempt: 1, errorReason: "Requested output exceeds the 16 megapixel derivative limit.", requestedAt: "2026-08-13T12:00:00.000Z", completedAt: "2026-08-13T12:00:01.000Z", requestedByActorUserId: "visual-admin", idempotencyKey: "visual-failed", requestHash: "sha256:failed", deduplicationKey: "sha256:failed", ...owned }
  ];
  const batch = { id: "visual-batch", sourceVersionIds: [original.id, cropDerivative.id, transparent.id], transformationType: "TYPE_CONVERT", normalizedParameters: { outputFormat: "WEBP" }, outputFormat: "WEBP", purpose: "WEB_EDITOR", taskIds: ["task-webp", "task-failed"], status: "PARTIAL", requestedAt: "2026-08-13T12:00:00.000Z", completedAt: "2026-08-13T12:00:04.000Z", requestedByActorUserId: "visual-admin", idempotencyKey: "visual-batch", requestHash: "sha256:batch", ...owned } as ImageProcessingBatchRecord;
  return { ok: true, revision: 42, assets: [{ ...asset, versions: [webp, transparent, cropDerivative, original] }], tasks, batches: [batch], auditEvents: [],
    repositoryRecords: [
      { id: "repo-disha", category: "DISHA_BALANCER", name: "Disha Copper Pyramid", status: "APPROVED", preferredAssetId: asset.id, preferredAssetVersionId: transparent.id, recordVersion: 4, caseUsed: false },
      { id: "case-used-visual", category: "CASE_USED_REMEDY", name: "Case-only Copper Helix", status: "ACTIVE", preferredAssetId: asset.id, preferredAssetVersionId: original.id, recordVersion: 1, caseUsed: true }
    ], storage: { originalCount: 1, originalBytes: original.sizeBytes, derivativeCount: 3, derivativeBytes: cropDerivative.sizeBytes + transparent.sizeBytes + webp.sizeBytes,
      availableCount: 3, retiredCount: 0, unusedCount: 2, unusedBytes: cropDerivative.sizeBytes + webp.sizeBytes, taskCounts: { QUEUED: 0, PROCESSING: 0, SUCCEEDED: 3, FAILED: 1 } } };
}

function transformationParameters(tool: Tool, values: {
  cropX: number; cropY: number; cropWidth: number; cropHeight: number; resizeWidth: number; resizeHeight: number;
  aspectLocked: boolean; upscaleFactor: number; rotation: number; brightness: number; contrast: number; trimTolerance: number;
}, outputFormat: ImageOutputFormat) {
  switch (tool) {
    case "CROP": return { x: values.cropX, y: values.cropY, width: values.cropWidth, height: values.cropHeight };
    case "RESIZE": return { width: values.resizeWidth, height: values.resizeHeight, preserveAspectRatio: values.aspectLocked };
    case "UPSCALE": return { factor: values.upscaleFactor };
    case "ROTATE": return { degrees: values.rotation };
    case "BRIGHTNESS": return { amount: values.brightness };
    case "CONTRAST": return { amount: values.contrast };
    case "WHITESPACE_TRIM": return { tolerance: values.trimTolerance, alphaThreshold: 8 };
    case "TYPE_CONVERT": return { outputFormat };
    case "BACKGROUND_REMOVE": return { tolerance: values.trimTolerance };
    default: return {};
  }
}

function qualityWarnings(version: SafeVersion | undefined) {
  if (!version) return ["Choose an image version to begin."];
  const warnings: string[] = [];
  if (!version.widthPixels || !version.heightPixels) warnings.push("Dimensions are missing; processing is blocked.");
  else if (Math.min(version.widthPixels, version.heightPixels) < 256) warnings.push("Small source: review sharpness before print use.");
  if (!(["image/png", "image/jpeg", "image/webp"] as const).includes(version.mimeType as never)) warnings.push("Unsupported image format.");
  if (version.mimeType === "image/jpeg" && version.hasAlphaChannel) warnings.push("Transparency metadata is inconsistent with JPEG.");
  return warnings.length ? warnings : ["Checksum, dimensions, format and renderability are ready for server validation."];
}

export function ImageUtilityConsole({ visualFixture = false }: { visualFixture?: boolean }) {
  const { activeUser } = useSession();
  const [view, setView] = useState<ImageUtilityView | null>(() => visualFixture ? visualFixtureState() : null);
  const [selectedVersionId, setSelectedVersionId] = useState(() => visualFixture ? "visual-original" : "");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState(() => visualFixture ? "repo-disha" : "");
  const [tool, setTool] = useState<Tool>("SELECT"); const [compare, setCompare] = useState<CompareMode>("AFTER");
  const [purpose, setPurpose] = useState<ImageDerivativePurpose>("CANONICAL"); const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>("PNG");
  const [cropX, setCropX] = useState(70); const [cropY, setCropY] = useState(45); const [cropWidth, setCropWidth] = useState(820); const [cropHeight, setCropHeight] = useState(620);
  const [resizeWidth, setResizeWidth] = useState(1200); const [resizeHeight, setResizeHeight] = useState(900); const [aspectLocked, setAspectLocked] = useState(true);
  const [upscaleFactor, setUpscaleFactor] = useState(2); const [rotation, setRotation] = useState(0); const [brightness, setBrightness] = useState(0); const [contrast, setContrast] = useState(0); const [trimTolerance, setTrimTolerance] = useState(8);
  const [busy, setBusy] = useState(!visualFixture); const [status, setStatus] = useState(visualFixture ? "Immutable source ready." : "Loading Image Utility…"); const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false); const [pendingVersionId, setPendingVersionId] = useState(""); const [showBatch, setShowBatch] = useState(false); const [batchSelection, setBatchSelection] = useState<string[]>([]);
  const [showCleanup, setShowCleanup] = useState(false); const [cleanupId, setCleanupId] = useState(""); const [scenario, setScenario] = useState("default");

  const versions = useMemo(() => view?.assets.flatMap((asset) => asset.versions) ?? [], [view]);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const selectedAsset = view?.assets.find((asset) => asset.id === selectedVersion?.assetId);
  const selectedDerivative = selectedVersion?.derivative;
  const rootVersion = versions.find((version) => version.id === selectedDerivative?.rootVersionId) ?? selectedVersion;
  const parentVersion = versions.find((version) => version.id === selectedDerivative?.parentVersionId) ?? selectedVersion;
  const repositoryChoices = view?.repositoryRecords.filter((item) => !item.caseUsed && item.preferredAssetId === selectedVersion?.assetId) ?? [];
  const selectedRepository = view?.repositoryRecords.find((item) => item.id === selectedRepositoryId);
  const relatedHistory = selectedAsset?.versions ?? [];
  const activeTasks = view?.tasks.filter((task) => task.sourceAssetId === selectedVersion?.assetId) ?? [];
  const latestTask = activeTasks[0];
  const unused = relatedHistory.filter((item) => item.derivative?.status === "AVAILABLE" && item.referenceCount === 0);
  const params = { cropX, cropY, cropWidth, cropHeight, resizeWidth, resizeHeight, aspectLocked, upscaleFactor, rotation, brightness, contrast, trimTolerance };

  const sourceUrl = visualFixture
    ? visualArt(selectedVersionId === "visual-transparent-v3" || selectedVersionId === "visual-webp-v4" || scenario === "background-result")
    : selectedVersion ? `/api/image-utility/assets/${encodeURIComponent(selectedVersion.id)}` : "";
  const beforeUrl = visualFixture ? visualArt(parentVersion?.hasAlphaChannel) : parentVersion ? `/api/image-utility/assets/${encodeURIComponent(parentVersion.id)}` : sourceUrl;
  const previewStyle = tool === "ROTATE" ? { transform: `rotate(${rotation}deg)` }
    : tool === "BRIGHTNESS" ? { filter: `brightness(${100 + brightness}%)` }
    : tool === "CONTRAST" ? { filter: `contrast(${100 + contrast}%)` } : undefined;

  async function refresh(preferredVersionId?: string) {
    if (visualFixture) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/image-utility", { cache: "no-store" }); const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.error ?? "Image Utility state could not be loaded.");
      setView(body); const query = new URLSearchParams(window.location.search);
      const requested = preferredVersionId ?? query.get("imageAssetVersionId") ?? "";
      const allVersions = (body.assets as ImageAssetView[]).flatMap((asset) => asset.versions);
      setSelectedVersionId(allVersions.some((version) => version.id === requested) ? requested : allVersions[0]?.id ?? "");
      const requestedRecord = query.get("repositoryRecordId") ?? ""; if (requestedRecord) setSelectedRepositoryId(requestedRecord);
      setStatus("Private media state is current.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Image Utility state could not be loaded."); }
    finally { setBusy(false); }
  }

  async function action(name: string, fields: Record<string, unknown>, expectedRecordVersion: number) {
    if (!view) throw new Error("Refresh Image Utility state first.");
    const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({
      action: name, ...fields, idempotencyKey: crypto.randomUUID(), expectedRecordVersion, expectedRevision: view.revision
    }) });
    const body = await response.json(); if (!response.ok || body.ok === false) throw new Error(body.error ?? "Image Utility action failed."); return body.result;
  }

  async function saveDerivative() {
    if (!selectedVersion || tool === "SELECT") return;
    setBusy(true); setError(""); setStatus("Authoritative server processing in progress…");
    try {
      const result = await action("image-utility-derivative-process", { sourceVersionId: selectedVersion.id, transformationType: tool,
        parameters: transformationParameters(tool, params, outputFormat), outputFormat: tool === "BACKGROUND_REMOVE" ? "PNG" : outputFormat, purpose }, selectedVersion.recordVersion ?? 0) as { task: ImageProcessingTaskRecord; version?: SafeVersion; derivative?: ImageDerivativeRecord; replayed: boolean; warnings?: string[] };
      if (result.task.status === "FAILED") throw new Error(result.task.errorReason ?? "Server processing failed.");
      setDirty(false); setStatus(result.replayed ? "Identical valid derivative reused; no duplicate was created." : `Derivative ${result.derivative?.id ?? ""} saved with immutable checksum.`);
      await refresh(result.version?.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Derivative processing failed."); setStatus("Processing failed. Review the error and retry."); }
    finally { setBusy(false); }
  }

  async function retryTask(task: ImageProcessingTaskRecord) {
    setBusy(true); setError(""); try {
      const result = await action("image-utility-task-retry", { taskId: task.id }, task.recordVersion) as { task: ImageProcessingTaskRecord; version?: SafeVersion };
      if (result.task.status === "FAILED") throw new Error(result.task.errorReason ?? "Retry failed."); setStatus("Retry completed without uncontrolled duplicate derivatives."); await refresh(result.version?.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Retry failed."); } finally { setBusy(false); }
  }

  async function setPreferred() {
    if (!selectedVersion || !selectedRepository) return; setBusy(true); setError("");
    try { await action("repository-preferred-asset-set", { recordId: selectedRepository.id, assetId: selectedVersion.assetId, assetVersionId: selectedVersion.id,
      reason: "Validated Image Utility derivative selected for future repository use only." }, selectedRepository.recordVersion); setStatus("Preferred Asset updated for future use. Historical placements and reports remain unchanged."); await refresh(selectedVersion.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Preferred Asset update failed."); } finally { setBusy(false); }
  }

  async function runBatch() {
    if (!batchSelection.length || tool === "SELECT") return; setBusy(true); setError(""); setStatus("Bounded batch is running item by item…");
    try { const result = await action("image-utility-batch-process", { sourceVersionIds: batchSelection, transformationType: tool,
      parameters: transformationParameters(tool, params, outputFormat), outputFormat: tool === "BACKGROUND_REMOVE" ? "PNG" : outputFormat, purpose }, 0) as { batch: ImageProcessingBatchRecord };
      setStatus(`Batch ${result.batch.status.toLowerCase()}: successful outputs were retained independently.`); await refresh(selectedVersionId); setShowBatch(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Batch processing failed."); } finally { setBusy(false); }
  }

  async function retireUnused() {
    const version = versions.find((item) => item.derivative?.id === cleanupId); if (!version?.derivative) return; setBusy(true); setError("");
    try { await action("image-utility-derivative-retire", { derivativeId: version.derivative.id, reason: "Unused derivative retired after explicit reference review." }, version.derivative.recordVersion);
      setShowCleanup(false); setCleanupId(""); setStatus("Unused derivative retired from future selection; immutable bytes and history remain retained."); await refresh(selectedVersionId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Derivative retirement failed."); } finally { setBusy(false); }
  }

  function selectVersion(versionId: string) {
    if (dirty) { setPendingVersionId(versionId); return; } setSelectedVersionId(versionId); setTool("SELECT"); setCompare("AFTER");
  }
  function resetWorking() {
    setSelectedVersionId(rootVersion?.id ?? selectedVersionId); setTool("SELECT"); setCompare("AFTER"); setRotation(0); setBrightness(0); setContrast(0); setDirty(false); setStatus("Working preview reset to the immutable original. Existing derivatives were not deleted.");
  }

  useEffect(() => { if (!visualFixture) void refresh(); }, [visualFixture]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!visualFixture) return; const requested = new URLSearchParams(window.location.search).get("imageVisual") ?? "default";
    const current = (IMAGE_UTILITY_VISUAL_SCENARIOS as readonly string[]).includes(requested) ? requested : "default"; setScenario(current);
    const tools: Record<string, Tool> = { crop: "CROP", "crop-result": "CROP", resize: "RESIZE", "resize-result": "RESIZE", "aspect-lock": "RESIZE", rotate: "ROTATE", "rotate-90": "ROTATE", straighten: "ROTATE", brightness: "BRIGHTNESS", contrast: "CONTRAST", trim: "WHITESPACE_TRIM", convert: "TYPE_CONVERT", "convert-warning": "TYPE_CONVERT", background: "BACKGROUND_REMOVE", "background-result": "BACKGROUND_REMOVE", upscale: "UPSCALE" };
    if (tools[current]) { setTool(tools[current]); setDirty(true); }
    if (current === "transparency") setSelectedVersionId("visual-transparent-v3");
    if (current === "crop-result") setSelectedVersionId("visual-crop-v2");
    if (current === "resize-result") { setResizeWidth(640); setResizeHeight(480); }
    if (current === "save") { setTool("CROP"); setDirty(true); }
    if (current === "before") setCompare("BEFORE"); if (current === "after") { setCompare("AFTER"); setSelectedVersionId("visual-crop-v2"); } if (current === "rotate-90") setRotation(90); if (current === "straighten") setRotation(-3.5);
    if (current === "brightness") setBrightness(28); if (current === "contrast") setContrast(34); if (current === "convert-warning") { setSelectedVersionId("visual-transparent-v3"); setOutputFormat("JPEG"); }
    if (current === "background-result") setSelectedVersionId("visual-transparent-v3"); if (current === "preferred" || current === "preferred-repository") setSelectedVersionId("visual-transparent-v3");
    if (["batch-selection", "batch-queue", "partial-batch"].includes(current)) { setShowBatch(true); setBatchSelection(["visual-original", "visual-crop-v2", "visual-transparent-v3"]); setTool("TYPE_CONVERT"); }
    if (["unused", "cleanup"].includes(current)) { setShowCleanup(true); setCleanupId("derivative-webp"); }
    if (["case-used", "case-used-remains"].includes(current)) setSelectedRepositoryId("case-used-visual");
    if (current === "failure" || current === "retry") setError("Requested output exceeds the 16 megapixel derivative limit.");
    if (current === "processing") setStatus("Authoritative server processing in progress…"); if (current === "dedup") setStatus("Identical valid derivative reused; no duplicate was created.");
  }, [visualFixture]);

  if (!view && busy) return <section id="image-utility" className="image-utility image-utility-loading" aria-busy="true"><div className="eyebrow">Image Utility</div><h2>Loading private image versions…</h2><p>Checking organisation scope, immutable checksums and processing history.</p></section>;
  if (!view) return <section id="image-utility" className="image-utility image-utility-loading"><h2>Image Utility unavailable</h2><p>{error || "Refresh to retry."}</p><button className="button" onClick={() => void refresh()}>Retry</button></section>;

  const resultingDimensions = tool === "CROP" ? `${cropWidth} × ${cropHeight}` : tool === "RESIZE" ? `${resizeWidth} × ${resizeHeight}`
    : tool === "UPSCALE" ? `${(selectedVersion?.widthPixels ?? 0) * upscaleFactor} × ${(selectedVersion?.heightPixels ?? 0) * upscaleFactor}`
      : `${selectedVersion?.widthPixels ?? "—"} × ${selectedVersion?.heightPixels ?? "—"}`;
  const transparencyWarning = outputFormat === "JPEG" && selectedVersion?.hasAlphaChannel;
  const scenarioTask = scenario === "failure" || scenario === "retry" ? view.tasks.find((item) => item.status === "FAILED") : latestTask;

  return <section id="image-utility" className="image-utility" data-visual-scenario={scenario} aria-labelledby="image-utility-title">
    <header className="image-utility-header">
      <div><div className="eyebrow">Governed media workspace</div><h2 id="image-utility-title">Image Utility</h2><p>Originals remain permanent. Every saved edit becomes a new immutable, checksummed derivative.</p></div>
      <div className="image-utility-header-actions">
        <span className={`image-processing-status ${(scenario === "processing" ? "processing" : scenarioTask?.status ?? "ready").toLowerCase()}`}><i />{scenario === "processing" ? "PROCESSING" : scenarioTask?.status ?? "READY"}</span>
        <button onClick={() => setShowBatch((current) => !current)}>Batch queue <b>{view.batches.length}</b></button>
        <button className="button-secondary" onClick={resetWorking}>Reset to Original</button>
        <button className="button" disabled={busy || tool === "SELECT" || !dirty} onClick={() => void saveDerivative()}>Save Derivative</button>
      </div>
    </header>

    {scenario === "entry" && <div className="image-entry-evidence"><span>Repository Administration</span><strong>Disha Copper Pyramid</strong><em>APPROVED</em><button>Open in Image Utility</button></div>}
    {error && <div className="image-utility-alert" role="alert"><strong>Processing needs attention</strong><span>{error}</span>{scenarioTask?.status === "FAILED" && <button onClick={() => void retryTask(scenarioTask)}>Retry</button>}</div>}

    <nav className="image-tool-nav" aria-label="Image transformation tools">{TOOLS.map((item) => <button key={item.id} className={tool === item.id ? "is-active" : ""} aria-current={tool === item.id ? "page" : undefined} onClick={() => { setTool(item.id); setDirty(item.id !== "SELECT"); if (item.id === "BACKGROUND_REMOVE") setOutputFormat("PNG"); }}><span>{item.label}</span><small>{item.hint}</small></button>)}</nav>

    <div className="image-utility-layout">
      <aside className="image-source-panel">
        <header><span>Source media</span><strong>{selectedAsset?.title ?? "No image selected"}</strong></header>
        <label>Image version<select value={selectedVersion?.id ?? ""} onChange={(event) => selectVersion(event.target.value)}>{view.assets.flatMap((asset) => asset.versions.map((version) => <option key={version.id} value={version.id}>{asset.title} · v{version.version}</option>))}</select></label>
        <div className="image-source-card"><div className={selectedVersion?.hasAlphaChannel ? "checkerboard" : ""}>{sourceUrl ? <img src={sourceUrl} alt="Selected immutable source preview" /> : <span className="image-empty-preview" role="img" aria-label="No immutable source selected">No image selected</span>}</div><strong>{selectedVersion?.filename}</strong><span>{selectedVersion?.mimeType?.replace("image/", "").toUpperCase()} · {selectedVersion?.widthPixels} × {selectedVersion?.heightPixels}</span><code>{selectedVersion?.id}</code></div>
        <div className="image-quality"><strong>Quality & integrity</strong>{qualityWarnings(selectedVersion).map((warning) => <span key={warning}>{warning}</span>)}</div>
        <div className="image-usage-indicator"><strong>Usage</strong><span>{selectedVersion?.referenceCount ? `${selectedVersion.referenceCount} governed reference${selectedVersion.referenceCount === 1 ? "" : "s"}` : "Unused derivative"}</span><span>{view.repositoryRecords.some((item) => item.preferredAssetVersionId === selectedVersion?.id) ? "Preferred Asset" : "Not preferred"}</span></div>
      </aside>

      <main className={`image-preview-panel${selectedVersion?.hasAlphaChannel || tool === "BACKGROUND_REMOVE" ? " has-transparency" : ""}`}>
        <header><div><span>Authoritative source · v{selectedVersion?.version}</span><strong>{compare === "BEFORE" ? "Before — immutable parent" : compare === "AFTER" ? `After — ${toolLabel(tool)} preview` : "Before / After split"}</strong></div><div className="image-compare-toggle" role="group" aria-label="Before and After comparison">{(["BEFORE", "SPLIT", "AFTER"] as CompareMode[]).map((mode) => <button key={mode} className={compare === mode ? "is-active" : ""} onClick={() => setCompare(mode)}>{mode === "SPLIT" ? "Split" : mode === "BEFORE" ? "Before" : "After"}</button>)}</div></header>
        <div className={`image-preview-stage${compare === "SPLIT" ? " is-split" : ""}`}>
          {(compare === "BEFORE" || compare === "SPLIT") && <div className="image-preview-before">{beforeUrl ? <img src={beforeUrl} alt="Before — immutable source parent"/> : <span className="image-empty-preview" role="img" aria-label="No immutable source parent selected">Select an immutable source</span>}<span>BEFORE · {parentVersion?.id}</span></div>}
          {(compare === "AFTER" || compare === "SPLIT") && <div className="image-preview-after">{sourceUrl ? <img src={sourceUrl} alt={`After — ${toolLabel(tool)} working preview`} style={previewStyle}/> : <span className="image-empty-preview" role="img" aria-label="No immutable source selected">Select an immutable source</span>}<span>AFTER · UNSAVED PREVIEW</span>
            {tool === "CROP" && <div className="image-crop-boundary"><i/><i/><i/><i/><b>{cropWidth} × {cropHeight}</b></div>}
            {tool === "BACKGROUND_REMOVE" && <div className="image-background-preview-note">Transparent edge preview · server confirms pixels on Save</div>}
          </div>}
        </div>
        <footer><span>Preview chrome is never exported.</span><strong>Result: {resultingDimensions} · {tool === "BACKGROUND_REMOVE" ? "PNG" : outputFormat}</strong><span>Committed bytes are produced and validated server-side.</span></footer>
      </main>

      <aside className="image-controls-panel">
        <header><span>Contextual controls</span><h3>{toolLabel(tool)}</h3><p>{TOOLS.find((item) => item.id === tool)?.hint}</p></header>
        {tool === "SELECT" && <div className="image-control-note"><strong>Select a focused operation</strong><p>Working changes remain local until Save Derivative completes server processing.</p></div>}
        {tool === "CROP" && <><div className="image-control-grid"><label>X<input type="number" value={cropX} onChange={(event) => { setCropX(Number(event.target.value)); setDirty(true); }}/></label><label>Y<input type="number" value={cropY} onChange={(event) => { setCropY(Number(event.target.value)); setDirty(true); }}/></label><label>Width<input type="number" value={cropWidth} onChange={(event) => { setCropWidth(Number(event.target.value)); setDirty(true); }}/></label><label>Height<input type="number" value={cropHeight} onChange={(event) => { setCropHeight(Number(event.target.value)); setDirty(true); }}/></label></div><label className="image-toggle"><input type="checkbox" checked={aspectLocked} onChange={(event) => setAspectLocked(event.target.checked)}/><span>Lock crop aspect ratio</span></label><button onClick={() => { setCropX(0); setCropY(0); setCropWidth(selectedVersion?.widthPixels ?? 1); setCropHeight(selectedVersion?.heightPixels ?? 1); }}>Reset crop boundary</button></>}
        {tool === "RESIZE" && <><div className="image-control-grid"><label>Width px<input type="number" value={resizeWidth} onChange={(event) => { const width = Number(event.target.value); setResizeWidth(width); if (aspectLocked && selectedVersion?.widthPixels && selectedVersion.heightPixels) setResizeHeight(Math.max(1, Math.round(width * selectedVersion.heightPixels / selectedVersion.widthPixels))); setDirty(true); }}/></label><label>Height px<input type="number" value={resizeHeight} onChange={(event) => { setResizeHeight(Number(event.target.value)); setDirty(true); }}/></label></div><label className="image-toggle"><input type="checkbox" checked={aspectLocked} onChange={(event) => { setAspectLocked(event.target.checked); setDirty(true); }}/><span>Preserve aspect ratio</span><b>{aspectLocked ? "LOCKED" : "UNLOCKED"}</b></label><p className="image-control-footnote">Pixel resizing does not claim new detail or arbitrary DPI improvement.</p></>}
        {tool === "UPSCALE" && <><fieldset><legend>Bounded scale</legend>{[2, 4].map((factor) => <label key={factor} className="image-choice"><input type="radio" name="upscale" checked={upscaleFactor === factor} onChange={() => { setUpscaleFactor(factor); setDirty(true); }}/><strong>{factor}×</strong><span>{factor === 2 ? "Recommended for editor assets" : "Use only within 16 MP output limit"}</span></label>)}</fieldset><div className="image-control-warning">Deterministic Lanczos resampling only. No AI detail reconstruction is promised.</div></>}
        {tool === "TYPE_CONVERT" && <><fieldset><legend>Output format</legend>{IMAGE_FORMATS.map((format) => <label key={format} className="image-choice"><input type="radio" name="format" checked={outputFormat === format} onChange={() => { setOutputFormat(format); setDirty(true); }}/><strong>{format}</strong><span>{format === "JPEG" ? "Opaque, quality 85" : "Transparency compatible"}</span></label>)}</fieldset>{transparencyWarning && <div className="image-control-warning"><strong>Transparency warning</strong> JPEG cannot retain alpha; transparent pixels will be flattened onto white.</div>}</>}
        {tool === "ROTATE" && <><label>Angle · {rotation}°<input type="range" min="-180" max="180" step="0.5" value={rotation} onChange={(event) => { setRotation(Number(event.target.value)); setDirty(true); }}/></label><input aria-label="Numeric rotation angle" type="number" min="-180" max="180" step="0.5" value={rotation} onChange={(event) => { setRotation(Number(event.target.value)); setDirty(true); }}/><div className="image-quick-actions"><button onClick={() => { setRotation((current) => Math.min(180, current + 90)); setDirty(true); }}>Rotate 90°</button><button onClick={() => { setRotation(0); setDirty(true); }}>Reset Rotation</button></div><p className="image-control-footnote">Straighten is intentionally manual and numeric.</p></>}
        {tool === "BRIGHTNESS" && <><label>Brightness · {brightness}<input type="range" min="-100" max="100" value={brightness} onChange={(event) => { setBrightness(Number(event.target.value)); setDirty(true); }}/></label><button onClick={() => setBrightness(0)}>Neutral · 0</button></>}
        {tool === "CONTRAST" && <><label>Contrast · {contrast}<input type="range" min="-100" max="100" value={contrast} onChange={(event) => { setContrast(Number(event.target.value)); setDirty(true); }}/></label><button onClick={() => setContrast(0)}>Neutral · 0</button></>}
        {tool === "WHITESPACE_TRIM" && <><label>Detection tolerance · {trimTolerance}<input type="range" min="0" max="32" value={trimTolerance} onChange={(event) => { setTrimTolerance(Number(event.target.value)); setDirty(true); }}/></label><div className="image-control-note"><strong>Auto Trim Whitespace</strong><p>Detects transparent or near-white exterior margins only. Bounds are deterministic and never overwrite the source.</p></div></>}
        {tool === "BACKGROUND_REMOVE" && <><label>Edge tolerance · {trimTolerance}<input type="range" min="0" max="64" value={trimTolerance} onChange={(event) => { setTrimTolerance(Number(event.target.value)); setDirty(true); }}/></label><div className="image-control-warning"><strong>Local safe implementation</strong> Uniform edge-connected background removal; review complex subjects before Save. Output retains transparency as PNG.</div></>}
        {tool !== "SELECT" && <div className="image-output-settings"><label>Derivative use<select value={purpose} onChange={(event) => setPurpose(event.target.value as ImageDerivativePurpose)}>{PURPOSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{tool !== "BACKGROUND_REMOVE" && <label>Output<select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as ImageOutputFormat)}>{IMAGE_FORMATS.map((item) => <option key={item}>{item}</option>)}</select></label>}</div>}
        <div className="image-save-card"><span>{dirty ? "UNSAVED WORKING PREVIEW" : "NO UNSAVED CHANGES"}</span><strong>{toolLabel(tool)} · {resultingDimensions}</strong><button className="button" disabled={busy || tool === "SELECT" || !dirty} onClick={() => void saveDerivative()}>{busy ? "Processing…" : "Save Derivative"}</button></div>
      </aside>
    </div>

    <div className="image-utility-lower">
      <section className="image-history-panel"><header><div><span>Immutable lineage</span><h3>Derivative history</h3></div><strong>{relatedHistory.length} versions</strong></header><div className="image-lineage">{relatedHistory.map((version, index) => <button key={version.id} className={`${version.id === selectedVersion?.id ? "is-selected" : ""}${version.derivative?.status === "RETIRED" ? " is-retired" : ""}`} onClick={() => selectVersion(version.id)}><span className={version.hasAlphaChannel ? "checkerboard" : ""}><img src={visualFixture ? visualArt(version.hasAlphaChannel) : `/api/image-utility/assets/${encodeURIComponent(version.id)}`} alt=""/></span><div><strong>v{version.version} · {version.derivative?.transformationType?.replaceAll("_", " ") ?? "ORIGINAL"}</strong><small>{version.mimeType.replace("image/", "").toUpperCase()} · {version.widthPixels} × {version.heightPixels}</small><code>{version.id}</code><em>{version.derivative ? `Parent ${version.derivative.parentVersionId}` : "Immutable provenance root"}</em></div><b>{view.repositoryRecords.some((item) => item.preferredAssetVersionId === version.id) ? "PREFERRED" : version.referenceCount ? `${version.referenceCount} REF` : "UNUSED"}</b>{index < relatedHistory.length - 1 && <i aria-hidden="true">→</i>}</button>)}</div></section>

      <aside className="image-governance-panel"><header><span>Repository integration</span><h3>Future Preferred Asset</h3></header>{selectedRepository?.caseUsed ? <div className="image-case-used"><strong>CASE-USED · exact scope retained</strong><p>Processing creates media derivatives only. It never promotes this remedy into the Main Library; Merge remains a separate governed action.</p></div> : <><label>Repository record<select value={selectedRepositoryId} onChange={(event) => setSelectedRepositoryId(event.target.value)}><option value="">Choose matching record</option>{repositoryChoices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label><div className="image-preferred-summary"><span>Current</span><strong>{selectedRepository?.preferredAssetVersionId ?? "Choose record"}</strong><span>Candidate</span><strong>{selectedVersion?.id}</strong></div><button className="button" disabled={!selectedRepository || !selectedDerivative || selectedDerivative.status !== "AVAILABLE"} onClick={() => void setPreferred()}>Set as Preferred Asset</button><p>Future use only. Existing placement and delivered-report snapshots remain unchanged.</p></>}
        <div className={`image-storage-mini${scenario === "storage" ? " is-review-focus" : ""}`}>{scenario === "storage" && <strong>Storage summary · immutable bytes retained</strong>}<span>Originals <b>{view.storage.originalCount}</b></span><span>Derivatives <b>{view.storage.derivativeCount}</b></span><span>Total <b>{formatBytes(view.storage.originalBytes + view.storage.derivativeBytes)}</b></span><span>Unused <b>{formatBytes(view.storage.unusedBytes)}</b></span><span>Failed <b>{view.storage.taskCounts.FAILED ?? 0}</b></span></div><button onClick={() => setShowCleanup(true)}>Review unused derivatives</button></aside>
    </div>

    {showBatch && <section className="image-batch-panel"><header><div><span>Bounded processing queue</span><h3>Batch processing · max 8</h3></div><button aria-label="Close batch queue" onClick={() => setShowBatch(false)}>×</button></header>
      {scenario === "batch-selection" && <div className="image-batch-scenario"><strong>3 immutable sources selected</strong><span>Ready to queue one bounded operation per source.</span></div>}
      {scenario === "batch-queue" && <div className="image-batch-scenario is-processing"><strong>Batch queued</strong><span>Items remain independently retryable while server processing runs.</span></div>}
      {scenario === "partial-batch" && <div className="image-batch-scenario is-partial"><strong>Partial completion</strong><span>2 succeeded · 1 failed · successful derivatives retained.</span></div>}
      <div className="image-batch-grid"><fieldset><legend>Select immutable sources</legend>{versions.slice(0, 8).map((version) => <label key={version.id}><input type="checkbox" checked={batchSelection.includes(version.id)} onChange={(event) => setBatchSelection((current) => event.target.checked ? [...current, version.id] : current.filter((id) => id !== version.id))}/><span>v{version.version} · {version.filename}</span><small>{version.widthPixels} × {version.heightPixels}</small></label>)}</fieldset><div className="image-batch-operation"><strong>{toolLabel(tool)}</strong><span>{batchSelection.length}/8 selected</span><p>Each input creates its own derivative. A failure never rolls back unrelated successes.</p><button className="button" disabled={!batchSelection.length || tool === "SELECT" || busy} onClick={() => void runBatch()}>Queue batch</button></div><div className="image-queue-list">{view.batches.map((batch) => { const shownBatchStatus = scenario === "batch-queue" ? "PROCESSING" : batch.status; return <article key={batch.id}><span className={`image-processing-status ${shownBatchStatus.toLowerCase()}`}><i/>{shownBatchStatus}</span><strong>{batch.transformationType.replaceAll("_", " ")} · {batch.sourceVersionIds.length} items</strong><small>{batch.id}</small><div>{batch.taskIds.map((taskId) => { const task = view.tasks.find((item) => item.id === taskId); const shownTaskStatus = scenario === "batch-queue" ? "QUEUED" : task?.status ?? "QUEUED"; return <span key={taskId} className={shownTaskStatus.toLowerCase()}>{shownTaskStatus}{scenario !== "batch-queue" && task?.errorReason ? ` · ${task.errorReason}` : ""}</span>; })}</div></article>; })}</div></div></section>}

    {showCleanup && <div className="image-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="image-cleanup-title"><article className="image-cleanup-dialog"><header><div><div className="eyebrow">Immutable media review</div><h3 id="image-cleanup-title">Unused derivative retirement</h3></div><button aria-label="Close cleanup" onClick={() => setShowCleanup(false)}>×</button></header><p>Physical deletion is not used. Only proven-unused derivatives may be retired from future selection after confirmation; originals and immutable bytes remain retained.</p><div>{unused.map((version) => <label key={version.id} className={cleanupId === version.derivative?.id ? "is-selected" : ""}><input type="radio" name="cleanup" checked={cleanupId === version.derivative?.id} onChange={() => setCleanupId(version.derivative!.id)}/><span className="checkerboard"><img src={visualFixture ? visualArt(version.hasAlphaChannel) : `/api/image-utility/assets/${encodeURIComponent(version.id)}`} alt=""/></span><div><strong>{version.filename}</strong><small>{version.derivative?.transformationType.replaceAll("_", " ")} · {formatBytes(version.sizeBytes)}</small><code>{version.id}</code></div><b>0 references</b></label>)}</div><footer><button onClick={() => setShowCleanup(false)}>Cancel</button><button className="button" disabled={!cleanupId || busy} onClick={() => void retireUnused()}>Confirm safe retirement</button></footer></article></div>}

    {pendingVersionId && <div className="image-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="image-unsaved-title"><article className="image-unsaved-dialog"><h3 id="image-unsaved-title">Unsaved Image Utility edits</h3><p>Your working preview has not created a derivative. Stay to continue, or discard only the working preview.</p><div><button onClick={() => setPendingVersionId("")}>Stay</button><button className="button" onClick={() => { setDirty(false); setSelectedVersionId(pendingVersionId); setPendingVersionId(""); setTool("SELECT"); }}>Discard working preview</button></div></article></div>}

    {(scenario === "future-workspace" || scenario === "frozen-report") && <div className="image-immutability-evidence"><span>{scenario === "future-workspace" ? "FUTURE REMEDY WORKSPACE" : "FROZEN REPORT PREVIEW"}</span><strong>{scenario === "future-workspace" ? "New placement resolves the explicitly selected Preferred Asset." : "Delivered report remains bound to its original asset version and PDF hash."}</strong><code>{scenario === "future-workspace" ? "visual-transparent-v3 · future only" : "source-v1 · manifest hash unchanged · PDF hash unchanged"}</code></div>}
    <footer className="image-utility-status" role="status"><span>{busy ? "Processing governed image operation…" : status}</span><button onClick={() => void refresh(selectedVersionId)} disabled={busy || visualFixture}>Refresh authoritative state</button></footer>
  </section>;
}

export function ImageUtilityVisualPreview() { return <ImageUtilityConsole visualFixture/>; }
