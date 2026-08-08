import { headers } from "next/headers";
import type { UserRole } from "@/lib/domain";
import { resolveRequestActor } from "@/lib/auth";
import { canRoleAccess } from "@/lib/access-policy";

export async function requirePageAccess(minimumRole: UserRole) {
  const requestHeaders = await headers();
  const actor = await resolveRequestActor(requestHeaders);

  return {
    actor,
    allowed: canRoleAccess(actor.role, minimumRole)
  };
}
