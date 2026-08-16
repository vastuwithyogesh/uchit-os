import type {
  AppUser, BrandBackdropConfig, BrandFooterConfig, BrandHeaderConfig, BrandingAuditEventRecord,
  BrandingMediaReference, BrandLogoConfig, BrandStandardTextConfig, DocumentFamily, DocumentTemplatePageRecord,
  DocumentTemplateRecord, DocumentTemplateSnapshot, LegacyBrandingSourceRecord, OrganisationBrandProfileRecord
} from "./domain.ts";
import { documentFamilies } from "./domain.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { AppState } from "./store.ts";

export class DocumentBrandingError extends Error {
  readonly statusCode: 400 | 403 | 404 | 409 | 428;
  constructor(message: string, statusCode: 400 | 403 | 404 | 409 | 428 = 400) {
    super(message); this.name = "DocumentBrandingError"; this.statusCode = statusCode;
  }
}

export const DOCUMENT_FAMILY_FIELDS: Record<DocumentFamily, readonly string[]> = {
  FOUNDER_COMMERCIAL_PROPOSAL: ["Client Name", "Project Name", "Report Date", "Version ID", "Consultant"],
  FOUNDER_STATUTORY_DOCUMENT: ["Client Name", "Project Name", "Report Date", "Version ID", "Document Number"],
  FOUNDER_FLOOR_REPORT: ["Client Name", "Project Name", "Floor", "Report Date", "Version ID", "Consultant"],
  VASTU_REMEDY_REPORT: ["Client Name", "Project Name", "Floor", "Report Date", "Version ID", "Consultant"]
};

