import { AppUser, UserRole, roles } from "@/lib/domain";

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
