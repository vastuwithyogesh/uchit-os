export const optinLeadsSchema = `
CREATE TABLE IF NOT EXISTS optin_leads (
  id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  unique_client_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_optin_leads_last_seen_at
ON optin_leads(last_seen_at);

CREATE TABLE IF NOT EXISTS review_call_bookings (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  meeting_link TEXT NOT NULL,
  calendar_hold_id TEXT NOT NULL,
  status TEXT NOT NULL,
  booked_by TEXT NOT NULL,
  booked_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_call_bookings_booked_at
ON review_call_bookings(booked_at);

CREATE TABLE IF NOT EXISTS advance_verifications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  amount_inr INTEGER NOT NULL,
  reference_screenshot_url TEXT NOT NULL,
  reference_screenshot_file_name TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  case_id TEXT,
  status TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advance_verifications_verified_at
ON advance_verifications(verified_at);

CREATE TABLE IF NOT EXISTS app_state_snapshot (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_role_assignments (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  full_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_role_assignment_audit (
  id TEXT PRIMARY KEY,
  target_email TEXT NOT NULL,
  previous_role TEXT,
  next_role TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_role_audit_target_time
ON staff_role_assignment_audit(target_email, changed_at);

CREATE TABLE IF NOT EXISTS case_file_assets (
  id TEXT PRIMARY KEY, evidence_ref TEXT NOT NULL UNIQUE, organisation_id TEXT, case_id TEXT NOT NULL,
  case_revision_number INTEGER NOT NULL, service_type TEXT NOT NULL, floor_label TEXT,
  object_key TEXT NOT NULL UNIQUE, original_file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL, uploaded_by_id TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL, uploaded_by_role TEXT NOT NULL, created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'IMMUTABLE')
);

CREATE INDEX IF NOT EXISTS idx_case_file_assets_scope
ON case_file_assets(case_id, case_revision_number, service_type, created_at);

CREATE INDEX IF NOT EXISTS idx_case_file_assets_floor
ON case_file_assets(case_id, floor_label);
CREATE INDEX IF NOT EXISTS idx_case_file_assets_org_scope
ON case_file_assets(organisation_id, case_id, case_revision_number, service_type, floor_label, created_at);

CREATE TABLE IF NOT EXISTS inbound_optin_events (
  event_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, source TEXT NOT NULL,
  payload_hash TEXT NOT NULL, identity_hash TEXT NOT NULL, received_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('CREATED', 'UPDATED')),
  submission_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbound_optin_events_received
ON inbound_optin_events(received_at);

CREATE INDEX IF NOT EXISTS idx_inbound_optin_events_identity
ON inbound_optin_events(identity_hash, received_at);

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
  founder_user_id TEXT NOT NULL, active_workflow_policy_version INTEGER NOT NULL,
  active_approval_policy_version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  record_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS organisation_memberships (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, user_id TEXT NOT NULL,
  role TEXT NOT NULL, capability TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_owner_per_org
ON organisation_memberships(organisation_id) WHERE role='SUPER_ADMIN' AND status='ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_membership_user_org
ON organisation_memberships(organisation_id,user_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS workflow_policies (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, version INTEGER NOT NULL, edition TEXT NOT NULL,
  status TEXT NOT NULL, policy_json TEXT NOT NULL, approved_by_actor_id TEXT NOT NULL,
  approved_at TEXT NOT NULL, reason TEXT NOT NULL, content_hash TEXT NOT NULL,
  UNIQUE (organisation_id,version)
);
CREATE TABLE IF NOT EXISTS approval_policies (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, version INTEGER NOT NULL,
  steps_json TEXT NOT NULL, release_gates_json TEXT NOT NULL, creator_may_approve INTEGER NOT NULL,
  status TEXT NOT NULL, approved_by_actor_id TEXT NOT NULL, approved_at TEXT NOT NULL,
  reason TEXT NOT NULL, content_hash TEXT NOT NULL, UNIQUE (organisation_id,version)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, actor_user_id TEXT NOT NULL,
  actor_display_name TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  case_id TEXT, project_id TEXT, floor_id TEXT, before_hash TEXT, after_hash TEXT, reason TEXT NOT NULL,
  request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, occurred_at TEXT NOT NULL,
  previous_audit_hash TEXT, event_hash TEXT NOT NULL UNIQUE, UNIQUE (organisation_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_events(organisation_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(organisation_id,entity_type,entity_id,occurred_at);

CREATE TABLE IF NOT EXISTS user_access_requests (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, target_user_id TEXT NOT NULL, target_email TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL, requested_by_role TEXT NOT NULL, proposed_role TEXT NOT NULL,
  proposed_capabilities_json TEXT NOT NULL, final_role TEXT, final_capabilities_json TEXT,
  state TEXT NOT NULL, reason TEXT NOT NULL, request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  reviewed_by_user_id TEXT, reviewed_at TEXT, activated_membership_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organisation_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_access_requests_target_state
ON user_access_requests(organisation_id,target_user_id,state);

CREATE TABLE IF NOT EXISTS ownership_transfer_requests (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, current_owner_user_id TEXT NOT NULL,
  proposed_owner_user_id TEXT NOT NULL, state TEXT NOT NULL, current_owner_confirmed_at TEXT,
  proposed_owner_confirmed_at TEXT, reason TEXT NOT NULL, request_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS final_pdf_artifacts (
  artifact_id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, report_version_id TEXT NOT NULL,
  report_version_label TEXT NOT NULL, case_id TEXT NOT NULL, project_id TEXT NOT NULL, floor_id TEXT NOT NULL,
  report_template_version TEXT NOT NULL, source_snapshot_hash TEXT NOT NULL, artifact_hash_sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, page_count INTEGER NOT NULL,
  renderer_version TEXT NOT NULL, page_configuration TEXT NOT NULL, embedded_evidence_checksums_json TEXT NOT NULL,
  generated_at TEXT NOT NULL, verified_at TEXT, released_at TEXT, released_by_actor_id TEXT,
  security_profile TEXT NOT NULL, status TEXT NOT NULL, generation_idempotency_key TEXT NOT NULL,
  record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,report_version_id),
  UNIQUE (organisation_id,generation_idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_final_pdf_scope
ON final_pdf_artifacts(organisation_id,case_id,project_id,floor_id,status);

CREATE TABLE IF NOT EXISTS final_pdf_artifact_events (
  event_id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, artifact_id TEXT, report_version_id TEXT NOT NULL,
  case_id TEXT NOT NULL, project_id TEXT NOT NULL, floor_id TEXT NOT NULL, event_type TEXT NOT NULL,
  actor_user_id TEXT NOT NULL, actor_display_name TEXT NOT NULL, artifact_hash_sha256 TEXT,
  reason TEXT NOT NULL, request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, occurred_at TEXT NOT NULL,
  UNIQUE (organisation_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_final_pdf_events_scope
ON final_pdf_artifact_events(organisation_id,report_version_id,occurred_at);
`;
