import type { UserRole } from "@/lib/domain";
import { roles } from "@/lib/domain";

export type PageAccessRule = {
  href: string;
  label: string;
  minimumRole: UserRole;
};

export const pageAccessRules: PageAccessRule[] = [
  { href: "/client", label: "My Case", minimumRole: "CLIENT" },
  { href: "/workspace", label: "Workspace", minimumRole: "SETTER" },
  { href: "/", label: "Overview", minimumRole: "SETTER" },
  { href: "/crm", label: "Clients", minimumRole: "SETTER" },
  { href: "/timeline", label: "History", minimumRole: "SETTER" },
  { href: "/ops", label: "Case Setup", minimumRole: "CONSULTANT" },
  { href: "/evaluation", label: "Evaluation", minimumRole: "CONSULTANT" },
  { href: "/assets", label: "Files", minimumRole: "CONSULTANT" },
  { href: "/payment-proofs", label: "Payments", minimumRole: "SETTER" },
  { href: "/reports", label: "Reports", minimumRole: "CONSULTANT" },
  { href: "/models", label: "Data Model", minimumRole: "ADMIN" },
  { href: "/diagnostics", label: "System Check", minimumRole: "ADMIN" },
  { href: "/integrity", label: "Data Check", minimumRole: "ADMIN" },
  { href: "/state", label: "System Data", minimumRole: "SUPER_ADMIN" },
  { href: "/admin", label: "Team", minimumRole: "ADMIN" },
  { href: "/bootstrap", label: "Setup", minimumRole: "ADMIN" },
  { href: "/settings", label: "Settings", minimumRole: "ADMIN" }
];

export function canRoleAccess(role: UserRole, minimumRole: UserRole) {
  return roles.indexOf(role) >= roles.indexOf(minimumRole);
}

export function getAccessiblePageRules(role: UserRole) {
  if (role === "CLIENT") {
    return pageAccessRules.filter((item) => item.href === "/client");
  }

  return pageAccessRules.filter((item) => item.href !== "/client" && canRoleAccess(role, item.minimumRole));
}
