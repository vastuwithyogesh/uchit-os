import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { normalizePaymentProofKey, readPaymentProofManifest, savePaymentProofUpload } from "@/lib/payment-proof-assets.server";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) {
    return access.response;
  }

  const assets = await readPaymentProofManifest();
  const uploadedKeys = new Set(assets.map((asset) => asset.key));

  return NextResponse.json({
    assets,
    summary: {
      required: 2,
      uploaded: assets.length,
      pending: 2 - assets.length,
      complete: assets.length >= 2,
      missingKeys: ["advance-proof", "balance-proof"].filter((key) => !uploadedKeys.has(normalizePaymentProofKey(key)))
    }
  });
}

export async function POST(request: Request) {
  try {
    const access = await requireRouteActor(request, "SETTER");
    if (!access.ok) {
      return access.response;
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const key = String(formData.get("key") ?? "advance-proof");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing payment proof file." }, { status: 400 });
    }

    const asset = await savePaymentProofUpload(file, key);
    return NextResponse.json({ ok: true, proof: asset });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save payment proof."
      },
      { status: 500 }
    );
  }
}
