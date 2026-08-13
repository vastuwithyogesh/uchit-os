import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("new Founder workflow controls have native actions, busy guards and actionable recovery", async () => {
  const [leads, communication, media, qualification, booking, commercial] = await Promise.all([
    read("components/unified-leads-workspace.tsx"),
    read("components/lead-communication-sheet.tsx"),
    read("components/media-library-console.tsx"),
    read("components/qualification-form-client.tsx"),
    read("components/booking-response-client.tsx"),
    read("components/founder-commercial-proposal-editor.tsx")
  ]);
  assert.match(leads, /Edit profile/); assert.match(leads, /onClick=\{\(\) => setEditing\(true\)\}/);
  assert.match(leads, /disabled=\{busy \|\| !editReason\.trim\(\)\}/); assert.match(leads, /\[409, 428\]/);
  assert.match(leads, /Your draft remains here; reload before retrying/);
  assert.match(communication, /Prepare WhatsApp & email/); assert.match(communication, /disabled=\{busy \|\| blocked\}/);
  assert.match(communication, /Allow pop-ups and retry/); assert.doesNotMatch(communication, /SENT|DELIVERED|FAILED|RETRY/);
  assert.match(media, /Select exact file and activate/); assert.match(media, /disabled=\{Boolean\(busyKey\)\}/);
  assert.match(media, /\/api\/media-library/); assert.match(media, /Ingestion failed without saving changes/);
  assert.match(qualification, /disabled=\{busy\}/); assert.match(qualification, /Retry securely/); assert.match(qualification, /Your answers remain on this page/);
  assert.match(booking, /disabled=\{busy\}/); assert.match(booking, /Retry securely/); assert.match(booking, /Your selection remains unchanged; reload and try again/);
  assert.match(commercial, /disabled=\{busy\}/); assert.match(commercial, /Reload current version/); assert.match(commercial, /Nothing changed/);
});

test("mobile, keyboard, focus and 44px source contracts cover all new surfaces", async () => {
  const [styles, leads, communication, qualification, booking] = await Promise.all([
    read("app/globals.css"), read("components/unified-leads-workspace.tsx"), read("components/lead-communication-sheet.tsx"), read("components/qualification-form-client.tsx"), read("components/booking-response-client.tsx")
  ]);
  assert.match(styles, /:where\(a, button, input, textarea, select, summary\):focus-visible/);
  assert.match(styles, /min-height:\s*44px/); assert.match(styles, /@media\(max-width:640px\)\{\.lead-communication-sheet\{width:100%/);
  assert.match(styles, /body\s*\{\s*overflow-x:\s*hidden/); assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(leads, /onKeyDown=.*event\.key === "Enter" \|\| event\.key === " "/s);
  assert.match(communication, /role="dialog" aria-modal="true"/);
  assert.match(qualification, /aria-live="polite"/); assert.match(booking, /aria-live="polite"/);
});

test("action routes remain server-authoritative and expose conflict semantics", async () => {
  const [route, leads, commercial] = await Promise.all([read("app/api/actions/route.ts"), read("components/unified-leads-workspace.tsx"), read("components/founder-commercial-proposal-editor.tsx")]);
  for (const action of ["founder-lead-profile-update", "founder-media-dry-run", "founder-communication-prepare", "founder-communication-opened", "founder-proposal-step-save", "founder-proposal-review", "founder-proposal-approve", "founder-proposal-artifact-generate", "founder-proposal-send"]) assert.match(route, new RegExp(`case \\"${action}\\"`));
  assert.match(route, /\[400, 401, 403, 404, 409, 428, 503\]/);
  assert.match(leads, /buildActionHeaders\(activeUser\.role\)/); assert.match(leads, /expectedRevision/); assert.match(leads, /idempotencyKey/);
  assert.match(commercial, /expectedRevision/); assert.match(commercial, /expectedRecordVersion/); assert.match(commercial, /idempotencyKey/);
  assert.doesNotMatch(leads, /ownerUserId\s*:/); assert.doesNotMatch(commercial, /ownerUserId\s*:/);
});

test("no automatic provider delivery or blocker weakening is introduced", async () => {
  const sources = (await Promise.all([
    read("components/lead-communication-sheet.tsx"), read("lib/founder-engagement.ts"), read("lib/founder-commercial.ts"), read("components/founder-commercial-proposal-editor.tsx")
  ])).join("\n");
  assert.doesNotMatch(sources, /AUTO_SEND|providerDelivered|automaticDelivery/);
  for (const blocker of ["P5_OWNER_LEGAL", "P13_OWNER_LEGAL", "P14_OWNER_LEGAL", "INVOICE_STATUTORY_CONFIG"]) assert.match(sources, new RegExp(blocker));
  assert.match(sources, /Activate the exact approved brochure|approved brochure/i);
});

test("commercial index reflects the approved brochure-as-scope contract", async () => {
  const page = await read("app/commercial-proposals/page.tsx");
  assert.match(page, /activate the exact approved brochure for the selected service/i);
  assert.match(page, /brochure is pinned as the scope reference/i);
  assert.match(page, /Active brochure scope references/);
  assert.doesNotMatch(page, /configure an active service scope template/i);
});
