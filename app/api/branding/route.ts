import { NextResponse } from "next/server";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";
import { activeBrandProjection } from "@/lib/document-branding";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request.headers, request.headers.get("x-uchit-demo-role"));
  const context = await resolveActiveOrganisationContext(actor, isInitialOrganisationOwnerEmail(actor.email) || isExplicitLocalDemo(request.headers));
  const snapshot = await loadStateSnapshotFromPersistence();
  const brand = activeBrandProjection(snapshot.state, context.organisation.id);
  return NextResponse.json({ ok: true, brand: { displayName: brand.displayName, colours: brand.colours, source: brand.source } }, { headers: { "Cache-Control": "private, no-store", Vary: "oai-authenticated-user-id, oai-authenticated-user-email" } });
}
