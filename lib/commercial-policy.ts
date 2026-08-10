import type { CommercialPolicy } from "@/lib/domain";

/** Compatibility values migrated from the previously hard-coded workflow behavior. */
export const LEGACY_COMMERCIAL_POLICY_DEFAULTS: CommercialPolicy = {
  version: 1,
  defaultProposalAmountInr: 51000,
  minimumAdvanceInr: 11000,
  qualificationCallTargetMinutes: 2,
  nextActionDueSoonHours: 24,
  defaultReviewCallMinutes: 30,
  reason: "Initial version migrated from the established workflow defaults.",
  updatedAt: "2026-08-10T00:00:00.000Z",
  updatedBy: { id: "system-migration", name: "System migration", role: "SUPER_ADMIN" }
  ,idempotencyKey: "system-migration-v1"
};
