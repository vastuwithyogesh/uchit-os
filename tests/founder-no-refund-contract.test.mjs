import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("P14 exact copy, version pinning and no-refund configuration remain source locked", async () => {
  const commercial = await source("lib/founder-commercial.ts"); const domain = await source("lib/domain.ts");
  assert.match(commercial, /Payments made to Uchit Vastu India are non-refundable\.[\s\S]*separately approved accountant process\./);
  assert.match(commercial, /NO_CREDITS_VOUCHERS_OR_FEE_OFFSETS/); assert.match(commercial, /REVIEW_REQUIRED_ACCOUNTANT/);
  assert.match(domain, /cancellationPolicyVersion/); assert.match(domain, /cancellationPolicyContentHash/);
});

test("v15 is additive and exposes no refund, credit, reversal or deletion action", async () => {
  const migrations = await source("db/migrations.ts"); const actions = await source("app/api/actions/route.ts");
  assert.match(migrations, /version:\s*15[\s\S]*founder_commercial_policy_events/);
  assert.match(migrations, /no_refund_or_credit_entitlement[\s\S]*payment_history_preserved/);
  for (const prohibited of ["founder-refund-issue", "founder-credit-issue", "founder-payment-reversal", "founder-commercial-delete"]) assert.doesNotMatch(actions, new RegExp(`case\\s+["']${prohibited}["']`, "i"));
});

test("proposal policy UI and client projection use the exact active version while Media Library stays in the next package", async () => {
  const editor = await source("components/founder-commercial-proposal-editor.tsx"); const page = await source("app/commercial-proposals/[proposalId]/[step]/page.tsx"); const media = await source("app/media-library/page.tsx");
  assert.match(editor, /No-refund policy/); assert.match(editor, /activeNoRefundPolicy\.exactText/); assert.match(page, /CANCELLATION_REFUND_DELAY/);
  assert.match(media, /MediaLibraryConsole/);
});
