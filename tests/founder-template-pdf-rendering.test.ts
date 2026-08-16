import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentTemplatePageRecord, DocumentTemplateSnapshot, MediaAssetVersionRecord } from "../lib/domain.ts";
import { renderCommercialProposalPdf, type FounderProposalClientProjection } from "../lib/commercial-document-renderer.ts";
import { InMemoryCommercialArtifactStore } from "../lib/founder-commercial.ts";
import { loadFounderTemplateMedia } from "../lib/founder-template-media.ts";
import { renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { createEmptyAppState } from "../lib/store.ts";

const organisationId = "org-founder-template-pdf";
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));
const jpeg = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=", "base64"));
const sha = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const pdfText = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const pdfPageCount = (bytes: Uint8Array) => (pdfText(bytes).match(/\/Type \/Page\b/g) ?? []).length;

const projection: FounderProposalClientProjection = {
  proposalVersion: 4, proposalHash: "proposal-hash-v4", client: { name: "Synthetic Client", permanentClientId: "UC-SYNTH" },
  project: { kind: "RESIDENTIAL", serviceType: "EXISTING_SPACE", propertyLocation: "Synthetic House" }, requirements: { exactQualificationVersion: "qualification-v1" },
  scopeItems: [{ order: 1, title: "Existing-space consultation", status: "INCLUDED", floorIds: ["floor-ground"] }],
  deliverables: [{ order: 1, name: "Founder report", status: "INCLUDED", floorIds: ["floor-ground"], deliveryFormat: "Protected PDF", expectedStage: "Final", description: "Synthetic", clientDependency: "Plan" }],
  interactions: { includedReviewRounds: 1, includedPresentationCalls: 1, clarificationPeriodDays: 7, expectedResponseTime: "Two days", additionalInteractionTreatment: "Successor scope" },
  timeline: { expectedCommencement: "After clearance", estimatedDateRange: "Synthetic range", milestones: ["Review"], prerequisites: ["Approval"], clientDependencies: ["Plan"], pauseOrExtensionConditions: ["Missing evidence"], isEstimate: true },
  commercial: { professionalFeePaise: 100_000, gstAppliedBasisPoints: 1_800, gstAmountPaise: 18_000, totalPayablePaise: 118_000, agreedAdvancePaise: 50_000, remainingBalancePaise: 68_000, paymentMilestones: [] },
  professionalBoundaries: "Existing Founder professional boundaries.", projectExclusions: [], cancellationRefundDelayPolicy: "Existing Founder cancellation policy.",
  validityEndsAt: "2026-09-01T00:00:00.000Z", postAcceptanceSequence: ["Acknowledge acceptance."]
};

function page(id: string, order: number, checksumSha256: string, mimeType: "image/png" | "image/jpeg", active = true): DocumentTemplatePageRecord {
  return { id: `page-${id}`, internalTitle: `Page ${id}`, active, order, media: { assetId: `asset-${id}`, assetVersionId: id, checksumSha256, mimeType } };
}

function snapshot(prefixPages: DocumentTemplatePageRecord[], suffixPages: DocumentTemplatePageRecord[]): DocumentTemplateSnapshot {
  return { schemaVersion: "document-template-snapshot/v1", source: "CENTRAL", organisationId, family: "FOUNDER_COMMERCIAL_PROPOSAL",
    brandProfile: { id: "brand-v1", stableProfileId: "brand", version: 1 }, documentTemplate: { id: "template-v1", stableTemplateId: "template", version: 1, name: "Founder Proposal" },
    brandDisplayName: "Uchit Vastu Test", logo: { enabled: false, position: "TOP_LEFT", widthPercent: 18, preserveAspectRatio: true },
    backdrop: { enabled: false, fit: "FIT", opacity: 0.1, alignment: "CENTER", pageApplicability: "ALL" },
    header: { enabled: true, showLogo: false, showBrandName: true, showDocumentTitle: true, showConsumerReferences: true, divider: true, alignment: "LEFT", size: "STANDARD" },
    footer: { enabled: true, showPageNumber: true, showOrganisationText: true, showContactLine: true, showConfidentialityLine: true, divider: true, alignment: "CENTER" },
    colours: { primary: "#111111", secondary: "#222222", accent: "#b08245", paper: "#ffffff", text: "#111111" }, prefixPages, suffixPages,
    standardText: { organisationNote: "", confidentialityStatement: "Confidential", disclaimer: "", introductoryText: "", contactInformation: "" }, documentFields: {}, snapshotHash: "f".repeat(64) };
}

