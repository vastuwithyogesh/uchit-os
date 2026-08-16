import type { FounderCommercialAuditEventRecord, MethodologyRuleRecord, MethodologyVersionRecord } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import { ENTRANCE_ZONE_CODES } from "./entrance-zone-catalog.ts";
import type { AppState } from "./store.ts";

export const ENTRANCE_ZONE_CATALOG_V1_ID = "entrance-zone-catalog-v1";
export const ENTRANCE_ZONE_CATALOG_V1_LABEL = "Entrance Zone Catalog v1.0";
export const ENTRANCE_ZONE_CATALOG_V1_ACTIVATED_AT = "2026-08-14T00:00:00.000+05:30";
export const ENTRANCE_ZONE_CATALOG_V1_OWNER = "Yogesh";
export const ENTRANCE_ZONE_PRESENTATION_STATUS = "REVIEW_REQUIRED_COPY" as const;
export const ENTRANCE_ZONE_CLASSIFICATIONS = ["GOOD", "BAD", "OK-OK"] as const;
export type EntranceZoneClassification = (typeof ENTRANCE_ZONE_CLASSIFICATIONS)[number];

export type EntranceZoneCatalogSourceRecord = {
  code: string;
  ownerSourceText: string;
  classification: EntranceZoneClassification;
};

/**
 * Owner-approved source records. `ownerSourceText` is intentionally preserved
 * byte-for-byte, including original spelling and punctuation. It is internal
 * methodology evidence and is not approved client-facing presentation copy.
 */
export const ENTRANCE_ZONE_CATALOG_V1_RECORDS: readonly EntranceZoneCatalogSourceRecord[] = Object.freeze(([
  { code: "N1", ownerSourceText: "Residents in house is affected by bed intention of other people.", classification: "BAD" },
  { code: "N2", ownerSourceText: "Residents feel like other people are jealous of them.", classification: "BAD" },
  { code: "N3", ownerSourceText: "Entrance bring lot of money.", classification: "GOOD" },
  { code: "N4", ownerSourceText: "Gain from ancestors property and earn money.", classification: "GOOD" },
  { code: "N5", ownerSourceText: "Religious, clam and non aggressive.", classification: "OK-OK" },
  { code: "N6", ownerSourceText: "Acceptable behavious in society and peopleusually avoid listening them.", classification: "BAD" },
  { code: "N7", ownerSourceText: "Girls in family go beyond family culture.", classification: "BAD" },
  { code: "N8", ownerSourceText: "Gives high bank balance", classification: "GOOD" },
  { code: "E1", ownerSourceText: "Causes fire, accidents and unexpected loss", classification: "BAD" },
  { code: "E2", ownerSourceText: "Wasteful expenditure and no of girls are more in family.", classification: "BAD" },
  { code: "E3", ownerSourceText: "Auspicious entrance bring money ,profit and success.", classification: "GOOD" },
  { code: "E4", ownerSourceText: "Built connections and growth with powerful people in government depertment", classification: "GOOD" },
  { code: "E5", ownerSourceText: "Extreme short temperament.", classification: "BAD" },
  { code: "E6", ownerSourceText: "Non commitments and unreliability of residents.", classification: "BAD" },
  { code: "E7", ownerSourceText: "Insensitive towards problem and discomfort of other.", classification: "BAD" },
  { code: "E8", ownerSourceText: "Results accidente ,burglary, financial losses.", classification: "BAD" },
  { code: "S1", ownerSourceText: "Effact negatively on boys in house, there action and thoughts go beyond parents expectation.", classification: "BAD" },
  { code: "S2", ownerSourceText: "Increase tendency to work for others , good for people working in MNC and corporates.", classification: "OK-OK" },
  { code: "S3", ownerSourceText: "Brings immense prosperity, make you smart enough to get their work dance.", classification: "GOOD" },
  { code: "S4", ownerSourceText: "Industries are highly successful, family is blessed with more boys in house.", classification: "GOOD" },
  { code: "S5", ownerSourceText: "People live with high debts and feel they are not making good use of there skills.", classification: "BAD" },
  { code: "S6", ownerSourceText: "Door brings poverty in house.", classification: "BAD" },
  { code: "S7", ownerSourceText: "Professional and relationship efforts going in waste, people feel disconnected from others.", classification: "BAD" },
  { code: "S8", ownerSourceText: "Extreme rude and attitude behaviours which disconnect them from rest of the world leading to financial and relationship hardships.", classification: "BAD" },
  { code: "W1", ownerSourceText: "Negativity of entrance affects financial postion and life span.", classification: "BAD" },
  { code: "W2", ownerSourceText: "Instable carrier, feel insure in life , lack of clarity and vision.", classification: "BAD" },
  { code: "W3", ownerSourceText: "Amazing growth and prosperity.", classification: "GOOD" },
  { code: "W4", ownerSourceText: "Balanced and smooth life. Not to profits not too losses.", classification: "GOOD" },
  { code: "W5", ownerSourceText: "Makes one perfectionst and overambitious which lead to problems in life.", classification: "OK-OK" },
  { code: "W6", ownerSourceText: "Mental depression.", classification: "BAD" },
  { code: "W7", ownerSourceText: "Drug, alcohol, loss of general happiness.", classification: "BAD" },
  { code: "W8", ownerSourceText: "Unfair and unlawful means for their own benefits.", classification: "BAD" }
] satisfies EntranceZoneCatalogSourceRecord[]).map((record) => Object.freeze(record)));