export const LEGACY_BRANDING_INVENTORY = [
  { sourceKey: "OS_SHELL_LOCKUP", owningModule: "Uchit OS shell", sourceFiles: ["components/site-header.tsx", "app/layout.tsx", "app/globals.css"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "Central profile is authoritative after activation; text lockup remains a pre-activation read-only fallback." },
  { sourceKey: "FOUNDER_MEDIA_ROLE_SELECTION", owningModule: "Founder Media Library", sourceFiles: ["lib/founder-media-manifest.ts", "lib/founder-engagement.ts"], disposition: "SUPERSEDED" as const, notes: "Media lifecycle remains active; document selection by brandRole/statutoryPurpose is superseded after central activation." },
  { sourceKey: "FOUNDER_PROPOSAL_RENDERER_BRAND", owningModule: "Founder commercial proposal", sourceFiles: ["lib/commercial-document-renderer.ts", "components/commercial-proposal-client.tsx"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "Central Founder proposal template controls new artifacts; historical artifacts retain their immutable bytes." },
  { sourceKey: "FOUNDER_STATUTORY_ACTIVE_ASSETS", owningModule: "Founder statutory documents", sourceFiles: ["lib/founder-statutory-documents.ts", "lib/commercial-document-renderer.ts"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "Central statutory template controls visual branding; statutory legal identity remains module body truth." },
  { sourceKey: "FLOOR_REPORT_HTML_BRAND", owningModule: "Founder floor reports", sourceFiles: ["lib/report-html.ts", "lib/report-artifacts.ts"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "Central floor-report template is frozen into new artifacts; body renderer versions remain unchanged." },
  { sourceKey: "VASTU_REMEDY_HTML_BRAND", owningModule: "Vastu Remedy report", sourceFiles: ["lib/report-html.ts", "lib/report-artifacts.ts"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "Central Remedy template wraps the frozen A/B/C/Appendix body manifests." },
  { sourceKey: "PROTECTED_PDF_BRAND", owningModule: "Protected PDF renderer", sourceFiles: ["lib/protected-pdf-renderer.ts", "lib/final-pdf.server.ts"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "The same protected renderer consumes the immutable central snapshot; no second PDF pipeline." },
  { sourceKey: "PRECOMPOSED_FOUNDER_PDFS", owningModule: "Founder brochures and qualification", sourceFiles: ["lib/founder-media-manifest.ts", "lib/qualification-form-definitions.ts"], disposition: "RETAINED_READ_ONLY" as const, notes: "Exact checksummed source documents are not restyled and are not writable branding authorities." },
  { sourceKey: "FOUNDER_COMMUNICATION_IDENTITY_COPY", owningModule: "Founder communications", sourceFiles: ["lib/founder-communication-templates.ts"], disposition: "COMPATIBILITY_ADAPTED" as const, notes: "Communication bodies stay separate; organisation identity tokens read the central profile." },
  { sourceKey: "SUPERSEDED_ADVANCE_INVOICE_RENDERER", owningModule: "Founder commercial legacy", sourceFiles: ["lib/commercial-document-renderer.ts", "lib/founder-commercial.ts"], disposition: "RETIRED" as const, notes: "The action is already superseded by statutory issuance and is not a document family." }
] as const;

const PROFESSIONAL_DISCLAIMER = "Uchit Vastu India provides Vastu assessment, prioritised recommendations, and agreed implementation guidance. Architectural design, structural safety, building services, statutory approvals, and regulated work remain the responsibility of appropriately qualified professionals. Recommendations depend on the accuracy and completeness of supplied or verified information. This report does not guarantee financial, medical, personal, relationship, or business outcomes.";
const nowIso = (date?: Date) => (date ?? new Date()).toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function organisation(actor: AppUser) {
  if (!actor.organisationId) throw new DocumentBrandingError("An active organisation is required.", 403);
  return actor.organisationId;
}
function assertAdmin(actor: AppUser) {
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") throw new DocumentBrandingError("Brand & Document Templates requires an Admin or Super-Admin.", 403);
}
function safeText(value: unknown, label: string, max = 1000, allowEmpty = false) {
  if (typeof value !== "string") throw new DocumentBrandingError(`${label} must be text.`);
  const parsed = value.trim();
  if ((!allowEmpty && !parsed) || parsed.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(parsed)) throw new DocumentBrandingError(`${label} must be safe text up to ${max} characters.`);
  return parsed;
}
function bounded(value: unknown, label: string, min: number, max: number) {
  const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new DocumentBrandingError(`${label} must be between ${min} and ${max}.`); return parsed;
}
function expected(record: { recordVersion?: number }, supplied: unknown, label: string) {
  if (!Number.isInteger(supplied) || Number(supplied) < 0) throw new DocumentBrandingError(`The latest ${label} version is required.`, 428);
  if ((record.recordVersion ?? 0) !== Number(supplied)) throw new DocumentBrandingError(`The ${label} changed. Refresh and try again.`, 409);
}
function family(value: unknown): DocumentFamily {
  if (typeof value !== "string" || !(documentFamilies as readonly string[]).includes(value)) throw new DocumentBrandingError("Document family is not supported.");
  return value as DocumentFamily;
}
function media(state: AppState, actor: AppUser, value: unknown, required = false): BrandingMediaReference | undefined {
  if (value === undefined || value === null) { if (required) throw new DocumentBrandingError("An approved immutable image version is required."); return undefined; }
  if (!value || typeof value !== "object") throw new DocumentBrandingError("Media reference is invalid.");
  const source = value as { assetId?: unknown; assetVersionId?: unknown };
  const assetId = safeText(source.assetId, "Media asset ID", 200), assetVersionId = safeText(source.assetVersionId, "Media asset version ID", 200);
  const version = state.mediaAssetVersions.find((item) => item.id === assetVersionId && item.assetId === assetId && item.organisationId === organisation(actor)
    && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status) && ["image/png", "image/jpeg", "image/webp"].includes(item.mimeType));
  if (!version) throw new DocumentBrandingError("An approved immutable PNG, JPEG, or WebP media version is required.", 404);
  return { assetId, assetVersionId, checksumSha256: version.checksumSha256, mimeType: version.mimeType as BrandingMediaReference["mimeType"] };
}
function logo(state: AppState, actor: AppUser, value: unknown, fallback?: BrandLogoConfig): BrandLogoConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const enabled = source.enabled === undefined ? fallback?.enabled ?? false : Boolean(source.enabled);
  const resolvedMedia = source.media === undefined ? fallback?.media : media(state, actor, source.media, enabled);
  const position = (source.position ?? fallback?.position ?? "TOP_LEFT") as BrandLogoConfig["position"];
  if (!["TOP_LEFT", "TOP_CENTER", "TOP_RIGHT"].includes(position)) throw new DocumentBrandingError("Logo position is not supported.");
  return { enabled, ...(resolvedMedia ? { media: resolvedMedia } : {}), position, widthPercent: bounded(source.widthPercent ?? fallback?.widthPercent ?? 18, "Logo width", 5, 40), preserveAspectRatio: true };
}
function backdrop(state: AppState, actor: AppUser, value: unknown, fallback?: BrandBackdropConfig): BrandBackdropConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const enabled = source.enabled === undefined ? fallback?.enabled ?? false : Boolean(source.enabled);
  const resolvedMedia = source.media === undefined ? fallback?.media : media(state, actor, source.media, enabled);
  const fit = (source.fit ?? fallback?.fit ?? "FIT") as BrandBackdropConfig["fit"];
  const alignment = (source.alignment ?? fallback?.alignment ?? "CENTER") as BrandBackdropConfig["alignment"];
  const pageApplicability = (source.pageApplicability ?? fallback?.pageApplicability ?? "ALL") as BrandBackdropConfig["pageApplicability"];
  if (!["FIT", "FILL"].includes(fit) || !["LEFT", "CENTER", "RIGHT"].includes(alignment) || !["ALL", "PREFIX_SUFFIX", "BODY"].includes(pageApplicability)) throw new DocumentBrandingError("Backdrop configuration is not supported.");
  return { enabled, ...(resolvedMedia ? { media: resolvedMedia } : {}), fit, opacity: bounded(source.opacity ?? fallback?.opacity ?? 0.12, "Backdrop opacity", 0, 0.4), alignment, pageApplicability };
}
function header(value: unknown, fallback: BrandHeaderConfig): BrandHeaderConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const alignment = (source.alignment ?? fallback.alignment) as BrandHeaderConfig["alignment"];
  const size = (source.size ?? fallback.size) as BrandHeaderConfig["size"];
  if (!["LEFT", "CENTER", "RIGHT"].includes(alignment) || !["COMPACT", "STANDARD", "SPACIOUS"].includes(size)) throw new DocumentBrandingError("Header configuration is not supported.");
  return { enabled: source.enabled === undefined ? fallback.enabled : Boolean(source.enabled), showLogo: source.showLogo === undefined ? fallback.showLogo : Boolean(source.showLogo),
    showBrandName: source.showBrandName === undefined ? fallback.showBrandName : Boolean(source.showBrandName), showDocumentTitle: source.showDocumentTitle === undefined ? fallback.showDocumentTitle : Boolean(source.showDocumentTitle),
    showConsumerReferences: source.showConsumerReferences === undefined ? fallback.showConsumerReferences : Boolean(source.showConsumerReferences), divider: source.divider === undefined ? fallback.divider : Boolean(source.divider), alignment, size };
}
function footer(value: unknown, fallback: BrandFooterConfig): BrandFooterConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const alignment = (source.alignment ?? fallback.alignment) as BrandFooterConfig["alignment"];
  if (!["LEFT", "CENTER", "RIGHT"].includes(alignment)) throw new DocumentBrandingError("Footer alignment is not supported.");
  return { enabled: source.enabled === undefined ? fallback.enabled : Boolean(source.enabled), showPageNumber: source.showPageNumber === undefined ? fallback.showPageNumber : Boolean(source.showPageNumber),
    showOrganisationText: source.showOrganisationText === undefined ? fallback.showOrganisationText : Boolean(source.showOrganisationText), showContactLine: source.showContactLine === undefined ? fallback.showContactLine : Boolean(source.showContactLine),
    showConfidentialityLine: source.showConfidentialityLine === undefined ? fallback.showConfidentialityLine : Boolean(source.showConfidentialityLine), divider: source.divider === undefined ? fallback.divider : Boolean(source.divider), alignment };
}
function colours(value: unknown, fallback?: OrganisationBrandProfileRecord["colours"]) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults = fallback ?? { primary: "#111111", secondary: "#2d2d2d", accent: "#b08d57", paper: "#fffdf9", text: "#242424" };
  const parse = (key: keyof typeof defaults) => { const result = String(source[key] ?? defaults[key]).toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(result)) throw new DocumentBrandingError(`${key} must be a six-digit hex colour.`); return result; };
  return { primary: parse("primary"), secondary: parse("secondary"), accent: parse("accent"), paper: parse("paper"), text: parse("text") };
}
function textConfig(value: unknown, fallback?: BrandStandardTextConfig): BrandStandardTextConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const base = fallback ?? { organisationNote: "Founder Edition", confidentialityStatement: "Immutable protected report - authorised access only", disclaimer: PROFESSIONAL_DISCLAIMER, introductoryText: "", contactInformation: "info@uchitvastu.com | +91 91155 30756" };
  return { organisationNote: safeText(source.organisationNote ?? base.organisationNote, "Organisation note", 1200, true), confidentialityStatement: safeText(source.confidentialityStatement ?? base.confidentialityStatement, "Confidentiality statement", 1200, true),
    disclaimer: safeText(source.disclaimer ?? base.disclaimer, "Disclaimer", 5000, true), introductoryText: safeText(source.introductoryText ?? base.introductoryText, "Introductory text", 3000, true), contactInformation: safeText(source.contactInformation ?? base.contactInformation, "Contact information", 1000, true) };
}
function standardTextOverride(value: unknown, fallback: Partial<BrandStandardTextConfig> = {}) {
  if (value === undefined) return structuredClone(fallback); if (!value || typeof value !== "object") throw new DocumentBrandingError("Standard text override is invalid.");
  const source = value as Record<string, unknown>; const result: Partial<BrandStandardTextConfig> = { ...fallback };
  const limits: Record<keyof BrandStandardTextConfig, number> = { organisationNote: 1200, confidentialityStatement: 1200, disclaimer: 5000, introductoryText: 3000, contactInformation: 1000 };
  for (const key of Object.keys(limits) as Array<keyof BrandStandardTextConfig>) if (key in source) result[key] = safeText(source[key], key, limits[key], true);
  return result;
}
function pages(state: AppState, actor: AppUser, value: unknown, label: string): DocumentTemplatePageRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new DocumentBrandingError(`${label} supports at most 20 pages.`);
  const result = value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new DocumentBrandingError(`${label} page is invalid.`);
    const item = raw as Record<string, unknown>; return { id: typeof item.id === "string" && item.id ? item.id : id("template-page"), internalTitle: safeText(item.internalTitle, `${label} title`, 180), active: item.active !== false, order: index + 1, media: media(state, actor, item.media, true)! };
  });
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new DocumentBrandingError(`${label} cannot contain duplicate page IDs.`);
  return result;
}
function visibleFields(value: unknown, resolvedFamily: DocumentFamily, fallback: string[] = []) {
  const raw = value === undefined ? fallback : value;
  if (!Array.isArray(raw)) throw new DocumentBrandingError("Visible document fields must be an array.");
  const result = [...new Set(raw.map((item) => safeText(item, "Document field", 80)))];
  if (result.some((item) => !DOCUMENT_FAMILY_FIELDS[resolvedFamily].includes(item))) throw new DocumentBrandingError("Document template requested a field outside the family allowlist.");
  return result;
}
function audit(state: AppState, actor: AppUser, input: { entityType: BrandingAuditEventRecord["entityType"]; entityId: string; action: string; family?: DocumentFamily; reason: string; key: string; requestHash: string; before?: unknown; after?: unknown }) {
  const event: BrandingAuditEventRecord = { id: id("branding-audit"), organisationId: organisation(actor), createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1,
    entityType: input.entityType, entityId: input.entityId, action: input.action, ...(input.family ? { family: input.family } : {}), actorUserId: actor.id, actorRole: actor.role, reason: input.reason,
    ...(input.before === undefined ? {} : { beforeHash: deterministicContentHash(input.before) }), ...(input.after === undefined ? {} : { afterHash: deterministicContentHash(input.after) }),
    happenedAt: nowIso(), idempotencyKey: input.key, requestHash: input.requestHash };
  state.brandingAuditEvents.unshift(event); return event;
}
function replay(state: AppState, actor: AppUser, key: string, requestHash: string) {
  const existing = state.brandingAuditEvents.find((item) => item.organisationId === organisation(actor) && item.idempotencyKey === key);
  if (existing && existing.requestHash !== requestHash) throw new DocumentBrandingError("This idempotency key was already used with different branding inputs.", 409);
  return existing;
}
function activeProfile(state: AppState, organisationId: string) { return (state.organisationBrandProfiles ?? []).find((item) => item.organisationId === organisationId && item.status === "ACTIVE"); }
function profileByRecord(state: AppState, actor: AppUser, recordId: unknown) { const record = state.organisationBrandProfiles.find((item) => item.id === recordId && item.organisationId === organisation(actor)); if (!record) throw new DocumentBrandingError("Brand Profile version was not found.", 404); return record; }
function templateByRecord(state: AppState, actor: AppUser, recordId: unknown) { const record = state.documentTemplates.find((item) => item.id === recordId && item.organisationId === organisation(actor)); if (!record) throw new DocumentBrandingError("Document Template version was not found.", 404); return record; }

