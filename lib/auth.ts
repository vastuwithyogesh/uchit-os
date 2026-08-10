import { AppUser, UserRole, roles } from "@/lib/domain";
import { users } from "@/lib/seed";
import { getRuntimeEnv } from "@/lib/runtime-env";

export type StaffRoleAssignment = {
  email: string;
  role: UserRole;
  fullName: string;
  updatedAt: string;
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

  if (!fullNameHeader) {
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
  const env = getRuntimeEnv();
  if (!env.DB) {
    return users.find((user) => user.email.toLowerCase() === email.toLowerCase())?.role ?? null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS staff_role_assignments (
      email TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      full_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const row = await env.DB.prepare("SELECT role FROM staff_role_assignments WHERE email = ?").bind(email.toLowerCase()).first<{ role: string }>();
  const storedRole = row?.role;
  return storedRole && roles.includes(storedRole as UserRole)
    ? (storedRole as UserRole)
    : users.find((user) => user.email.toLowerCase() === email.toLowerCase())?.role ?? null;
}

async function ensureStaffRoleAssignmentsTable() {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS staff_role_assignments (
      email TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      full_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  return env.DB;
}

async function hasStoredStaffRoleAssignments() {
  const db = await ensureStaffRoleAssignmentsTable();
  if (!db) {
    return false;
  }

  const row = await db.prepare("SELECT COUNT(*) as count FROM staff_role_assignments").first<{ count: number }>();
  return Number(row?.count ?? 0) > 0;
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
    const matchedUser = users.find((user) => {
      return user.email.toLowerCase() === authenticatedEmail;
    });

    if (matchedUser) {
      return hydrateAuthenticatedActor(matchedUser, headers);
    }

    const mappedRole = await getRoleForAuthenticatedEmail(authenticatedEmail);
    if (mappedRole) {
      return hydrateAuthenticatedActor(getUserByRole(mappedRole), headers);
    }

    if (initialOwnerEmails.has(authenticatedEmail)) {
      await upsertStaffRoleAssignment({
        email: authenticatedEmail,
        role: "SUPER_ADMIN",
        fullName: resolveAuthenticatedDisplayName(headers, authenticatedEmail)
      });
      return hydrateAuthenticatedActor(getUserByRole("SUPER_ADMIN"), headers);
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
  if (!db) {
    return users
      .filter((user) => user.role !== "CLIENT")
      .map((user) => ({
        email: user.email.toLowerCase(),
        role: user.role,
        fullName: user.fullName,
        updatedAt: new Date("2026-08-08T00:00:00+05:30").toISOString()
      }));
  }

  const result = await db
    .prepare("SELECT email, role, full_name, updated_at FROM staff_role_assignments ORDER BY updated_at DESC, email ASC")
    .all<{ email: string; role: UserRole; full_name: string; updated_at: string }>();

  const stored = (result.results ?? []).map((row: { email: string; role: UserRole; full_name: string; updated_at: string }) => ({
    email: row.email,
    role: row.role,
    fullName: row.full_name,
    updatedAt: row.updated_at
  }));

  if (stored.length > 0) {
    return stored;
  }

  const seeded = users
    .filter((user) => user.role !== "CLIENT")
    .map((user) => ({
      email: user.email.toLowerCase(),
      role: user.role,
      fullName: user.fullName,
      updatedAt: new Date("2026-08-08T00:00:00+05:30").toISOString()
    }));

  await db.batch(
    seeded.map((entry) =>
      db.prepare("INSERT OR REPLACE INTO staff_role_assignments (email, role, full_name, updated_at) VALUES (?, ?, ?, ?)").bind(
        entry.email,
        entry.role,
        entry.fullName,
        entry.updatedAt
      )
    )
  );

  return seeded;
}

export async function upsertStaffRoleAssignment(input: { email: string; role: UserRole; fullName: string }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.fullName.trim() || normalizedEmail;
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

  await db
    .prepare("INSERT OR REPLACE INTO staff_role_assignments (email, role, full_name, updated_at) VALUES (?, ?, ?, ?)")
    .bind(normalizedEmail, input.role, normalizedName, updatedAt)
    .run();

  return {
    email: normalizedEmail,
    role: input.role,
    fullName: normalizedName,
    updatedAt
  } satisfies StaffRoleAssignment;
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
