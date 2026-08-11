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
  },
  {
    version: 6,
    statements: [
      `CREATE TABLE IF NOT EXISTS organisations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
        founder_user_id TEXT NOT NULL, active_workflow_policy_version INTEGER NOT NULL,
        active_approval_policy_version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS organisation_memberships (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','CONSULTANT','SETTER','SPECIALIST')),
        capability TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
        created_at TEXT NOT NULL, revoked_at TEXT,
        FOREIGN KEY (organisation_id) REFERENCES organisations(id)
      )`,
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_owner_per_org ON organisation_memberships(organisation_id) WHERE role='SUPER_ADMIN' AND status='ACTIVE'",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_active_membership_user_org ON organisation_memberships(organisation_id,user_id) WHERE status='ACTIVE'",
      `CREATE TABLE IF NOT EXISTS workflow_policies (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, version INTEGER NOT NULL,
        edition TEXT NOT NULL CHECK (edition IN ('FOUNDER','TEAM')), status TEXT NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
        policy_json TEXT NOT NULL, approved_by_actor_id TEXT NOT NULL, approved_at TEXT NOT NULL,
        reason TEXT NOT NULL, content_hash TEXT NOT NULL,
        UNIQUE (organisation_id,version), FOREIGN KEY (organisation_id) REFERENCES organisations(id)
      )`,
      `CREATE TABLE IF NOT EXISTS approval_policies (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, version INTEGER NOT NULL,
        steps_json TEXT NOT NULL, release_gates_json TEXT NOT NULL, creator_may_approve INTEGER NOT NULL CHECK (creator_may_approve IN (0,1)),
        status TEXT NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')), approved_by_actor_id TEXT NOT NULL,
        approved_at TEXT NOT NULL, reason TEXT NOT NULL, content_hash TEXT NOT NULL,
        UNIQUE (organisation_id,version), FOREIGN KEY (organisation_id) REFERENCES organisations(id)
      )`,
      `CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, actor_display_name TEXT NOT NULL,
        action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, case_id TEXT, project_id TEXT, floor_id TEXT,
        before_hash TEXT, after_hash TEXT, reason TEXT NOT NULL, request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        occurred_at TEXT NOT NULL, previous_audit_hash TEXT, event_hash TEXT NOT NULL UNIQUE,
        UNIQUE (organisation_id,idempotency_key), FOREIGN KEY (organisation_id) REFERENCES organisations(id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_events(organisation_id,occurred_at)",
      "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(organisation_id,entity_type,entity_id,occurred_at)",
      `CREATE TABLE IF NOT EXISTS user_access_requests (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, target_user_id TEXT NOT NULL, target_email TEXT NOT NULL,
        requested_by_user_id TEXT NOT NULL, requested_by_role TEXT NOT NULL,
        proposed_role TEXT NOT NULL, proposed_capabilities_json TEXT NOT NULL,
        final_role TEXT, final_capabilities_json TEXT,
        state TEXT NOT NULL CHECK (state IN ('DRAFT','PENDING_SUPER_ADMIN_APPROVAL','APPROVED','ACTIVE','REJECTED','REVOKED','CANCELLED')),
        reason TEXT NOT NULL, request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        reviewed_by_user_id TEXT, reviewed_at TEXT, activated_membership_id TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,idempotency_key), FOREIGN KEY (organisation_id) REFERENCES organisations(id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_access_requests_target_state ON user_access_requests(organisation_id,target_user_id,state)",
      `CREATE TABLE IF NOT EXISTS ownership_transfer_requests (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, current_owner_user_id TEXT NOT NULL, proposed_owner_user_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('PENDING_BOTH_CONFIRMATIONS','CONFIRMED','COMPLETED','CANCELLED')),
        current_owner_confirmed_at TEXT, proposed_owner_confirmed_at TEXT, reason TEXT NOT NULL,
        request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,idempotency_key),
        FOREIGN KEY (organisation_id) REFERENCES organisations(id)
      )`
    ]
  },
  {
    version: 7,
    statements: [
      "ALTER TABLE case_file_assets ADD COLUMN organisation_id TEXT",
      "CREATE INDEX IF NOT EXISTS idx_case_file_assets_org_scope ON case_file_assets(organisation_id,case_id,case_revision_number,service_type,floor_label,created_at)"
    ]
  },
  {
    version: 8,
    statements: [
      `CREATE TABLE IF NOT EXISTS final_pdf_artifacts (
        artifact_id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, report_version_id TEXT NOT NULL,
        report_version_label TEXT NOT NULL, case_id TEXT NOT NULL, project_id TEXT NOT NULL, floor_id TEXT NOT NULL,
        report_template_version TEXT NOT NULL, source_snapshot_hash TEXT NOT NULL, artifact_hash_sha256 TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL CHECK (mime_type='application/pdf'), size_bytes INTEGER NOT NULL,
        page_count INTEGER NOT NULL, renderer_version TEXT NOT NULL, page_configuration TEXT NOT NULL,
        embedded_evidence_checksums_json TEXT NOT NULL, generated_at TEXT NOT NULL, verified_at TEXT,
        released_at TEXT, released_by_actor_id TEXT, security_profile TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('GENERATED','VERIFIED','RELEASED','SUPERSEDED')),
        generation_idempotency_key TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,report_version_id), UNIQUE (organisation_id,generation_idempotency_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_final_pdf_scope ON final_pdf_artifacts(organisation_id,case_id,project_id,floor_id,status)",
      `CREATE TABLE IF NOT EXISTS final_pdf_artifact_events (
        event_id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, artifact_id TEXT, report_version_id TEXT NOT NULL,
        case_id TEXT NOT NULL, project_id TEXT NOT NULL, floor_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('GENERATION_REQUESTED','GENERATED','GENERATION_FAILED','INTEGRITY_VERIFIED','VERIFICATION_FAILED','RELEASED','EXPORTED','PRINTED','SUPERSEDED')),
        actor_user_id TEXT NOT NULL, actor_display_name TEXT NOT NULL, artifact_hash_sha256 TEXT,
        reason TEXT NOT NULL, request_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, occurred_at TEXT NOT NULL,
        UNIQUE (organisation_id,idempotency_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_final_pdf_events_scope ON final_pdf_artifact_events(organisation_id,report_version_id,occurred_at)"
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
    if (migration.version === 7) {
      const columns = await db.prepare("PRAGMA table_info(case_file_assets)").all<{ name: string }>();
      if ((columns.results ?? []).some((column) => column.name === "organisation_id")) {
        const appliedAt = new Date().toISOString();
        await db.batch([
          db.prepare("CREATE INDEX IF NOT EXISTS idx_case_file_assets_org_scope ON case_file_assets(organisation_id,case_id,case_revision_number,service_type,floor_label,created_at)"),
          db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").bind(migration.version, appliedAt)
        ]);
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
