import type { DocumentFamily, DocumentTemplatePageRecord, DocumentTemplateSnapshot } from "./domain.ts";
import type { ProtectedPdfBrandingImage } from "./protected-pdf-renderer.ts";
import type { AppState } from "./store.ts";

export interface FounderTemplateMediaReader {
  readImmutable(key: string): Promise<Uint8Array | undefined>;
}

export type FounderTemplateMediaPages = {
  prefixPages: ProtectedPdfBrandingImage[];
  suffixPages: ProtectedPdfBrandingImage[];
};

function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function orderedActivePages(pages: DocumentTemplatePageRecord[], placement: string) {
  const active = pages.filter((page) => page.active).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const orders = new Set<number>();
  for (const page of active) {
    if (!Number.isSafeInteger(page.order) || page.order < 1 || orders.has(page.order)) fail(409, `${placement} page order is invalid in the frozen document-template snapshot.`);
    orders.add(page.order);
  }
  return active;
}

async function readPage(input: {
  state: AppState;
  organisationId: string;
  page: DocumentTemplatePageRecord;
  reader: FounderTemplateMediaReader;
  placement: string;
}): Promise<ProtectedPdfBrandingImage> {
  const reference = input.page.media;
  if (reference.mimeType !== "image/png" && reference.mimeType !== "image/jpeg") fail(409, `${input.placement} page ${input.page.internalTitle} must use its frozen PNG or JPEG print asset.`);
  const version = input.state.mediaAssetVersions.find((item) => item.id === reference.assetVersionId
    && item.assetId === reference.assetId && item.organisationId === input.organisationId);
  if (!version || version.checksumSha256 !== reference.checksumSha256 || version.mimeType !== reference.mimeType) {
    fail(409, `${input.placement} page ${input.page.internalTitle} no longer matches its frozen media version.`);
  }
  const bytes = await input.reader.readImmutable(version.privateObjectKey);
  if (!bytes) fail(503, `${input.placement} page ${input.page.internalTitle} is unavailable from immutable private storage.`);
  const actualHash = await sha256(bytes);
  if (actualHash !== reference.checksumSha256) fail(409, `${input.placement} page ${input.page.internalTitle} failed its frozen SHA-256 check.`);
  return { bytes: bytes.slice(), mimeType: reference.mimeType, checksumSha256: reference.checksumSha256,
    title: input.page.internalTitle, assetVersionId: reference.assetVersionId };
}

export async function loadFounderTemplateMedia(input: {
  state: AppState;
  organisationId: string;
  expectedFamily: Extract<DocumentFamily, "FOUNDER_COMMERCIAL_PROPOSAL" | "FOUNDER_STATUTORY_DOCUMENT">;
  snapshot?: DocumentTemplateSnapshot;
  reader: FounderTemplateMediaReader;
}): Promise<FounderTemplateMediaPages> {
  if (!input.snapshot) return { prefixPages: [], suffixPages: [] };
  if (input.snapshot.schemaVersion !== "document-template-snapshot/v1" || input.snapshot.source !== "CENTRAL"
    || input.snapshot.organisationId !== input.organisationId || input.snapshot.family !== input.expectedFamily) {
    fail(409, "The Founder document-template snapshot does not match this organisation and document family.");
  }
  const prefix = orderedActivePages(input.snapshot.prefixPages, "Prefix");
  const suffix = orderedActivePages(input.snapshot.suffixPages, "Suffix");
  return {
    prefixPages: await Promise.all(prefix.map((page) => readPage({ ...input, page, placement: "Prefix" }))),
    suffixPages: await Promise.all(suffix.map((page) => readPage({ ...input, page, placement: "Suffix" })))
  };
}
