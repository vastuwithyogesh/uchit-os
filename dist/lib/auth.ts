import { AppUser, UserRole, roles } from "@/lib/domain";
import { users } from "@/lib/seed";

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

export function resolveActor(role?: string | null) {
  if (role && roles.includes(role as UserRole)) {
    return getUserByRole(role as UserRole);
  }

  return getUserByRole("SUPER_ADMIN");
}