export const ENTRANCE_ZONE_CATALOG_V1_CODES = [...ENTRANCE_ZONE_CODES];
export const ENTRANCE_ZONE_CATALOG_V1_HASH = deterministicContentHash({
  catalogId: ENTRANCE_ZONE_CATALOG_V1_ID,
  scope: "ENTRANCE",
  records: ENTRANCE_ZONE_CATALOG_V1_RECORDS,
  presentationTextStatus: ENTRANCE_ZONE_PRESENTATION_STATUS
});

export function validateEntranceZoneCatalogV1(records: readonly EntranceZoneCatalogSourceRecord[] = ENTRANCE_ZONE_CATALOG_V1_RECORDS) {
  if (records.length !== 32) throw new Error("Entrance Zone Catalog v1.0 requires exactly 32 records.");
  const codes = records.map((item) => item.code);
  if (new Set(codes).size !== 32) throw new Error("Entrance Zone Catalog v1.0 contains duplicate codes.");
  if (codes.some((code, index) => code !== ENTRANCE_ZONE_CATALOG_V1_CODES[index])) throw new Error("Entrance Zone Catalog v1.0 contains a missing, unknown, or out-of-order code.");
  if (records.some((item) => !ENTRANCE_ZONE_CLASSIFICATIONS.includes(item.classification) || !item.ownerSourceText)) throw new Error("Entrance Zone Catalog v1.0 contains an invalid rating or empty owner source text.");
  return true;
}

/**
 * Adds the owner-approved catalog to a disposable local state. This pure
 * builder is called only by guarded local/server fixture builders; normal
 * runtime and hosted state are never auto-seeded or activated.
 */
