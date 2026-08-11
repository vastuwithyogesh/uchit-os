import type { AppUser } from "@/lib/domain";
import {
  DEFAULT_FOUNDER_APPROVAL_POLICY,
  DEFAULT_FOUNDER_WORKFLOW_POLICY,
  type ApprovalPolicyRecord,
  type FounderFoundationContext,
  type ImmutableAuditEvent,
  type OrganisationMembership,
  type OrganisationRecord,
  type OrganisationCapability,
  type UserAccessRequestRecord,
  decodeMembershipCapabilities,
  hasOrganisationCapability,
  highRiskCapabilities,
  organisationCapabilities,
  type WorkflowPolicyRecord
} from "@/lib/foundation";
import { deterministicContentHash } from "@/lib/evaluation-provenance";
import { migrateD1 } from "@/db/migrations";
import { getRuntimeEnv, type D1DatabaseBinding } from "@/lib/runtime-env";

export class FoundationAccessError extends Error {
  constructor(readonly statusCode: 401 | 403 | 404 | 409 | 428 | 503, message: string) {
    super(message);
    this.name = "FoundationAccessError";
  }
}

type OrganisationRow = {
  id: string; name: string; status: OrganisationRecord["status"]; founder_user_id: string;
  active_workflow_policy_version: number; active_approval_policy_version: number;
  created_at: string; updated_at: string; record_version: number;
};
type MembershipRow = {
  id: string; organisation_id: string; user_id: string; role: OrganisationMembership["role"];
  capability: string; status: OrganisationMembership["status"]; created_at: string; revoked_at: string | null;
};
type WorkflowRow = {
  id: string; organisation_id: string; version: number; edition: WorkflowPolicyRecord["edition"];
  status: WorkflowPolicyRecord["status"]; policy_json: string; approved_by_actor_id: string;
  approved_at: string; reason: string; content_hash: string;
};
type ApprovalRow = {
  id: string; organisation_id: string; version: number; steps_json: string; release_gates_json: string;
  creator_may_approve: number; status: ApprovalPolicyRecord["status"]; approved_by_actor_id: string;
  approved_at: string; reason: string; content_hash: string;
};
type AuditRow = {
  id: string; organisation_id: string; actor_user_id: string; actor_display_name: string; action: string;
  entity_type: string; entity_id: string; case_id: string | null; project_id: string | null; floor_id: string | null;
  before_hash: string | null; after_hash: string | null; reason: string; request_id: string;
  idempotency_key: string; occurred_at: string; previous_audit_hash: string | null; event_hash: string;
};
type UserAccessRow = {
  id: string; organisation_id: string; target_user_id: string; target_email: string;
  requested_by_user_id: string; requested_by_role: OrganisationMembership["role"];
  proposed_role: Exclude<OrganisationMembership["role"], "SUPER_ADMIN">; proposed_capabilities_json: string;
  final_role: Exclude<OrganisationMembership["role"], "SUPER_ADMIN"> | null; final_capabilities_json: string | null;
  state: UserAccessRequestRecord["state"]; reason: string; request_id: string; idempotency_key: string;
  reviewed_by_user_id: string | null; reviewed_at: string | null; activated_membership_id: string | null;
  created_at: string; updated_at: string; record_version: number;
};

function database(): D1DatabaseBinding {
  const db = getRuntimeEnv().DB;
  if (!db) throw new FoundationAccessError(503, "Founder Edition durable organisation storage is unavailable.");
  return db;
}

function organisationFromRow(row: OrganisationRow): OrganisationRecord {
  return { id: row.id, name: row.name, status: row.status, founderUserId: row.founder_user_id,
    activeWorkflowPolicyVersion: row.active_workflow_policy_version, activeApprovalPolicyVersion: row.active_approval_policy_version,
    createdAt: row.created_at, updatedAt: row.updated_at, recordVersion: row.record_version };
}
function membershipFromRow(row: MembershipRow): OrganisationMembership {
  return { id: row.id, organisationId: row.organisation_id, userId: row.user_id, role: row.role,
    capability: row.capability, status: row.status, createdAt: row.created_at, ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}) };
}
function workflowFromRow(row: WorkflowRow): WorkflowPolicyRecord {
  return { id: row.id, organisationId: row.organisation_id, version: row.version, edition: row.edition,
    status: row.status, policyJson: JSON.parse(row.policy_json), approvedByActorId: row.approved_by_actor_id,
    approvedAt: row.approved_at, reason: row.reason, contentHash: row.content_hash };
}
function approvalFromRow(row: ApprovalRow): ApprovalPolicyRecord {
  return { id: row.id, organisationId: row.organisation_id, version: row.version,
    steps: JSON.parse(row.steps_json), releaseGates: JSON.parse(row.release_gates_json), creatorMayApprove: row.creator_may_approve === 1,
    status: row.status, approvedByActorId: row.approved_by_actor_id, approvedAt: row.approved_at,
    reason: row.reason, contentHash: row.content_hash };
}
function auditFromRow(row: AuditRow): ImmutableAuditEvent {
  return { id: row.id, organisationId: row.organisation_id, actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name, action: row.action, entityType: row.entity_type, entityId: row.entity_id,
    ...(row.case_id ? { caseId: row.case_id } : {}), ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.floor_id ? { floorId: row.floor_id } : {}), ...(row.before_hash ? { beforeHash: row.before_hash } : {}),
    ...(row.after_hash ? { afterHash: row.after_hash } : {}), reason: row.reason, requestId: row.request_id,
    idempotencyKey: row.idempotency_key, occurredAt: row.occurred_at,
    ...(row.previous_audit_hash ? { previousAuditHash: row.previous_audit_hash } : {}), eventHash: row.event_hash };
}

