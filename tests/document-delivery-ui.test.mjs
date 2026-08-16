import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("internal delivery UI exposes readiness, immutable identity, lifecycle, history and manual handoff", () => {
  const ui = source("components/document-delivery-console.tsx");
  for (const copy of ["Delivery dashboard", "Readiness checklist", "Report canonical hash", "Protected PDF SHA-256", "Prepare delivery", "Mark Ready", "Deliver to portal", "Record repeat delivery", "Record Manual Delivery", "Append-only delivery history", "Delivery health"]) assert.match(ui, new RegExp(copy));
  assert.match(ui, /document-delivery-prepare/); assert.match(ui, /document-delivery-mark-ready/); assert.match(ui, /document-delivery-deliver/);
  assert.match(ui, /expectedRecordVersion/); assert.match(ui, /expectedRevision/); assert.match(ui, /idempotencyKey/);
  assert.match(ui, /CLIENT_PORTAL/); assert.match(ui, /MANUAL_HANDOFF/);
  assert.doesNotMatch(ui, /EMAIL|WHATSAPP|Founder proposal|statutory/);
});

test("client portal exposes delivered records, exact protected access and receipt-only acknowledgement", () => {
  const ui = source("components/client-portal.tsx"); const projection = source("lib/client-portal.ts");
  assert.match(ui, /Download protected PDF/); assert.match(ui, /Acknowledge receipt/); assert.match(ui, /confirms receipt only/);
  assert.match(ui, /document-delivery-acknowledge/); assert.match(ui, /deliveryAccess/);
  assert.match(projection, /documentDeliveries/); assert.match(projection, /recipientClientId === client\.id/);
  assert.match(projection, /item\.status === "DELIVERED"/); assert.doesNotMatch(projection, /renderPrintableReport/);
});

test("delivery dashboard is capability-protected, navigable and responsive", () => {
  assert.match(source("app/report-deliveries/page.tsx"), /requirePageAccess\("ADMIN"\)/);
  assert.match(source("lib/access-policy.ts"), /\/report-deliveries/);
  assert.match(source("components/report-console.tsx"), /Open delivery panel/);
  const css = source("app/globals.css"); assert.match(css, /delivery-admin-grid/); assert.match(css, /@media \(max-width: 900px\)/); assert.match(css, /review-mobile/);
});

test("development visual review declares every required delivery evidence state", () => {
  const page = source("app/visual-review/delivery/page.tsx"); const preview = source("components/document-delivery-visual-review.tsx");
  assert.match(page, /NODE_ENV === "production"/);
  for (const scenario of ["dashboard", "panel", "ready", "blocked", "identity", "approval", "protected", "recipient", "mark_ready", "confirmation", "delivered", "history", "repeat", "manual", "replacement", "old_preserved", "client_list", "client_detail", "download", "acknowledge_action", "acknowledged", "access_history", "unauthorized", "health", "founder_deferred", "remedy", "old_brand", "replacement_brand", "mobile_client", "mobile_internal"]) assert.match(preview, new RegExp(scenario));
  assert.match(preview, /Founder proposal and statutory delivery is deferred/);
  assert.match(preview, /VASTU_REMEDY_REPORT/);
});
