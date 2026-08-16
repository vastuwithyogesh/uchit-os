import { NextResponse } from "next/server";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { deterministicContentHash } from "@/lib/evaluation-provenance";
import {
  appendImmutableAuditEvent,
  findImmutableAuditEventByEntity,
  findImmutableAuditEventByIdempotency,
  FoundationAccessError,
  resolveActiveOrganisationContext
} from "@/lib/foundation.server";
import {
  buildLeadImportPreview,
  LEAD_IMPORT_MAX_BYTES,
  LEAD_IMPORT_MINIMAL_TEMPLATE,
  LEAD_IMPORT_TEMPLATE,
  publicLeadImportPreview
} from "@/lib/lead-import";
import { stampOrganisationOwnership } from "@/lib/organisation-scope";
import { loadStateSnapshotFromPersistence, PersistenceConflictError, persistStateToDatabase } from "@/lib/persistence";
import { projectOrganisationState } from "@/lib/foundation";
import { getAppState, setAppState } from "@/lib/store";
import { importInboundLeads } from "@/lib/workflow-service";

const ALLOWED_FORM_FIELDS = new Set([
  "file", "mode", "expectedBatchHash", "expectedRevision", "expectedOrganisationVersion", "idempotencyKey"
]);
const ALLOWED_MIME_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"]);

function privateHeaders() {
  return { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
}

function errorResponse(error: unknown) {
  const status = error instanceof FoundationAccessError ? error.statusCode
    : error instanceof PersistenceConflictError ? 409
      : error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 400;
  const safeStatus = [400, 401, 403, 404, 409, 413, 428, 503].includes(status) ? status : 400;
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The lead import could not be completed." },
    { status: safeStatus, headers: privateHeaders() });
}

function precondition(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 428;
  return error;
}

function boundedFile(file: FormDataEntryValue | null) {
  if (!(file instanceof File)) throw new Error("Select one CSV file.");
  const mime = file.type.trim().toLowerCase();
  if (!file.name.toLowerCase().endsWith(".csv") || (mime && !ALLOWED_MIME_TYPES.has(mime))) {
    throw new Error("Only a CSV file from the Uchit template is accepted. XLSX is deferred.");
  }
  if (file.size === 0) throw new Error("The CSV file is empty.");
  if (file.size > LEAD_IMPORT_MAX_BYTES) {
    const error = new Error("The CSV file exceeds the 2 MB limit.") as Error & { statusCode: number };
    error.statusCode = 413;
    throw error;
  }
  return file;
}

function expectedRevision(formData: FormData) {
  if (!formData.has("expectedRevision")) throw precondition("The latest CRM state revision is required. Reload and preview the file again.");
  const raw = String(formData.get("expectedRevision"));
  if (raw === "null") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw precondition("The latest CRM state revision is required. Reload and preview the file again.");
  return value;
}

