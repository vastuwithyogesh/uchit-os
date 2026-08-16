"use client";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import type { AppState } from "@/lib/store";
import type { ContextualRepositoryRecord, RemedyRepositoryRecord, RepositoryCategory, StageBRemedyType } from "@/lib/domain";
import { buildActionHeaders } from "@/lib/request-helpers";
import { PERMANENT_REPOSITORY_CATEGORIES, REPOSITORY_CSV_HEADERS, REPOSITORY_DIRECTIONS, REPOSITORY_ELEMENTS } from "@/lib/repository-admin";
type Bootstrap = AppState & {
    persistenceRevision?: number | null;
};
type PermanentView = {
    id: string;
    category: Exclude<RepositoryCategory, "CASE_USED_REMEDY">;
    name: string;
    purpose: string;
    status: "DRAFT" | "APPROVED" | "ARCHIVED";
    assetId: string;
    assetVersionId: string;
    tags: string[];
    elements: string[];
    directions: string[];
    recordVersion: number;
    replacementRecordId?: string;
    sourceCaseUsedRemedyId?: string;
};
type Dialog = "CREATE" | "EDIT" | "ARCHIVE" | "USAGE" | "PREFERRED" | "DUPLICATE" | "CASE_MERGE" | "IMPORT" | "PREVIEW" | null;
const LABELS: Record<RepositoryCategory, string> = {
    FURNITURE_ADDON: "Furniture Add-ons", APPLIANCE: "Appliances", COLOUR_FRAME: "Colour Frames", EXTRA: "Extras",
    DISHA_BALANCER: "Disha Balancer", DISHA_ACTIVATION: "Disha Activation", TATTAV_BALANCER: "Tattav Balancer",
    TATTAV_ACTIVATION: "Tattav Activation", EQUALISER: "Equaliser", CASE_USED_REMEDY: "Case-Used Remedies"
};
const CATEGORIES = [...PERMANENT_REPOSITORY_CATEGORIES, "CASE_USED_REMEDY"] as const;
class RepositoryActionError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}
function permanentRows(state: Bootstrap | null): PermanentView[] {
    if (!state)
        return [];
    return [
        ...state.contextualRepositoryRecords.map((record) => ({ id: record.id, category: record.category, name: record.name, purpose: record.attributePurpose, status: record.status,
            assetId: record.preferredAssetId, assetVersionId: record.preferredAssetVersionId, tags: record.tags ?? [], elements: [], directions: [], recordVersion: record.recordVersion ?? 0,
            replacementRecordId: record.replacementRecordId })),
        ...state.remedyRepositoryRecords.map((record) => ({ id: record.id, category: record.remedialType, name: record.name, purpose: record.attributePurpose, status: record.status,
            assetId: record.preferredAssetId, assetVersionId: record.preferredAssetVersionId, tags: record.tags ?? [], elements: record.elements, directions: record.directions,
            recordVersion: record.recordVersion ?? 0, replacementRecordId: record.replacementRecordId, sourceCaseUsedRemedyId: record.sourceCaseUsedRemedyId }))
    ];
}
const csvCell = (value: unknown) => { const raw = String(value ?? ""); const safe = /^[=+@-]/.test(raw) ? `'${raw}` : raw; return `"${safe.replace(/"/g, '""')}"`; };
function download(name: string, contents: string) { const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
function visualState(): Bootstrap {
    const categories = PERMANENT_REPOSITORY_CATEGORIES;
    const contextual = categories.filter((category) => ["FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME", "EXTRA"].includes(category));
    const remedies = categories.filter((category) => !contextual.includes(category));
    const owned = { organisationId: "visual-org", createdByActorUserId: "visual-admin", updatedByActorUserId: "visual-admin", recordVersion: 3 };
    const contextualRecords = contextual.flatMap((category, index) => [0, 1].map((item) => ({ id: `visual-${category}-${item}`, category, name: `${LABELS[category]} ${item ? "Copper" : "Signature"}`,
        attributePurpose: item ? "Alternative approved visual reference" : "Primary approved implementation reference", tags: item ? ["alternative"] : ["preferred", "report-ready"], preferredAssetId: `visual-asset-${category}-${item}`,
        preferredAssetVersionId: `visual-version-${category}-${item}`, status: item ? "DRAFT" : "APPROVED", createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-13T12:00:00.000Z", idempotencyKey: `visual-key-${category}-${item}`, requestHash: `visual-hash-${category}-${item}`, ...owned }))) as ContextualRepositoryRecord[];
    const remedyRecords = remedies.flatMap((category, index) => [0, 1].map((item) => ({ id: `visual-${category}-${item}`, remedialType: category, name: `${LABELS[category]} ${item ? "Copper" : "Signature"}`,
        attributePurpose: item ? "Case-adaptable remedy option" : "Approved primary remedy", elements: index % 2 ? ["Water"] : ["Earth"], directions: index % 2 ? ["NE"] : ["SW"],
        tags: item ? ["alternative"] : ["preferred", "report-ready"], preferredAssetId: `visual-asset-${category}-${item}`, preferredAssetVersionId: `visual-version-${category}-${item}`,
        status: item ? "DRAFT" : "APPROVED", approvalTimestamp: item ? undefined : "2026-08-12T09:00:00.000Z", approvedBy: item ? undefined : "visual-admin", createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-13T12:00:00.000Z", ...owned }))) as RemedyRepositoryRecord[];
    const all = [...contextualRecords, ...remedyRecords];
    return { persistenceRevision: 28, contextualRepositoryRecords: contextualRecords, remedyRepositoryRecords: remedyRecords,
        caseUsedRemedyRecords: [{ id: "visual-case-used", caseId: "case-UV-2026-001", floorId: "ground-floor", remediationId: "visual-remediation", pageId: "visual-db-page", remedialType: "DISHA_BALANCER", name: "Case-only Brass Helix", attributePurpose: "Exact case correction", preferredAssetId: "visual-case-asset", preferredAssetVersionId: "visual-case-version", sourceMediaChecksumSha256: "77e48af19f7a6670", source: "ONE_TIME_USE_THIS_CASE", status: "ACTIVE", createdAt: "2026-08-13T09:30:00.000Z", idempotencyKey: "visual-case-key", requestHash: "visual-case-hash", ...owned }],
        mediaAssetVersions: [...all.map((record) => ({ id: record.preferredAssetVersionId, assetId: record.preferredAssetId, version: 1, filename: `${record.id}.png`, mimeType: "image/png", status: "ACTIVE", checksumSha256: `checksum-${record.id}`, widthPixels: 1200, heightPixels: 1200, ...owned })),
            { id: "visual-case-version", assetId: "visual-case-asset", version: 1, filename: "case-brass-helix.png", mimeType: "image/png", status: "ACTIVE", checksumSha256: "77e48af19f7a6670", widthPixels: 1200, heightPixels: 1200, ...owned }],
        repositoryAuditEvents: [{ id: "audit-1", recordId: "visual-DISHA_BALANCER-0", category: "DISHA_BALANCER", action: "APPROVE", actorId: "visual-admin", actorRole: "ADMIN", reason: "Metadata and immutable media evidence reviewed.", happenedAt: "2026-08-12T09:00:00.000Z", idempotencyKey: "audit-key", requestHash: "audit-hash", ...owned }],
        repositoryImportBatches: [{ id: "visual-import", format: "CSV", filename: "remedy-library.csv", status: "PARTIALLY_APPROVED", totalRows: 4, validRows: 2, invalidRows: 1, duplicateRows: 1, approvedRows: 1, createdAt: "2026-08-13T08:00:00.000Z", createdBy: "visual-admin", idempotencyKey: "visual-import-key", requestHash: "visual-import-hash", ...owned }],
        repositoryImportRows: [
            { id: "row-1", batchId: "visual-import", rowNumber: 2, raw: { category: "EXTRA", name: "Brass Pyramid" }, status: "APPROVED", errors: [], createdRecordId: "visual-EXTRA-0", ...owned },
            { id: "row-2", batchId: "visual-import", rowNumber: 3, raw: { category: "TATTAV_BALANCER", name: "" }, status: "INVALID", errors: ["Name is required."], ...owned },
            { id: "row-3", batchId: "visual-import", rowNumber: 4, raw: { category: "DISHA_BALANCER", name: "Disha Balancer Signature" }, status: "DUPLICATE", errors: [], duplicateRecordId: "visual-DISHA_BALANCER-0", ...owned },
            { id: "row-4", batchId: "visual-import", rowNumber: 5, raw: { category: "APPLIANCE", name: "Copper Harmoniser" }, status: "VALID", errors: [], ...owned }
        ],
        physicalPlacements: [{ id: "visual-placement", remediationId: "visual-remediation", reportId: "visual-report", caseId: "case-UV-2026-001", floorId: "ground-floor", pageId: "visual-db-page", placementType: "REMEDY", remedyId: "visual-DISHA_BALANCER-0", masterNumber: 4, state: "LOCKED", imageAssetVersionId: "visual-version-DISHA_BALANCER-0", imageAssetSnapshotId: "immutable-snapshot", nameSnapshot: "Disha Balancer Signature", attributePurposeSnapshot: "Approved primary remedy", ...owned }],
        sectionAAssets: [], sectionCAssets: [], stageBRemediations: [], reportPlacementPages: [], remedyEligibilityResolutions: [], remediationBaseLayoutVersions: [], revisedLayoutCandidates: [], placementImplementationRows: [], masterAppendixRows: [], stageBIntegrityRuns: [], sectionAWorkspaces: [], sectionAVisualPages: [], existingLayoutAnnotations: [], colourFrameCompositions: [], sectionAIntegrityRuns: [], remediationReportIntegrityRuns: [], sectionCWorkspaces: [], sectionCExtraPages: [], sectionCIntegrityRuns: [],
        clients: [], pipelineTransitions: [], commercialPolicy: {} as any, commercialPolicyHistory: [], clientIntakeProfiles: [], leadQualifications: [], commercialProposals: [], reviewCallBookings: [], payments: [], advanceVerifications: [], vastuCases: [], projects: [], floorWorkspaces: [], siteAnalyses: [], siteAnalysisApprovals: [], postSiteFindings: [], postSiteFindingsApprovals: [], planVersions: [], spatialEvidenceVersions: [], orientationVersions: [], openingMappings: [], entranceZoneVersions: [], spaceMappings: [], dependencyInvalidations: [], regenerationResolutions: [], stageAFloorReviews: [], stageAFloorApprovalCheckpoints: [], remedialWorkflowReservations: [], methodologyVersions: [], methodologyRules: [], methodologyGoldenFixtures: [], aouMethodologyVersions: [], aouReferenceRows: [], reportVersions: [], rectificationRequests: [], assessmentObservations: [], recommendations: [], implementationTasks: [], caseDocuments: [], manualSheetApprovals: [], deliveryMilestones: [], evaluationSnapshots: [], utilityVerdicts: [], mapping32D: [], mapping16D: [], utilityRules: [], shaktiSnapshots: [], timelineEvents: [], optInLeads: [], whatsappTemplates: [], whatsappLogs: [], leadProfileVersions: [], mediaAssets: [], secureAccessGrants: [], communicationPreparations: [], qualificationFormDefinitions: [], qualificationInvitations: [], qualificationResponseVersions: [], prospectiveProjects: [], founderReviewBookings: [], zoomMeetingBindings: [], founderReminderTasks: [], founderCommercialPolicies: [], founderCommercialLegalPolicies: [], founderProposalTemplates: [], founderProposalVersions: [], founderProposalApprovals: [], founderProposalArtifacts: [], founderProposalGrants: [], founderProposalResponses: [], founderCommercialPaymentConfirmations: [], founderBalanceDeadlines: [], founderCommercialInvoices: [], founderCommercialPolicyEvents: [], founderCommercialAuditEvents: [], founderStatutoryPolicies: [], founderBillingProfileVersions: [], founderStatutorySequenceReservations: [], founderStatutoryDocuments: []
    } as unknown as Bootstrap;
}
export function RepositoryAdminConsole({ visualFixture = false }: {
    visualFixture?: boolean;
}) {
    const { activeUser } = useSession();
    const [state, setState] = useState<Bootstrap | null>(() => visualFixture ? visualState() : null);
    const [category, setCategory] = useState<RepositoryCategory>("DISHA_BALANCER");
    const [status, setStatus] = useState("ALL");
    const [healthFilter, setHealthFilter] = useState("ALL");
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [busy, setBusy] = useState(!visualFixture);
    const [message, setMessage] = useState("Loading governed repository…");
    const [error, setError] = useState("");
    const [duplicatePolicy, setDuplicatePolicy] = useState("USE_EXISTING");
    const [draft, setDraft] = useState({ name: "", purpose: "", assetVersionId: "", tags: "", elements: ["Earth"], directions: ["SW"], reason: "Metadata and immutable media evidence reviewed for the governed repository." });
    const [archiveReplacement, setArchiveReplacement] = useState("");
    const [csvText, setCsvText] = useState("");
    const [importRows, setImportRows] = useState<string[]>([]);
    const rows = useMemo(() => permanentRows(state), [state]);
    const media = state?.mediaAssetVersions.filter((item) => ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status)) ?? [];
    const health = (row: PermanentView) => media.some((item) => item.id === row.assetVersionId && item.assetId === row.assetId) ? "HEALTHY" : "REVIEW";
    const filtered = rows.filter((row) => row.category === category && (status === "ALL" || row.status === status) && (healthFilter === "ALL" || health(row) === healthFilter)
        && `${row.name} ${row.purpose} ${row.tags.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()));
    const selected = rows.find((row) => row.id === selectedId) ?? filtered[0];
    const selectedMedia = media.find((item) => item.id === selected?.assetVersionId);
    const caseUsed = state?.caseUsedRemedyRecords.filter((item) => item.status === "ACTIVE" && `${item.name} ${item.attributePurpose}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
    const approvedCount = rows.filter((item) => item.status === "APPROVED").length, draftCount = rows.filter((item) => item.status === "DRAFT").length, reviewCount = rows.filter((item) => health(item) === "REVIEW").length;
    async function refresh() { if (visualFixture)
        return; setBusy(true); setError(""); try {
        const response = await fetch("/api/bootstrap", { cache: "no-store" });
        if (!response.ok)
            throw new Error("Repository state could not be loaded.");
        setState(await response.json());
        setMessage("Repository state is current.");
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "Repository state could not be loaded.");
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { if (!visualFixture)
        void refresh(); }, [visualFixture]);
    useEffect(() => {
        if (!visualFixture)
            return;
        const scenario = new URLSearchParams(window.location.search).get("repoVisual") ?? "overview";
        const categoryMap: Record<string, RepositoryCategory> = { furniture: "FURNITURE_ADDON", appliances: "APPLIANCE", colours: "COLOUR_FRAME", extras: "EXTRA", "disha-balancer": "DISHA_BALANCER", "disha-activation": "DISHA_ACTIVATION", "tattav-balancer": "TATTAV_BALANCER", "tattav-activation": "TATTAV_ACTIVATION", equaliser: "EQUALISER", "case-used": "CASE_USED_REMEDY" };
        if (categoryMap[scenario])
            setCategory(categoryMap[scenario]);
        if (["create", "controlled", "validation"].includes(scenario)) {
            setDialog("CREATE");
            setCategory("DISHA_BALANCER");
            if (scenario === "validation")
                setError("Name, purpose and an approved immutable media version are required before this Draft can be saved.");
        }
        if (["archive", "replacement"].includes(scenario))
            setDialog("ARCHIVE");
        if (scenario === "usage")
            setDialog("USAGE");
        if (scenario === "preferred")
            setDialog("PREFERRED");
        if (["duplicate", "use-existing", "merge-details", "create-anyway"].includes(scenario)) {
            setDialog("DUPLICATE");
            setDuplicatePolicy(scenario === "merge-details" ? "MERGE_DETAILS" : scenario === "create-anyway" ? "CREATE_ANYWAY" : "USE_EXISTING");
        }
        if (scenario === "case-merge") {
            setCategory("CASE_USED_REMEDY");
            setDialog("CASE_MERGE");
        }
        if (scenario.startsWith("import")) {
            setDialog("IMPORT");
            setCsvText(repositoryTemplate());
            if (scenario === "import-errors")
                setError("Row 3 · Name is required. Row 4 · Duplicate approved record found.");
            if (scenario === "import-partial")
                setImportRows(["row-4"]);
        }
        if (scenario === "approved")
            setStatus("APPROVED");
        if (scenario === "health")
            setHealthFilter("REVIEW");
        if (scenario === "search")
            setSearch("Signature");
        if (scenario === "preview")
            setDialog("PREVIEW");
        if (scenario.startsWith("consume-"))
            setMessage(scenario === "consume-remedy" ? "Frozen Remedy workspace consumed this approved record through the existing resolver." : scenario === "consume-extra" ? "Frozen Extras workspace registered an approved repository asset without changing placement identity." : "Frozen Furniture/Appliance workspace registered an approved repository asset and retained server numbering.");
    }, [visualFixture]);
    async function action(name: string, fields: Record<string, unknown>, expectedRecordVersion: number) { if (!state)
        throw new Error("Refresh repository state first."); const response = await fetch("/api/actions", { method: "POST", headers: buildActionHeaders(activeUser.role), body: JSON.stringify({ action: name, ...fields, idempotencyKey: crypto.randomUUID(), expectedRecordVersion, expectedRevision: state.persistenceRevision }) }); const body = await response.json(); if (!response.ok || body.ok === false)
        throw new RepositoryActionError(typeof body.error === "string" ? body.error : "Repository action failed.", response.status); return body.result; }
    async function run(task: () => Promise<unknown>, success: string) { setBusy(true); setError(""); try {
        await task();
        await refresh();
        setDialog(null);
        setMessage(success);
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "Repository action failed.");
    }
    finally {
        setBusy(false);
    } }
    function resetDraft(row?: PermanentView) { setDraft({ name: row?.name ?? "", purpose: row?.purpose ?? "", assetVersionId: row?.assetVersionId ?? media[0]?.id ?? "", tags: row?.tags.join(" | ") ?? "", elements: row?.elements.length ? row.elements : ["Earth"], directions: row?.directions.length ? row.directions : ["SW"], reason: "Metadata and immutable media evidence reviewed for the governed repository." }); }
    function repositoryTemplate() { return `${REPOSITORY_CSV_HEADERS.join(",")}\nDISHA_BALANCER,Example remedy,Documented purpose,${media[0]?.id ?? "asset-version-id"},,Earth,SW,review`; }
    function exportCsv() { const header = ["category", "name", "attributePurpose", "assetVersionId", "elements", "directions", "tags", "recordId", "status"]; const output = [header.join(","), ...rows.map((row) => [row.category, row.name, row.purpose, row.assetVersionId, row.elements.join("|"), row.directions.join("|"), row.tags.join("|"), row.id, row.status].map(csvCell).join(","))].join("\n"); download("uchit-repository-metadata.csv", output); setMessage("Organisation-scoped repository metadata export prepared."); }
    async function saveRepositoryDraft(policy?: string) {
        const mediaVersion = media.find((item) => item.id === draft.assetVersionId);
        if (!mediaVersion)
            return;
        const duplicate = rows.find((row) => row.category === category && row.name.trim().toLowerCase().replace(/\s+/g, " ") === draft.name.trim().toLowerCase().replace(/\s+/g, " "));
        if (!policy && duplicate) {
            setDuplicatePolicy("USE_EXISTING");
            setDialog("DUPLICATE");
            return;
        }
        await run(() => action("repository-record-create", { category, name: draft.name, attributePurpose: draft.purpose, assetId: mediaVersion.assetId, assetVersionId: mediaVersion.id,
            elements: draft.elements, directions: draft.directions, tags: draft.tags.split("|").map((item) => item.trim()).filter(Boolean), duplicatePolicy: policy ?? "USE_EXISTING", reason: draft.reason }, 0), policy === "USE_EXISTING" ? "Existing governed record retained." : policy === "MERGE_DETAILS" ? "Details merged into the existing Draft." : policy === "CREATE_ANYWAY" ? "Separate provenance-bound Draft created." : "Governed Draft created.");
    }
    async function stageImport() { if (!state)
        return; setBusy(true); setError(""); try {
        const result = await action("repository-import-stage", { filename: "repository-import.csv", csv: csvText }, 0) as {
            rows?: Array<{
                id: string;
                status: string;
            }>;
        };
        setImportRows(result.rows?.filter((item) => item.status === "VALID").map((item) => item.id) ?? []);
        await refresh();
        setDialog("IMPORT");
        setMessage("CSV staged for explicit row review.");
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "CSV staging failed.");
    }
    finally {
        setBusy(false);
    } }
    async function approveImport() { const batch = state?.repositoryImportBatches[0]; if (!batch || !importRows.length)
        return; setBusy(true); setError(""); try {
        await action("repository-import-approve", { batchId: batch.id, rowIds: importRows, duplicatePolicy: "USE_EXISTING", reason: "Selected valid CSV rows reviewed for partial governed Draft creation." }, batch.recordVersion ?? 0);
        await refresh();
        setImportRows([]);
        setDialog("IMPORT");
        setMessage("Selected valid rows created as Drafts; failed rows remain exportable.");
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : "Import approval failed.");
    }
    finally {
        setBusy(false);
    } }
    function exportFailedRows() {
        const batch = state?.repositoryImportBatches[0];
        const failed = state?.repositoryImportRows.filter((row) => row.batchId === batch?.id && ["INVALID", "DUPLICATE", "FAILED"].includes(row.status)) ?? [];
        download("repository-failed-rows.csv", ["rowNumber,status,error,duplicateRecordId", ...failed.map((row) => [row.rowNumber, row.status, row.errors.join(" | "), row.duplicateRecordId ?? ""].map(csvCell).join(","))].join("\n"));
        setMessage("Failed-row CSV exported without silent omissions.");
    }
    async function mergeCaseUsed() { const source = state?.caseUsedRemedyRecords.find((item) => item.id === selectedId) ?? caseUsed[0]; if (!source)
        return; await run(() => action("repository-case-used-merge", { caseUsedRemedyId: source.id, elements: draft.elements, directions: draft.directions, tags: draft.tags.split("|").map((item) => item.trim()).filter(Boolean), duplicatePolicy, reason: "Case-used evidence reviewed for a separate governed Main Library Draft." }, source.recordVersion ?? 0), "Main Library Draft created; original Case-Used record retained."); }
    return <section className="repository-admin" aria-labelledby="repository-admin-title">
    <header className="repository-admin-header">
<div>
<div className="eyebrow">Governed content system</div>
<h2 id="repository-admin-title">Repository Administration</h2>
<p>One controlled library for report assets, five remedy types, contextual Extras, and retained Case-Used evidence.</p>
</div>
<div className="repository-admin-actions">
<button className="button-secondary" onClick={() => { setCsvText(repositoryTemplate()); setDialog("IMPORT"); }}>Import CSV</button>
<button className="button-secondary" onClick={exportCsv}>Export metadata</button>
<button className="button" onClick={() => { resetDraft(); setDialog("CREATE"); }}>+ New Draft</button>
</div>
</header>
    <div className="repository-stats">
<article>
<strong>{rows.length}</strong>
<span>permanent records</span>
</article>
<article>
<strong>{approvedCount}</strong>
<span>approved</span>
</article>
<article>
<strong>{draftCount}</strong>
<span>awaiting review</span>
</article>
<article className={reviewCount ? "needs-review" : ""}>
<strong>{reviewCount}</strong>
<span>health checks</span>
</article>
<article>
<strong>{caseUsed.length}</strong>
<span>case-used retained</span>
</article>
</div>
    <nav className="repository-category-nav" aria-label="Repository categories">{CATEGORIES.map((item) => <button key={item} className={category === item ? "is-active" : ""} aria-current={category === item ? "page" : undefined} onClick={() => { setCategory(item); setSelectedId(""); }}>{LABELS[item]}<span>{item === "CASE_USED_REMEDY" ? state?.caseUsedRemedyRecords.length ?? 0 : rows.filter((row) => row.category === item).length}</span>
</button>)}</nav>
    <div className="repository-filterbar">
<label>
<span>Search</span>
<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${LABELS[category]}`}/>
</label>
<label>
<span>Status</span>
<select value={status} onChange={(event) => setStatus(event.target.value)}>
<option value="ALL">All</option>
<option>DRAFT</option>
<option>APPROVED</option>
<option>ARCHIVED</option>
</select>
</label>
<label>
<span>Health</span>
<select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value)}>
<option value="ALL">All</option>
<option value="HEALTHY">Healthy</option>
<option value="REVIEW">Review</option>
</select>
</label>
<button className="button-secondary" onClick={() => { setSearch(""); setStatus("ALL"); setHealthFilter("ALL"); }}>Clear</button>
</div>
    {error && <div className="repository-alert" role="alert">
<strong>Review required</strong>
<span>{error}</span>
</div>}
    <div className="repository-admin-body">
      <main className="repository-list-panel">{category === "CASE_USED_REMEDY" ? <>{caseUsed.map((record) => <article key={record.id} className="repository-row">
<div className="repository-thumb">CU</div>
<div>
<strong>{record.name}</strong>
<span>{record.attributePurpose}</span>
<small>{record.remedialType} · Case {record.caseId} · Floor {record.floorId}</small>
</div>
<span className="repository-status case-used">CASE-USED</span>
<a className="button-secondary repository-image-utility-link" href={`/admin?imageAssetVersionId=${encodeURIComponent(record.preferredAssetVersionId)}#image-utility`}>Edit Image</a>
<button className="button-secondary" onClick={() => { setSelectedId(record.id); setDialog("CASE_MERGE"); }}>Merge into Main Library</button>
</article>)}{!caseUsed.length && <div className="repository-empty">No Case-Used remedies match this filter.</div>}</> : <>{filtered.map((row) => <article key={row.id} className={`repository-row${selected?.id === row.id ? " is-selected" : ""}`} onClick={() => setSelectedId(row.id)}>
<input aria-label={`Select ${row.name}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} onClick={(event) => event.stopPropagation()}/>
<div className="repository-thumb">{LABELS[row.category].split(" ").map((word) => word[0]).join("").slice(0, 2)}</div>
<div>
<strong>{row.name}</strong>
<span>{row.purpose}</span>
<small>{row.elements.join(" · ") || "Contextual"}{row.directions.length ? ` · ${row.directions.join(", ")}` : ""}</small>
</div>
<span className={`repository-health ${health(row).toLowerCase()}`}>{health(row)}</span>
<span className={`repository-status ${row.status.toLowerCase()}`}>{row.status}</span>
</article>)}{!filtered.length && <div className="repository-empty">No repository records match this category and filter.</div>}</>}
        {selectedIds.length > 0 && <div className="repository-bulkbar">
<strong>{selectedIds.length} selected</strong>
<span>Maximum 25 · explicit audited transitions only</span>
<button onClick={() => void run(() => action("repository-records-bulk-transition", { records: rows.filter((row) => selectedIds.includes(row.id)).map((row) => ({ recordId: row.id, expectedRecordVersion: row.recordVersion })), target: "APPROVED", reason: "Selected Drafts completed controlled bulk approval review." }, 0), "Selected Drafts approved.")}>Approve Drafts</button>
<button onClick={() => void run(() => action("repository-records-bulk-transition", { records: rows.filter((row) => selectedIds.includes(row.id)).map((row) => ({ recordId: row.id, expectedRecordVersion: row.recordVersion })), target: "ARCHIVED", reason: "Selected records completed controlled bulk retirement review." }, 0), "Selected records archived.")}>Archive</button>
</div>}
      </main>
      <aside className="repository-detail-panel">{selected && category !== "CASE_USED_REMEDY" ? <>
<div className="repository-detail-media">
<span>{LABELS[selected.category]}</span>
<strong>{selected.name}</strong>
<small>Immutable asset version · {selected.assetVersionId}</small>
</div>
<div className="repository-detail-title">
<div>
<span className={`repository-status ${selected.status.toLowerCase()}`}>{selected.status}</span>
<h3>{selected.name}</h3>
</div>
<button aria-label="Preview immutable asset metadata" onClick={() => setDialog("PREVIEW")}>Preview</button>
</div>
<p>{selected.purpose}</p>
<dl>
<div>
<dt>Category</dt>
<dd>{LABELS[selected.category]}</dd>
</div>
<div>
<dt>Applicability</dt>
<dd>{[...selected.elements, ...selected.directions].join(" · ") || "Contextual page"}</dd>
</div>
<div>
<dt>Tags</dt>
<dd>{selected.tags.join(" · ") || "None"}</dd>
</div>
<div>
<dt>Asset</dt>
<dd>{selectedMedia?.filename ?? selected.assetVersionId}</dd>
</div>
<div>
<dt>Health</dt>
<dd>{health(selected)}</dd>
</div>
</dl>
<div className="repository-detail-actions">
<button disabled={selected.status !== "DRAFT"} onClick={() => { resetDraft(selected); setDialog("EDIT"); }}>Edit Draft</button>
<button className="button" disabled={selected.status !== "DRAFT"} onClick={() => void run(() => action("repository-record-approve", { recordId: selected.id, reason: "Metadata, applicability and immutable asset evidence reviewed for approval." }, selected.recordVersion), "Repository record approved for future use.")}>Approve</button>
<button disabled={selected.status === "ARCHIVED"} onClick={() => setDialog("ARCHIVE")}>Archive</button>
<button disabled={selected.status !== "ARCHIVED"} onClick={() => void run(() => action("repository-record-reactivate", { recordId: selected.id, reason: "Archived record reactivated into Draft for a fresh governance review." }, selected.recordVersion), "Archived record restored as Draft.")}>Reactivate</button>
<button onClick={() => setDialog("PREFERRED")}>Preferred Asset</button>
<a className="repository-image-utility-link" href={`/admin?imageAssetVersionId=${encodeURIComponent(selected.assetVersionId)}&repositoryRecordId=${encodeURIComponent(selected.id)}#image-utility`}>Open in Image Utility</a>
<button onClick={() => setDialog("USAGE")}>Usage & history</button>
</div>
</> : <div className="repository-empty">Select a governed record to review its lifecycle, immutable asset, usage and audit history.</div>}</aside>
    </div>
<div className="repository-statusline" role="status">
<span>{busy ? "Saving governed change…" : message}</span>
<button onClick={() => void refresh()} disabled={busy}>Refresh</button>
</div>

    {dialog && <div className="repository-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="repository-dialog-title">
<article className="repository-dialog">
<header>
<div>
<div className="eyebrow">Repository Administration</div>
<h2 id="repository-dialog-title">{dialog === "CREATE" ? "Create Repository Draft" : dialog === "EDIT" ? "Edit Draft metadata" : dialog === "ARCHIVE" ? "Archive governed record" : dialog === "USAGE" ? "Usage history" : dialog === "PREFERRED" ? "Select Preferred Asset" : dialog === "DUPLICATE" ? "Duplicate review" : dialog === "CASE_MERGE" ? "Merge into Main Library Draft" : dialog === "IMPORT" ? "Stage UTF-8 CSV import" : "Immutable asset preview"}</h2>
</div>
<button aria-label="Close Repository dialog" onClick={() => { setDialog(null); setError(""); }}>×</button>
</header>
      {(dialog === "CREATE" || dialog === "EDIT") && <div className="repository-form">
        <label>Category<select disabled={dialog === "EDIT"} value={category === "CASE_USED_REMEDY" ? "DISHA_BALANCER" : category} onChange={(event) => setCategory(event.target.value as RepositoryCategory)}>{PERMANENT_REPOSITORY_CATEGORIES.map((item) => <option key={item} value={item}>{LABELS[item]}</option>)}</select>
</label>
        <label>Name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}/>
</label>
        <label className="wide">Purpose / attribute<textarea rows={3} value={draft.purpose} onChange={(event) => setDraft((current) => ({ ...current, purpose: event.target.value }))}/>
</label>
        <label>Approved media version<select value={draft.assetVersionId} onChange={(event) => setDraft((current) => ({ ...current, assetVersionId: event.target.value }))}>
<option value="">Choose immutable media</option>{media.map((item) => <option key={item.id} value={item.id}>{item.filename} · v{item.version}</option>)}</select>
</label>
        <label>Tags<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="premium | report-ready"/>
</label>
        {!["FURNITURE_ADDON", "APPLIANCE", "COLOUR_FRAME", "EXTRA", "CASE_USED_REMEDY"].includes(category) && <>
<fieldset>
<legend>Elements</legend>{REPOSITORY_ELEMENTS.map((item) => <label key={item}>
<input type="checkbox" checked={draft.elements.includes(item)} onChange={(event) => setDraft((current) => ({ ...current, elements: event.target.checked ? [...current.elements, item] : current.elements.filter((value) => value !== item) }))}/>{item}</label>)}</fieldset>
<fieldset>
<legend>Directions</legend>{REPOSITORY_DIRECTIONS.map((item) => <label key={item}>
<input type="checkbox" checked={draft.directions.includes(item)} onChange={(event) => setDraft((current) => ({ ...current, directions: event.target.checked ? [...current.directions, item] : current.directions.filter((value) => value !== item) }))}/>{item}</label>)}</fieldset>
</>}
        <label className="wide">Audit reason<textarea value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}/>
</label>
        <div className="repository-dialog-actions wide">
<button onClick={() => setDialog(null)}>Cancel</button>
<button className="button" disabled={!draft.name.trim() || !draft.purpose.trim() || !draft.assetVersionId} onClick={() => { if (dialog === "CREATE") void saveRepositoryDraft(); else void run(() => action("repository-record-update", { recordId: selected!.id, name: draft.name, attributePurpose: draft.purpose, elements: draft.elements, directions: draft.directions, tags: draft.tags.split("|").map((item) => item.trim()).filter(Boolean), reason: draft.reason }, selected!.recordVersion), "Draft metadata updated."); }}>Save Draft</button>
</div>
      </div>}
      {dialog === "ARCHIVE" && selected && <div className="repository-dialog-content">
<p>Archiving removes this record from future workspace choices while preserving every historical placement and report snapshot.</p>
<label>Replacement (optional)<select value={archiveReplacement} onChange={(event) => setArchiveReplacement(event.target.value)}>
<option value="">No replacement</option>{rows.filter((row) => row.id !== selected.id && row.category === selected.category && row.status === "APPROVED").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
</label>
<label>Retirement reason<textarea value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}/>
</label>
<div className="repository-dialog-actions">
<button onClick={() => setDialog(null)}>Cancel</button>
<button className="button" onClick={() => void run(() => action("repository-record-archive", { recordId: selected.id, replacementRecordId: archiveReplacement || undefined, reason: draft.reason }, selected.recordVersion), "Record archived; historical usage remains immutable.")}>Archive safely</button>
</div>
</div>}
      {dialog === "USAGE" && selected && <div className="repository-dialog-content">
<div className="repository-usage-summary">
<article>
<strong>{state?.physicalPlacements.filter((item) => item.remedyId === selected.id && item.state !== "DELETED").length ?? 0}</strong>
<span>physical placements</span>
</article>
<article>
<strong>{new Set(state?.physicalPlacements.filter((item) => item.remedyId === selected.id).map((item) => item.caseId)).size}</strong>
<span>cases</span>
</article>
<article>
<strong>{state?.repositoryAuditEvents.filter((item) => item.recordId === selected.id).length ?? 0}</strong>
<span>audit events</span>
</article>
</div>
<h3>Immutable placement snapshots</h3>{state?.physicalPlacements.filter((item) => item.remedyId === selected.id).map((placement) => <div className="repository-history-row" key={placement.id}>
<strong>Master No. {placement.masterNumber}</strong>
<span>{placement.nameSnapshot}</span>
<small>Case {placement.caseId} · Snapshot {placement.imageAssetSnapshotId}</small>
</div>)}<h3>Governance timeline</h3>{state?.repositoryAuditEvents.filter((item) => item.recordId === selected.id).map((event) => <div className="repository-history-row" key={event.id}>
<strong>{event.action}</strong>
<span>{event.reason}</span>
<small>{new Date(event.happenedAt).toLocaleString()}</small>
</div>)}</div>}
      {dialog === "PREFERRED" && selected && <div className="repository-dialog-content">
<p>Preferred asset changes apply to future use only. Existing placements and delivered reports retain their immutable asset snapshots.</p>
<div className="repository-asset-grid">{media.map((item) => <button key={item.id} className={draft.assetVersionId === item.id ? "is-selected" : ""} onClick={() => setDraft((current) => ({ ...current, assetVersionId: item.id }))}>
<span>IMAGE</span>
<strong>{item.filename}</strong>
<small>v{item.version} · {item.checksumSha256?.slice(0, 12)}</small>
</button>)}</div>
<label>Audit reason<textarea value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}/>
</label>
<button className="button" disabled={!draft.assetVersionId} onClick={() => { const version = media.find((item) => item.id === draft.assetVersionId)!; void run(() => action("repository-preferred-asset-set", { recordId: selected.id, assetId: version.assetId, assetVersionId: version.id, reason: draft.reason }, selected.recordVersion), "Preferred asset updated for future use only."); }}>Set future preferred asset</button>
</div>}
      {dialog === "DUPLICATE" && <div className="repository-dialog-content">
<div className="repository-duplicate-warning">
<strong>Potential duplicate found</strong>
<span>{draft.name || "Disha Balancer Signature"} · same category and normalized name</span>
</div>
<div className="repository-duplicate-choices">{[["USE_EXISTING", "Use Existing", "Keep one governed record and discard the new Draft request."], ["MERGE_DETAILS", "Merge Details", "Update an existing Draft only; approved records remain immutable."], ["CREATE_ANYWAY", "Create Anyway", "Create a separate Draft with duplicate provenance for audit."]].map(([value, label, description]) => <button key={value} className={duplicatePolicy === value ? "is-selected" : ""} onClick={() => setDuplicatePolicy(value)}>
<strong>{label}</strong>
<span>{description}</span>
</button>)}</div>
<button className="button" onClick={() => void saveRepositoryDraft(duplicatePolicy)}>Confirm {duplicatePolicy.replaceAll("_", " ").toLowerCase()}</button>
</div>}
      {dialog === "CASE_MERGE" && <div className="repository-dialog-content">
<div className="repository-case-source">
<span>Original Case-Used record remains retained</span>
<strong>{caseUsed.find((item) => item.id === selectedId)?.name ?? caseUsed[0]?.name}</strong>
<small>Exact case + floor + remedy-page provenance</small>
</div>
<p>A separate permanent Remedy record will be created as Draft. It will not become eligible until explicit approval.</p>
<fieldset>
<legend>Mandatory applicability</legend>{REPOSITORY_ELEMENTS.map((item) => <label key={item}>
<input type="checkbox" checked={draft.elements.includes(item)} onChange={(event) => setDraft((current) => ({ ...current, elements: event.target.checked ? [...current.elements, item] : current.elements.filter((value) => value !== item) }))}/>{item}</label>)}</fieldset>
<fieldset>
<legend>Directions</legend>{REPOSITORY_DIRECTIONS.map((item) => <label key={item}>
<input type="checkbox" checked={draft.directions.includes(item)} onChange={(event) => setDraft((current) => ({ ...current, directions: event.target.checked ? [...current.directions, item] : current.directions.filter((value) => value !== item) }))}/>{item}</label>)}</fieldset>
<label>Duplicate decision<select value={duplicatePolicy} onChange={(event) => setDuplicatePolicy(event.target.value)}>
<option value="USE_EXISTING">Use Existing / stop for review</option>
<option value="CREATE_ANYWAY">Create separate provenance Draft</option>
</select>
</label>
<button className="button" disabled={!draft.elements.length && !draft.directions.length} onClick={() => void mergeCaseUsed()}>Create Main Library Draft</button>
</div>}
      {dialog === "IMPORT" && <div className="repository-dialog-content">
<div className="repository-import-actions">
<button onClick={() => { download("uchit-repository-import-template.csv", `${REPOSITORY_CSV_HEADERS.join(",")}\n`); setMessage("UTF-8 CSV template downloaded."); }}>Download template</button>
<button onClick={() => setCsvText(repositoryTemplate())}>Load example</button>
</div>
<p>Bounded UTF-8 CSV · maximum 1 MB / 500 rows · approved assetVersionId first, unique filename fallback. XLSX and packaged image upload remain deferred.</p>
<label>CSV staging content<textarea rows={7} value={csvText} onChange={(event) => setCsvText(event.target.value)}/>
</label>
<button className="button" disabled={!csvText.trim()} onClick={() => void stageImport()}>Validate and stage</button>{state?.repositoryImportBatches[0] && <>
<div className="repository-import-summary">
<span>{state.repositoryImportBatches[0].totalRows} rows</span>
<span>{state.repositoryImportBatches[0].validRows} valid</span>
<span>{state.repositoryImportBatches[0].invalidRows} invalid</span>
<span>{state.repositoryImportBatches[0].duplicateRows} duplicate</span>
<span>{state.repositoryImportBatches[0].approvedRows} Draft created</span>
</div>
<div className="repository-import-table">{state.repositoryImportRows.map((row) => <label key={row.id} className={row.status.toLowerCase()}>
<input type="checkbox" checked={importRows.includes(row.id)} onChange={(event) => setImportRows((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} disabled={row.status === "INVALID" || row.status === "APPROVED"}/>
<strong>Row {row.rowNumber}</strong>
<span>{row.raw.name || "Missing name"}</span>
<em>{row.status}</em>
<small>{row.errors.join(" · ") || (row.duplicateRecordId ? `Duplicate ${row.duplicateRecordId}` : "Ready")}</small>
</label>)}</div>
<div className="repository-dialog-actions">
<button onClick={exportFailedRows}>Export failed rows</button>
<button className="button" disabled={!importRows.length} onClick={() => void approveImport()}>Create Drafts from selected valid rows</button>
</div>
</>}</div>}
      {dialog === "PREVIEW" && selected && <div className="repository-dialog-content">
<div className="repository-preview">
<div>IMMUTABLE ASSET</div>
<strong>{selectedMedia?.filename ?? selected.assetVersionId}</strong>
<span>{selectedMedia?.mimeType ?? "approved media"} · {selectedMedia?.widthPixels ?? "—"} × {selectedMedia?.heightPixels ?? "—"}</span>
<code>{selectedMedia?.checksumSha256 ?? selected.assetVersionId}</code>
</div>
<p>Preview is bound to immutable media metadata. Raw private bytes remain behind the existing Media Library and case-file access controls.</p>
</div>}
    </article>
</div>}
  </section>;
}
export function RepositoryAdminVisualPreview() { return <RepositoryAdminConsole visualFixture/>; }
