import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { readPaymentProofFile } from "@/lib/payment-proof-assets.server";

export async function GET(request: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) return access.response;

  const { fileName: opaqueId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key !== "advance-proof" && key !== "balance-proof") {
    return NextResponse.json({ ok: false, error: "Payment proof scope is required." }, { status: 400 });
  }
  const proof = await readPaymentProofFile(opaqueId, {
    key,
    clientId: url.searchParams.get("clientId") ?? undefined,
    proposalId: url.searchParams.get("proposalId") ?? undefined,
    caseId: url.searchParams.get("caseId") ?? undefined
  });
  if (!proof) return NextResponse.json({ ok: false, error: "Payment proof file not found." }, { status: 404 });

  const headers = new Headers({
    "Content-Type": proof.mimeType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${proof.fileName.replace(/[\"\\\r\n]/g, "_")}"`
  });
  return new Response(proof.object.body, { headers });
}