function accessRequestFromRow(row: UserAccessRow): UserAccessRequestRecord {
  return {
    id: row.id, organisationId: row.organisation_id, targetUserId: row.target_user_id,
    targetEmail: row.target_email, requestedByUserId: row.requested_by_user_id, requestedByRole: row.requested_by_role,
    proposedRole: row.proposed_role, proposedCapabilities: JSON.parse(row.proposed_capabilities_json),
    ...(row.final_role ? { finalRole: row.final_role } : {}),
    ...(row.final_capabilities_json ? { finalCapabilities: JSON.parse(row.final_capabilities_json) } : {}),
    state: row.state, reason: row.reason, requestId: row.request_id, idempotencyKey: row.idempotency_key,
    ...(row.reviewed_by_user_id ? { reviewedByUserId: row.reviewed_by_user_id } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
    ...(row.activated_membership_id ? { activatedMembershipId: row.activated_membership_id } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at, recordVersion: row.record_version
  };
}

function auditHash(input: Omit<ImmutableAuditEvent, "eventHash">) {
  return deterministicContentHash(input);
}

async function loadContext(db: D1DatabaseBinding, membershipRow: MembershipRow, organisationRow: OrganisationRow): Promise<FounderFoundationContext> {
  const workflow = await db.prepare("SELECT * FROM workflow_policies WHERE organisation_id = ? AND version = ?")
    .bind(organisationRow.id, organisationRow.active_workflow_policy_version).first<WorkflowRow>();
  const approval = await db.prepare("SELECT * FROM approval_policies WHERE organisation_id = ? AND version = ?")
    .bind(organisationRow.id, organisationRow.active_approval_policy_version).first<ApprovalRow>();
  if (!workflow || !approval) throw new FoundationAccessError(503, "The active Founder Edition policies are unavailable.");
  return { organisation: organisationFromRow(organisationRow), membership: membershipFromRow(membershipRow),
    workflowPolicy: workflowFromRow(workflow), approvalPolicy: approvalFromRow(approval), isFounderEdition: workflow.edition === "FOUNDER" };
}

async function bootstrapFounder(db: D1DatabaseBinding, actor: AppUser): Promise<FounderFoundationContext> {
  const now = new Date().toISOString();
  const organisationId = crypto.randomUUID();
  const organisation: OrganisationRecord = { id: organisationId, name: "Uchit Vastu India", status: "ACTIVE",
    founderUserId: actor.id, activeWorkflowPolicyVersion: 1, activeApprovalPolicyVersion: 1,
    createdAt: now, updatedAt: now, recordVersion: 1 };
  const workflowId = crypto.randomUUID();
  const approvalId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const workflowHash = deterministicContentHash(DEFAULT_FOUNDER_WORKFLOW_POLICY);
  const approvalHash = deterministicContentHash(DEFAULT_FOUNDER_APPROVAL_POLICY);
  const auditBase: Omit<ImmutableAuditEvent, "eventHash"> = {
    id: crypto.randomUUID(), organisationId, actorUserId: actor.id, actorDisplayName: actor.fullName,
    action: "FOUNDER_ORGANISATION_BOOTSTRAPPED", entityType: "ORGANISATION", entityId: organisationId,
    afterHash: deterministicContentHash({ organisation, workflowHash, approvalHash }),
    reason: "Initial Founder Edition organisation and owner policy bootstrap.", requestId: crypto.randomUUID(),
    idempotencyKey: `founder-bootstrap:${actor.id}`, occurredAt: now
  };
  const audit = { ...auditBase, eventHash: auditHash(auditBase) };
  await db.batch([
    db.prepare(`INSERT INTO organisations (id,name,status,founder_user_id,active_workflow_policy_version,active_approval_policy_version,created_at,updated_at,record_version)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(organisation.id, organisation.name, organisation.status, actor.id, 1, 1, now, now, 1),
    db.prepare(`INSERT INTO organisation_memberships (id,organisation_id,user_id,role,capability,status,created_at)
      VALUES (?,?,?,?,?,'ACTIVE',?)`).bind(membershipId, organisationId, actor.id, "SUPER_ADMIN", "organisation_owner", now),
    db.prepare(`INSERT INTO workflow_policies (id,organisation_id,version,edition,status,policy_json,approved_by_actor_id,approved_at,reason,content_hash)
      VALUES (?,?,1,'FOUNDER','ACTIVE',?,?,?,?,?)`).bind(workflowId, organisationId, JSON.stringify(DEFAULT_FOUNDER_WORKFLOW_POLICY.policyJson), actor.id, now, "Initial Founder Edition workflow policy.", workflowHash),
    db.prepare(`INSERT INTO approval_policies (id,organisation_id,version,steps_json,release_gates_json,creator_may_approve,status,approved_by_actor_id,approved_at,reason,content_hash)
      VALUES (?,?,1,?,?,1,'ACTIVE',?,?,?,?)`).bind(approvalId, organisationId, JSON.stringify(DEFAULT_FOUNDER_APPROVAL_POLICY.steps), JSON.stringify(DEFAULT_FOUNDER_APPROVAL_POLICY.releaseGates), actor.id, now, "Initial one-owner Founder approval policy.", approvalHash),
    auditInsert(db, audit)
  ]);
  const membership = await db.prepare("SELECT * FROM organisation_memberships WHERE id = ?").bind(membershipId).first<MembershipRow>();
  const orgRow = await db.prepare("SELECT * FROM organisations WHERE id = ?").bind(organisationId).first<OrganisationRow>();
  if (!membership || !orgRow) throw new FoundationAccessError(503, "Founder organisation bootstrap did not complete.");
  return loadContext(db, membership, orgRow);
}

function auditInsert(db: D1DatabaseBinding, event: ImmutableAuditEvent) {
  return db.prepare(`INSERT INTO audit_events
    (id,organisation_id,actor_user_id,actor_display_name,action,entity_type,entity_id,case_id,project_id,floor_id,before_hash,after_hash,reason,request_id,idempotency_key,occurred_at,previous_audit_hash,event_hash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(event.id, event.organisationId, event.actorUserId, event.actorDisplayName,
      event.action, event.entityType, event.entityId, event.caseId ?? null, event.projectId ?? null, event.floorId ?? null,
      event.beforeHash ?? null, event.afterHash ?? null, event.reason, event.requestId, event.idempotencyKey,
      event.occurredAt, event.previousAuditHash ?? null, event.eventHash);
}

async function buildAuditEvent(input: {
  organisationId: string; actor: AppUser; action: string; entityType: string; entityId: string;
  reason: string; requestId: string; idempotencyKey: string; beforeHash?: string; afterHash?: string;
  caseId?: string; projectId?: string; floorId?: string;
}) {
  const db = database();
  const previous = await db.prepare("SELECT event_hash FROM audit_events WHERE organisation_id=? ORDER BY occurred_at DESC LIMIT 1")
    .bind(input.organisationId).first<{ event_hash: string }>();
  const base: Omit<ImmutableAuditEvent, "eventHash"> = {
    id: crypto.randomUUID(), organisationId: input.organisationId, actorUserId: input.actor.id,
    actorDisplayName: input.actor.fullName, action: input.action, entityType: input.entityType, entityId: input.entityId,
    reason: input.reason, requestId: input.requestId, idempotencyKey: input.idempotencyKey,
    occurredAt: new Date().toISOString(), ...(input.beforeHash ? { beforeHash: input.beforeHash } : {}),
    ...(input.afterHash ? { afterHash: input.afterHash } : {}), ...(input.caseId ? { caseId: input.caseId } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.floorId ? { floorId: input.floorId } : {}),
    ...(previous?.event_hash ? { previousAuditHash: previous.event_hash } : {})
  };
  return { ...base, eventHash: auditHash(base) };
}

export async function appendImmutableAuditEvent(input: Parameters<typeof buildAuditEvent>[0]) {
  const db = database();
  await migrateD1(db);
  const replay = await db.prepare("SELECT * FROM audit_events WHERE organisation_id=? AND idempotency_key=?")
    .bind(input.organisationId, input.idempotencyKey).first<AuditRow>();
  if (replay) return { event: auditFromRow(replay), replayed: true };
  const event = await buildAuditEvent(input);
  await auditInsert(db, event).run();
  return { event, replayed: false };
}

export async function resolveActiveOrganisationContext(actor: AppUser, allowFounderBootstrap = false): Promise<FounderFoundationContext> {
  const db = database();
  await migrateD1(db);
  const rows = await db.prepare(`SELECT m.* FROM organisation_memberships m JOIN organisations o ON o.id=m.organisation_id
    WHERE m.user_id=? AND m.status='ACTIVE' AND o.status='ACTIVE' ORDER BY m.created_at`).bind(actor.id).all<MembershipRow>();
  if ((rows.results ?? []).length > 1) throw new FoundationAccessError(409, "Choose one active organisation before continuing.");
  const membership = rows.results?.[0];
  if (!membership) {
    if (!allowFounderBootstrap) throw new FoundationAccessError(403, "No active Uchit organisation membership is assigned to this account.");
    return bootstrapFounder(db, actor);
  }
  const organisation = await db.prepare("SELECT * FROM organisations WHERE id=?").bind(membership.organisation_id).first<OrganisationRow>();
  if (!organisation) throw new FoundationAccessError(404, "Organisation not found.");
  if (organisation.status !== "ACTIVE") throw new FoundationAccessError(403, "This organisation is not active.");
  return loadContext(db, membership, organisation);
}

export async function listAuditEvents(organisationId: string, filters: { entityType?: string; entityId?: string; caseId?: string; projectId?: string; floorId?: string; limit?: number } = {}) {
  const db = database();
  await migrateD1(db);
  const clauses = ["organisation_id = ?"];
  const values: unknown[] = [organisationId];
  for (const [column, value] of [["entity_type", filters.entityType], ["entity_id", filters.entityId], ["case_id", filters.caseId], ["project_id", filters.projectId], ["floor_id", filters.floorId]] as const) {
    if (value) { clauses.push(`${column} = ?`); values.push(value); }
  }
  const limit = Number.isInteger(filters.limit) ? Math.max(1, Math.min(100, filters.limit!)) : 50;
  values.push(limit);
  const result = await db.prepare(`SELECT * FROM audit_events WHERE ${clauses.join(" AND ")} ORDER BY occurred_at DESC LIMIT ?`).bind(...values).all<AuditRow>();
  return (result.results ?? []).map(auditFromRow);
}

export async function listUserAccessRequests(context: FounderFoundationContext, actor: AppUser, limit = 50) {
  if (!isOrganisationOwner(context, actor) && !(context.membership.role === "ADMIN" && hasOrganisationCapability(context.membership, "USER_MANAGEMENT"))) {
    throw new FoundationAccessError(403, "User-access governance is not assigned to this account.");
  }
  const db = database();
  await migrateD1(db);
  const boundedLimit = Number.isInteger(limit) ? Math.max(1, Math.min(100, limit)) : 50;
  const result = await db.prepare("SELECT * FROM user_access_requests WHERE organisation_id=? ORDER BY updated_at DESC LIMIT ?")
    .bind(context.organisation.id, boundedLimit).all<UserAccessRow>();
  return (result.results ?? []).map(accessRequestFromRow);
}

export async function publishFoundationPolicies(input: {
  context: FounderFoundationContext; actor: AppUser; workflowPolicy?: Record<string, unknown>;
  approvalPolicy?: { steps?: unknown; releaseGates?: unknown; creatorMayApprove?: unknown };
  reason: string; idempotencyKey: string; requestId: string; expectedOrganisationVersion: number;
}) {
  const db = database();
  await migrateD1(db);
  if (input.context.membership.role !== "SUPER_ADMIN" || input.context.membership.capability !== "organisation_owner") {
    throw new FoundationAccessError(403, "Only the active organisation owner can publish Founder Edition policies.");
  }
  if (input.context.organisation.founderUserId !== input.actor.id) throw new FoundationAccessError(403, "Organisation ownership is required.");
  const reason = input.reason.trim();
  if (reason.length < 20 || reason.length > 500) throw new FoundationAccessError(409, "Policy changes require a reason of 20 to 500 characters.");
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) throw new FoundationAccessError(409, "A bounded idempotency key is required.");
  const replay = await db.prepare("SELECT * FROM audit_events WHERE organisation_id=? AND idempotency_key=?")
    .bind(input.context.organisation.id, idempotencyKey).first<AuditRow>();
  if (replay) return { context: await resolveActiveOrganisationContext(input.actor), audit: auditFromRow(replay), replayed: true };
  if (input.expectedOrganisationVersion !== input.context.organisation.recordVersion) throw new FoundationAccessError(409, "The organisation policy changed. Reload before publishing.");

  const workflowPolicyJson = input.workflowPolicy ?? input.context.workflowPolicy.policyJson;
  if (!workflowPolicyJson || typeof workflowPolicyJson !== "object" || Array.isArray(workflowPolicyJson) || JSON.stringify(workflowPolicyJson).length > 20_000) {
    throw new FoundationAccessError(409, "Workflow policy must be a bounded object.");
  }
  const steps = input.approvalPolicy?.steps ?? input.context.approvalPolicy.steps;
  const releaseGates = input.approvalPolicy?.releaseGates ?? input.context.approvalPolicy.releaseGates;
  const creatorMayApprove = input.approvalPolicy?.creatorMayApprove ?? input.context.approvalPolicy.creatorMayApprove;
  if (!Array.isArray(steps) || steps.some((item) => typeof item !== "string" || !item.trim()) || steps.length > 20) throw new FoundationAccessError(409, "Approval steps must be a bounded list.");
  if (!Array.isArray(releaseGates) || releaseGates.some((item) => typeof item !== "string" || !item.trim()) || releaseGates.length > 40) throw new FoundationAccessError(409, "Release gates must be a bounded list.");
  if (typeof creatorMayApprove !== "boolean") throw new FoundationAccessError(409, "creatorMayApprove must be true or false.");
  const now = new Date().toISOString();
  const workflowVersion = input.context.workflowPolicy.version + 1;
  const approvalVersion = input.context.approvalPolicy.version + 1;
  const workflowHash = deterministicContentHash({ edition: "FOUNDER", policyJson: workflowPolicyJson });
  const approvalHash = deterministicContentHash({ steps, releaseGates, creatorMayApprove });
  const previous = await db.prepare("SELECT event_hash FROM audit_events WHERE organisation_id=? ORDER BY occurred_at DESC LIMIT 1")
    .bind(input.context.organisation.id).first<{ event_hash: string }>();
  const beforeHash = deterministicContentHash({ workflow: input.context.workflowPolicy.contentHash, approval: input.context.approvalPolicy.contentHash });
  const afterHash = deterministicContentHash({ workflow: workflowHash, approval: approvalHash });
  const base: Omit<ImmutableAuditEvent, "eventHash"> = { id: crypto.randomUUID(), organisationId: input.context.organisation.id,
    actorUserId: input.actor.id, actorDisplayName: input.actor.fullName, action: "FOUNDATION_POLICIES_PUBLISHED",
    entityType: "ORGANISATION", entityId: input.context.organisation.id, beforeHash, afterHash, reason,
    requestId: input.requestId, idempotencyKey, occurredAt: now, ...(previous?.event_hash ? { previousAuditHash: previous.event_hash } : {}) };
  const audit = { ...base, eventHash: auditHash(base) };
  const expected = input.expectedOrganisationVersion;
  const orgId = input.context.organisation.id;
  const results = await db.batch([
    db.prepare(`INSERT INTO workflow_policies (id,organisation_id,version,edition,status,policy_json,approved_by_actor_id,approved_at,reason,content_hash)
      SELECT ?,?,?, 'FOUNDER','ACTIVE',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
      .bind(crypto.randomUUID(), orgId, workflowVersion, JSON.stringify(workflowPolicyJson), input.actor.id, now, reason, workflowHash, orgId, expected),
    db.prepare(`INSERT INTO approval_policies (id,organisation_id,version,steps_json,release_gates_json,creator_may_approve,status,approved_by_actor_id,approved_at,reason,content_hash)
      SELECT ?,?,?,?,?,?,'ACTIVE',?,?,?,? WHERE EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
      .bind(crypto.randomUUID(), orgId, approvalVersion, JSON.stringify(steps), JSON.stringify(releaseGates), creatorMayApprove ? 1 : 0, input.actor.id, now, reason, approvalHash, orgId, expected),
    db.prepare(`UPDATE workflow_policies SET status='RETIRED' WHERE organisation_id=? AND version=? AND EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
      .bind(orgId, input.context.workflowPolicy.version, orgId, expected),
    db.prepare(`UPDATE approval_policies SET status='RETIRED' WHERE organisation_id=? AND version=? AND EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
      .bind(orgId, input.context.approvalPolicy.version, orgId, expected),
    db.prepare(`UPDATE organisations SET active_workflow_policy_version=?,active_approval_policy_version=?,updated_at=?,record_version=record_version+1 WHERE id=? AND record_version=?`)
      .bind(workflowVersion, approvalVersion, now, orgId, expected),
    db.prepare(`INSERT INTO audit_events
      (id,organisation_id,actor_user_id,actor_display_name,action,entity_type,entity_id,case_id,project_id,floor_id,before_hash,after_hash,reason,request_id,idempotency_key,occurred_at,previous_audit_hash,event_hash)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
      .bind(audit.id, audit.organisationId, audit.actorUserId, audit.actorDisplayName, audit.action, audit.entityType, audit.entityId,
        null, null, null, audit.beforeHash ?? null, audit.afterHash ?? null, audit.reason, audit.requestId, audit.idempotencyKey,
        audit.occurredAt, audit.previousAuditHash ?? null, audit.eventHash, orgId, expected + 1)
  ]);
  if (results[4]?.meta?.changes !== 1) throw new FoundationAccessError(409, "The organisation policy changed. Reload before publishing.");
  return { context: await resolveActiveOrganisationContext(input.actor), audit, replayed: false };
}

// SPECIALIST remains a dormant schema capability until Team Edition defines
// its effective application permissions. Founder Edition never activates it.
const assignableRoles = ["ADMIN", "CONSULTANT", "SETTER"] as const;
type AssignableRole = (typeof assignableRoles)[number];
type AccessAction = "CREATE" | "SUBMIT" | "APPROVE" | "ACTIVATE" | "REJECT" | "CANCEL" | "REVOKE";

function boundedGovernanceText(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") throw new FoundationAccessError(409, `${label} is required.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum || /[<>\u0000-\u001f\u007f]/.test(normalized)) {
    throw new FoundationAccessError(409, `${label} must be ${minimum} to ${maximum} safe characters.`);
  }
  return normalized;
}

function assignableRole(value: unknown): AssignableRole {
  if (typeof value !== "string" || !(assignableRoles as readonly string[]).includes(value)) {
    throw new FoundationAccessError(403, "A user-access request cannot grant SUPER_ADMIN or an unknown role.");
  }
  return value as AssignableRole;
}

function normalizedCapabilities(value: unknown): OrganisationCapability[] {
  if (!Array.isArray(value) || value.length > organisationCapabilities.length) {
    throw new FoundationAccessError(409, "Capabilities must be a bounded approved list.");
  }
  const capabilities = [...new Set(value.map((item) => {
    if (typeof item !== "string" || !(organisationCapabilities as readonly string[]).includes(item) || item === "organisation_owner") {
      throw new FoundationAccessError(403, "The request contains a capability that cannot be delegated.");
    }
    return item as OrganisationCapability;
  }))].sort();
  return capabilities;
}

function isOrganisationOwner(context: FounderFoundationContext, actor: AppUser) {
  return context.organisation.founderUserId === actor.id && context.membership.role === "SUPER_ADMIN"
    && context.membership.capability === "organisation_owner";
}

function canPrepareAccess(context: FounderFoundationContext, actor: AppUser) {
  return isOrganisationOwner(context, actor)
    || (context.membership.role === "ADMIN" && hasOrganisationCapability(context.membership, "USER_MANAGEMENT"));
}

async function loadAccessRequest(db: D1DatabaseBinding, organisationId: string, requestId: string) {
  const row = await db.prepare("SELECT * FROM user_access_requests WHERE id=? AND organisation_id=?")
    .bind(requestId, organisationId).first<UserAccessRow>();
  if (!row) throw new FoundationAccessError(404, "User-access request not found.");
  return row;
}

function membershipCapabilitiesJson(capabilities: OrganisationCapability[]) {
  return JSON.stringify([...capabilities].sort());
}

async function accessAudit(input: {
  context: FounderFoundationContext; actor: AppUser; action: string; request: UserAccessRequestRecord;
  reason: string; requestId: string; idempotencyKey: string; beforeHash?: string; afterHash: string;
}) {
  return buildAuditEvent({ organisationId: input.context.organisation.id, actor: input.actor, action: input.action,
    entityType: "USER_ACCESS_REQUEST", entityId: input.request.id, reason: input.reason, requestId: input.requestId,
    idempotencyKey: input.idempotencyKey, beforeHash: input.beforeHash, afterHash: input.afterHash });
}

export async function mutateUserAccessRequest(input: {
  context: FounderFoundationContext; actor: AppUser; action: AccessAction; accessRequestId?: string;
  targetUserId?: unknown; targetEmail?: unknown; proposedRole?: unknown; proposedCapabilities?: unknown;
  finalRole?: unknown; finalCapabilities?: unknown; reason: unknown; idempotencyKey: unknown; requestId: string;
  expectedOrganisationVersion: number; expectedRecordVersion?: number;
}) {
  const db = database();
  await migrateD1(db);
  const owner = isOrganisationOwner(input.context, input.actor);
  if ((input.action === "CREATE" || input.action === "SUBMIT" || input.action === "CANCEL") ? !canPrepareAccess(input.context, input.actor) : !owner) {
    throw new FoundationAccessError(403, input.action === "CREATE"
      ? "Only the organisation owner or a delegated administrator can prepare access requests."
      : "Only the organisation owner can perform this user-governance action.");
  }
  const reason = boundedGovernanceText(input.reason, "Reason", 20, 500);
  const idempotencyKey = boundedGovernanceText(input.idempotencyKey, "Idempotency key", 1, 160);
  if (!Number.isInteger(input.expectedOrganisationVersion) || input.expectedOrganisationVersion < 0) {
    throw new FoundationAccessError(428, "The current organisation version is required.");
  }
  const replay = await db.prepare("SELECT * FROM audit_events WHERE organisation_id=? AND idempotency_key=?")
    .bind(input.context.organisation.id, idempotencyKey).first<AuditRow>();
  if (replay) {
    const request = await loadAccessRequest(db, input.context.organisation.id, replay.entity_id);
    return { request: accessRequestFromRow(request), audit: auditFromRow(replay), replayed: true };
  }
  if (input.expectedOrganisationVersion !== input.context.organisation.recordVersion) {
    throw new FoundationAccessError(409, "The organisation changed. Reload before changing access.");
  }

  const organisationId = input.context.organisation.id;
  const now = new Date().toISOString();
  if (input.action === "CREATE") {
    const targetUserId = boundedGovernanceText(input.targetUserId, "Target user ID", 3, 200);
    const targetEmail = boundedGovernanceText(input.targetEmail, "Target email", 5, 254).toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(targetEmail)) throw new FoundationAccessError(409, "Target email is invalid.");
    if (targetUserId === input.actor.id) throw new FoundationAccessError(403, "Self-escalation through an access request is not allowed.");
    const proposedRole = assignableRole(input.proposedRole);
    const proposedCapabilities = normalizedCapabilities(input.proposedCapabilities);
    if (!owner && proposedRole === "ADMIN") throw new FoundationAccessError(403, "An administrator cannot prepare another administrator account.");
    if (!owner && proposedCapabilities.includes("USER_MANAGEMENT")) throw new FoundationAccessError(403, "Only the organisation owner can delegate user management.");
    const foreign = await db.prepare("SELECT organisation_id FROM organisation_memberships WHERE user_id=? AND organisation_id<>? AND status='ACTIVE' LIMIT 1")
      .bind(targetUserId, organisationId).first<{ organisation_id: string }>();
    if (foreign) throw new FoundationAccessError(404, "Target user not found in this organisation scope.");
    const pending = await db.prepare(`SELECT * FROM user_access_requests WHERE organisation_id=? AND target_user_id=?
      AND state IN ('DRAFT','PENDING_SUPER_ADMIN_APPROVAL','APPROVED') ORDER BY created_at DESC LIMIT 1`)
      .bind(organisationId, targetUserId).first<UserAccessRow>();
    if (pending) {
      const existing = accessRequestFromRow(pending);
      if (existing.targetEmail === targetEmail && existing.proposedRole === proposedRole
        && JSON.stringify(existing.proposedCapabilities) === JSON.stringify(proposedCapabilities)) {
        return { request: existing, replayed: true };
      }
      throw new FoundationAccessError(409, "A different access request for this user is already pending.");
    }
    const request: UserAccessRequestRecord = {
      id: crypto.randomUUID(), organisationId, targetUserId, targetEmail, requestedByUserId: input.actor.id,
      requestedByRole: input.context.membership.role, proposedRole, proposedCapabilities, state: "DRAFT", reason,
      requestId: input.requestId, idempotencyKey, createdAt: now, updatedAt: now, recordVersion: 1
    };
    const afterHash = deterministicContentHash({ targetUserId, targetEmail, proposedRole, proposedCapabilities, state: request.state });
    const audit = await accessAudit({ context: input.context, actor: input.actor, action: "USER_ACCESS_REQUEST_CREATED",
      request, reason, requestId: input.requestId, idempotencyKey, afterHash });
    const expected = input.expectedOrganisationVersion;
    const results = await db.batch([
      db.prepare(`INSERT INTO user_access_requests
        (id,organisation_id,target_user_id,target_email,requested_by_user_id,requested_by_role,proposed_role,proposed_capabilities_json,state,reason,request_id,idempotency_key,created_at,updated_at,record_version)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
        .bind(request.id, organisationId, targetUserId, targetEmail, input.actor.id, input.context.membership.role,
          proposedRole, JSON.stringify(proposedCapabilities), "DRAFT", reason, input.requestId, idempotencyKey, now, now, organisationId, expected),
      db.prepare(`UPDATE organisations SET updated_at=?,record_version=record_version+1 WHERE id=? AND record_version=?
        AND EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=?)`).bind(now, organisationId, expected, request.id, now),
      db.prepare(`INSERT INTO audit_events
        (id,organisation_id,actor_user_id,actor_display_name,action,entity_type,entity_id,case_id,project_id,floor_id,before_hash,after_hash,reason,request_id,idempotency_key,occurred_at,previous_audit_hash,event_hash)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)
        AND EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=?)`)
        .bind(audit.id, audit.organisationId, audit.actorUserId, audit.actorDisplayName, audit.action, audit.entityType,
          audit.entityId, null, null, null, null, audit.afterHash ?? null, audit.reason, audit.requestId,
          audit.idempotencyKey, audit.occurredAt, audit.previousAuditHash ?? null, audit.eventHash,
          organisationId, expected + 1, request.id, now)
    ]);
    if (results.some((result) => result.meta?.changes !== 1)) throw new FoundationAccessError(409, "The organisation changed. Reload before creating access.");
    return { request, audit, replayed: false };
  }

  const accessRequestId = boundedGovernanceText(input.accessRequestId, "Access request ID", 3, 200);
  const row = await loadAccessRequest(db, organisationId, accessRequestId);
  if (!Number.isInteger(input.expectedRecordVersion) || input.expectedRecordVersion! < 0) {
    throw new FoundationAccessError(428, "The current access-request version is required.");
  }
  if (row.record_version !== input.expectedRecordVersion) throw new FoundationAccessError(409, "The access request changed. Reload and review it again.");
  if ((input.action === "SUBMIT" || input.action === "CANCEL") && !owner && row.requested_by_user_id !== input.actor.id) {
    throw new FoundationAccessError(403, "An administrator can change only access requests they prepared.");
  }
  if ((input.action === "APPROVE" || input.action === "REJECT") && input.context.membership.role !== "SUPER_ADMIN") {
    throw new FoundationAccessError(403, "Super Admin approval is required.");
  }
  const before = accessRequestFromRow(row);
  const transitions: Record<Exclude<AccessAction, "CREATE">, { from: UserAccessRequestRecord["state"]; to: UserAccessRequestRecord["state"] }> = {
    SUBMIT: { from: "DRAFT", to: "PENDING_SUPER_ADMIN_APPROVAL" }, APPROVE: { from: "PENDING_SUPER_ADMIN_APPROVAL", to: "APPROVED" },
    ACTIVATE: { from: "APPROVED", to: "ACTIVE" }, REJECT: { from: "DRAFT", to: "REJECTED" },
    CANCEL: { from: "PENDING_SUPER_ADMIN_APPROVAL", to: "CANCELLED" }, REVOKE: { from: "ACTIVE", to: "REVOKED" }
  };
  const transition = transitions[input.action];
  if (row.state !== transition.from) throw new FoundationAccessError(409, `Access request must be ${transition.from} before ${input.action.toLowerCase()}.`);
  let finalRole = row.final_role;
  let finalCapabilities = row.final_capabilities_json ? JSON.parse(row.final_capabilities_json) as OrganisationCapability[] : undefined;
  if (input.action === "APPROVE") {
    if (row.requested_by_role === "ADMIN" && row.requested_by_user_id === input.actor.id) throw new FoundationAccessError(403, "An administrator cannot approve their own access request.");
    finalRole = assignableRole(input.finalRole);
    finalCapabilities = normalizedCapabilities(input.finalCapabilities);
    // The explicit approval payload is the owner's confirmation of all elevated permissions.
    if ((finalCapabilities.some((item) => (highRiskCapabilities as readonly string[]).includes(item))
      || finalCapabilities.includes("USER_MANAGEMENT")) && !owner) throw new FoundationAccessError(403, "High-risk capabilities require owner confirmation.");
  }
  if ((input.action === "ACTIVATE" || input.action === "REVOKE") && row.target_user_id === input.context.organisation.founderUserId) {
    throw new FoundationAccessError(403, "The organisation owner cannot be changed or revoked through user-access requests.");
  }
  if (input.action === "ACTIVATE" && (!finalRole || !finalCapabilities)) throw new FoundationAccessError(409, "Approved final access is required before activation.");
  const after: UserAccessRequestRecord = { ...before, state: transition.to, updatedAt: now, recordVersion: before.recordVersion + 1,
    ...(input.action === "APPROVE" ? { finalRole: finalRole!, finalCapabilities: finalCapabilities!, reviewedByUserId: input.actor.id, reviewedAt: now } : {}) };
  const existingMembership = await db.prepare("SELECT * FROM organisation_memberships WHERE organisation_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1")
    .bind(organisationId, row.target_user_id).first<MembershipRow>();
  if (existingMembership?.role === "SUPER_ADMIN") throw new FoundationAccessError(403, "The organisation owner cannot be changed through user-access requests.");
  const membershipId = input.action === "ACTIVATE" ? (existingMembership?.id ?? crypto.randomUUID()) : row.activated_membership_id;
  if (membershipId) after.activatedMembershipId = membershipId;
  const beforeHash = deterministicContentHash({ state: before.state, role: before.finalRole ?? before.proposedRole,
    capabilities: before.finalCapabilities ?? before.proposedCapabilities, targetUserId: before.targetUserId });
  const afterHash = deterministicContentHash({ state: after.state, role: after.finalRole ?? after.proposedRole,
    capabilities: after.finalCapabilities ?? after.proposedCapabilities, targetUserId: after.targetUserId });
  const audit = await accessAudit({ context: input.context, actor: input.actor, action: `USER_ACCESS_${input.action}`,
    request: after, reason, requestId: input.requestId, idempotencyKey, beforeHash, afterHash });
  const expectedOrg = input.expectedOrganisationVersion;
  const expectedRecord = input.expectedRecordVersion!;
  const statements = [
    db.prepare(`UPDATE user_access_requests SET state=?,final_role=?,final_capabilities_json=?,reason=?,reviewed_by_user_id=?,reviewed_at=?,activated_membership_id=?,updated_at=?,record_version=record_version+1
      WHERE id=? AND organisation_id=? AND state=? AND record_version=? AND EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)`)
      .bind(after.state, after.finalRole ?? null, after.finalCapabilities ? JSON.stringify(after.finalCapabilities) : null, reason,
        after.reviewedByUserId ?? null, after.reviewedAt ?? null, after.activatedMembershipId ?? null, now,
        row.id, organisationId, transition.from, expectedRecord, organisationId, expectedOrg)
  ];
  if (input.action === "ACTIVATE") {
    const capabilityJson = membershipCapabilitiesJson(finalCapabilities!);
    statements.push(existingMembership
      ? db.prepare(`UPDATE organisation_memberships SET role=?,capability=?,status='ACTIVE',revoked_at=NULL WHERE id=? AND organisation_id=?
          AND role<>'SUPER_ADMIN' AND EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=? AND state='ACTIVE')`)
        .bind(finalRole!, capabilityJson, membershipId, organisationId, row.id, now)
      : db.prepare(`INSERT INTO organisation_memberships (id,organisation_id,user_id,role,capability,status,created_at)
          SELECT ?,?,?,?,?, 'ACTIVE',? WHERE EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=? AND state='ACTIVE')`)
        .bind(membershipId, organisationId, row.target_user_id, finalRole!, capabilityJson, now, row.id, now));
  }
  if (input.action === "REVOKE") {
    if (!existingMembership || existingMembership.status !== "ACTIVE") throw new FoundationAccessError(409, "The target membership is not active.");
    statements.push(db.prepare(`UPDATE organisation_memberships SET status='REVOKED',revoked_at=? WHERE id=? AND organisation_id=? AND role<>'SUPER_ADMIN'
      AND EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=? AND state='REVOKED')`)
      .bind(now, existingMembership.id, organisationId, row.id, now));
  }
  statements.push(
    db.prepare(`UPDATE organisations SET updated_at=?,record_version=record_version+1 WHERE id=? AND record_version=?
      AND EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=? AND state=?)`)
      .bind(now, organisationId, expectedOrg, row.id, now, after.state),
    db.prepare(`INSERT INTO audit_events
      (id,organisation_id,actor_user_id,actor_display_name,action,entity_type,entity_id,case_id,project_id,floor_id,before_hash,after_hash,reason,request_id,idempotency_key,occurred_at,previous_audit_hash,event_hash)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM organisations WHERE id=? AND record_version=?)
      AND EXISTS (SELECT 1 FROM user_access_requests WHERE id=? AND updated_at=? AND state=?)`)
      .bind(audit.id, audit.organisationId, audit.actorUserId, audit.actorDisplayName, audit.action, audit.entityType,
        audit.entityId, null, null, null, audit.beforeHash ?? null, audit.afterHash ?? null, audit.reason, audit.requestId,
        audit.idempotencyKey, audit.occurredAt, audit.previousAuditHash ?? null, audit.eventHash,
        organisationId, expectedOrg + 1, row.id, now, after.state)
  );
  const results = await db.batch(statements);
  if (results.some((result) => result.meta?.changes !== 1)) throw new FoundationAccessError(409, "The access request changed. Reload before continuing.");
  return { request: after, audit, replayed: false };
}

/** Ownership transfers are intentionally contract-only until the two-party UI is approved. */
export function assertOwnershipTransferContract(input: { currentOwner: OrganisationMembership; proposedOwner: OrganisationMembership; confirmedByCurrentOwner: boolean; confirmedByProposedOwner: boolean }) {
  if (input.currentOwner.role !== "SUPER_ADMIN" || input.currentOwner.capability !== "organisation_owner") throw new FoundationAccessError(403, "Only the current owner can initiate ownership transfer.");
  if (input.proposedOwner.organisationId !== input.currentOwner.organisationId || input.proposedOwner.status !== "ACTIVE" || input.proposedOwner.role !== "ADMIN") throw new FoundationAccessError(409, "Ownership can transfer only to an active administrator in the same organisation.");
  if (!input.confirmedByCurrentOwner || !input.confirmedByProposedOwner) throw new FoundationAccessError(409, "Ownership transfer requires confirmation from both people.");
  return true;
}
