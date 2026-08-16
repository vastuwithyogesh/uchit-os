import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source } from "./helpers/source-contracts.mjs";

test("v5 uses the existing immutable replacement and Founder review guards", () => {
  const regeneration = source("lib/founder-regeneration.ts");
  const replacement = functionBody(regeneration, "replacementFor");
  const blockers = functionBody(regeneration, "getStageAFloorReviewBlockers");

  assert.match(replacement, /uchit-verdict\/v3/);
  assert.match(replacement, /uchit-verdict\/v4/);
  assert.match(replacement, /uchit-verdict\/v5/);
  assert.match(replacement, /item\.artifact\.immutable/);
  assert.match(blockers, /uchit-verdict\/v3/);
  assert.match(blockers, /uchit-verdict\/v4/);
  assert.match(blockers, /uchit-verdict\/v5/);
  assert.match(blockers, /report\.artifact\.floorId !== floor\.id/);
});

test("v5 cannot bypass verified protected-PDF release", () => {
  const release = functionBody(source("lib/workflow-service.ts"), "releaseVerdict");

  assert.match(release, /uchit-verdict\/v3/);
  assert.match(release, /uchit-verdict\/v4/);
  assert.match(release, /uchit-verdict\/v5/);
  assert.match(release, /!pdfReleaseAuthorized/);
  assert.match(release, /protected PDF verification and atomic release workflow/);
});

test("Founder PDF operations stay owner-only without the temporary global delivery kill switch", () => {
  const founder = functionBody(source("lib/final-pdf.server.ts"), "assertFounder");

  assert.match(founder, /isFounderEdition/);
  assert.match(founder, /founderUserId !== actor\.id/);
  assert.match(founder, /role !== "SUPER_ADMIN"/);
  assert.match(founder, /capability !== "organisation_owner"/);
  assert.doesNotMatch(founder, /clientDeliveryEnabled/);
  assert.match(founder, /DELIVERED DocumentDeliveryRecord/);
});
