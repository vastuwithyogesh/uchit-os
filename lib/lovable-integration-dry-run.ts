import { lovableSourceEnvironments } from "./lovable-integration-contract.ts";

export type LovableIntegrationDryRun = {
  externalWrites: false;
  migrationExecuted: false;
  webhookActive: false;
  backfillExecuted: false;
  clientDeliveryEnabled: false;
  syntheticEventCount: number;
  environments: readonly string[];
  independentEnvironmentBindings: true;
  crossEnvironmentEventsRejected: true;
  identityModes: readonly ["EXACT_MATCH", "NEW_CLIENT", "REVIEW_REQUIRED"];
  nextRequiredApproval: "LIVE_SYNC_ACTIVATION";
};

/** Read-only rehearsal plan; it accepts no database or storage binding. */
export function buildLovableIntegrationDryRun(): LovableIntegrationDryRun {
  return {
    externalWrites: false,
    migrationExecuted: false,
    webhookActive: false,
    backfillExecuted: false,
    clientDeliveryEnabled: false,
    syntheticEventCount: 3,
    environments: [...lovableSourceEnvironments],
    independentEnvironmentBindings: true,
    crossEnvironmentEventsRejected: true,
    identityModes: ["EXACT_MATCH", "NEW_CLIENT", "REVIEW_REQUIRED"],
    nextRequiredApproval: "LIVE_SYNC_ACTIVATION"
  };
}
