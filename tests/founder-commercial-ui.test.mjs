import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("proposal editor is a six-step exclusive route with one focused current form", () => {
  const page = source("app/commercial-proposals/[proposalId]/[step]/page.tsx");
  assert.match(page, /requirePageAccess\("SUPER_ADMIN"\)/); assert.match(page, /FounderCommercialProposalEditor/);
  const editor = source("components/founder-commercial-proposal-editor.tsx");
  for (const title of ["Client & Project", "Requirements & Scope", "Deliverables & Interactions", "Timeline & Commercials", "Policies & Next Steps", "Preview, Review & Approve"]) assert.match(editor, new RegExp(title.replace(/[&]/g, "&")));
  assert.match(editor, /current === 1/); assert.match(editor, /current === 6/); assert.doesNotMatch(editor, /steps\.map\(/);
  assert.match(editor, /Save & Continue/); assert.match(editor, />Back</); assert.match(editor, /Technical details/);
});

test("UI exposes actionable blocking, conflict recovery and no hidden optimistic success", () => {
  const editor = source("components/founder-commercial-proposal-editor.tsx");
  assert.match(editor, /Approval is blocked/); assert.match(editor, /Nothing changed/); assert.match(editor, /Reload current version/);
  assert.match(editor, /if \(!request\.ok\) throw new Error/); assert.match(editor, /window\.location\.reload/);
  assert.doesNotMatch(editor, /setProposal\(|status\s*=\s*["']APPROVED/);
});

test("commercial UI is mobile-safe and public acceptance remains explicit", () => {
  const css = source("app/globals.css");
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*commercial-editor-actions[\s\S]*min-height: 44px/);
  const client = source("components/commercial-proposal-client.tsx");
  assert.match(client, /acceptanceChecked/); assert.match(client, /typedConfirmation/); assert.match(client, /organisationName/); assert.match(client, /designation/);
  assert.match(client, /Record response/); assert.doesNotMatch(client, /signature pad|canvas/i);
});

test("proposal navigation remains Founder-only and outside primary workflow clutter", () => {
  const policy = source("lib/access-policy.ts"); assert.match(policy, /\/commercial-proposals.*SUPER_ADMIN/);
  const header = source("components/site-header.tsx"); assert.doesNotMatch(header, /primaryHrefs[^;]*commercial-proposals/);
});