function defaultHeader(): BrandHeaderConfig { return { enabled: true, showLogo: false, showBrandName: true, showDocumentTitle: true, showConsumerReferences: true, divider: true, alignment: "LEFT", size: "STANDARD" }; }
function defaultFooter(): BrandFooterConfig { return { enabled: true, showPageNumber: true, showOrganisationText: false, showContactLine: false, showConfidentialityLine: true, divider: true, alignment: "LEFT" }; }
function legacyLogo(state: AppState, org: string): BrandLogoConfig {
  const version = (state.mediaAssetVersions ?? []).find((item) => item.organisationId === org && item.status === "ACTIVE" && item.approvedByActorUserId && item.brandRole === "PRIMARY_DARK_PREMIUM" && ["image/png", "image/jpeg", "image/webp"].includes(item.mimeType));
  return { enabled: Boolean(version), ...(version ? { media: { assetId: version.assetId, assetVersionId: version.id, checksumSha256: version.checksumSha256, mimeType: version.mimeType as BrandingMediaReference["mimeType"] } } : {}), position: "TOP_LEFT", widthPercent: 18, preserveAspectRatio: true };
}

export function bootstrapLegacyBranding(input: { state: AppState; actor: AppUser; idempotencyKey: unknown; expectedRecordVersion: unknown; reason?: unknown; now?: Date }) {
  assertAdmin(input.actor); const org = organisation(input.actor); const key = safeText(input.idempotencyKey, "Idempotency key", 180); const reason = safeText(input.reason ?? "Exact-equivalent legacy branding consolidation bootstrap.", "Reason", 500);
  const requestHash = deterministicContentHash({ organisationId: org, operation: "LEGACY_EQUIVALENT_BOOTSTRAP" }); const existingAudit = replay(input.state, input.actor, key, requestHash);
  if (existingAudit) return { profile: input.state.organisationBrandProfiles.find((item) => item.id === existingAudit.entityId), templates: input.state.documentTemplates.filter((item) => item.organisationId === org && item.status === "ACTIVE"), legacySources: input.state.legacyBrandingSources.filter((item) => item.organisationId === org), replayed: true as const };
  if (!Number.isInteger(input.expectedRecordVersion) || Number(input.expectedRecordVersion) !== 0) throw new DocumentBrandingError("Legacy branding bootstrap requires expectedRecordVersion 0.", 428);
  if (activeProfile(input.state, org) || input.state.documentTemplates.some((item) => item.organisationId === org)) throw new DocumentBrandingError("Central branding already exists for this organisation.", 409);
  const timestamp = nowIso(input.now); const stableProfileId = id("brand-profile"); const profile: OrganisationBrandProfileRecord = {
    id: id("brand-profile-version"), stableProfileId, organisationId: org, version: 1, status: "ACTIVE", brandDisplayName: "Uchit Vastu India", primaryLogo: legacyLogo(input.state, org),
    defaultBackdrop: { enabled: false, fit: "FIT", opacity: 0.12, alignment: "CENTER", pageApplicability: "ALL" }, defaultHeader: defaultHeader(), defaultFooter: defaultFooter(),
    contactText: "info@uchitvastu.com | +91 91155 30756", confidentialityLegalText: "Immutable protected report - authorised access only", colours: colours(undefined),
    sharedApprovedMediaVersionIds: input.state.mediaAssetVersions.filter((item) => item.organisationId === org && ["FOUNDER_APPROVED", "ACTIVE"].includes(item.status) && ["image/png", "image/jpeg", "image/webp"].includes(item.mimeType)).map((item) => item.id),
    source: "LEGACY_EQUIVALENT_BOOTSTRAP", legacySourceRefs: LEGACY_BRANDING_INVENTORY.map((item) => item.sourceKey), createdAt: timestamp, updatedAt: timestamp, activatedAt: timestamp,
    createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, activatedByActorUserId: input.actor.id, reason, idempotencyKey: key, requestHash, recordVersion: 1
  };
  input.state.organisationBrandProfiles.push(profile);
  const templates = documentFamilies.map((resolvedFamily, index): DocumentTemplateRecord => ({ id: id("document-template-version"), stableTemplateId: id("document-template"), organisationId: org, family: resolvedFamily,
    name: resolvedFamily === "FOUNDER_COMMERCIAL_PROPOSAL" ? "Founder Commercial Proposal" : resolvedFamily === "FOUNDER_STATUTORY_DOCUMENT" ? "Founder Statutory Document" : resolvedFamily === "FOUNDER_FLOOR_REPORT" ? "Founder Floor Report" : "Vastu Remedy Report",
    version: 1, status: "ACTIVE", isDefault: true, brandProfileId: stableProfileId, brandProfileVersion: profile.version, logoRule: { mode: "INHERIT" }, backdropRule: { mode: "INHERIT" },
    prefixPages: [], suffixPages: [], standardTextOverride: {}, visibleDocumentFields: [...DOCUMENT_FAMILY_FIELDS[resolvedFamily]], source: "LEGACY_EQUIVALENT_BOOTSTRAP",
    legacySourceRefs: LEGACY_BRANDING_INVENTORY.filter((item) => item.owningModule.toUpperCase().includes(resolvedFamily.includes("FOUNDER") ? "FOUNDER" : "REPORT") || item.sourceKey === "PROTECTED_PDF_BRAND").map((item) => item.sourceKey),
    createdAt: timestamp, updatedAt: timestamp, activatedAt: timestamp, effectiveAt: timestamp, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, activatedByActorUserId: input.actor.id,
    reason, idempotencyKey: `${key}:template:${index + 1}`, requestHash: deterministicContentHash({ requestHash, family: resolvedFamily }), recordVersion: 1 }));
  input.state.documentTemplates.push(...templates);
  const legacySources: LegacyBrandingSourceRecord[] = LEGACY_BRANDING_INVENTORY.map((source) => ({ id: id("legacy-branding"), organisationId: org, sourceKey: source.sourceKey, owningModule: source.owningModule,
    sourceFiles: [...source.sourceFiles], disposition: source.disposition, writable: false, centralProfileId: profile.id,
    centralTemplateId: templates.find((item) => source.owningModule.includes("proposal") ? item.family === "FOUNDER_COMMERCIAL_PROPOSAL" : source.owningModule.includes("statutory") ? item.family === "FOUNDER_STATUTORY_DOCUMENT" : source.owningModule.includes("Remedy") ? item.family === "VASTU_REMEDY_REPORT" : source.owningModule.includes("report") ? item.family === "FOUNDER_FLOOR_REPORT" : false)?.id,
    notes: source.notes, recordedAt: timestamp, recordedByActorUserId: input.actor.id, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, recordVersion: 1 }));
  input.state.legacyBrandingSources.push(...legacySources);
  audit(input.state, input.actor, { entityType: "BRAND_PROFILE", entityId: profile.id, action: "LEGACY_EQUIVALENT_BOOTSTRAP_ACTIVATE", reason, key, requestHash, after: { profile, templates, legacySources } });
  return { profile, templates, legacySources, replayed: false as const };
}

