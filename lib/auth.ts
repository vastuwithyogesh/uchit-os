import { AppUser, UserRole, roles } from "@/lib/domain";
import { users } from "@/lib/seed";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { migrateD1 } from "@/db/migrations";

export type StaffRoleAssignment = {
  email: string;
  role: UserRole;
  fullName: string;
  updatedAt: string;
};

export type StaffRoleAuditRecord = {
  id: string;
  targetEmail: string;
  previousRole?: UserRole;
  nextRole: UserRole;
  actorId: string;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  changedAt: string;
};

export const rolePermissions: Record<UserRole, string[]> = {
  CLIENT: ["view-own-timeline", "view-own-report"],
  SETTER: ["capture-lead", "trigger-deliverable", "book-qualification-call", "view-pipeline"],
  CONSULTANT: ["build-floor-workspace", "prepare-report", "approve-draft-report", "view-utility-matrix"],
  ADMIN: ["approve-report", "release-verdict", "manage-templates", "view-full-crm"],
  SUPER_ADMIN: ["approve-commercial", "approve-report", "release-verdict", "manage-templates", "view-full-crm"]
};

export function hasPermission(user: AppUser, permission: string) {
  return rolePermissions[user.role].includes(permission);
}

export function canAccessRole(user: AppUser, role: UserRole) {
  return roles.indexOf(user.role) >= roles.indexOf(role);
}

export function getDemoSession(user: AppUser) {
  return {
    user,
    permissions: rolePermissions[user.role]
  };
}

export function getUserByRole(role: UserRole) {
  return users.find((user) => user.role === role) ?? users[0];
}

const initialOwnerEmails = new Set(["iyogesh2020@gmail.com"]);

export function isInitialOrganisationOwnerEmail(email: string) {
  return initialOwnerEmails.has(email.trim().toLowerCase());
}

export const SESSION_API_VERSION = 1 as const;

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHENTICATED";

  constructor(message = "A verified signed-in identity is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

function isLocalRequest(headers: Headers) {
  const host = (headers.get("host") ?? "").trim().toLowerCase();
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || /^\[::1\](:\d+)?$/.test(host) || host === "::1";
}

export function isExplicitLocalDemo(headers: Headers) {
  return process.env.NODE_ENV !== "production" && process.env.UCHIT_VASTU_DEMO_MODE === "true" && isLocalRequest(headers);
}

function readAuthenticatedIdentity(headers: Headers) {
  const id = headers.get("oai-authenticated-user-id")?.trim() ?? "";
  const email = headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validId = id.length > 0 && id.length <= 256 && !/[\u0000-\u001f\u007f]/.test(id);

  // A partial identity must never be accepted: both values are supplied by Sites
  // and together provide a stable, auditable actor key.
  if (!validId || !validEmail) {
    throw new AuthenticationError();
  }

  return { id, email };
}

function resolveAuthenticatedDisplayName(headers: Headers, fallback: string) {
  const fullNameHeader = headers.get("oai-authenticated-user-full-name");
  const encoding = headers.get("oai-authenticated-user-full-name-encoding");

  if (!fullNameHeader || encoding !== "percent-encoded-utf-8") {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(fullNameHeader).replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return decoded ? decoded.slice(0, 160) : fallback;
  } catch {
    return fallback;
  }
}

function hydrateAuthenticatedActor(baseUser: AppUser, headers: Headers) {
  const authenticatedUserId = headers.get("oai-authenticated-user-id");
  const authenticatedEmail = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();

  return {
    ...baseUser,
    id: authenticatedUserId ?? baseUser.id,
    email: authenticatedEmail ?? baseUser.email,
    fullName: resolveAuthenticatedDisplayName(headers, authenticatedEmail ?? baseUser.fullName)
  } satisfies AppUser;
}

async function getRoleForAuthenticatedEmail(email: string) {
  const db = await ensureStaffRoleAssignmentsTable();
  if (!db) return null;
  const row = await db.prepare("SELECT role FROM staff_role_assignments WHERE email = ?").bind(email.toLowerCase()).first<{ role: string }>();
  const storedRole = row?.role;
  return storedRole && roles.includes(storedRole as UserRole)
    ? (storedRole as UserRole)
    : null;
}

async function getRoleForActiveMembership(userId: string): Promise<UserRole | null> {
  const db = await ensureStaffRoleAssignmentsTable();
  if (!db) return null;
  const result = await db.prepare(`SELECT m.role FROM organisation_memberships m
    JOIN organisations o ON o.id=m.organisation_id
    WHERE m.user_id=? AND m.status='ACTIVE' AND o.status='ACTIVE' ORDER BY m.created_at`)
    .bind(userId).all<{ role: string }>();
  const memberships = result.results ?? [];
  if (memberships.length !== 1) return null;
  return roles.includes(memberships[0].role as UserRole) ? memberships[0].role as UserRole : null;
}

async function ensureStaffRoleAssignmentsTable() {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }
  try {
    await migrateD1(env.DB);
  } catch {
    // Session verification must not become unavailable because a non-critical
    // role-assignment migration is temporarily unavailable. Callers fall back
    // to the authenticated user's safe default CLIENT role until the next
    // request can complete the migration.
    return null;
  }

  return env.DB;
}

