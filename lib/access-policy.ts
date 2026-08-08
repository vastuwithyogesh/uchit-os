import type { UserRole } from "@/lib/domain";
import { roles } from "@/lib/domain";

export type PageAccessRule = {
  href: string;
  label: string;
  minimumRole: UserRole;
};

export const pageAccessRules: PageAccessRule[] = [
  { href: "/", label: "Overview", minimumRole: "SETTER" },
  { href: "/crm", label: "CRM workbench", minimumRole: "SETTER" },
  { href: "/timeline", label: "Timeline", minimumRole: "SETTER" },
  { href: "/ops", label: "Ops", minimumRole: "CONSULTANT" },
  { href: "/evaluation", label: "Evaluation", minimumRole: "CONSULTANT" },
  { href: "/assets", label: "Assets", minimumRole: "CONSULTANT" },
  { href: "/reports", label: "Reports", minimumRole: "CONSULTANT" },
  { href: "/models", label: "Models", minimumRole: "ADMIN" },
  { href: "/diagnostics", label: "Diagnostics", minimumRole: "ADMIN" },
  { href: "/integrity", label: "Integrity", minimumRole: "ADMIN" },
  { href: "/state", label: "State", minimumRole: "SUPER_ADMIN" },
  { href: "/admin", label: "Admin", minimumRole: "ADMIN" },
  { href: "/bootstrap", label: "Bootstrap", minimumRole: "ADMIN" },
  { href: "/settings", label: "Settings", minimumRole: "ADMIN" }
];

export function canRoleAccess(role: UserRole, minimumRole: UserRole) {
  return roles.indexOf(role) >= roles.indexOf(minimumRole);
}