export function createBrandProfileVersion(input: { state: AppState; actor: AppUser; sourceProfileId?: unknown; profile?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; now?: Date }) {
  assertAdmin(input.actor); const org = organisation(input.actor); const key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500);
  const source = input.sourceProfileId ? profileByRecord(input.state, input.actor, input.sourceProfileId) : activeProfile(input.state, org);
  if (source) expected(source, input.expectedRecordVersion, "Brand Profile"); else if (Number(input.expectedRecordVersion) !== 0) throw new DocumentBrandingError("New Brand Profile lineage requires expectedRecordVersion 0.", 428);
  const raw = input.profile && typeof input.profile === "object" ? input.profile as Record<string, unknown> : {}; const timestamp = nowIso(input.now);
  const stableProfileId = source?.stableProfileId ?? id("brand-profile"); const version = Math.max(0, ...input.state.organisationBrandProfiles.filter((item) => item.organisationId === org && item.stableProfileId === stableProfileId).map((item) => item.version)) + 1;
  const requestHash = deterministicContentHash({ sourceProfileId: source?.id ?? null, profile: raw, version }); const prior = replay(input.state, input.actor, key, requestHash);
  if (prior) return profileByRecord(input.state, input.actor, prior.entityId);
  const created: OrganisationBrandProfileRecord = { id: id("brand-profile-version"), stableProfileId, organisationId: org, version, status: "DRAFT",
    brandDisplayName: safeText(raw.brandDisplayName ?? source?.brandDisplayName ?? "Uchit Vastu India", "Brand display name", 180), primaryLogo: logo(input.state, input.actor, raw.primaryLogo, source?.primaryLogo),
    ...(raw.secondaryLogo !== undefined || source?.secondaryLogo ? { secondaryLogo: logo(input.state, input.actor, raw.secondaryLogo, source?.secondaryLogo) } : {}),
    defaultBackdrop: backdrop(input.state, input.actor, raw.defaultBackdrop, source?.defaultBackdrop), defaultHeader: header(raw.defaultHeader, source?.defaultHeader ?? defaultHeader()), defaultFooter: footer(raw.defaultFooter, source?.defaultFooter ?? defaultFooter()),
    contactText: safeText(raw.contactText ?? source?.contactText ?? "", "Contact text", 1000, true), confidentialityLegalText: safeText(raw.confidentialityLegalText ?? source?.confidentialityLegalText ?? "", "Confidentiality/legal text", 1500, true),
    colours: colours(raw.colours, source?.colours), sharedApprovedMediaVersionIds: [...new Set([...(source?.sharedApprovedMediaVersionIds ?? []), ...[logo(input.state, input.actor, raw.primaryLogo, source?.primaryLogo).media?.assetVersionId, backdrop(input.state, input.actor, raw.defaultBackdrop, source?.defaultBackdrop).media?.assetVersionId].filter(Boolean) as string[]])],
    source: "CENTRAL_ADMIN", legacySourceRefs: source?.legacySourceRefs ?? [], createdAt: timestamp, updatedAt: timestamp, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id, reason, idempotencyKey: key, requestHash, recordVersion: 1 };
  input.state.organisationBrandProfiles.push(created); audit(input.state, input.actor, { entityType: "BRAND_PROFILE", entityId: created.id, action: source ? "CREATE_SUCCESSOR_DRAFT" : "CREATE_DRAFT", reason, key, requestHash, before: source, after: created }); return created;
}