export function resolveActor(role?: string | null) {
  if (role && roles.includes(role as UserRole)) {
    return getUserByRole(role as UserRole);
  }

  return getUserByRole("CLIENT");
}

export async function resolveRequestActor(headers: Headers, demoRole?: string | null) {
  if (isExplicitLocalDemo(headers)) {
    const role = demoRole && roles.includes(demoRole as UserRole) ? (demoRole as UserRole) : "SUPER_ADMIN";
    return getUserByRole(role);
  }

  const { id: authenticatedUserId, email: authenticatedEmail } = readAuthenticatedIdentity(headers);
  const membershipRole = await getRoleForActiveMembership(authenticatedUserId);
  if (membershipRole) {
    return hydrateAuthenticatedActor(getUserByRole(membershipRole), headers);
  }
  const mappedRole = await getRoleForAuthenticatedEmail(authenticatedEmail);
  if (mappedRole) {
    return hydrateAuthenticatedActor(getUserByRole(mappedRole), headers);
  }

  if (initialOwnerEmails.has(authenticatedEmail)) {
    const owner = hydrateAuthenticatedActor(getUserByRole("SUPER_ADMIN"), headers);
    await upsertStaffRoleAssignment({
      email: authenticatedEmail,
      role: "SUPER_ADMIN",
      fullName: resolveAuthenticatedDisplayName(headers, authenticatedEmail)
    }, owner, { allowInitialOwnerBootstrap: true });
    return owner;
  }

  return {
    ...getUserByRole("CLIENT"),
    id: authenticatedUserId,
    email: authenticatedEmail,
    fullName: resolveAuthenticatedDisplayName(headers, authenticatedEmail)
  };
}

export async function listStaffRoleAssignments(): Promise<StaffRoleAssignment[]> {
  const db = await ensureStaffRoleAssignmentsTable();
  if (!db) return [];

  const result = await db
    .prepare("SELECT email, role, full_name, updated_at FROM staff_role_assignments ORDER BY updated_at DESC, email ASC")
    .all<{ email: string; role: UserRole; full_name: string; updated_at: string }>();

  return (result.results ?? [])
    .filter((row) => roles.includes(row.role))
    .map((row: { email: string; role: UserRole; full_name: string; updated_at: string }) => ({
      email: row.email,
      role: row.role,
      fullName: row.full_name,
      updatedAt: row.updated_at
    }));
}

export async function listStaffRoleAudit(limit = 30): Promise<StaffRoleAuditRecord[]> {
  const db = await ensureStaffRoleAssignmentsTable();
  if (!db) return [];
  const safeLimit = Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30;
  const result = await db.prepare(`SELECT id, target_email, previous_role, next_role, actor_id, actor_email,
    actor_name, actor_role, changed_at FROM staff_role_assignment_audit ORDER BY changed_at DESC LIMIT ?`)
    .bind(safeLimit)
    .all<{ id: string; target_email: string; previous_role: string | null; next_role: string; actor_id: string; actor_email: string; actor_name: string; actor_role: string; changed_at: string }>();
  return (result.results ?? []).filter((row) => roles.includes(row.next_role as UserRole) && roles.includes(row.actor_role as UserRole)).map((row) => ({
    id: row.id,
    targetEmail: row.target_email,
    previousRole: row.previous_role && roles.includes(row.previous_role as UserRole) ? row.previous_role as UserRole : undefined,
    nextRole: row.next_role as UserRole,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorName: row.actor_name,
    actorRole: row.actor_role as UserRole,
    changedAt: row.changed_at
  }));
}

