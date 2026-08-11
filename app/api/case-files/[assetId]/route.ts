import { NextResponse } from "next/server";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getActiveCaseForClient, normalizeCaseService } from "@/lib/service-framework";
import { readCaseFile } from "@/lib/case-file-assets.server";
import { FoundationAccessError, resolveActiveOrganisationContext } from "@/lib/foundation.server";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const access = await requireRouteActor(request, "CONSULTANT"); if (!access.ok) return access.response;
  let organisationId: string;
  try { organisationId = isExplicitLocalDemo(request.headers) ? "local-demo-organisation" : (await resolveActiveOrganisationContext(access.actor, isInitialOrganisationOwnerEmail(access.actor.email))).organisation.id; }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Organisation access denied." }, { status: error instanceof FoundationAccessError ? error.statusCode : 500 }); }
  const url = new URL(request.url); const caseId = url.searchParams.get("caseId")?.trim() ?? ""; const floorLabel = url.searchParams.get("floorLabel")?.trim() || undefined;
  const state = await loadStateFromPersistence(); const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord || (caseRecord.organisationId && caseRecord.organisationId !== organisationId) || getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseId) return NextResponse.json({ ok: false, error: "Active case not found." }, { status: 404 });
  if (floorLabel && !state.floorWorkspaces.some((item) => item.caseId === caseId && (!item.organisationId || item.organisationId === organisationId) && item.floorLabel === floorLabel)) return NextResponse.json({ ok: false, error: "Case file not found in this floor." }, { status: 404 });
  const { assetId } = await params;
  const file = await readCaseFile(assetId, { organisationId, caseId, caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: normalizeCaseService(caseRecord).serviceType, floorLabel });
  if (!file) return NextResponse.json({ ok: false, error: "Case file not found in this case revision." }, { status: 404 });
  const headers = new Headers({ "Content-Type": file.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, "_")}"` });
  return new Response(file.object.body, { headers });
}