export function updateBrandProfileDraft(input: { state: AppState; actor: AppUser; profileId: unknown; profile: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown }) {
  assertAdmin(input.actor); const record = profileByRecord(input.state, input.actor, input.profileId); expected(record, input.expectedRecordVersion, "Brand Profile"); if (record.status !== "DRAFT") throw new DocumentBrandingError("Only a Draft Brand Profile can be edited; create a new version from an Active profile.", 409);
  const before = structuredClone(record), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500); const raw = input.profile && typeof input.profile === "object" ? input.profile as Record<string, unknown> : {};
  const requestHash = deterministicContentHash({ profileId: record.id, profile: raw }); if (replay(input.state, input.actor, key, requestHash)) return record;
  record.brandDisplayName = safeText(raw.brandDisplayName ?? record.brandDisplayName, "Brand display name", 180); record.primaryLogo = logo(input.state, input.actor, raw.primaryLogo, record.primaryLogo);
  if (raw.secondaryLogo !== undefined) record.secondaryLogo = raw.secondaryLogo === null ? undefined : logo(input.state, input.actor, raw.secondaryLogo, record.secondaryLogo);
  record.defaultBackdrop = backdrop(input.state, input.actor, raw.defaultBackdrop, record.defaultBackdrop); record.defaultHeader = header(raw.defaultHeader, record.defaultHeader); record.defaultFooter = footer(raw.defaultFooter, record.defaultFooter);
  record.contactText = safeText(raw.contactText ?? record.contactText, "Contact text", 1000, true); record.confidentialityLegalText = safeText(raw.confidentialityLegalText ?? record.confidentialityLegalText, "Confidentiality/legal text", 1500, true); record.colours = colours(raw.colours, record.colours);
  record.sharedApprovedMediaVersionIds = [...new Set([record.primaryLogo.media?.assetVersionId, record.secondaryLogo?.media?.assetVersionId, record.defaultBackdrop.media?.assetVersionId].filter(Boolean) as string[])]; record.updatedAt = nowIso(); record.updatedByActorUserId = input.actor.id; record.reason = reason; record.recordVersion += 1;
  audit(input.state, input.actor, { entityType: "BRAND_PROFILE", entityId: record.id, action: "UPDATE_DRAFT", reason, key, requestHash, before, after: record }); return record;
}

export function activateBrandProfile(input: { state: AppState; actor: AppUser; profileId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; now?: Date }) {
  assertAdmin(input.actor); const record = profileByRecord(input.state, input.actor, input.profileId), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500); const requestHash = deterministicContentHash({ profileId: record.id, target: "ACTIVE" });
  if (replay(input.state, input.actor, key, requestHash)) return record; expected(record, input.expectedRecordVersion, "Brand Profile"); if (record.status !== "DRAFT") throw new DocumentBrandingError("Only a Draft Brand Profile can be activated.", 409);
  if ([record.primaryLogo.media, record.secondaryLogo?.media, record.defaultBackdrop.media].filter(Boolean).some((ref) => ref?.mimeType === "image/webp")) throw new DocumentBrandingError("Active Brand Profile print media requires approved PNG or JPEG derivatives; WebP remains available for preview only.", 409);
  const before = structuredClone(record); const timestamp = nowIso(input.now); for (const active of input.state.organisationBrandProfiles.filter((item) => item.organisationId === record.organisationId && item.status === "ACTIVE")) { active.status = "ARCHIVED"; active.archivedAt = timestamp; active.archivedByActorUserId = input.actor.id; active.updatedAt = timestamp; active.updatedByActorUserId = input.actor.id; active.recordVersion += 1; }
  record.status = "ACTIVE"; record.activatedAt = timestamp; record.activatedByActorUserId = input.actor.id; record.updatedAt = timestamp; record.updatedByActorUserId = input.actor.id; record.reason = reason; record.recordVersion += 1;
  audit(input.state, input.actor, { entityType: "BRAND_PROFILE", entityId: record.id, action: "ACTIVATE", reason, key, requestHash, before, after: record }); return record;
}

export function archiveBrandProfile(input: { state: AppState; actor: AppUser; profileId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown }) {
  assertAdmin(input.actor); const record = profileByRecord(input.state, input.actor, input.profileId), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500); const requestHash = deterministicContentHash({ profileId: record.id, target: "ARCHIVED" });
  if (replay(input.state, input.actor, key, requestHash)) return record; expected(record, input.expectedRecordVersion, "Brand Profile"); if (record.status === "ACTIVE") throw new DocumentBrandingError("Activate a successor before archiving the current Brand Profile.", 409); if (record.status === "ARCHIVED") throw new DocumentBrandingError("Brand Profile is already archived.", 409);
  const before = structuredClone(record); record.status = "ARCHIVED"; record.archivedAt = nowIso(); record.archivedByActorUserId = input.actor.id; record.updatedAt = record.archivedAt; record.updatedByActorUserId = input.actor.id; record.recordVersion += 1;
  audit(input.state, input.actor, { entityType: "BRAND_PROFILE", entityId: record.id, action: "ARCHIVE", reason, key, requestHash, before, after: record }); return record;
}

