import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("Founder route intro provides one dominant action with progressive context", () => {
  const intro = read("components/founder-route-intro.tsx");
  assert.match(intro, /primaryAction/);
  assert.match(intro, /secondaryAction/);
  assert.match(intro, /status-\$\{status\.tone\}/);
  assert.match(intro, /context-line/);
  assert.match(intro, /route-intro-actions/);
});

test("priority Founder routes use the shared one-task intro", () => {
  for (const file of [
    "app/page.tsx", "app/workspace/page.tsx",
    "app/files/page.tsx", "app/spatial/page.tsx", "app/evaluation/page.tsx", "app/assessment/page.tsx",
    "app/site/page.tsx", "app/payment-proofs/page.tsx", "app/reports/page.tsx", "app/delivery/page.tsx",
    "app/diagnostics/page.tsx", "app/methodology/page.tsx", "app/insights/page.tsx"
  ]) {
    const text = read(file);
    if (file === "app/page.tsx") {
      assert.match(text, /FounderFlowHome/, `${file} uses the Founder flow`);
      assert.match(text, /buildFounderScorecard/, `${file} derives the scorecard server-side`);
      continue;
    }
    assert.match(text, /FounderRouteIntro/, `${file} uses the shared intro`);
    assert.match(text, /description=/, `${file} explains the current job`);
    assert.match(text, /status=/, `${file} exposes a semantic status`);
  }
});

test("reference-parity CRM routes intentionally start at their working surface", () => {
  const crm = read("app/crm/page.tsx");
  const pipeline = read("app/lead-pipeline/page.tsx");
  const cases = read("app/clients-cases/page.tsx");
  const ops = read("app/ops/page.tsx");
  assert.match(crm, /UnifiedLeadsWorkspace mode="leads"/);
  assert.match(pipeline, /UnifiedLeadsWorkspace mode="pipeline"/);
  assert.match(cases, /ClientCasePipeline/);
  assert.match(ops, /Legacy technical console/);
  for (const text of [crm, pipeline, cases]) assert.doesNotMatch(text, /FounderRouteIntro|route-intro/);
});

test("evaluation keeps secondary tools behind disclosure", () => {
  const text = read("app/evaluation/page.tsx");
  assert.match(text, /<details className="route-secondary-links">/);
  assert.match(text, /More evaluation tools/);
  assert.doesNotMatch(text, /href="\/assets" className="button"/);
  assert.doesNotMatch(text, /href="\/diagnostics" className="button"/);
});

test("Founder visual system preserves semantic tokens, focus, motion and touch targets", () => {
  const css = read("app/globals.css");
  for (const token of ["#F7F5F2", "#111111", "#2D2D2D", "#888888", "#B08D57"]) {
    assert.match(css.toUpperCase(), new RegExp(token), token);
  }
  assert.match(css, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.route-intro\s*\{/);
  assert.match(css, /\.context-line\s*\{/);
  assert.match(css, /box-shadow:\s*none\s*!important/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});

test("Founder route links remain native and delivery remains deferred", () => {
  for (const file of ["components/site-header.tsx", "components/founder-route-intro.tsx"]) {
    const text = read(file);
    assert.doesNotMatch(text, /next\/link|<Link\b|prefetch=/, file);
    assert.match(text, /href=/, file);
  }
  assert.match(read("app/api/client/portal/route.ts"), /CLIENT_DELIVERY_DEFERRED/);
  assert.match(read("app/api/client/reports/[reportId]/route.ts"), /disabled during Founder Edition/);
});
