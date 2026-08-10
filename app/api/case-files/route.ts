import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getActiveCaseForClient, normalizeCaseService } from "@/lib/service-framework";
import { listCaseFiles, saveCaseFileUpload } from "@/lib/case-file-assets.server";

async function selectedScope(caseId: string, floorLabel?: string) {
  const state = await loadStateFromPersistence();
  const caseRecord = state.vastuCases.find((item) => item.id === caseId);
  if (!caseRecord || getActiveCaseForClient(state, caseRecord.clientId)?.id !== caseId) throw new Error("Select the active case revision.");
  if (floorLabel && !state.floorWorkspaces.some((item) => item.caseId === caseId && item.floorLabel === floorLabel)) throw new Error("Floor does not belong to the selected case revision.");
  return { caseId, caseRevisionNumber: caseRecord.revisionNumber ?? 1, serviceType: normalizeCaseService(caseRecord).serviceType, floorLabel };
}

export async function GET(request: Request) {
  try {
    const access = await requireRouteActor(request, "CONSULTANT"); if (!access.ok) return access.response;
    const url = new URL(request.url); const caseId = url.searchParams.get("caseId")?.trim() ?? ""; const floorLabel = url.searchParams.get("floorLabel")?.trim() || undefined;
    if (!caseId) return NextResponse.json({ ok: false, error: "caseId is required." }, { status: 400 });
    return NextResponse.json({ ok: true, assets: await listCaseFiles(await selectedScope(caseId, floorLabel)) }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to list case files." }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const access = await requireRouteActor(request, "CONSULTANT"); if (!access.ok) return access.response;
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "A case file is required." }, { status: 400 });
    const caseId = String(form.get("caseId") ?? "").trim(); const floorLabel = String(form.get("floorLabel") ?? "").trim() || undefined;
    const asset = await saveCaseFileUpload(file, await selectedScope(caseId, floorLabel), access.actor);
    return NextResponse.json({ ok: true, asset }, { status: 201, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload case file.";
    return NextResponse.json({ ok: false, error: message }, { status: /allowed|between|unsupported|match|required|active|belong/i.test(message) ? 400 : 503 });
  }
}