async function fixture(prefix: Array<{ id: string; order: number; bytes: Uint8Array; active?: boolean }>, suffix: Array<{ id: string; order: number; bytes: Uint8Array; active?: boolean }>) {
  const state = createEmptyAppState(); const store = new InMemoryCommercialArtifactStore();
  const make = async (item: { id: string; order: number; bytes: Uint8Array; active?: boolean }, mimeType: "image/png" | "image/jpeg") => {
    const checksum = await sha(item.bytes); const record: MediaAssetVersionRecord = { id: item.id, assetId: `asset-${item.id}`, version: 1, filename: `${item.id}.${mimeType === "image/png" ? "png" : "jpg"}`,
      privateObjectKey: `media/${item.id}`, mimeType, sizeBytes: item.bytes.length, checksumSha256: checksum, pageCount: 1, status: "FOUNDER_APPROVED", clientSendable: false,
      uploadedByActorUserId: "founder", uploadedAt: "2026-08-14T00:00:00.000Z", approvedByActorUserId: "founder", approvedAt: "2026-08-14T00:00:00.000Z", reason: "Synthetic", registrationHash: `registration-${item.id}`, organisationId, recordVersion: 1 };
    state.mediaAssetVersions.push(record); store.objects.set(record.privateObjectKey, item.bytes.slice()); return page(item.id, item.order, checksum, mimeType, item.active ?? true);
  };
  const prefixPages = await Promise.all(prefix.map((item) => make(item, "image/png")));
  const suffixPages = await Promise.all(suffix.map((item) => make(item, "image/jpeg")));
  const frozen = snapshot(prefixPages, suffixPages); const before = structuredClone(frozen);
  const media = await loadFounderTemplateMedia({ state, organisationId, expectedFamily: "FOUNDER_COMMERCIAL_PROPOSAL", snapshot: frozen, reader: store });
  assert.deepEqual(frozen, before, "media resolution must not mutate the frozen snapshot");
  return { state, store, frozen, media };
}

test("01 one prefix, unchanged Founder body, and one suffix render as three physical pages", async () => {
  const { frozen, media } = await fixture([{ id: "prefix-v1", order: 1, bytes: png }], [{ id: "suffix-v1", order: 1, bytes: jpeg }]);
  const bytes = await renderCommercialProposalPdf(projection, frozen, media); const text = pdfText(bytes);
  assert.equal(pdfPageCount(bytes), 3); assert.match(text, /PREFIX \/ prefix-v1/); assert.match(text, /COMMERCIAL PROPOSAL/); assert.match(text, /SUFFIX \/ suffix-v1/);
  assert.ok(text.indexOf("PREFIX / prefix-v1") < text.indexOf("COMMERCIAL PROPOSAL")); assert.ok(text.indexOf("COMMERCIAL PROPOSAL") < text.indexOf("SUFFIX / suffix-v1"));
});

test("02 multiple prefix and suffix pages follow frozen order", async () => {
  const { frozen, media } = await fixture([{ id: "prefix-2", order: 2, bytes: png }, { id: "prefix-1", order: 1, bytes: png }],
    [{ id: "suffix-2", order: 2, bytes: jpeg }, { id: "suffix-1", order: 1, bytes: jpeg }]);
  const text = pdfText(await renderCommercialProposalPdf(projection, frozen, media));
  assert.equal(pdfPageCount(new TextEncoder().encode(text)), 5);
  for (const [before, after] of [["prefix-1", "prefix-2"], ["prefix-2", "COMMERCIAL PROPOSAL"], ["COMMERCIAL PROPOSAL", "suffix-1"], ["suffix-1", "suffix-2"]]) assert.ok(text.indexOf(before) < text.indexOf(after));
});

test("03 inactive pages are excluded from reads and output", async () => {
  const { frozen, media } = await fixture([{ id: "prefix-active", order: 1, bytes: png }, { id: "prefix-inactive", order: 2, bytes: png, active: false }], []);
  const bytes = await renderCommercialProposalPdf(projection, frozen, media); assert.equal(media.prefixPages.length, 1); assert.equal(pdfPageCount(bytes), 2); assert.doesNotMatch(pdfText(bytes), /prefix-inactive/);
});

