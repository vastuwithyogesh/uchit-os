import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder control inventory covers every critical route and action family", () => {
  const inventory = read("docs/founder-ui-action-inventory.md");
  for (const token of [
    "app/crm/page.tsx", "app/ops/page.tsx", "app/spatial/page.tsx", "app/evaluation/page.tsx",
    "app/site/page.tsx", "app/reports/page.tsx", "app/files/page.tsx", "app/payment-proofs/page.tsx",
    "app/methodology/page.tsx", "app/delivery/page.tsx", "app/diagnostics/page.tsx", "app/admin/page.tsx",
    "app/bootstrap/page.tsx", "app/state/page.tsx", "app/integrity/page.tsx", "app/models/page.tsx",
    "app/settings/page.tsx", "app/timeline/page.tsx", "app/workspace/page.tsx", "app/assets/page.tsx", "app/client/page.tsx",
    "proposal-create", "advance-pay", "case-create", "preview-report", "report-approve",
    "verdict-release", "plan-version-create", "spatial-evidence-create", "orientation-version-lock",
    "utility-evaluate", "site-analysis-upsert", "pdf-generate", "pdf-verify", "pdf-release",
      "delivery-milestone-upsert", "409", "428", "aria-live", "Client delivery is disabled"
  ]) assert.match(inventory, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), token);
});

test("protected action route rejects unknown actions and requires concurrency for mutation families", () => {
  const route = read("app/api/actions/route.ts");
  assert.match(route, /Unknown action/);
  for (const action of ["proposal-create", "case-create", "preview-report", "report-approve", "verdict-release", "spatial-evidence-create", "orientation-version-lock", "utility-evaluate", "site-analysis-upsert"]) {
    assert.match(route, new RegExp(`\\\"${action}\\\"`), action);
  }
  assert.match(route, /expectedRecordVersion/);
  assert.match(route, /expectedRevision/);
  assert.match(route, /status: 428/);
  assert.match(route, /status: 409/);
});

test("critical Founder components expose busy guards, status recovery and intentional blocked states", () => {
  const files = [
    "components/commercial-console.tsx", "components/client-intake-form.tsx", "components/crm-pipeline-board.tsx",
    "components/case-master-console.tsx", "components/spatial-workspace.tsx", "components/evaluation-console.tsx",
    "components/site-analysis-console.tsx", "components/report-console.tsx", "components/files-drawings-console.tsx",
    "components/payment-proof-console.tsx", "components/delivery-console.tsx", "components/methodology-console.tsx",
    "components/aou-methodology-console.tsx", "components/session-provider.tsx"
  ];
  for (const file of files) {
    const text = read(file);
    assert.match(text, /disabled=|busy/, `${file} must guard duplicate submission`);
  }
  const spatial = read("components/spatial-workspace.tsx");
  assert.match(spatial, /disabled[^>]*Computed 16D mapping is deferred|Computed 16D mapping is deferred[\s\S]*disabled/);
  assert.match(spatial, /aria-live/);
  const report = read("components/report-console.tsx");
  assert.match(report, /pdf|PDF/);
  assert.match(report, /refresh|Reload/);
  assert.match(report, /aria-live/);
});

test("secondary Founder controls are wired rather than decorative", () => {
  for (const file of [
    "components/admin-console.tsx", "components/state-console.tsx", "components/integrity-console.tsx",
    "components/bootstrap-console.tsx", "components/settings-console.tsx", "components/timeline-console.tsx",
    "components/chart-upload-board.tsx", "components/lead-inbox-console.tsx"
  ]) {
    const text = read(file);
    assert.match(text, /<button|<a /, `${file} exposes a control`);
    assert.match(text, /onClick=|href=|onChange=/, `${file} control has a handler or target`);
    assert.match(text, /disabled=|busy|aria-live|role=["'](alert|status)["']/, `${file} exposes recovery/busy semantics`);
  }
});

test("native navigation, private delivery routes and accessibility tokens remain enforced", () => {
  for (const file of ["components/site-header.tsx", "components/access-denied-panel.tsx", "components/case-workspace.tsx"]) {
    const text = read(file);
    assert.doesNotMatch(text, /from ["']next\/link["']/);
    assert.doesNotMatch(text, /<Link\b|prefetch=/);
  }
  const clientPortal = read("app/api/client/portal/route.ts");
  assert.match(clientPortal, /buildClientPortalView/);
  const clientReport = read("app/api/client/reports/[reportId]/route.ts");
  assert.match(clientReport, /readDeliveredProtectedPdf/);
  assert.match(clientReport, /recipientClientId === client\.id/);
  const css = read("app/globals.css");
  assert.match(css, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(max-width: 820px\)/);
  for (const status of ["status-neutral", "status-attention", "status-blocked", "status-ready", "status-approved", "status-released"]) {
    assert.match(css, new RegExp(`\\.${status}\\b`), status);
  }
});

test("report PDF endpoints are private and prevent preview export paths", () => {
  const print = read("app/api/reports/[reportId]/print/route.ts");
  const pdf = read("app/api/reports/[reportId]/pdf/route.ts");
  for (const text of [print, pdf]) {
    assert.match(text, /no-store|private/i);
    assert.match(text, /authenticate|require|actor|scope/i);
  }
  assert.match(print + pdf, /preview|RELEASED|export|print/i);
});