function resolveTemplateRules(state: AppState, actor: AppUser, raw: Record<string, unknown>, source?: DocumentTemplateRecord) {
  const logoRuleRaw = raw.logoRule && typeof raw.logoRule === "object" ? raw.logoRule as Record<string, unknown> : undefined; const logoMode = (logoRuleRaw?.mode ?? source?.logoRule.mode ?? "INHERIT") as DocumentTemplateRecord["logoRule"]["mode"];
  if (!["INHERIT", "HIDE", "OVERRIDE"].includes(logoMode)) throw new DocumentBrandingError("Logo inheritance rule is not supported.");
  const backdropRuleRaw = raw.backdropRule && typeof raw.backdropRule === "object" ? raw.backdropRule as Record<string, unknown> : undefined; const backdropMode = (backdropRuleRaw?.mode ?? source?.backdropRule.mode ?? "INHERIT") as DocumentTemplateRecord["backdropRule"]["mode"];
  if (!["INHERIT", "HIDE", "OVERRIDE"].includes(backdropMode)) throw new DocumentBrandingError("Backdrop inheritance rule is not supported.");
  return { logoRule: { mode: logoMode, ...(logoMode === "OVERRIDE" ? { override: logo(state, actor, logoRuleRaw?.override, source?.logoRule.override) } : {}) },
    backdropRule: { mode: backdropMode, ...(backdropMode === "OVERRIDE" ? { override: backdrop(state, actor, backdropRuleRaw?.override, source?.backdropRule.override) } : {}) } } as Pick<DocumentTemplateRecord, "logoRule" | "backdropRule">;
}

export function createDocumentTemplateVersion(input: { state: AppState; actor: AppUser; family: unknown; sourceTemplateId?: unknown; template?: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; now?: Date }) {
  assertAdmin(input.actor); const resolvedFamily = family(input.family), org = organisation(input.actor), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500);
  const source = input.sourceTemplateId ? templateByRecord(input.state, input.actor, input.sourceTemplateId) : input.state.documentTemplates.find((item) => item.organisationId === org && item.family === resolvedFamily && item.status === "ACTIVE" && item.isDefault);
  if (source && source.family !== resolvedFamily) throw new DocumentBrandingError("Template source belongs to another document family.", 409); if (source) expected(source, input.expectedRecordVersion, "Document Template"); else if (Number(input.expectedRecordVersion) !== 0) throw new DocumentBrandingError("New Document Template lineage requires expectedRecordVersion 0.", 428);
  const profile = activeProfile(input.state, org); if (!profile) throw new DocumentBrandingError("Activate an Organisation Brand Profile before creating Document Templates.", 409);
  const raw = input.template && typeof input.template === "object" ? input.template as Record<string, unknown> : {}; const stableTemplateId = source?.stableTemplateId ?? id("document-template"); const version = Math.max(0, ...input.state.documentTemplates.filter((item) => item.organisationId === org && item.stableTemplateId === stableTemplateId).map((item) => item.version)) + 1;
  const requestHash = deterministicContentHash({ family: resolvedFamily, sourceTemplateId: source?.id ?? null, template: raw, version }); const prior = replay(input.state, input.actor, key, requestHash); if (prior) return templateByRecord(input.state, input.actor, prior.entityId);
  const rules = resolveTemplateRules(input.state, input.actor, raw, source), timestamp = nowIso(input.now); const standardSource = raw.standardTextOverride && typeof raw.standardTextOverride === "object" ? raw.standardTextOverride as Record<string, unknown> : source?.standardTextOverride ?? {};
  const created: DocumentTemplateRecord = { id: id("document-template-version"), stableTemplateId, organisationId: org, family: resolvedFamily, name: safeText(raw.name ?? source?.name ?? resolvedFamily.replaceAll("_", " "), "Template name", 180), version, status: "DRAFT", isDefault: raw.isDefault === undefined ? source?.isDefault ?? true : Boolean(raw.isDefault),
    brandProfileId: profile.stableProfileId, brandProfileVersion: profile.version, ...rules, ...(raw.headerOverride !== undefined ? { headerOverride: header(raw.headerOverride, source?.headerOverride ? header(source.headerOverride, profile.defaultHeader) : profile.defaultHeader) } : source?.headerOverride ? { headerOverride: structuredClone(source.headerOverride) } : {}),
    ...(raw.footerOverride !== undefined ? { footerOverride: footer(raw.footerOverride, source?.footerOverride ? footer(source.footerOverride, profile.defaultFooter) : profile.defaultFooter) } : source?.footerOverride ? { footerOverride: structuredClone(source.footerOverride) } : {}),
    prefixPages: raw.prefixPages === undefined ? structuredClone(source?.prefixPages ?? []) : pages(input.state, input.actor, raw.prefixPages, "Prefix pages"), suffixPages: raw.suffixPages === undefined ? structuredClone(source?.suffixPages ?? []) : pages(input.state, input.actor, raw.suffixPages, "Ending pages"),
    standardTextOverride: standardTextOverride(standardSource, source?.standardTextOverride), visibleDocumentFields: visibleFields(raw.visibleDocumentFields, resolvedFamily, source?.visibleDocumentFields ?? [...DOCUMENT_FAMILY_FIELDS[resolvedFamily]]),
    source: "CENTRAL_ADMIN", legacySourceRefs: source?.legacySourceRefs ?? [], createdAt: timestamp, updatedAt: timestamp, createdByActorUserId: input.actor.id, updatedByActorUserId: input.actor.id,
    reason, idempotencyKey: key, requestHash, recordVersion: 1 };
  input.state.documentTemplates.push(created); audit(input.state, input.actor, { entityType: "DOCUMENT_TEMPLATE", entityId: created.id, action: source ? "CREATE_SUCCESSOR_DRAFT" : "CREATE_DRAFT", family: resolvedFamily, reason, key, requestHash, before: source, after: created }); return created;
}

export function updateDocumentTemplateDraft(input: { state: AppState; actor: AppUser; templateId: unknown; template: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown }) {
  assertAdmin(input.actor); const record = templateByRecord(input.state, input.actor, input.templateId); expected(record, input.expectedRecordVersion, "Document Template"); if (record.status !== "DRAFT") throw new DocumentBrandingError("Only a Draft Document Template can be edited; create a successor version from an Active template.", 409);
  const profile = activeProfile(input.state, organisation(input.actor)); if (!profile) throw new DocumentBrandingError("An Active Brand Profile is required.", 409); const raw = input.template && typeof input.template === "object" ? input.template as Record<string, unknown> : {};
  const before = structuredClone(record), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500), requestHash = deterministicContentHash({ templateId: record.id, template: raw }); if (replay(input.state, input.actor, key, requestHash)) return record;
  const rules = resolveTemplateRules(input.state, input.actor, raw, record); record.name = safeText(raw.name ?? record.name, "Template name", 180); record.isDefault = raw.isDefault === undefined ? record.isDefault : Boolean(raw.isDefault); record.logoRule = rules.logoRule; record.backdropRule = rules.backdropRule;
  if (raw.headerOverride !== undefined) record.headerOverride = raw.headerOverride === null ? undefined : header(raw.headerOverride, record.headerOverride ? header(record.headerOverride, profile.defaultHeader) : profile.defaultHeader);
  if (raw.footerOverride !== undefined) record.footerOverride = raw.footerOverride === null ? undefined : footer(raw.footerOverride, record.footerOverride ? footer(record.footerOverride, profile.defaultFooter) : profile.defaultFooter);
  if (raw.prefixPages !== undefined) record.prefixPages = pages(input.state, input.actor, raw.prefixPages, "Prefix pages"); if (raw.suffixPages !== undefined) record.suffixPages = pages(input.state, input.actor, raw.suffixPages, "Ending pages");
  if (raw.standardTextOverride !== undefined) record.standardTextOverride = standardTextOverride(raw.standardTextOverride, record.standardTextOverride); if (raw.visibleDocumentFields !== undefined) record.visibleDocumentFields = visibleFields(raw.visibleDocumentFields, record.family, record.visibleDocumentFields);
  record.updatedAt = nowIso(); record.updatedByActorUserId = input.actor.id; record.reason = reason; record.recordVersion += 1; audit(input.state, input.actor, { entityType: "DOCUMENT_TEMPLATE", entityId: record.id, action: "UPDATE_DRAFT", family: record.family, reason, key, requestHash, before, after: record }); return record;
}

