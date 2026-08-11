import type { IntegrationOutboxRecord } from "./domain.ts";

export const canonicalProjectionVersion = "uchit-canonical-projection/v1" as const;
export const integrationOutboxStatuses = ["PENDING", "SENT", "FAILED", "DEAD_LETTER"] as const;
export type IntegrationOutboxStatus = (typeof integrationOutboxStatuses)[number];

/**
 * The only fields that may be sent back to a separate Lovable panel.  This is
 * deliberately a projection, never a copy of AppState or a raw client row.
 */
export type CanonicalLeadProjection = {
  schemaVersion: typeof canonicalProjectionVersion;
  organisationId: string;
  sourceSystem: "UCHIT";
  entityType: "CLIENT";
  entityId: string;
  externalSourceId?: string;
  externalSourceRecordType?: string;
  externalSourceRecordId?: string;
  canonicalPipelineStage?: string;
  recordVersion: number;
  globalRevision: number;
  syncStatus: "CANONICAL" | "REVIEW_REQUIRED" | "PAUSED";
  changedAt: string;
};

export type CanonicalProjectionInput = {
  organisationId: string;
  clientId: string;
  pipelineStage?: string;
  recordVersion?: number;
  globalRevision: number;
  changedAt: string;
  externalSourceId?: string;
  externalSourceRecordType?: string;
  externalSourceRecordId?: string;
  syncStatus?: CanonicalLeadProjection["syncStatus"];
};

export function buildCanonicalLeadProjection(input: CanonicalProjectionInput): CanonicalLeadProjection {
  if (!input.organisationId || !input.clientId) throw new Error("Canonical projection scope is required.");
  if (!Number.isSafeInteger(input.globalRevision) || input.globalRevision < 0) throw new Error("Canonical projection revision is invalid.");
  return {
    schemaVersion: canonicalProjectionVersion,
    organisationId: input.organisationId,
    sourceSystem: "UCHIT",
    entityType: "CLIENT",
    entityId: input.clientId,
    ...(input.externalSourceId ? { externalSourceId: input.externalSourceId } : {}),
    ...(input.externalSourceRecordType ? { externalSourceRecordType: input.externalSourceRecordType } : {}),
    ...(input.externalSourceRecordId ? { externalSourceRecordId: input.externalSourceRecordId } : {}),
    ...(input.pipelineStage ? { canonicalPipelineStage: input.pipelineStage } : {}),
    recordVersion: Number.isSafeInteger(input.recordVersion) && (input.recordVersion ?? 0) >= 0 ? input.recordVersion ?? 0 : 0,
    globalRevision: input.globalRevision,
    syncStatus: input.syncStatus ?? "CANONICAL",
    changedAt: new Date(input.changedAt).toISOString()
  };
}

export function stableOutboxIdempotencyKey(input: {
  externalSourceId: string; entityType: string; entityId: string; eventType: string; canonicalRevision: number;
}) {
  if (!input.externalSourceId || !input.entityType || !input.entityId || !input.eventType || !Number.isSafeInteger(input.canonicalRevision) || input.canonicalRevision < 0) {
    throw new Error("Outbox identity is invalid.");
  }
  return ["uchit", input.externalSourceId, input.entityType, input.entityId, input.eventType, String(input.canonicalRevision)].join(":");
}

export function assertOutboxTransition(from: IntegrationOutboxStatus, to: IntegrationOutboxStatus) {
  const allowed: Record<IntegrationOutboxStatus, readonly IntegrationOutboxStatus[]> = {
    PENDING: ["SENT", "FAILED", "DEAD_LETTER"],
    SENT: [],
    FAILED: ["PENDING", "DEAD_LETTER"],
    DEAD_LETTER: []
  };
  if (!allowed[from].includes(to)) throw new Error(`Invalid integration outbox transition ${from} -> ${to}.`);
  return true;
}

export function buildOutboxRecord(input: {
  id: string; organisationId: string; externalSourceId: string; targetSystem: string; entityType: string; entityId: string;
  eventType: string; canonicalRevision: number; payloadHash: string; now: string; payloadVersion?: string;
}): IntegrationOutboxRecord {
  const now = new Date(input.now).toISOString();
  return {
    id: input.id, organisationId: input.organisationId, externalSourceId: input.externalSourceId,
    targetSystem: input.targetSystem, entityType: input.entityType, entityId: input.entityId, eventType: input.eventType,
    canonicalRevision: input.canonicalRevision, payloadVersion: input.payloadVersion ?? canonicalProjectionVersion,
    payloadHash: input.payloadHash, status: "PENDING", attemptCount: 0,
    idempotencyKey: stableOutboxIdempotencyKey({ externalSourceId: input.externalSourceId, entityType: input.entityType, entityId: input.entityId, eventType: input.eventType, canonicalRevision: input.canonicalRevision }),
    createdAt: now, updatedAt: now, recordVersion: 1
  };
}

export function safeReconcileProjection(row: {
  organisationId: string; entityType: string; entityId: string; canonicalPipelineStage?: string;
  recordVersion?: number; globalRevision: number; syncStatus?: CanonicalLeadProjection["syncStatus"];
}) {
  if (!row.organisationId || !row.entityId) throw new Error("Reconcile projection scope is required.");
  return {
    organisationId: row.organisationId,
    entityType: row.entityType,
    entityId: row.entityId,
    ...(row.canonicalPipelineStage ? { canonicalPipelineStage: row.canonicalPipelineStage } : {}),
    recordVersion: row.recordVersion ?? 0,
    globalRevision: row.globalRevision,
    syncStatus: row.syncStatus ?? "CANONICAL"
  };
}
