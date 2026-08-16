import assert from "node:assert/strict";
import test from "node:test";
import type { AppUser } from "../lib/domain.ts";
import { inspectProtectedPdf, renderProtectedPdf } from "../lib/protected-pdf-renderer.ts";
import { exportRepositoryCsv, repositoryHealth } from "../lib/repository-admin.ts";
import { createEmptyAppState } from "../lib/store.ts";

const actor: AppUser = { id: "performance-admin", fullName: "Performance Admin", email: "performance@example.test", role: "ADMIN", color: "#111", organisationId: "org-performance" };
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));

test("bounded production smoke renders a large protected report and lists 500 repository records", async (context) => {
  const checksum = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", png))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const rows = Array.from({ length: 240 }, (_, index) => `<tr><td>${index + 1}</td><td>Governed placement ${index + 1}</td><td>Floor reference ${(index % 12) + 1}</td></tr>`).join("");
  const html = `<h1>Large valid A→B→C report</h1><table><thead><tr><th>No.</th><th>Item</th><th>Location</th></tr></thead><tbody>${rows}</tbody></table>`;
  const image = (id: string, title: string) => ({ bytes: png, mimeType: "image/png" as const, checksumSha256: checksum, title, assetVersionId: id });
  const startedPdf = performance.now();
  const rendered = await renderProtectedPdf({ reportVersionId: "report-performance", sourceSnapshotHash: "a".repeat(64), html,
    evidence: { bytes: png, fileName: "existing-layout.png", mimeType: "image/png", checksumSha256: checksum, role: "PLAN_AUTHENTICATION" },
    ownerSecret: "owner-secret-performance-32-characters-minimum", branding: { snapshotHash: "snapshot-performance", displayName: "Uchit Vastu India",
      headerText: "Final Vastu Remedy Report", footerText: "Private · authorised access only", accentHex: "#b08245",
      prefixPages: [image("prefix-1", "Introduction"), image("prefix-2", "Client context")], suffixPages: [image("suffix-1", "Implementation note"), image("suffix-2", "Closing")] } });
  const pdfDurationMs = performance.now() - startedPdf; const inspection = inspectProtectedPdf(rendered.bytes);
  assert.equal(inspection.encrypted, true); assert.equal(inspection.validEof, true); assert.ok(rendered.pageCount >= 5); assert.ok(rendered.bytes.length > 10_000);

  const state = createEmptyAppState(); const owned = { organisationId: actor.organisationId!, createdByActorUserId: actor.id, updatedByActorUserId: actor.id, recordVersion: 1 };
  for (let index = 0; index < 500; index++) {
    state.mediaAssetVersions.push({ id: `media-${index}`, assetId: `asset-${index}`, filename: `remedy-${index}.png`, status: "FOUNDER_APPROVED", ...owned } as never);
    state.remedyRepositoryRecords.push({ id: `remedy-${index}`, name: `Remedy ${String(index).padStart(3, "0")}`, attributePurpose: "Bounded repository performance fixture",
      remedialType: "DISHA_BALANCER", elements: ["Earth"], directions: ["SW"], preferredAssetId: `asset-${index}`, preferredAssetVersionId: `media-${index}`, status: "APPROVED", tags: ["performance"], ...owned } as never);
  }
  const startedRepository = performance.now(); const csv = exportRepositoryCsv(state, actor); const health = repositoryHealth(state, actor); const repositoryDurationMs = performance.now() - startedRepository;
  assert.equal(csv.split("\n").length, 501); assert.equal(health.length, 500); assert.ok(health.every((item) => item.health === "HEALTHY"));
  context.diagnostic(JSON.stringify({ pdfDurationMs: Number(pdfDurationMs.toFixed(2)), pdfBytes: rendered.bytes.length, pageCount: rendered.pageCount,
    repositoryDurationMs: Number(repositoryDurationMs.toFixed(2)), repositoryRecords: health.length }));
});
