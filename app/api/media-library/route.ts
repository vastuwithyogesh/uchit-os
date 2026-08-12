import { NextResponse } from "next/server";
import { isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { registerMediaAssetVersion, transitionMediaAssetVersion, validateApprovedAssetDryRun } from "@/lib/founder-engagement";
import { APPROVED_FOUNDER_ASSETS } from "@/lib/founder-media-manifest";
import { loadStateSnapshotFromPersistence, persistStateToDatabase } from "@/lib/persistence";
import { getRuntimeEnv } from "@/lib/runtime-env";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();

async function ownerContext(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) return { response: access.response } as const;
  const foundation = await resolveActiveOrganisationContext(access.actor, isInitialOrganisationOwnerEmail(access.actor.email));
  if (access.actor.id !== foundation.organisation.founderUserId || foundation.membership.capability !== "organisation_owner") {
    return { response: NextResponse.json({ ok: false, error: "Only the configured Founder owner can manage Media Library assets." }, { status: 403, headers: noStore }) } as const;
  }
  const actor = { ...access.actor, role: access.actor.role, organisationId: foundation.organisation.id, organisationCapability: foundation.membership.capability };
  return { actor, foundation } as const;
}

export async function GET(request: Request) {
  const context = await ownerContext(request); if ("response" in context) return context.response;
  const snapshot = await loadStateSnapshotFromPersistence();
  const organisationId = context.foundation.organisation.id;
  return NextResponse.json({ ok: true, revision: snapshot.revision, assets: APPROVED_FOUNDER_ASSETS.map((manifest) => {
    const asset = snapshot.state.mediaAssets.find((item) => item.id === `media:${manifest.key.toLowerCase()}` && item.organisationId === organisationId);
    const version = snapshot.state.mediaAssetVersions.find((item) => item.id === asset?.activeVersionId && item.organisationId === organisationId);
    return { key: manifest.key, status: version?.status ?? "NOT_INGESTED", version: version?.version, checksumSha256: version?.checksumSha256, widthPixels: version?.widthPixels, heightPixels: version?.heightPixels, hasAlphaChannel: version?.hasAlphaChannel, brandRole: version?.brandRole, clientSendable: version?.clientSendable ?? manifest.clientSendable };
  }) }, { headers: noStore });
}

export async function POST(request: Request) {
  const context = await ownerContext(request); if ("response" in context) return context.response;
  const env = getRuntimeEnv();
  if (!env.R2 || !env.DB) return NextResponse.json({ ok: false, error: "Private D1 and R2 bindings are required." }, { status: 503, headers: noStore });
  const form = await request.formData(); const file = form.get("file"); const assetKey = String(form.get("assetKey") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Select the exact approved source file." }, { status: 400, headers: noStore });
  const manifest = APPROVED_FOUNDER_ASSETS.find((item) => item.key === assetKey);
  if (!manifest) return NextResponse.json({ ok: false, error: "Approved asset manifest entry not found." }, { status: 404, headers: noStore });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Media Library files are limited to 5 MB." }, { status: 413, headers: noStore });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const magicOk = manifest.mimeType === "application/pdf" ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" : bytes.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index]);
  if (!magicOk || file.type !== manifest.mimeType) return NextResponse.json({ ok: false, error: "File signature or MIME type does not match the approved asset." }, { status: 400, headers: noStore });
  const checksumSha256 = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const organisationId = context.foundation.organisation.id;
  validateApprovedAssetDryRun({ actor: context.actor, founderUserId: context.foundation.organisation.founderUserId, organisationId, assetKey, filename: file.name, sizeBytes: file.size, pageCount: manifest.pageCount, checksumSha256, mimeType: file.type });
  const snapshot = await loadStateSnapshotFromPersistence();
  const existingAsset = snapshot.state.mediaAssets.find((item) => item.id === `media:${assetKey.toLowerCase()}` && item.organisationId === organisationId);
  const active = snapshot.state.mediaAssetVersions.find((item) => item.id === existingAsset?.activeVersionId && item.checksumSha256 === checksumSha256 && item.status === "ACTIVE");
  if (active) return NextResponse.json({ ok: true, replayed: true, status: active.status, version: active.version, checksumSha256: active.checksumSha256 }, { headers: noStore });
  const objectKey = `media/${organisationId}/${assetKey.toLowerCase()}/${checksumSha256.toLowerCase()}`;
  await env.R2.put(objectKey, bytes, { httpMetadata: { contentType: manifest.mimeType }, customMetadata: { immutable: "true", checksumSha256, assetKey } });
  try {
    const registered = registerMediaAssetVersion({ state: snapshot.state, actor: context.actor, founderUserId: context.foundation.organisation.founderUserId, organisationId, assetKey, privateObjectKey: objectKey, reason: "Founder approved exact original bytes for private Media Library ingestion.", idempotencyKey: `media-ingest-${checksumSha256.slice(0, 24).toLowerCase()}`, expectedRecordVersion: existingAsset?.recordVersion ?? 0 });
    transitionMediaAssetVersion({ state: snapshot.state, actor: context.actor, founderUserId: context.foundation.organisation.founderUserId, organisationId, versionId: registered.version.id, target: "FOUNDER_APPROVED", expectedRecordVersion: 1, reason: "Yogesh verified and approved the exact immutable source asset." });
    transitionMediaAssetVersion({ state: snapshot.state, actor: context.actor, founderUserId: context.foundation.organisation.founderUserId, organisationId, versionId: registered.version.id, target: "ACTIVE", expectedRecordVersion: 2, reason: "Yogesh activated this exact version for its approved private role." });
    await persistStateToDatabase(snapshot.state, snapshot.revision ?? undefined);
    return NextResponse.json({ ok: true, replayed: false, status: registered.version.status, version: registered.version.version, checksumSha256, role: manifest.brandRole, clientSendable: manifest.clientSendable }, { status: 201, headers: noStore });
  } catch (error) {
    await env.R2.delete(objectKey);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Media ingestion failed without saving changes." }, { status: 409, headers: noStore });
  }
}
