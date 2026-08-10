import { AppUser } from "@/lib/domain";

export function canApproveCommercialProposal(user: AppUser) {
  return user.role === "SUPER_ADMIN";
}

export function canApproveReport(user: AppUser) {
  return user.role === "CONSULTANT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canReleaseVerdict(user: AppUser) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canManageTemplates(user: AppUser) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canEditFloorWorkspaces(user: AppUser) {
  return user.role === "CONSULTANT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canEvaluateCases(user: AppUser) {
  return user.role === "CONSULTANT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canVerifyPayments(user: AppUser) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canReadClientSnapshots(user: AppUser) {
  return user.role === "CONSULTANT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export function canTriggerDeliverables(user: AppUser) {
  return user.role === "SETTER" || user.role === "CONSULTANT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}
