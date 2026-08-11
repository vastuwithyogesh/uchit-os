import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("CRM is a single unified native lead workspace with advanced tools behind disclosure", () => {
  const page = source("app/crm/page.tsx");
  assert.match(page, /UnifiedLeadsWorkspace/);
  assert.match(page, /founder-technical-details crm-advanced-tools/);
  assert.match(page, /ClientIntakeForm/);
  assert.match(page, /CommercialConsole/);
});

test("lead workspace provides search, stage/source filters, list/stage views and a focused detail", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  for (const token of ["Search leads", "Filter by pipeline stage", "Filter by source", "List", "Stages", "Lead detail", "Activity and source history", "Technical details"]) assert.match(ui, new RegExp(token));
  assert.match(ui, /normaliseRows/);
  assert.match(ui, /sourceSystem/);
  assert.match(ui, /sourceRecordId/);
  assert.match(ui, /timelineEvents/);
  assert.match(ui, /Technical details/);
  assert.match(ui, /Source record: \{selected\.sourceRecordId\}/);
});

test("pipeline mutations use the existing canonical transition contract without source owner overrides", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /action: "client-pipeline-transition"/);
  for (const field of ["clientId", "pipelineStage", "nextAction", "nextActionDueAt", "idempotencyKey", "expectedRecordVersion", "expectedRevision"]) assert.match(ui, new RegExp(field));
  const payload = ui.slice(ui.indexOf("body: JSON.stringify({"), ui.indexOf("}),\n      });", ui.indexOf("body: JSON.stringify({")));
  assert.doesNotMatch(payload, /owner|pipelineOwner|assignedTo/);
  assert.match(ui, /getAllowedPipelineTransitions/);
});

test("dormant Lovable mode is visible and never mutates the external source", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /Lovable connector dormant/);
  assert.match(ui, /Lovable-origin records/);
  assert.match(ui, /source history never becomes an Uchit audit event/i);
  assert.doesNotMatch(ui, /lovable.*fetch|fetch\([^)]*lovable/i);
  const route = source("app/api/integrations/lovable/events/route.ts");
  assert.match(route, /status: 503/);
});

test("offline and concurrency recovery preserve the working draft", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /navigator\.onLine/);
  assert.match(ui, /errorKind.*conflict/);
  assert.match(ui, /response\.status === 409/);
  assert.match(ui, /Your draft remains on screen/);
  assert.match(ui, /Reload latest/);
  assert.match(ui, /aria-live="polite"/);
});

test("parity map records ownership, stage mapping and dormant activation boundary", () => {
  const doc = source("docs/lovable-uchit-leads-parity-map.md");
  for (const token of ["Canonical ownership", "Field mapping", "Stage mapping", "D1 v9", "lead_activities", "lead_followups", "REVIEW_REQUIRED", "No live activation"]) assert.match(doc, new RegExp(token));
});

test("unified CRM responsive and accessibility hooks are present", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.unified-leads-workspace/);
  assert.match(css, /\.unified-leads-layout/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
});
