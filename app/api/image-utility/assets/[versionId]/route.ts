import { NextResponse } from "next/server";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { IMAGE_UTILITY_IMAGE_MIME_TYPES, ImageUtilityError } from "@/lib/image-utility";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";
import { getRuntimeEnv } from "@/lib/runtime-env";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();

export async function GET(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) return access.response;
  try {
    const foundation = await resolveActiveOrganisationContext(access.actor,
      isInitialOrganisationOwnerEmail(access.actor.email) || isExplicitLocalDemo(request.headers));
    const { versionId } = await context.params; const snapshot = await loadStateSnapshotFromPersistence();
    const version = snapshot.state.mediaAssetVersions.find((item) => item.id === versionId && item.organisationId === foundation.organisation.id
      && IMAGE_UTILITY_IMAGE_MIME_TYPES.includes(item.mimeType as never));
    if (!version) throw new ImageUtilityError("Image asset version was not found.", 404);
    const stored = await getRuntimeEnv().R2?.get(version.privateObjectKey);
    if (!stored) throw new ImageUtilityError("Image bytes were not found in private storage.", 404);
    const bytes = new Uint8Array(await new Response(stored.body).arrayBuffer());
    const checksum = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)));
    if (bytes.length !== version.sizeBytes || checksum !== version.checksumSha256.toUpperCase()) throw new ImageUtilityError("Image checksum validation failed.", 409);
    return new Response(bytes, { headers: { ...noStore, "Content-Type": version.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(version.filename)}` } });
  } catch (error) {
    const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 400;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Image access failed." }, { status, headers: noStore });
  }
}
