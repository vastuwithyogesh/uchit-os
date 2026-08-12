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
  { href: "/crm", label: "Leads", minimumRole: "SETTER" },
  { href: "/lead-pipeline", label: "Lead Pipeline", minimumRole: "SETTER" },
  { href: "/clients-cases", label: "Clients & Cases", minimumRole: "SETTER" },
  { href: "/founder/continue", label: "Evaluation", minimumRole: "SETTER" },
  { href: "/timeline", label: "History", minimumRole: "SETTER" },
  { href: "/ops", label: "Legacy technical console", minimumRole: "CONSULTANT" },
  { href: "/evaluation", label: "Evaluation tools", minimumRole: "CONSULTANT" },
  { href: "/assessment", label: "Action Plan", minimumRole: "CONSULTANT" },
  { href: "/files", label: "Files & Drawings", minimumRole: "CONSULTANT" },
  { href: "/spatial", label: "Spatial Setup", minimumRole: "CONSULTANT" },
  { href: "/site", label: "Site Analysis", minimumRole: "CONSULTANT" },
  { href: "/delivery", label: "Delivery", minimumRole: "CONSULTANT" },
  { href: "/assets", label: "Report Charts", minimumRole: "CONSULTANT" },
  { href: "/payment-proofs", label: "Payments", minimumRole: "SETTER" },
  { href: "/reports", label: "Reports", minimumRole: "CONSULTANT" },
  { href: "/commercial-proposals", label: "Commercial Proposals", minimumRole: "SUPER_ADMIN" },
  { href: "/models", label: "Data Model", minimumRole: "ADMIN" },
  { href: "/diagnostics", label: "System Check", minimumRole: "ADMIN" },
  { href: "/insights", label: "Operations", minimumRole: "ADMIN" },
  { href: "/integrations", label: "Integrations", minimumRole: "ADMIN" },
  { href: "/integrity", label: "Data Check", minimumRole: "ADMIN" },
  { href: "/methodology", label: "Methodology", minimumRole: "SUPER_ADMIN" },
  { href: "/state", label: "System Data", minimumRole: "SUPER_ADMIN" },
  { href: "/admin", label: "Team", minimumRole: "ADMIN" },
  { href: "/bootstrap", label: "Data Readiness", minimumRole: "ADMIN" },
  { href: "/settings", label: "Settings", minimumRole: "ADMIN" }
];

export function canRoleAccess(role: UserRole, minimumRole: UserRole) {
  return roles.indexOf(role) >= roles.indexOf(minimumRole);
}

export function getAccessiblePageRules(role: UserRole) {
  if (role === "CLIENT") {
    return [];
  }

  return pageAccessRules.filter((item) => item.href !== "/client" && canRoleAccess(role, item.minimumRole));
}
