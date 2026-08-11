import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";
import { decodeMembershipCapabilities, DEFAULT_FOUNDER_APPROVAL_POLICY, DEFAULT_FOUNDER_WORKFLOW_POLICY } from "../lib/foundation.ts";

test("Founder Edition is capability-based with one Super Admin owner", () => {
  const foundation = source("lib/foundation.ts");
  const migrations = source("db/migrations.ts");
  assert.doesNotMatch(foundation, /"FOUNDER"\s*\|\s*"SUPER_ADMIN"/);
  assert.equal(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.ownerCapability, "organisation_owner");
  assert.equal(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.teamOperationsEnabled, false);
  assert.equal(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.clientDeliveryEnabled, false);
  assert.deepEqual(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson.approvalFlow, ["DRAFT", "FOUNDER_REVIEWED", "FOUNDER_APPROVED", "RELEASED"]);
  assert.equal(DEFAULT_FOUNDER_APPROVAL_POLICY.creatorMayApprove, true);
  assert.match(migrations, /idx_one_active_owner_per_org[\s\S]*role='SUPER_ADMIN' AND status='ACTIVE'/);
  assert.match(migrations, /ownership_transfer_requests/);
  assert.match(functionBody(source("lib/foundation.server.ts"), "assertOwnershipTransferContract"), /confirmedByCurrentOwner[\s\S]*confirmedByProposedOwner/);
});

test("session and bootstrap resolve one organisation on the server", () => {
  const auth = source("lib/auth.ts");
  const session = source("app/api/session/route.ts");
  const bootstrap = source("app/api/bootstrap/route.ts");
  assert.match(auth, /organisation_memberships/);
  assert.match(session, /resolveActiveOrganisationContext/);
  assert.match(session, /organisationCapability/);
  assert.doesNotMatch(session, /availableUsers:\s*users(?!\s*:)/);
  assert.match(bootstrap, /projectOrganisationState\(snapshot\.state, context\.organisation\.id\)/);
  assert.match(bootstrap, /workflowPolicyVersion/);
  assert.match(bootstrap, /approvalPolicyVersion/);
});

test("business mutations reject client organisation scope and append ownership audit", () => {
  const actions = source("app/api/actions/route.ts");
  const scope = source("lib/organisation-scope.ts");
  assert.match(actions, /assertOrganisationRequestScope\(getAppState\(\), body, foundation\.organisation\.id\)/);
  assert.match(actions, /stampOrganisationOwnership/);
  assert.match(actions, /appendImmutableAuditEvent/);
  assert.match(scope, /"organisationId" in body \|\| "organizationId" in body \|\| "tenantId" in body/);
  assert.match(scope, /statusCode = 404/);
  assert.match(scope, /createdByActorUserId/);
  assert.match(scope, /updatedByActorUserId/);
});

test("foundation policy publication is versioned, concurrent, idempotent and audited", () => {
  const route = source("app/api/foundation/policy/route.ts");
  const server = source("lib/foundation.server.ts");
  assert.match(route, /expectedOrganisationVersion/);
  assert.match(route, /expectedRevision/);
  assert.match(route, /status: 428/);
  assert.match(route, /status: 409/);
  const publish = functionBody(server, "publishFoundationPolicies");
  assert.match(publish, /idempotency_key/);
  assert.match(publish, /workflowVersion = input\.context\.workflowPolicy\.version \+ 1/);
  assert.match(publish, /approvalVersion = input\.context\.approvalPolicy\.version \+ 1/);
  assert.match(publish, /FOUNDATION_POLICIES_PUBLISHED/);
  assert.match(publish, /record_version=record_version\+1/);
});

test("access requests require Super Admin approval before activation", () => {
  const schema = source("db/migrations.ts");
  const route = source("app/api/foundation/access/route.ts");
  const server = source("lib/foundation.server.ts");
  for (const state of ["DRAFT", "PENDING_SUPER_ADMIN_APPROVAL", "APPROVED", "ACTIVE", "REJECTED", "REVOKED", "CANCELLED"]) assert.match(schema, new RegExp(`'${state}'`));
  for (const action of ["user-access-create", "user-access-submit", "user-access-approve", "user-access-activate", "user-access-reject", "user-access-cancel", "user-access-revoke"]) assert.match(route, new RegExp(`"${action}"`));
  const mutate = functionBody(server, "mutateUserAccessRequest");
  assert.match(mutate, /Self-escalation/);
  assert.match(server, /cannot grant SUPER_ADMIN/);
  assert.match(mutate, /USER_MANAGEMENT/);
  assert.match(mutate, /highRiskCapabilities/);
  assert.match(mutate, /requested_by_role === "ADMIN" && row\.requested_by_user_id === input\.actor\.id/);
  assert.match(mutate, /role<>'SUPER_ADMIN'/);
  assert.match(mutate, /USER_ACCESS_\$\{input\.action\}/);
  assert.match(mutate, /expectedRecordVersion/);
  assert.match(mutate, /expectedOrganisationVersion/);
});

test("membership capabilities decode deterministically and ignore unknown values", () => {
  assert.deepEqual(decodeMembershipCapabilities('["REPORT_APPROVAL","CLIENT_CRM","REPORT_APPROVAL"]'), ["CLIENT_CRM", "REPORT_APPROVAL"]);
  assert.deepEqual(decodeMembershipCapabilities("USER_MANAGEMENT,unknown"), ["USER_MANAGEMENT"]);
  assert.deepEqual(decodeMembershipCapabilities("organisation_owner"), ["organisation_owner"]);
});

test("client delivery and internal preview export remain server-blocked", () => {
  assert.match(source("app/api/client/portal/route.ts"), /CLIENT_DELIVERY_ENABLED = false/);
  assert.match(source("app/api/client/reports/[reportId]/route.ts"), /CLIENT_DELIVERY_ENABLED = false/);
  assert.match(source("app/api/reports/[reportId]/print/route.ts"), /report\.isPreview[\s\S]*status: 403/);
  assert.match(source("app/client/page.tsx"), /client portal is reserved for a later edition/i);
});

test("protected case files are organisation, case, revision and floor scoped", () => {
  const files = source("lib/case-file-assets.server.ts");
  const migration = source("db/migrations.ts");
  assert.match(files, /organisationId: string/);
  assert.match(files, /organisations\/\$\{scope\.organisationId\}\/case-files/);
  assert.match(files, /WHERE organisation_id = \? AND case_id = \?/);
  assert.match(migration, /ALTER TABLE case_file_assets ADD COLUMN organisation_id/);
  assert.match(migration, /idx_case_file_assets_org_scope/);
});

test("released report hashes remain independent of foundation policy records", () => {
  const artifacts = source("lib/report-artifacts.ts");
  assert.doesNotMatch(artifacts, /foundation|workflow_policies|approval_policies|organisation_memberships/);
});
