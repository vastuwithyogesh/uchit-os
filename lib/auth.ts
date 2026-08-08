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

  const row = await env.DB.prepare("SELECT role FROM staff_role_assignments WHERE email = ?").bind(email.toLowerCase()).first<{ role: UserRole }>();
  return row?.role ?? users.find((user) => user.email.toLowerCase() === email.toLowerCase())?.role ?? null;
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

export function resolveActor(role?: string | null) {
  if (role && roles.includes(role as UserRole)) {
    return getUserByRole(role as UserRole);
  }

  return getUserByRole("SUPER_ADMIN");
}

export async function resolveRequestActor(headers: Headers, demoRole?: string | null) {
  const authenticatedUserId = headers.get("oai-authenticated-user-id");
  const authenticatedEmail = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const fullNameHeader = headers.get("oai-authenticated-user-full-name");
  const isDev = process.env.NODE_ENV !== "production";
  const host = headers.get("host")?.toLowerCase() ?? "";
  const isLocalHostRequest =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]") ||
    host.startsWith("::1");

  if (authenticatedUserId || authenticatedEmail) {
    const matchedUser = users.find((user) => {
      const sameEmail = authenticatedEmail ? user.email.toLowerCase() === authenticatedEmail : false;
      const sameId = authenticatedUserId ? user.id === authenticatedUserId : false;
      return sameEmail || sameId;
    });

    if (matchedUser) {
      return matchedUser;
    }

    const mappedRole = authenticatedEmail ? await getRoleForAuthenticatedEmail(authenticatedEmail) : null;
    if (mappedRole) {
      const mappedUser = getUserByRole(mappedRole);
      return {
        ...mappedUser,
        id: authenticatedUserId ?? mappedUser.id,
        email: authenticatedEmail ?? mappedUser.email,
        fullName: mappedUser.fullName
      };
    }

    let displayName = authenticatedEmail || getUserByRole("CLIENT").fullName;
    try {
      displayName = fullNameHeader ? decodeURIComponent(fullNameHeader) : displayName;
    } catch {
      displayName = authenticatedEmail || getUserByRole("CLIENT").fullName;
    }

    return {
      ...getUserByRole("CLIENT"),
      id: authenticatedUserId ?? `auth_${authenticatedEmail ?? "visitor"}`,
      email: authenticatedEmail ?? getUserByRole("CLIENT").email,
      fullName: displayName
    };
  }

  if (isDev && demoRole && roles.includes(demoRole as UserRole)) {
    return getUserByRole(demoRole as UserRole);
  }

  if (isDev && isLocalHostRequest) {
    return getUserByRole("SUPER_ADMIN");
  }

  return getUserByRole("CLIENT");
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

  const stored = (result.results ?? []).map((row) => ({
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
  const actor = await resolveRequestActor(request.headers);
  if (!canAccessRole(actor, minimumRole)) {
    return {
      ok: false as const,
      actor,
      response: new Response(JSON.stringify({ ok: false, error: `This route requires ${minimumRole} access.` }), {
        status: 403,
        headers: {
          "Content-Type": "application/json"
        }
      })
    };
  }

  return {
    ok: true as const,
    actor
  };
}
