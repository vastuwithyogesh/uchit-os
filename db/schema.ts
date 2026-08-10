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
  id TEXT PRIMARY KEY, evidence_ref TEXT NOT NULL UNIQUE, case_id TEXT NOT NULL,
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
`;
