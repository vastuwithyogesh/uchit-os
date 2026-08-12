import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("operational routes use the compact shell without internal marketing heroes", () => {
  const header = source("components/site-header.tsx");
  const pages = ["app/crm/page.tsx", "app/lead-pipeline/page.tsx", "app/clients-cases/page.tsx"];
  assert.match(header, /app-sidebar/);
  assert.match(header, /mobile-appbar/);
  for (const file of pages) {
    const page = source(file);
    assert.doesNotMatch(page, /FounderRouteIntro|hero-stat|route-intro/);
  }
});

test("CRM has the required above-fold table columns and 420–480px drawer", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  const css = source("app/globals.css");
  for (const column of ["Client ID", "Name", "Email", "Phone", "City", "Service interest", "Stage", "Source", "Received"]) assert.match(ui, new RegExp(`<th>${column}`));
  assert.match(css, /lead-profile-drawer[\s\S]*width:\s*min\(460px/);
  assert.match(css, /lead-table-wrap[\s\S]*overflow:\s*auto/);
  assert.doesNotMatch(ui.slice(ui.indexOf("<table"), ui.indexOf("</table>")), /DOB|birth|sourceRecordId/);
});

test("Kanban drop is only a proposal and requires canonical confirmation", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /onDrop/);
  assert.match(ui, /proposeMove/);
  assert.match(ui, /Confirm canonical transition/);
  assert.match(ui, /getAllowedPipelineTransitions/);
  assert.match(ui, /expectedRecordVersion/);
  assert.match(ui, /expectedRevision/);
  assert.match(ui, /idempotencyKey/);
  assert.match(ui, /The lead stayed in its current stage/);
});

test("each post-advance step renders only its scoped working component", () => {
  const workspace = source("components/founder-step-workspace.tsx");
  const flow = source("components/founder-flow.tsx");
  assert.match(flow, /!isBlocked && !isComplete/);
  assert.match(flow, /<FounderStepWorkspace/);
  assert.match(workspace, /focus="orientation"/);
  assert.match(workspace, /focus="plan"/);
  assert.match(workspace, /focus="gridding"/);
  assert.match(workspace, /focus="manual-sheet"/);
  assert.match(workspace, /focus="site"/);
  assert.match(workspace, /focus="post-site"/);
  assert.match(workspace, /focus="balance"/);
  assert.doesNotMatch(`${workspace}\n${flow}`, /CaseMasterConsole|WorkflowConsole|CommercialConsole/);
});

test("exact case and floor context is passed into every floor-scoped editor", () => {
  const workspace = source("components/founder-step-workspace.tsx");
  for (const field of ["scorecard.client?.id", "scorecard.caseRecord?.id", "scorecard.selectedFloorId"]) assert.match(workspace, new RegExp(field.replace(/[?.]/g, "\\$&")));
  assert.match(workspace, /\.\.\.common/);
  for (const file of ["components/spatial-workspace.tsx", "components/files-drawings-console.tsx", "components/evaluation-console.tsx", "components/site-analysis-console.tsx"]) {
    const ui = source(file);
    assert.match(ui, /requestedCaseId/);
    assert.match(ui, /initialFloorId|requestedFloorId/);
  }
});

test("Founder balance, approval and PDF actions remain protected and explicit", () => {
  const payment = source("components/payment-proof-console.tsx");
  const report = source("components/founder-report-step.tsx");
  assert.match(payment, /action: "balance-proof-verify"/);
  assert.match(payment, /window\.confirm/);
  assert.match(payment, /expectedRecordVersion/);
  assert.match(report, /window\.confirm/);
  assert.match(report, /stage-a-present/);
  assert.match(report, /final-report-prepare/);
  assert.match(report, /report-approve/);
  assert.match(report, /mode=export/);
  assert.match(report, /mode=print/);
});

test("legacy ops is contained and cannot be required by the Founder journey", () => {
  const header = source("components/site-header.tsx");
  const flow = source("components/founder-flow.tsx");
  const workspace = source("components/founder-step-workspace.tsx");
  const cases = source("components/client-case-pipeline.tsx");
  const ops = source("app/ops/page.tsx");
  assert.doesNotMatch(header.slice(header.indexOf("primaryHrefs"), header.indexOf("primaryNavigation")), /\/ops/);
  assert.doesNotMatch(`${flow}\n${workspace}\n${cases}`, /\/ops/);
  assert.match(ops, /Legacy technical console/);
});

test("responsive and focus contracts prevent mobile overflow and tiny controls", () => {
  const css = source("app/globals.css");
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /lead-profile-drawer[\s\S]*width:\s*100%/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