export function activateDocumentTemplate(input: { state: AppState; actor: AppUser; templateId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown; now?: Date }) {
  assertAdmin(input.actor); const record = templateByRecord(input.state, input.actor, input.templateId), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500), requestHash = deterministicContentHash({ templateId: record.id, target: "ACTIVE_DEFAULT" }); if (replay(input.state, input.actor, key, requestHash)) return record;
  expected(record, input.expectedRecordVersion, "Document Template"); if (record.status !== "DRAFT") throw new DocumentBrandingError("Only a Draft Document Template can be activated.", 409); const profile = activeProfile(input.state, organisation(input.actor)); if (!profile || profile.stableProfileId !== record.brandProfileId) throw new DocumentBrandingError("Template inheritance does not resolve to the Active Brand Profile.", 409);
  const mediaRefs = [record.logoRule.override?.media, record.backdropRule.override?.media, ...record.prefixPages.map((item) => item.media), ...record.suffixPages.map((item) => item.media)].filter(Boolean) as BrandingMediaReference[];
  for (const ref of mediaRefs) { media(input.state, input.actor, ref, true); if (ref.mimeType === "image/webp") throw new DocumentBrandingError("Active document templates require approved PNG or JPEG print derivatives; WebP remains available for preview only.", 409); } const before = structuredClone(record), timestamp = nowIso(input.now);
  for (const active of input.state.documentTemplates.filter((item) => item.organisationId === record.organisationId && item.family === record.family && item.status === "ACTIVE" && item.isDefault)) { active.status = "ARCHIVED"; active.archivedAt = timestamp; active.archivedByActorUserId = input.actor.id; active.updatedAt = timestamp; active.updatedByActorUserId = input.actor.id; active.recordVersion += 1; }
  record.status = "ACTIVE"; record.isDefault = true; record.brandProfileVersion = profile.version; record.activatedAt = timestamp; record.effectiveAt = timestamp; record.activatedByActorUserId = input.actor.id; record.updatedAt = timestamp; record.updatedByActorUserId = input.actor.id; record.reason = reason; record.recordVersion += 1;
  audit(input.state, input.actor, { entityType: "DOCUMENT_TEMPLATE", entityId: record.id, action: "ACTIVATE_DEFAULT", family: record.family, reason, key, requestHash, before, after: record }); return record;
}

export function archiveDocumentTemplate(input: { state: AppState; actor: AppUser; templateId: unknown; reason: unknown; idempotencyKey: unknown; expectedRecordVersion: unknown }) {
  assertAdmin(input.actor); const record = templateByRecord(input.state, input.actor, input.templateId), key = safeText(input.idempotencyKey, "Idempotency key", 180), reason = safeText(input.reason, "Reason", 500), requestHash = deterministicContentHash({ templateId: record.id, target: "ARCHIVED" }); if (replay(input.state, input.actor, key, requestHash)) return record;
  expected(record, input.expectedRecordVersion, "Document Template"); if (record.status === "ACTIVE") throw new DocumentBrandingError("Activate a successor default before archiving the current template.", 409); if (record.status === "ARCHIVED") throw new DocumentBrandingError("Document Template is already archived.", 409);
  const before = structuredClone(record); record.status = "ARCHIVED"; record.archivedAt = nowIso(); record.archivedByActorUserId = input.actor.id; record.updatedAt = record.archivedAt; record.updatedByActorUserId = input.actor.id; record.recordVersion += 1;
  audit(input.state, input.actor, { entityType: "DOCUMENT_TEMPLATE", entityId: record.id, action: "ARCHIVE", family: record.family, reason, key, requestHash, before, after: record }); return record;
}

function legacySnapshot(state: AppState, organisationId: string, resolvedFamily: DocumentFamily, documentFields: Record<string, string>): DocumentTemplateSnapshot {
  const primaryLogo = legacyLogo(state, organisationId), base = { schemaVersion: "document-template-snapshot/v1" as const, source: "LEGACY_COMPATIBILITY" as const, organisationId, family: resolvedFamily,
    brandProfile: { id: "legacy-read-only-brand", stableProfileId: "legacy-read-only-brand", version: 1 }, documentTemplate: { id: `legacy-read-only-${resolvedFamily.toLowerCase()}`, stableTemplateId: `legacy-read-only-${resolvedFamily.toLowerCase()}`, version: 1, name: `Legacy ${resolvedFamily.replaceAll("_", " ")}` },
    brandDisplayName: "Uchit Vastu India", logo: primaryLogo, backdrop: { enabled: false, fit: "FIT" as const, opacity: 0.12, alignment: "CENTER" as const, pageApplicability: "ALL" as const }, header: defaultHeader(), footer: defaultFooter(), colours: colours(undefined), prefixPages: [], suffixPages: [], standardText: textConfig(undefined), documentFields };
  return { ...base, snapshotHash: deterministicContentHash(base) };
}

