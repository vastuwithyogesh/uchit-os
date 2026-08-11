import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("navigation exposes four focused Founder workspaces", () => {
  const policy = source("lib/access-policy.ts");
  const header = source("components/site-header.tsx");
  for (const token of ["/crm", "/lead-pipeline", "/clients-cases", "/evaluation", "/reports"]) assert.match(policy, new RegExp(token.replaceAll("/", "\\/")));
  assert.match(header, /primaryHrefs/);
  assert.match(header, /lead-pipeline/);
  assert.match(header, /clients-cases/);
});

test("Leads is a searchable table with profile sections and a single Continue action", () => {
  const page = source("app/crm/page.tsx");
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(page, /UnifiedLeadsWorkspace mode="leads"/);
  for (const token of ["Summary", "Intake", "Timeline", "Follow-ups", "Commercial", "Continue in lead pipeline", "detailOpen"]) assert.match(ui, new RegExp(token));
  assert.match(ui, /Protected contact on file/);
  assert.match(ui, /<details className="founder-technical-details"><summary>Technical details/);
});

test("Lead Pipeline is acquisition-only and uses the canonical transition contract", () => {
  const page = source("app/lead-pipeline/page.tsx");
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(page, /mode="pipeline"/);
  assert.match(ui, /leadPipelineStages/);
  assert.match(ui, /getAllowedPipelineTransitions/);
  assert.match(ui, /action: "client-pipeline-transition"/);
  assert.doesNotMatch(ui, /owner:s*selected|ownerId|pipelineOwner/);
});

test("Client & Case Pipeline groups one card per case under permanent Client ID", () => {
  const page = source("app/clients-cases/page.tsx");
  const ui = source("components/client-case-pipeline.tsx");
  for (const token of ["ClientCasePipeline", "permanent Client ID", "one card per active case", "Floor progress", "Payment", "Report"]) assert.match(`${page}\n${ui}`, new RegExp(token, "i"));
  assert.match(ui, /caseRecord.clientId/);
  assert.match(ui, /floorWorkspaces/);
  assert.match(ui, /reportVersions/);
});

test("CRM IA preserves dormant Lovable, mobile sheet, focus and no-delivery boundaries", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  const css = source("app/globals.css");
  const doc = source("docs/founder-crm-information-architecture.md");
  assert.match(ui, /Lovable connector dormant/);
  assert.match(ui, /sourceRecordId/);
  assert.match(css, /unified-lead-detail.is-closed/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(doc, /No direct Lovable writes/);
});
