import { NextResponse } from "next/server";
import { loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { FounderCommercialError, resolveFounderProposalGrant, respondToFounderProposal } from "@/lib/founder-commercial";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; form-action 'self'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" };
const errorResponse = (error: unknown) => NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "This proposal is unavailable." }, { status: error instanceof FounderCommercialError ? error.statusCode : 400, headers });

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; const snapshot = await loadStateSnapshotFromPersistence();
    const result = await resolveFounderProposalGrant(snapshot.state, token);
    await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
    return NextResponse.json({ ok: true, proposal: result.projection, brandPresentation: result.brandPresentation, acceptanceDeclaration: result.acceptanceDeclaration }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params; const body = await request.json().catch(() => ({}));
    const allowed = new Set(["response", "fullName", "acceptanceChecked", "typedConfirmation", "organisationName", "designation", "requestedChanges", "idempotencyKey"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) return NextResponse.json({ ok: false, error: "Unsupported proposal response field." }, { status: 400, headers });
    const snapshot = await loadStateSnapshotFromPersistence();
    const result = await respondToFounderProposal({ state: snapshot.state, token, response: body.response, fullName: String(body.fullName ?? ""), acceptanceChecked: body.acceptanceChecked === true, typedConfirmation: body.typedConfirmation, organisationName: body.organisationName, designation: body.designation, requestedChanges: body.requestedChanges, idempotencyKey: String(body.idempotencyKey ?? "") });
    await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
    return NextResponse.json({ ok: true, response: { response: result.response, respondedAt: result.respondedAt, proposalContentHash: result.proposalContentHash, artifactHashSha256: result.artifactHashSha256 } }, { headers });
  } catch (error) { return errorResponse(error); }
}
