import { NextResponse } from "next/server";
import { savePaymentProofUpload } from "@/lib/payment-proof-assets.server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing payment proof file." }, { status: 400 });
  }

  const asset = await savePaymentProofUpload(file);
  return NextResponse.json({ ok: true, proof: asset });
}