export async function GET(request: Request) {
  const template = new URL(request.url).searchParams.get("template");
  const wantsTemplate = template === "1" || template === "minimal";
  const access = await requireRouteActor(request, wantsTemplate ? "SUPER_ADMIN" : "SETTER");
  if (!access.ok) return access.response;
  try {
    if (wantsTemplate) {
      const minimal = template === "minimal";
      return new Response(minimal ? LEAD_IMPORT_MINIMAL_TEMPLATE : LEAD_IMPORT_TEMPLATE, { status: 200, headers: { ...privateHeaders(), "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${minimal ? "uchit-minimal-lead-import-template.csv" : "vastu-with-yogesh-apply-leads-template.csv"}` } });
    }
    const localDemo = isExplicitLocalDemo(request.headers);
    const context = await resolveActiveOrganisationContext(access.actor, isInitialOrganisationOwnerEmail(access.actor.email) || localDemo);
    const snapshot = await loadStateSnapshotFromPersistence();
    const leads = context ? snapshot.state.optInLeads.filter((lead) => lead.organisationId === context.organisation.id) : snapshot.state.optInLeads;
    const projectedLeads = access.actor.role === "SUPER_ADMIN" ? leads : leads.map((lead) => {
      const { dob: _dob, landingPage: _landingPage, referrer: _referrer, assignedTo: _assignedTo, deletedAt: _deletedAt,
        sourceRecordId: _sourceRecordId, externalClientCode: _externalClientCode, sourceProfile: _sourceProfile, ...safe } = lead;
      return safe;
    });
    return NextResponse.json({ leads: projectedLeads, counts: { total: leads.length,
      qualified: leads.filter((lead) => lead.status === "QUALIFIED").length,
      new: leads.filter((lead) => lead.submissionCount === 1).length,
      filtered: leads.filter((lead) => lead.status === "FILTERED").length } }, { headers: privateHeaders() });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > LEAD_IMPORT_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ ok: false, error: "The CSV upload exceeds the bounded request size." }, { status: 413, headers: privateHeaders() });
  }
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) return access.response;
  let rollback = structuredClone(getAppState());
  try {
    const localDemo = isExplicitLocalDemo(request.headers);
    const context = await resolveActiveOrganisationContext(access.actor, isInitialOrganisationOwnerEmail(access.actor.email) || localDemo);
    if (context && (context.membership.role !== "SUPER_ADMIN" || context.membership.capability !== "organisation_owner"
      || context.organisation.founderUserId !== access.actor.id)) {
      return NextResponse.json({ ok: false, error: "Only the active organisation owner can import leads in Founder Edition." }, { status: 403, headers: privateHeaders() });
    }
    const formData = await request.formData();
    if (Array.from(formData.keys()).some((key) => !ALLOWED_FORM_FIELDS.has(key))) throw new Error("The upload contains unsupported fields.");
    const mode = String(formData.get("mode") ?? "");
    if (mode !== "preview" && mode !== "confirm") throw new Error("Choose preview or confirm for this CSV upload.");
    const file = boundedFile(formData.get("file"));
    const csvText = await file.text();
    const snapshot = await loadStateSnapshotFromPersistence();
    rollback = structuredClone(snapshot.state);
    const organisationId = context?.organisation.id ?? access.actor.organisationId ?? "local-demo-organisation";
    const scoped = context ? projectOrganisationState(snapshot.state, organisationId) : snapshot.state;
    const preview = buildLeadImportPreview(csvText, { clients: scoped.clients, leads: scoped.optInLeads, organisationId });
    const safePreview = publicLeadImportPreview(preview);
    if (mode === "preview") {
      return NextResponse.json({ ok: preview.batchErrors.length === 0, preview: safePreview,
        expectedRevision: snapshot.revision, expectedOrganisationVersion: context?.organisation.recordVersion ?? 0,
        limits: { maxBytes: LEAD_IMPORT_MAX_BYTES, maxRows: 1000, fileTypes: ["CSV"], xlsx: "DEFERRED" } },
        { status: preview.batchErrors.length ? 400 : 200, headers: privateHeaders() });
    }

    const expectedBatchHash = String(formData.get("expectedBatchHash") ?? "");
    if (!expectedBatchHash) throw precondition("Preview this exact CSV file before confirming the import.");
    if (expectedBatchHash !== preview.batchHash) throw new FoundationAccessError(409, "The selected file changed after preview. Preview it again.");
    const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
    if (!/^[A-Za-z0-9:_-]{8,160}$/.test(idempotencyKey)) throw precondition("A bounded idempotency key is required.");
    const auditKey = `lead-import:${idempotencyKey}`;
    const replay = context ? await findImmutableAuditEventByIdempotency(organisationId, auditKey) : null;
    if (replay && replay.entityId !== preview.batchHash) {
      throw new FoundationAccessError(409, "This idempotency key was already used for a different CSV file.");
    }
    if (replay) {
      return NextResponse.json({ ok: true, replayed: true, batchHash: preview.batchHash,
        result: { createdClients: 0, linkedExistingClients: 0, reviewRequired: preview.counts.reviewRequired, rejected: 0 } },
        { headers: privateHeaders() });
    }
    const batchReplay = context ? await findImmutableAuditEventByEntity(organisationId, "LEAD_CSV_IMPORT_CONFIRMED", "LEAD_IMPORT_BATCH", preview.batchHash) : null;
    if (batchReplay) {
      return NextResponse.json({ ok: true, replayed: true, batchHash: preview.batchHash,
        result: { createdClients: 0, linkedExistingClients: 0, reviewRequired: preview.counts.reviewRequired, rejected: 0, unchanged: preview.counts.accepted } },
        { headers: privateHeaders() });
    }
    const requestedRevision = expectedRevision(formData);
    if (requestedRevision !== snapshot.revision) throw new FoundationAccessError(409, "The CRM changed after preview. Reload and preview the file again.");
    if (!formData.has("expectedOrganisationVersion")) throw precondition("The latest organisation version is required.");
    const expectedOrganisationVersion = Number(formData.get("expectedOrganisationVersion"));
    if (!Number.isInteger(expectedOrganisationVersion) || expectedOrganisationVersion < 0) throw precondition("The latest organisation version is required.");
    if (context && expectedOrganisationVersion !== context.organisation.recordVersion) throw new FoundationAccessError(409, "The organisation changed after preview. Reload and retry.");
    if (!preview.canImport) throw new Error("The whole CSV batch must pass validation before import. Review invalid rows first.");

    const beforeHash = deterministicContentHash(projectOrganisationState(snapshot.state, organisationId));
    setAppState(structuredClone(snapshot.state));
    const actor = { ...access.actor, organisationId };
    const result = importInboundLeads(preview, actor, organisationId);
    stampOrganisationOwnership(getAppState(), snapshot.state, organisationId, actor.id);
    const afterHash = deterministicContentHash(projectOrganisationState(getAppState(), organisationId));
    await persistStateToDatabase(undefined, snapshot.revision ?? undefined);
    if (context) {
      await appendImmutableAuditEvent({ organisationId, actor, action: "LEAD_CSV_IMPORT_CONFIRMED", entityType: "LEAD_IMPORT_BATCH",
        entityId: preview.batchHash, reason: "Founder confirmed a validated canonical CSV lead import.",
        requestId: request.headers.get("x-request-id") || crypto.randomUUID(), idempotencyKey: auditKey, beforeHash, afterHash });
    }
    return NextResponse.json({ ok: true, replayed: false, batchHash: preview.batchHash,
      result: { createdClients: result.createdClients.length, linkedExistingClients: result.linkedExisting,
        reviewRequired: result.reviewRequired, rejected: 0, importedLeads: result.created.length + result.updated.length, unchanged: result.unchanged } },
      { status: 201, headers: privateHeaders() });
  } catch (error) {
    setAppState(rollback);
    return errorResponse(error);
  }
}
