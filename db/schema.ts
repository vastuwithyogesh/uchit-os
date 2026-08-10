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
`;