export async function upsertStaffRoleAssignment(
  input: { email: string; role: UserRole; fullName: string },
  actor: AppUser,
  options: { allowInitialOwnerBootstrap?: boolean } = {}
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.fullName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) throw new Error("Enter a valid staff email address.");
  if (!normalizedName || normalizedName.length > 160) throw new Error("Enter a staff name of 160 characters or fewer.");
  if (!roles.includes(input.role)) throw new Error("Choose a valid staff role.");
  if (initialOwnerEmails.has(normalizedEmail) && input.role !== "SUPER_ADMIN") throw new Error("The initial owner cannot be demoted inside the application.");
  if (input.role === "SUPER_ADMIN" && !(options.allowInitialOwnerBootstrap && initialOwnerEmails.has(normalizedEmail))) {
    throw new Error("Additional Super-Admin access must be configured through the controlled production access process.");
  }
  const updatedAt = new Date().toISOString();
  const db = await ensureStaffRoleAssignmentsTable();

  if (!db) {
    return {
      email: normalizedEmail,
      role: input.role,
      fullName: normalizedName,
      updatedAt
    } satisfies StaffRoleAssignment;
  }
  const previous = await db.prepare("SELECT role, full_name FROM staff_role_assignments WHERE email = ?").bind(normalizedEmail)
    .first<{ role: string; full_name: string }>();
  if (previous?.role === input.role && previous.full_name === normalizedName) {
    return { email: normalizedEmail, role: input.role, fullName: normalizedName, updatedAt } satisfies StaffRoleAssignment;
  }
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO staff_role_assignments (email, role, full_name, updated_at) VALUES (?, ?, ?, ?)")
      .bind(normalizedEmail, input.role, normalizedName, updatedAt),
    db.prepare(`INSERT INTO staff_role_assignment_audit
      (id, target_email, previous_role, next_role, actor_id, actor_email, actor_name, actor_role, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), normalizedEmail, previous?.role ?? null, input.role, actor.id, actor.email, actor.fullName, actor.role, updatedAt)
  ]);

  return {
    email: normalizedEmail,
    role: input.role,
    fullName: normalizedName,
    updatedAt
  } satisfies StaffRoleAssignment;
}

export async function revokeStaffRoleAssignment(email: string, actor: AppUser) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) throw new Error("Enter a valid staff email address.");
  if (initialOwnerEmails.has(normalizedEmail)) throw new Error("The initial owner cannot be revoked inside the application.");
  const db = await ensureStaffRoleAssignmentsTable();
  if (!db) throw new Error("Durable staff-role storage is not configured.");
  const previous = await db.prepare("SELECT role FROM staff_role_assignments WHERE email = ?").bind(normalizedEmail).first<{ role: string }>();
  if (!previous?.role) throw new Error("Staff assignment not found.");
  const changedAt = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM staff_role_assignments WHERE email = ?").bind(normalizedEmail),
    db.prepare(`INSERT INTO staff_role_assignment_audit
      (id, target_email, previous_role, next_role, actor_id, actor_email, actor_name, actor_role, changed_at)
      VALUES (?, ?, ?, 'CLIENT', ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), normalizedEmail, previous.role, actor.id, actor.email, actor.fullName, actor.role, changedAt)
  ]);
  return { email: normalizedEmail, previousRole: previous.role, revokedAt: changedAt };
}

export async function requireRouteActor(request: Request, minimumRole: UserRole) {
  let actor: AppUser;
  try {
    actor = await resolveRequestActor(request.headers);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return {
        ok: false as const,
        actor: null,
        response: authErrorResponse(error)
      };
    }
    throw error;
  }
  if (!canAccessRole(actor, minimumRole)) {
    return {
      ok: false as const,
      actor,
      response: new Response(JSON.stringify({ ok: false, error: `This route requires ${minimumRole} access.` }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      })
    };
  }

  return {
    ok: true as const,
    actor
  };
}

export function authErrorResponse(error: AuthenticationError) {
  return new Response(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }), {
    status: error.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
