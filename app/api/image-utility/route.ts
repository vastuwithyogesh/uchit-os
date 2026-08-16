import { NextResponse } from "next/server";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, requireRouteActor } from "@/lib/auth";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";
import { buildImageUtilityReadModel } from "@/lib/image-utility";
import { loadStateSnapshotFromPersistence } from "@/lib/persistence";
import type { AppUser } from "@/lib/domain";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) return access.response;
  const context = await resolveActiveOrganisationContext(access.actor,
    isInitialOrganisationOwnerEmail(access.actor.email) || isExplicitLocalDemo(request.headers));
  if (context.membership.role === "SPECIALIST") return NextResponse.json({ ok: false, error: "Specialist access remains deferred until Team Edition." }, { status: 403, headers: noStore });
  const actor = { ...access.actor, role: context.membership.role, organisationId: context.organisation.id,
    organisationCapability: context.membership.capability } satisfies AppUser;
  const snapshot = await loadStateSnapshotFromPersistence();
  const repositoryRecords = [
    ...snapshot.state.contextualRepositoryRecords.filter((item) => item.organisationId === context.organisation.id).map((item) => ({
      id: item.id, category: item.category, name: item.name, status: item.status, preferredAssetId: item.preferredAssetId,
      preferredAssetVersionId: item.preferredAssetVersionId, recordVersion: item.recordVersion ?? 0, caseUsed: false
    })),
    ...snapshot.state.remedyRepositoryRecords.filter((item) => item.organisationId === context.organisation.id).map((item) => ({
      id: item.id, category: item.remedialType, name: item.name, status: item.status, preferredAssetId: item.preferredAssetId,
      preferredAssetVersionId: item.preferredAssetVersionId, recordVersion: item.recordVersion ?? 0, caseUsed: false
    })),
    ...snapshot.state.caseUsedRemedyRecords.filter((item) => item.organisationId === context.organisation.id).map((item) => ({
      id: item.id, category: "CASE_USED_REMEDY", name: item.name, status: item.status, preferredAssetId: item.preferredAssetId,
      preferredAssetVersionId: item.preferredAssetVersionId, recordVersion: item.recordVersion ?? 0, caseUsed: true
    }))
  ];
  return NextResponse.json({ ok: true, revision: snapshot.revision, ...buildImageUtilityReadModel(snapshot.state, actor), repositoryRecords }, { headers: noStore });
}
