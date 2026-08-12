import { loadStateSnapshotFromPersistence, persistStateToDatabase, PersistenceConflictError } from "@/lib/persistence";
import { resolveSecureGrant, FounderEngagementError } from "@/lib/founder-engagement";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { setAppState } from "@/lib/store";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const snapshot = await loadStateSnapshotFromPersistence();
    const rollback = structuredClone(snapshot.state);
    let grant;
    try { grant = await resolveSecureGrant(snapshot.state, token, "BROCHURE"); }
    catch { grant = await resolveSecureGrant(snapshot.state, token, "QUALIFICATION_PDF"); }
    const version = snapshot.state.mediaAssetVersions.find((item) => item.id === grant.assetVersionId && item.organisationId === grant.organisationId && item.status === "ACTIVE" && item.clientSendable);
    if (!version) throw new FounderEngagementError(404, "This secure media link is unavailable.");
    const object = await getRuntimeEnv().R2?.get(version.privateObjectKey);
    if (!object) throw new FounderEngagementError(404, "This secure media link is unavailable.");
    try {
      setAppState(snapshot.state);
      await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
    } catch (error) { setAppState(rollback); throw error; }
    const filename = version.filename.replace(/[^A-Za-z0-9._-]+/g, "_");
    return new Response(object.body, { headers: { ...privateHeaders, "Content-Type": version.mimeType, "Content-Disposition": `inline; filename=\"${filename}\"` } });
  } catch (error) {
    const status = error instanceof PersistenceConflictError ? 409 : error instanceof FounderEngagementError ? error.statusCode : 404;
    return Response.json({ ok: false, error: "This secure media link is unavailable or has expired." }, { status, headers: privateHeaders });
  }
}