test("04 exact snapshotted version and checksum are used even when another asset version exists", async () => {
  const result = await fixture([{ id: "prefix-exact-v1", order: 1, bytes: png }], []); const otherHash = await sha(jpeg);
  result.state.mediaAssetVersions.push({ ...result.state.mediaAssetVersions[0], id: "prefix-other-v2", version: 2, checksumSha256: otherHash, mimeType: "image/jpeg", privateObjectKey: "media/prefix-other-v2" });
  result.store.objects.set("media/prefix-other-v2", jpeg);
  const reloaded = await loadFounderTemplateMedia({ state: result.state, organisationId, expectedFamily: "FOUNDER_COMMERCIAL_PROPOSAL", snapshot: result.frozen, reader: result.store });
  assert.deepEqual(reloaded.prefixPages[0].bytes, png); assert.equal(reloaded.prefixPages[0].assetVersionId, "prefix-exact-v1");
});

test("05 missing and corrupt immutable media fail before PDF output", async () => {
  const missing = await fixture([{ id: "missing-v1", order: 1, bytes: png }], []); missing.store.objects.delete("media/missing-v1");
  await assert.rejects(loadFounderTemplateMedia({ state: missing.state, organisationId, expectedFamily: "FOUNDER_COMMERCIAL_PROPOSAL", snapshot: missing.frozen, reader: missing.store }), /unavailable from immutable private storage/);
  const corrupt = await fixture([{ id: "corrupt-v1", order: 1, bytes: png }], []); corrupt.store.objects.set("media/corrupt-v1", jpeg);
  await assert.rejects(loadFounderTemplateMedia({ state: corrupt.state, organisationId, expectedFamily: "FOUNDER_COMMERCIAL_PROPOSAL", snapshot: corrupt.frozen, reader: corrupt.store }), /failed its frozen SHA-256 check/);
});

test("06 legacy Founder body-only rendering remains byte-for-byte deterministic", async () => {
  const first = await renderCommercialProposalPdf(projection); const second = await renderCommercialProposalPdf(projection);
  assert.deepEqual(first, second); assert.equal(pdfPageCount(first), 1); assert.equal(await sha(first), "127cf864b9b84272e22c9224be3ac98c80eb98c378f59b25d0a6bac810b6a094");
});

test("07 new frozen template output and hash are deterministic", async () => {
  const { frozen, media } = await fixture([{ id: "det-prefix", order: 1, bytes: png }], [{ id: "det-suffix", order: 1, bytes: jpeg }]);
  const first = await renderCommercialProposalPdf(projection, frozen, media); const second = await renderCommercialProposalPdf(projection, structuredClone(frozen), media);
  assert.deepEqual(first, second); assert.equal(await sha(first), await sha(second));
});

test("08 floor and Remedy protected-PDF behavior remains deterministic and unchanged", async () => {
  const input = { reportVersionId: "report-v5", sourceSnapshotHash: "a".repeat(64), html: "<h1>Frozen A B C report body</h1>", ownerSecret: "owner-secret-for-tests-32-characters-minimum",
    evidence: { bytes: new Uint8Array([1, 2, 3]), fileName: "plan.png", mimeType: "image/png", checksumSha256: "b".repeat(64) } };
  const first = await renderProtectedPdf(input); const second = await renderProtectedPdf(input); assert.deepEqual(first, second); assert.equal(first.pageCount, 1);
});

test("09 wrong organisation or Founder family cannot read frozen media", async () => {
  const { state, store, frozen } = await fixture([{ id: "scope-prefix", order: 1, bytes: png }], []);
  await assert.rejects(loadFounderTemplateMedia({ state, organisationId: "org-other", expectedFamily: "FOUNDER_COMMERCIAL_PROPOSAL", snapshot: frozen, reader: store }), /does not match this organisation/);
  await assert.rejects(loadFounderTemplateMedia({ state, organisationId, expectedFamily: "FOUNDER_STATUTORY_DOCUMENT", snapshot: frozen, reader: store }), /does not match this organisation/);
});
