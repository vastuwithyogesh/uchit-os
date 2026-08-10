import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { readPaymentProofFile } from "@/lib/payment-proof-assets.server";

export async function GET(request: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) return access.response;

  const { fileName: opaqueId } = await params;
  const proof = await readPaymentProofFile(opaqueId);
  if (!proof) return NextResponse.json({ ok: false, error: "Payment proof file not found." }, { status: 404 });

  const headers = new Headers({
    "Content-Type": proof.mimeType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${proof.fileName.replace(/[\"\\\r\n]/g, "_")}"`
  });
  return new Response(proof.object.body, { headers });
}
