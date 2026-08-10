import type { UserRole } from "@/lib/domain";
import { roles } from "@/lib/domain";

export type PageAccessRule = {
  href: string;
  label: string;
  minimumRole: UserRole;
};

export const pageAccessRules: PageAccessRule[] = [
  { href: "/client", label: "My Vastu journey", minimumRole: "CLIENT" },
  { href: "/", label: "Overview", minimumRole: "SETTER" },
  { href: "/workspace", label: "Case workspace", minimumRole: "SETTER" },
  { href: "/crm", label: "CRM workbench", minimumRole: "SETTER" },
  { href: "/timeline", label: "Timeline", minimumRole: "SETTER" },
  { href: "/ops", label: "Ops", minimumRole: "CONSULTANT" },
  { href: "/evaluation", label: "Evaluation", minimumRole: "CONSULTANT" },
  { href: "/assets", label: "Assets", minimumRole: "CONSULTANT" },
  { href: "/payment-proofs", label: "Proofs", minimumRole: "SETTER" },
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

export function getAccessiblePageRules(role: UserRole) {
  if (role === "CLIENT") {
    return pageAccessRules.filter((item) => item.href === "/client");
  }

  return pageAccessRules.filter((item) => item.href !== "/client" && canRoleAccess(role, item.minimumRole));
}
