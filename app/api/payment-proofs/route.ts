import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import {
  normalizePaymentProofKey,
  readScopedPaymentProofManifest,
  savePaymentProofUpload,
  toPublicPaymentProofRecord
} from "@/lib/payment-proof-assets.server";
import { loadStateFromPersistence } from "@/lib/persistence";
import { getActiveCaseForClient } from "@/lib/service-framework";

type PaymentContext = { clientId: string; proposalId?: string; caseId?: string };

function assertPaymentScope(state: Awaited<ReturnType<typeof loadStateFromPersistence>>, context: PaymentContext) {
  if (!context.clientId) throw new Error("Choose a client before working with payment proof.");
  if (context.proposalId) {
    const proposal = state.commercialProposals.find((item) => item.id === context.proposalId);
    if (!proposal || proposal.clientId !== context.clientId) throw new Error("The proposal does not belong to this client.");
  }
  if (context.caseId) {
    const activeCase = getActiveCaseForClient(state, context.clientId);
    if (!activeCase || activeCase.id !== context.caseId) throw new Error("Payment proof must belong to the active case revision.");
  }
  if (!context.proposalId && !context.caseId) throw new Error("Choose a proposal or active case before working with payment proof.");
}

function privateHeaders() {
  return { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
}

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const context = {
      clientId: url.searchParams.get("clientId")?.trim() ?? "",
      proposalId: url.searchParams.get("proposalId")?.trim() || undefined,
      caseId: url.searchParams.get("caseId")?.trim() || undefined
    };
    const state = await loadStateFromPersistence();
    assertPaymentScope(state, context);
    const assets = await readScopedPaymentProofManifest(context);
    const uploadedKeys = new Set(assets.map((asset) => asset.key));
    const requiredKeys = [context.proposalId ? "advance-proof" : null, context.caseId ? "balance-proof" : null]
      .filter(Boolean) as Array<"advance-proof" | "balance-proof">;

    return NextResponse.json({
      assets: assets.map(toPublicPaymentProofRecord),
      summary: {
        required: requiredKeys.length,
        uploaded: requiredKeys.filter((key) => uploadedKeys.has(key)).length,
        pending: requiredKeys.filter((key) => !uploadedKeys.has(key)).length,
        complete: requiredKeys.every((key) => uploadedKeys.has(key)),
        missingKeys: requiredKeys.filter((key) => !uploadedKeys.has(normalizePaymentProofKey(key)))
      }
    }, { headers: privateHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid payment proof scope." }, { status: 400, headers: privateHeaders() });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireRouteActor(request, "SETTER");
    if (!access.ok) return access.response;

    const formData = await request.formData();
    const file = formData.get("file");
    const key = String(formData.get("key") ?? "");
    if (key !== "advance-proof" && key !== "balance-proof") {
      return NextResponse.json({ ok: false, error: "Choose advance or balance proof." }, { status: 400, headers: privateHeaders() });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing payment proof file." }, { status: 400, headers: privateHeaders() });
    }

    const context = {
      clientId: String(formData.get("clientId") ?? "").trim(),
      proposalId: String(formData.get("proposalId") ?? "").trim() || undefined,
      caseId: String(formData.get("caseId") ?? "").trim() || undefined
    };
    const state = await loadStateFromPersistence();
    assertPaymentScope(state, context);
    if (key === "advance-proof" && !context.proposalId) throw new Error("Advance proof requires the selected proposal.");
    if (key === "balance-proof" && !context.caseId) throw new Error("Balance proof requires the active case.");
    const existingAssets = await readScopedPaymentProofManifest(context);
    const existingAsset = existingAssets.find((asset) => asset.key === key);
    const proofIsBound = Boolean(existingAsset?.id) && (
      state.payments.some((payment) => payment.proofAssetId === existingAsset?.id)
      || state.advanceVerifications.some((verification) => verification.proofAssetId === existingAsset?.id)
    );
    if (proofIsBound) {
      return NextResponse.json({ ok: false, error: "A verified receipt is permanent and cannot be replaced. Open a formal correction if it is wrong." }, {
        status: 409,
        headers: privateHeaders()
      });
    }
    const asset = await savePaymentProofUpload(file, key, { id: access.actor.id, email: access.actor.email }, context);
    return NextResponse.json({ ok: true, proof: toPublicPaymentProofRecord(asset) }, { status: 201, headers: privateHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save payment proof.";
    return NextResponse.json({ ok: false, error: message }, {
      status: /allowed|required|valid|belong|active case|Choose|match|between|Missing/.test(message) ? 400 : 500,
      headers: privateHeaders()
    });
  }
}
