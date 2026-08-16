import { headers } from "next/headers";
import type { UserRole } from "@/lib/domain";
import { isExplicitLocalDemo, isInitialOrganisationOwnerEmail, resolveRequestActor } from "@/lib/auth";
import { canRoleAccess } from "@/lib/access-policy";
import { resolveActiveOrganisationContext } from "@/lib/foundation.server";

export async function requirePageAccess(minimumRole: UserRole) {
  const requestHeaders = await headers();
  const actor = await resolveRequestActor(requestHeaders);

  return {
    actor,
    allowed: canRoleAccess(actor.role, minimumRole)
  };
}

/**
 * Founder commercial pages must use the same binding-backed organisation
 * resolution as the authenticated API routes. The local fixture actor starts
 * with a synthetic organisation id; the active D1 membership is authoritative.
 */
export async function requireFounderCommercialPageAccess() {
  const requestHeaders = await headers();
  const actor = await resolveRequestActor(requestHeaders);
  const allowed = canRoleAccess(actor.role, "SUPER_ADMIN");
  if (!allowed) return { actor, allowed };
  const context = await resolveActiveOrganisationContext(
    actor,
    isInitialOrganisationOwnerEmail(actor.email) || isExplicitLocalDemo(requestHeaders)
  );
  return {
    actor: { ...actor, organisationId: context.organisation.id },
    allowed,
    organisation: context.organisation,
    membership: context.membership
  };
}

/**
 * Founder operational pages use the authenticated actor for role authority,
 * but the binding-backed active organisation for tenant/resource scope. The
 * local fixture actor's synthetic organisation must never decide Case access.
 */
export async function requireFounderPageAccess(minimumRole: UserRole = "SETTER") {
  const requestHeaders = await headers();
  const actor = await resolveRequestActor(requestHeaders);
  const allowed = canRoleAccess(actor.role, minimumRole);
  if (!allowed) return { actor, allowed };
  const context = await resolveActiveOrganisationContext(
    actor,
    isInitialOrganisationOwnerEmail(actor.email) || isExplicitLocalDemo(requestHeaders)
  );
  return {
    actor: { ...actor, organisationId: context.organisation.id },
    allowed,
    organisation: context.organisation,
    membership: context.membership
  };
}
