import { NextResponse } from "next/server";
import { loadStateFromPersistence } from "@/lib/persistence";
import { resolveFounderProposalGrant } from "@/lib/founder-commercial";
import { getRuntimeEnv } from "@/lib/runtime-env";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": "attachment; filename=uchit-vastu-commercial-proposal.pdf", "Content-Type": "application/pdf", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; const state = await loadStateFromPersistence(); const resolved = await resolveFounderProposalGrant(state, token);
    const artifact = state.founderProposalArtifacts.find((item) => item.proposalVersionId === resolved.proposal.id && item.organisationId === resolved.proposal.organisationId);
    if (!artifact) throw new Error("The immutable proposal artifact is unavailable.");
    const object = await getRuntimeEnv().R2?.get(artifact.privateObjectKey); if (!object) throw new Error("The private proposal object is unavailable.");
    return new Response(object.body, { status: 200, headers });
  } catch { return NextResponse.json({ ok: false, error: "This proposal artifact is unavailable." }, { status: 404, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
}
