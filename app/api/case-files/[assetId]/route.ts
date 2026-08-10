import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getActiveCaseForClient, normalizeCaseService } from "@/lib/service-framework";
import { readCaseFile } from "@/lib/case-file-assets.server";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const access = await requireRouteActor(request, "CONSULTANT"); if (!access.ok) return access.response;
  const url = new URL(request.url); const caseId = url.searchParams.get("caseId")?.trim() ?? ""; const floorLabel = url.searchParams.get("floorLabel")?.trim() || undefined;
  const state = await loadStateFromPersistence(); const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord || getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseId) return NextResponse.json({ ok: false, error: "Active case not found." }, { status: 404 });
  if (floorLabel && !state.floorWorkspaces.some((item) => item.caseId === caseId && item.floorLabel === floorLabel)) return NextResponse.json({ ok: false, error: "Case file not found in this floor." }, { status: 404 });
  const { assetId } = await params;
  const file = await readCaseFile(assetId, { caseId, caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: normalizeCaseService(caseRecord).serviceType, floorLabel });
  if (!file) return NextResponse.json({ ok: false, error: "Case file not found in this case revision." }, { status: 404 });
  const headers = new Headers({ "Content-Type": file.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, "_")}"` });
  return new Response(file.object.body, { headers });
}