export function resolveDocumentTemplateSnapshot(state: AppState, input: { organisationId: string; family: DocumentFamily; documentFields?: Record<string, string> }): DocumentTemplateSnapshot {
  const allowed = DOCUMENT_FAMILY_FIELDS[input.family]; const fields = Object.fromEntries(Object.entries(input.documentFields ?? {}).filter(([key, value]) => allowed.includes(key) && typeof value === "string").sort(([a], [b]) => a.localeCompare(b)));
  const profile = activeProfile(state, input.organisationId); const template = (state.documentTemplates ?? []).find((item) => item.organisationId === input.organisationId && item.family === input.family && item.status === "ACTIVE" && item.isDefault);
  if (!profile || !template) return legacySnapshot(state, input.organisationId, input.family, fields);
  if (template.brandProfileId !== profile.stableProfileId) throw new DocumentBrandingError("Active Document Template has invalid Brand Profile inheritance.", 409);
  const inheritedText = textConfig({ organisationNote: "Founder Edition", confidentialityStatement: profile.confidentialityLegalText, disclaimer: PROFESSIONAL_DISCLAIMER, introductoryText: "", contactInformation: profile.contactText });
  const logoResolved: BrandLogoConfig = template.logoRule.mode === "HIDE" ? { ...profile.primaryLogo, enabled: false } : template.logoRule.mode === "OVERRIDE" ? template.logoRule.override! : profile.primaryLogo;
  const backdropResolved: BrandBackdropConfig = template.backdropRule.mode === "HIDE" ? { ...profile.defaultBackdrop, enabled: false } : template.backdropRule.mode === "OVERRIDE" ? template.backdropRule.override! : profile.defaultBackdrop;
  const selectedFields = Object.fromEntries(Object.entries(fields).filter(([key]) => template.visibleDocumentFields.includes(key)));
  const base = { schemaVersion: "document-template-snapshot/v1" as const, source: "CENTRAL" as const, organisationId: input.organisationId, family: input.family,
    brandProfile: { id: profile.id, stableProfileId: profile.stableProfileId, version: profile.version }, documentTemplate: { id: template.id, stableTemplateId: template.stableTemplateId, version: template.version, name: template.name },
    brandDisplayName: profile.brandDisplayName, logo: structuredClone(logoResolved), ...(profile.secondaryLogo ? { secondaryLogo: structuredClone(profile.secondaryLogo) } : {}), backdrop: structuredClone(backdropResolved),
    header: header(template.headerOverride, profile.defaultHeader), footer: footer(template.footerOverride, profile.defaultFooter), colours: structuredClone(profile.colours),
    prefixPages: structuredClone(template.prefixPages.filter((item) => item.active).sort((a, b) => a.order - b.order)), suffixPages: structuredClone(template.suffixPages.filter((item) => item.active).sort((a, b) => a.order - b.order)),
    standardText: textConfig(template.standardTextOverride, inheritedText), documentFields: selectedFields };
  return { ...base, snapshotHash: deterministicContentHash(base) };
}

export function projectBrandingHealth(state: AppState, organisationId: string) {
  const issues: Array<{ code: string; severity: "ERROR" | "WARNING"; message: string; family?: DocumentFamily }> = [];
  const profiles = state.organisationBrandProfiles.filter((item) => item.organisationId === organisationId && item.status === "ACTIVE");
  if (!profiles.length) issues.push({ code: "NO_ACTIVE_BRAND_PROFILE", severity: "ERROR", message: "No Active Organisation Brand Profile exists." });
  if (profiles.length > 1) issues.push({ code: "MULTIPLE_ACTIVE_BRAND_PROFILES", severity: "ERROR", message: "Multiple Active Organisation Brand Profiles exist." });
  for (const resolvedFamily of documentFamilies) {
    const templates = state.documentTemplates.filter((item) => item.organisationId === organisationId && item.family === resolvedFamily && item.status === "ACTIVE" && item.isDefault);
    if (!templates.length) issues.push({ code: "MISSING_ACTIVE_TEMPLATE", severity: "ERROR", family: resolvedFamily, message: `No Active default template exists for ${resolvedFamily}.` });
    if (templates.length > 1) issues.push({ code: "MULTIPLE_ACTIVE_DEFAULT_TEMPLATES", severity: "ERROR", family: resolvedFamily, message: `Multiple Active default templates exist for ${resolvedFamily}.` });
    for (const template of templates) {
      if (profiles[0] && template.brandProfileId !== profiles[0].stableProfileId) issues.push({ code: "INVALID_INHERITANCE", severity: "ERROR", family: resolvedFamily, message: "Template does not inherit from the Active Brand Profile lineage." });
      for (const [kind, ref] of [["logo", template.logoRule.override?.media], ["background", template.backdropRule.override?.media], ...template.prefixPages.map((item) => ["prefix", item.media]), ...template.suffixPages.map((item) => ["suffix", item.media])] as Array<[string, BrandingMediaReference | undefined]>) {
        if (!ref) continue; const version = state.mediaAssetVersions.find((item) => item.organisationId === organisationId && item.id === ref.assetVersionId && item.assetId === ref.assetId && item.checksumSha256 === ref.checksumSha256);
        if (!version) issues.push({ code: `BROKEN_${kind.toUpperCase()}_MEDIA`, severity: "ERROR", family: resolvedFamily, message: `Template references missing ${kind} media.` });
        else if (["ARCHIVED", "SUPERSEDED"].includes(version.status)) issues.push({ code: "ARCHIVED_MEDIA_ON_ACTIVE_TEMPLATE", severity: "ERROR", family: resolvedFamily, message: `Active template references ${version.status.toLowerCase()} media.` });
        else if (version.mimeType === "image/webp") issues.push({ code: "PRINT_DERIVATIVE_REQUIRED", severity: "ERROR", family: resolvedFamily, message: `Active template ${kind} media requires an approved PNG or JPEG print derivative.` });
      }
      const missingFields = template.visibleDocumentFields.filter((field) => !DOCUMENT_FAMILY_FIELDS[resolvedFamily].includes(field)); if (missingFields.length) issues.push({ code: "INVALID_DOCUMENT_FAMILY_FIELD", severity: "ERROR", family: resolvedFamily, message: `Template contains unsupported fields: ${missingFields.join(", ")}.` });
    }
  }
  const legacy = state.legacyBrandingSources.filter((item) => item.organisationId === organisationId); if (profiles.length && legacy.some((item) => item.writable)) issues.push({ code: "LEGACY_BRANDING_WRITE_ACTIVE", severity: "ERROR", message: "A superseded legacy branding source is still writable." });
  return { status: issues.some((item) => item.severity === "ERROR") ? "BLOCKED" as const : "HEALTHY" as const, issues, activeProfile: profiles[0], activeTemplates: state.documentTemplates.filter((item) => item.organisationId === organisationId && item.status === "ACTIVE" && item.isDefault), legacySources: legacy };
}

export function rejectLegacyBrandingWrite(state: AppState, organisationId: string, sourceKey: string): never {
  if (activeProfile(state, organisationId)) throw new DocumentBrandingError(`Legacy branding source ${sourceKey} is superseded and read-only after central activation.`, 409);
  throw new DocumentBrandingError(`Legacy branding source ${sourceKey} is read-only; use Brand & Document Templates.`, 409);
}

export function activeBrandProjection(state: AppState, organisationId: string) {
  const profile = activeProfile(state, organisationId); return profile ? { displayName: profile.brandDisplayName, colours: profile.colours, logo: profile.primaryLogo, source: "CENTRAL" as const } : { displayName: "Uchit Vastu India", colours: colours(undefined), logo: legacyLogo(state, organisationId), source: "LEGACY_COMPATIBILITY" as const };
}
