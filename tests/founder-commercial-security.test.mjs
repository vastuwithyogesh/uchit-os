import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("D1 v11 is additive, immutable and defined without execution commands", () => {
  const migrations = source("db/migrations.ts");
  assert.match(migrations, /version:\s*11[\s\S]*founder_commercial_policy_versions[\s\S]*founder_proposal_versions[\s\S]*founder_commercial_invoices/);
  for (const table of ["founder_commercial_legal_policies", "founder_proposal_template_versions", "founder_proposal_approvals", "founder_proposal_artifacts", "founder_proposal_grants", "founder_proposal_responses", "founder_commercial_payment_confirmations", "founder_balance_deadlines", "founder_commercial_audit_events"]) assert.match(migrations, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migrations, /UNIQUE \(organisation_id,proposal_id,version\)/);
  assert.match(migrations, /balance_deadline_days INTEGER NOT NULL CHECK \(balance_deadline_days=7\)/);
  assert.match(migrations, /advance_invoice_sla_minutes INTEGER NOT NULL CHECK \(advance_invoice_sla_minutes=60\)/);
});

test("commercial actions are server-owned, allowlisted, CAS/idempotent and tenant scoped", () => {
  const route = source("app/api/actions/route.ts");
  for (const action of ["founder-proposal-draft-create", "founder-proposal-step-save", "founder-proposal-review", "founder-proposal-approve", "founder-proposal-artifact-generate", "founder-proposal-send", "founder-commercial-payment-confirm", "founder-balance-deadline-exception", "founder-invoice-issue"]) assert.match(route, new RegExp(`case "${action}"`));
  assert.match(route, /foundation\?\.organisation\.founderUserId \?\? actor\.id/);
  assert.match(route, /founderCommercialAllowedFields/);
  assert.doesNotMatch(route, /body\.founderUserId|body\.organisationId|body\.ownerId|body\.approvedBy/);
  const scope = source("lib/organisation-scope.ts");
  assert.match(scope, /founderProposalVersions/); assert.match(scope, /proposalVersionId/); assert.match(scope, /prospectiveProjectId/);
});

test("legal, acceptance, invoice and client privacy gates fail closed", () => {
  const commercial = source("lib/founder-commercial.ts");
  for (const marker of ["P5_OWNER_LEGAL", "P13_OWNER_LEGAL", "P14_OWNER_LEGAL", "MISSING_STATUTORY_CONFIG", "BLOCKED — OWNER\/LEGAL INPUT REQUIRED"]) assert.match(commercial, new RegExp(marker));
  assert.match(commercial, /projectFounderProposalForClient/);
  assert.doesNotMatch(source("lib/commercial-document-renderer.ts"), /feeDeviationReason|classificationReason|advanceExceptionReason|gstDeviationReason/);
  assert.match(commercial, /acceptanceDoesNotCreateCase: true/);
  assert.match(commercial, /paymentProofDoesNotConfirmPayment: true/);
  assert.doesNotMatch(commercial, /createVastuCase|reportVersions\.push|payments\.push/);
});

test("public proposal routes are narrow, hashed-token based and no-store", () => {
  const route = source("app/api/public/proposals/[token]/route.ts");
  assert.match(route, /resolveFounderProposalGrant/); assert.match(route, /private, no-store/); assert.match(route, /Unsupported proposal response field/);
  assert.doesNotMatch(route, /console\.|sourceRecordId|feeDeviationReason|exceptionReason/);
  const pdf = source("app/api/public/proposals/[token]/pdf/route.ts");
  assert.match(pdf, /resolveFounderProposalGrant/); assert.match(pdf, /private, no-store/); assert.match(pdf, /Content-Disposition/);
  assert.doesNotMatch(pdf, /privateObjectKey.*json|public.*R2/i);
});

test("P17 and P18 use immutable server timestamps and exact boundaries", () => {
  const commercial = source("lib/founder-commercial.ts");
  assert.match(commercial, /addMinutes\(instant, policy\.advanceInvoiceSlaMinutes\)/);
  assert.match(commercial, /addDays\(instant, policy\.balanceDeadlineDays\)/);
  assert.match(commercial, /now\.getTime\(\) >= new Date\(invoice\.dueAt\)\.getTime\(\)/);
  assert.match(commercial, /now\.getTime\(\) >= new Date\(deadline\.dueAt\)\.getTime\(\)/);
  assert.match(commercial, /BALANCE_DEADLINE_EXTENDED/); assert.match(commercial, /BALANCE_DEADLINE_WAIVED/); assert.match(commercial, /ADVANCE_INVOICE_OVERDUE/);
});