export function activateLocalEntranceZoneCatalogV1(input: {
  state: AppState;
  organisationId: string;
  actorUserId: string;
  activatedAt?: string;
}) {
  validateEntranceZoneCatalogV1();
  const activatedAt = input.activatedAt ?? ENTRANCE_ZONE_CATALOG_V1_ACTIVATED_AT;
  const existing = input.state.methodologyVersions.find((item) => item.organisationId === input.organisationId && item.id === ENTRANCE_ZONE_CATALOG_V1_ID);
  if (existing) {
    if (existing.contentHash !== ENTRANCE_ZONE_CATALOG_V1_HASH || existing.lifecycleStatus !== "ACTIVE") throw new Error("The local Entrance Zone Catalog v1.0 identity is already occupied by different or inactive content.");
    return existing;
  }
  for (const version of input.state.methodologyVersions.filter((item) => item.organisationId === input.organisationId && item.module === "DIRECTION_32" && item.lifecycleStatus === "ACTIVE")) version.lifecycleStatus = "RETIRED";

  const rules: MethodologyRuleRecord[] = ENTRANCE_ZONE_CATALOG_V1_RECORDS.map((item, index) => {
    const payload = {
      ruleKey: `ENTRANCE_ZONE:${item.code}`,
      sourceReference: `Owner methodology input · ${ENTRANCE_ZONE_CATALOG_V1_LABEL} · ${item.code}`,
      decisionStatus: "APPROVED" as const,
      conditionJson: { entranceZoneCode: item.code },
      outcomeJson: {
        entranceZoneOrder: index + 1,
        entranceZoneClassification: item.classification,
        presentationText: null,
        presentationTextStatus: ENTRANCE_ZONE_PRESENTATION_STATUS
      },
      ownerSourceText: item.ownerSourceText,
      presentationTextStatus: ENTRANCE_ZONE_PRESENTATION_STATUS
    };
    return {
      id: `${ENTRANCE_ZONE_CATALOG_V1_ID}-${item.code.toLowerCase()}`,
      organisationId: input.organisationId,
      methodologyVersionId: ENTRANCE_ZONE_CATALOG_V1_ID,
      ...payload,
      contentHash: deterministicContentHash(payload),
      idempotencyKey: `local:${ENTRANCE_ZONE_CATALOG_V1_ID}:${item.code}`,
      createdAt: activatedAt,
      createdByActorUserId: input.actorUserId,
      recordVersion: 1
    };
  });
  const version: MethodologyVersionRecord = {
    id: ENTRANCE_ZONE_CATALOG_V1_ID,
    organisationId: input.organisationId,
    module: "DIRECTION_32",
    version: 1,
    label: ENTRANCE_ZONE_CATALOG_V1_LABEL,
    lifecycleStatus: "ACTIVE",
    executionAdapterVersion: "entrance-zone-catalog/v1",
    sourceLabel: `Owner-approved by ${ENTRANCE_ZONE_CATALOG_V1_OWNER}`,
    contentHash: ENTRANCE_ZONE_CATALOG_V1_HASH,
    reason: "Owner-approved Entrance Zone Catalog v1.0 activated for local verification only.",
    idempotencyKey: `local:${ENTRANCE_ZONE_CATALOG_V1_ID}:activate`,
    createdAt: activatedAt,
    createdByActorUserId: input.actorUserId,
    approvedAt: activatedAt,
    approvedByActorUserId: input.actorUserId,
    catalogScope: "ENTRANCE",
    catalogRecordCount: 32,
    ownerSourceAuthority: ENTRANCE_ZONE_CATALOG_V1_OWNER,
    recordVersion: 1
  };
  input.state.methodologyRules.unshift(...rules);
  input.state.methodologyVersions.unshift(version);
  const audit: FounderCommercialAuditEventRecord = {
    id: `audit-${ENTRANCE_ZONE_CATALOG_V1_ID}`,
    organisationId: input.organisationId,
    createdByActorUserId: input.actorUserId,
    recordVersion: 1,
    eventType: "ENTRANCE_ZONE_CATALOG_ACTIVATED",
    entityType: "METHODOLOGY_VERSION",
    entityId: version.id,
    actorUserId: input.actorUserId,
    happenedAt: activatedAt,
    reason: version.reason,
    afterHash: version.contentHash,
    idempotencyKey: `audit:local:${ENTRANCE_ZONE_CATALOG_V1_ID}:activate`
  };
  input.state.founderCommercialAuditEvents.unshift(audit);
  return version;
}
