import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("CRM route contains only the reference-parity leads table workspace", () => {
  const page = source("app/crm/page.tsx");
  assert.match(page, /UnifiedLeadsWorkspace mode="leads"/);
  assert.doesNotMatch(page, /ClientIntakeForm|CommercialConsole|crm-workbench|FounderRouteIntro/);
});

test("lead table supplies filters, private display, drawer and source history separation", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  for (const token of ["Search", "Stage", "Source", "Received from", "Received to", "lead-table", "lead-profile-drawer", "Timeline", "Technical details"]) assert.match(ui, new RegExp(token));
  assert.match(ui, /normaliseRows/);
  assert.match(ui, /maskEmail/);
  assert.match(ui, /maskPhone/);
  assert.match(ui, /Source payloads, private IDs and audit internals are intentionally excluded/);
});

test("pipeline mutation preserves canonical CAS and never accepts source owner", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /action: "client-pipeline-transition"/);
  for (const field of ["clientId", "pipelineStage", "nextAction", "nextActionDueAt", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]) assert.match(ui, new RegExp(field));
  const payload = ui.slice(ui.indexOf("action: \"client-pipeline-transition\""), ui.indexOf("}) });", ui.indexOf("action: \"client-pipeline-transition\"")));
  assert.doesNotMatch(payload, /owner|pipelineOwner|assignedTo/);
  assert.match(ui, /getAllowedPipelineTransitions/);
  assert.match(ui, /The card will not move until the server accepts/);
});

test("dormant Lovable state is visible and has no direct external mutation", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /Lovable sync dormant/);
  assert.doesNotMatch(ui, /fetch\([^)]*lovable/i);
  const route = source("app/api/integrations/lovable/events/route.ts");
  assert.match(route, /status: 503/);
});

test("offline and concurrency recovery preserve the draft", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /navigator\.onLine/);
  assert.match(ui, /response\.status === 409 \|\| response\.status === 428/);
  assert.match(ui, /Your draft remains here; reload before retrying/);
  assert.match(ui, /Reload/);
  assert.match(ui, /aria-live="polite"/);
});

test("responsive drawer and keyboard-accessible move controls are present", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  const css = source("app/globals.css");
  assert.match(ui, /lead-card-move/);
  assert.match(ui, /Move to/);
  assert.match(ui, /role="dialog"/);
  assert.match(css, /lead-profile-drawer/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
});

test("converted Founder leads surface the governed editable proposal handoff", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /selected\.stage === "WON"/);
  assert.match(ui, /Create proposal/);
  assert.match(ui, /action: "founder-proposal-draft-create"/);
  for (const field of ["classification", "professionalFeePaise", "appliedGstBasisPoints", "agreedAdvancePaise", "expectedProjectVersion", "expectedRevision", "idempotencyKey"]) assert.match(ui, new RegExp(field));
  assert.match(ui, /STANDARD_PAID/);
  assert.match(ui, /INTERNAL_COMPLIMENTARY/);
  assert.match(ui, /window\.location\.assign\(`\/commercial-proposals/);
});
