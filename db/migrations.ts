export type D1Migration = {
  version: number;
  statements: readonly string[];
};

export const d1Migrations: readonly D1Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS app_state_snapshot (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ]
  },
  {
    version: 2,
    statements: [
      "ALTER TABLE app_state_snapshot ADD COLUMN revision INTEGER NOT NULL DEFAULT 0"
    ]
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS case_file_assets (
        id TEXT PRIMARY KEY, evidence_ref TEXT NOT NULL UNIQUE, case_id TEXT NOT NULL,
        case_revision_number INTEGER NOT NULL, service_type TEXT NOT NULL, floor_label TEXT,
        object_key TEXT NOT NULL UNIQUE, original_file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL, uploaded_by_id TEXT NOT NULL,
        uploaded_by_name TEXT NOT NULL, uploaded_by_role TEXT NOT NULL, created_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status = 'IMMUTABLE')
      )`,
      "CREATE INDEX IF NOT EXISTS idx_case_file_assets_scope ON case_file_assets(case_id, case_revision_number, service_type, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_case_file_assets_floor ON case_file_assets(case_id, floor_label)"
    ]
  },
  {
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS staff_role_assignments (
        email TEXT PRIMARY KEY, role TEXT NOT NULL, full_name TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS staff_role_assignment_audit (
        id TEXT PRIMARY KEY, target_email TEXT NOT NULL, previous_role TEXT, next_role TEXT NOT NULL,
        actor_id TEXT NOT NULL, actor_email TEXT NOT NULL, actor_name TEXT NOT NULL, actor_role TEXT NOT NULL,
        changed_at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_staff_role_audit_target_time ON staff_role_assignment_audit(target_email, changed_at)",
      `DELETE FROM staff_role_assignments
       WHERE updated_at = '2026-08-07T18:30:00.000Z'
       AND email IN ('aarav@uchitvastu.in', 'nandini@uchitvastu.in', 'rishi@uchitvastu.in', 'meera@uchitvastu.in')`
    ]
  },
  {
    version: 5,
    statements: [
      `CREATE TABLE IF NOT EXISTS optin_leads (
        id TEXT PRIMARY KEY, identity_key TEXT NOT NULL UNIQUE, unique_client_id TEXT NOT NULL,
        payload TEXT NOT NULL, imported_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inbound_optin_events (
        event_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, source TEXT NOT NULL,
        payload_hash TEXT NOT NULL, identity_hash TEXT NOT NULL, received_at TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('CREATED', 'UPDATED')),
        submission_count INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_inbound_optin_events_received ON inbound_optin_events(received_at)",
      "CREATE INDEX IF NOT EXISTS idx_inbound_optin_events_identity ON inbound_optin_events(identity_hash, received_at)"
    ]
  }
];

const migrationsTableSql = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

/** Applies each migration and its version marker in one D1 batch. */
export async function migrateD1(db: D1DatabaseBinding): Promise<void> {
  await db.prepare(migrationsTableSql).run();
  const rows = await db.prepare("SELECT version FROM schema_migrations ORDER BY version").all<{ version: number }>();
  const applied = new Set((rows.results ?? []).map((row) => row.version));

  for (const migration of d1Migrations) {
    if (applied.has(migration.version)) continue;

    // A database bootstrapped from the declarative schema already has this
    // column, so adopt it without attempting a destructive rebuild.
    if (migration.version === 2) {
      const columns = await db.prepare("PRAGMA table_info(app_state_snapshot)").all<{ name: string }>();
      if ((columns.results ?? []).some((column) => column.name === "revision")) {
        await db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .bind(migration.version, new Date().toISOString())
          .run();
        continue;
      }
    }

    const appliedAt = new Date().toISOString();
    const statements = migration.statements.map((sql) => db.prepare(sql));
    statements.push(
      db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").bind(migration.version, appliedAt)
    );
    await db.batch(statements);
  }
}
import type { D1DatabaseBinding } from "@/lib/runtime-env";
