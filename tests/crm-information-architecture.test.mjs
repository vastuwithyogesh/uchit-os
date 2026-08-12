import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("compact Founder shell exposes the six primary workspaces and contains legacy ops", () => {
  const policy = source("lib/access-policy.ts");
  const header = source("components/site-header.tsx");
  for (const token of ["/crm", "/lead-pipeline", "/clients-cases", "/founder/08", "/reports"]) assert.match(header, new RegExp(token.replaceAll("/", "\\/")));
  assert.match(header, /app-sidebar/);
  assert.match(header, /mobile-nav-menu/);
  assert.match(header, /More/);
  assert.match(policy, /Legacy technical console/);
  assert.doesNotMatch(header.slice(header.indexOf("primaryHrefs"), header.indexOf("primaryNavigation")), /\/ops/);
});

test("Leads opens as a full-width table and one shared right-side profile drawer", () => {
  const page = source("app/crm/page.tsx");
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(page, /UnifiedLeadsWorkspace mode="leads"/);
  for (const token of ["lead-table", "Client ID", "Service interest", "Received from", "lead-profile-drawer", "Profile", "Requirement / Intake", "Next action", "Timeline", "Follow-ups", "Commercial", "Save & continue"]) assert.match(ui, new RegExp(token));
  assert.match(ui, /maskEmail/);
  assert.match(ui, /maskPhone/);
  assert.match(ui, /Technical details/);
  assert.doesNotMatch(page, /FounderRouteIntro|hero/);
});

test("Lead Pipeline uses five visual groups with canonical server confirmation", () => {
  const page = source("app/lead-pipeline/page.tsx");
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(page, /mode="pipeline"/);
  for (const label of ["New", "Contacted / Engaged", "Review / Qualified", "Converted", "Lost / Closed"]) assert.match(ui, new RegExp(label.replace("/", "\\/")));
  assert.match(ui, /onDrop/);
  assert.match(ui, /Confirm canonical transition/);
  assert.match(ui, /getAllowedPipelineTransitions/);
  assert.match(ui, /action: "client-pipeline-transition"/);
  assert.match(ui, /The card will not move until the server accepts/);
  assert.doesNotMatch(ui, /ownerId|pipelineOwner|assignedTo/);
});

test("Clients & Cases is one card per case with independent floor progress", () => {
  const page = source("app/clients-cases/page.tsx");
  const ui = source("components/client-case-pipeline.tsx");
  for (const token of ["ClientCasePipeline", "Setup", "Evidence / Mapping", "Evaluation", "Verdict / Balance", "Report / Delivery", "Continue case", "case-floor-chips", "one independent report per floor"]) assert.match(`${page}\n${ui}`, new RegExp(token, "i"));
  assert.match(ui, /state\.vastuCases\.map/);
  assert.match(ui, /caseRecord\.clientId/);
  assert.match(ui, /buildFounderScorecard\(state, \{ role: actorRole \}, card\.client\?\.id, card\.caseRecord\.id, floor\.id\)/);
});

test("CRM parity remains private, dormant, responsive and fail-safe", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  const css = source("app/globals.css");
  assert.match(ui, /Lovable sync dormant/);
  assert.match(ui, /Source history is labelled separately and never becomes authoritative audit/);
  assert.match(ui, /sourceRecordId/);
  assert.match(ui, /navigator\.onLine/);
  assert.match(ui, /response\.status === 409 \|\| response\.status === 428/);
  assert.match(css, /lead-profile-drawer/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /min-height:\s*44px/);
});
