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
  },
  {
    version: 9,
    statements: [
      "ALTER TABLE optin_leads ADD COLUMN organisation_id TEXT",
      "ALTER TABLE optin_leads ADD COLUMN external_source_id TEXT",
      "ALTER TABLE optin_leads ADD COLUMN source_record_type TEXT",
      "ALTER TABLE optin_leads ADD COLUMN source_record_id TEXT",
      "ALTER TABLE optin_leads ADD COLUMN external_client_code TEXT",
      "ALTER TABLE optin_leads ADD COLUMN sync_status TEXT",
      "ALTER TABLE optin_leads ADD COLUMN last_synced_at TEXT",
      "ALTER TABLE optin_leads ADD COLUMN source_event_id TEXT",
      "ALTER TABLE optin_leads ADD COLUMN record_version INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE inbound_optin_events ADD COLUMN organisation_id TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN external_source_id TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN source_record_type TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN source_record_id TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN external_client_code TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN sync_status TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN last_synced_at TEXT",
      "ALTER TABLE inbound_optin_events ADD COLUMN record_version INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE audit_events ADD COLUMN source_system TEXT",
      "ALTER TABLE audit_events ADD COLUMN source_record_type TEXT",
      "ALTER TABLE audit_events ADD COLUMN source_record_id TEXT",
      "ALTER TABLE audit_events ADD COLUMN integration_event_id TEXT",
      "CREATE INDEX IF NOT EXISTS idx_optin_leads_external_link ON optin_leads(organisation_id,external_source_id,source_record_type,source_record_id)",
      "CREATE INDEX IF NOT EXISTS idx_inbound_optin_events_external ON inbound_optin_events(organisation_id,external_source_id,source_record_type,source_record_id)",
      "CREATE INDEX IF NOT EXISTS idx_audit_integration_source ON audit_events(organisation_id,source_system,source_record_type,source_record_id,occurred_at)",
      `CREATE TABLE IF NOT EXISTS external_sources (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, source_system TEXT NOT NULL,
        source_environment TEXT NOT NULL, source_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','PAUSED','RETIRED')),
        inbound_mode TEXT NOT NULL CHECK (inbound_mode IN ('SIGNED_WEBHOOK','POLL','COHOSTED_API')),
        config_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,source_system,source_environment), UNIQUE (organisation_id,source_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_external_sources_org_status ON external_sources(organisation_id,status)",
      `CREATE TABLE IF NOT EXISTS external_client_links (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, external_source_id TEXT NOT NULL,
        source_record_type TEXT NOT NULL, source_record_id TEXT NOT NULL, external_client_code TEXT,
        client_id TEXT NOT NULL, match_method TEXT NOT NULL CHECK (match_method IN ('EXACT_EMAIL','EXACT_PHONE','MANUAL','NEW_CLIENT')),
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVIEW_REQUIRED','REVOKED')), identity_hash TEXT,
        source_created_at TEXT, last_seen_at TEXT, last_synced_at TEXT,
        record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (external_source_id,source_record_type,source_record_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_external_client_links_org_client ON external_client_links(organisation_id,client_id,status)",
      "CREATE INDEX IF NOT EXISTS idx_external_client_links_external_code ON external_client_links(external_source_id,external_client_code)",
      `CREATE TABLE IF NOT EXISTS integration_events (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, external_source_id TEXT NOT NULL,
        event_id TEXT NOT NULL, source_record_type TEXT NOT NULL, source_record_id TEXT NOT NULL,
        event_type TEXT NOT NULL, source_actor_id TEXT, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
        payload_hash TEXT NOT NULL, identity_hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('RECEIVED','APPLIED','REPLAYED','REVIEW_REQUIRED','FAILED','DEAD_LETTER')),
        retry_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error_code TEXT, processed_at TEXT,
        request_id TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (external_source_id,event_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_integration_events_org_time ON integration_events(organisation_id,received_at)",
      "CREATE INDEX IF NOT EXISTS idx_integration_events_record ON integration_events(external_source_id,source_record_type,source_record_id,received_at)",
      `CREATE TABLE IF NOT EXISTS integration_outbox (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, external_source_id TEXT NOT NULL,
        target_system TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL,
        canonical_revision INTEGER, payload_version TEXT NOT NULL, payload_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','SENT','FAILED','DEAD_LETTER')),
        attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, last_error_code TEXT,
        idempotency_key TEXT NOT NULL, sent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,idempotency_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON integration_outbox(organisation_id,status,next_attempt_at)",
      `CREATE TABLE IF NOT EXISTS integration_conflicts (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, external_source_id TEXT NOT NULL,
        integration_event_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, field_name TEXT NOT NULL,
        canonical_hash TEXT, incoming_hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('REVIEW_REQUIRED','ACCEPT_CANONICAL','ACCEPT_INCOMING','RESOLVED')),
        reason TEXT NOT NULL, resolved_by_actor_id TEXT, resolved_at TEXT, created_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1
      )`,
      "CREATE INDEX IF NOT EXISTS idx_integration_conflicts_open ON integration_conflicts(organisation_id,status,created_at)",
      `CREATE TABLE IF NOT EXISTS integration_cursors (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, external_source_id TEXT NOT NULL,
        cursor TEXT, observed_at TEXT, updated_at TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,external_source_id)
      )`
    ]
  },
  {
    version: 10,
    statements: [
      `CREATE TABLE IF NOT EXISTS lead_profile_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, lead_id TEXT NOT NULL, client_id TEXT,
        version INTEGER NOT NULL, canonical_snapshot_json TEXT NOT NULL, prior_snapshot_hash TEXT,
        snapshot_hash TEXT NOT NULL, request_hash TEXT NOT NULL, reason TEXT NOT NULL, actor_user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,lead_id,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, category TEXT NOT NULL,
        audience TEXT NOT NULL CHECK (audience IN ('FOUNDER_PRIVATE','CLIENT_SENDABLE')),
        service_applicability_json TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
        tags_json TEXT NOT NULL, active_version_id TEXT, created_at TEXT NOT NULL,
        created_by_actor_user_id TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS media_asset_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, asset_id TEXT NOT NULL, version INTEGER NOT NULL,
        filename TEXT NOT NULL, private_object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL CHECK (mime_type='application/pdf'),
        size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL, page_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT','FOUNDER_APPROVED','ACTIVE','SUPERSEDED','ARCHIVED')),
        client_sendable INTEGER NOT NULL CHECK (client_sendable IN (0,1)), uploaded_by_actor_user_id TEXT NOT NULL,
        uploaded_at TEXT NOT NULL, approved_by_actor_user_id TEXT, approved_at TEXT,
        supersedes_version_id TEXT, superseded_by_version_id TEXT, reason TEXT NOT NULL, registration_hash TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,asset_id,version)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_media_versions_active ON media_asset_versions(organisation_id,asset_id,status)",
      `CREATE TABLE IF NOT EXISTS secure_access_grants (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, purpose TEXT NOT NULL,
        lead_id TEXT NOT NULL, client_id TEXT, asset_version_id TEXT, form_definition_id TEXT, booking_id TEXT,
        token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, replaced_by_grant_id TEXT,
        opened_at TEXT, created_at TEXT NOT NULL, created_by_actor_user_id TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1
      )`,
      "CREATE INDEX IF NOT EXISTS idx_secure_grants_scope ON secure_access_grants(organisation_id,lead_id,purpose,expires_at)",
      `CREATE TABLE IF NOT EXISTS communication_preparations (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, lead_id TEXT NOT NULL, client_id TEXT,
        prospective_project_ids_json TEXT NOT NULL, template_key TEXT NOT NULL, template_version INTEGER NOT NULL,
        channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP','EMAIL')),
        state TEXT NOT NULL CHECK (state IN ('NOT_PREPARED','PREPARED','OPENED')),
        recipient_hash TEXT NOT NULL, rendered_content_hash TEXT NOT NULL, asset_version_ids_json TEXT NOT NULL,
        form_definition_id TEXT, booking_id TEXT, grant_ids_json TEXT NOT NULL,
        rendered_time_zone_snapshot TEXT, manual_note TEXT, prepared_at TEXT NOT NULL, opened_at TEXT,
        actor_user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS qualification_form_definitions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('RESIDENTIAL','COMMERCIAL','HYBRID')),
        version INTEGER NOT NULL, title TEXT NOT NULL, source_asset_version_id TEXT NOT NULL,
        source_checksum_sha256 TEXT NOT NULL, questions_json TEXT NOT NULL, definition_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT','FOUNDER_APPROVED','ACTIVE','RETIRED')),
        created_at TEXT NOT NULL, approved_at TEXT, approved_by_actor_user_id TEXT,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,kind,version)
      )`,
      `CREATE TABLE IF NOT EXISTS qualification_invitations (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, lead_id TEXT NOT NULL, client_id TEXT NOT NULL,
        form_definition_id TEXT NOT NULL, grant_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('OPEN','SUBMITTED','EXPIRED','REPLACED')),
        selected_services_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        submitted_at TEXT, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS qualification_response_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, invitation_id TEXT NOT NULL, client_id TEXT NOT NULL,
        form_definition_id TEXT NOT NULL, version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','SUPERSEDED')),
        answers_json TEXT NOT NULL, answers_hash TEXT NOT NULL, selected_services_json TEXT NOT NULL,
        secondary_interest_selected INTEGER NOT NULL CHECK (secondary_interest_selected IN (0,1)),
        source_question_ids_json TEXT NOT NULL, predecessor_response_id TEXT, saved_at TEXT NOT NULL,
        submitted_at TEXT, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,invitation_id,version)
      )`,
      `CREATE TABLE IF NOT EXISTS prospective_projects (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, client_id TEXT NOT NULL, lead_id TEXT NOT NULL,
        response_version_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('RESIDENTIAL','COMMERCIAL')),
        status TEXT NOT NULL, service_type TEXT, case_id TEXT, created_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,response_version_id,kind)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_review_bookings (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, client_id TEXT NOT NULL,
        prospective_project_ids_json TEXT NOT NULL, response_version_id TEXT NOT NULL, form_definition_id TEXT NOT NULL,
        starts_at TEXT NOT NULL, time_zone TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK (duration_minutes=30),
        buffer_minutes INTEGER NOT NULL CHECK (buffer_minutes=15), rendered_client_time TEXT NOT NULL, rendered_ist_time TEXT,
        status TEXT NOT NULL CHECK (status IN ('ASSIGNED','CLIENT_CONFIRMED','RESCHEDULE_REQUESTED','MEETING_SETUP_FAILED','CONFIRMED','CANCELLED')),
        confirmation_grant_id TEXT NOT NULL, assigned_by_actor_user_id TEXT NOT NULL, assigned_at TEXT NOT NULL,
        confirmed_at TEXT, prior_booking_id TEXT, reason TEXT, idempotency_key TEXT NOT NULL, assignment_hash TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,idempotency_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_founder_bookings_time ON founder_review_bookings(organisation_id,starts_at,status)",
      `CREATE TABLE IF NOT EXISTS zoom_meeting_bindings (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, booking_id TEXT NOT NULL, provider TEXT NOT NULL CHECK (provider='ZOOM'),
        provider_meeting_id TEXT NOT NULL, private_join_metadata_ciphertext TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','RETIRED','FAILED')), created_at TEXT NOT NULL,
        retired_at TEXT, idempotency_key TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,booking_id,idempotency_key), UNIQUE (organisation_id,provider_meeting_id)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_reminder_tasks (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, booking_id TEXT NOT NULL,
        threshold TEXT NOT NULL CHECK (threshold IN ('24H','2H')), due_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','PREPARED','OPENED','SKIPPED','CANCELLED')),
        whatsapp_state TEXT NOT NULL CHECK (whatsapp_state IN ('NOT_PREPARED','PREPARED','OPENED')),
        email_state TEXT NOT NULL CHECK (email_state IN ('NOT_PREPARED','PREPARED','OPENED')),
        template_key TEXT NOT NULL, template_version INTEGER NOT NULL, created_at TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,booking_id,threshold)
      )`
    ]
  },
  {
    version: 11,
    statements: [
      `CREATE TABLE IF NOT EXISTS founder_commercial_policy_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, version INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','SUPERSEDED')),
        reference_fee_paise INTEGER NOT NULL, reference_advance_paise INTEGER NOT NULL,
        default_gst_basis_points INTEGER NOT NULL, balance_deadline_days INTEGER NOT NULL CHECK (balance_deadline_days=7),
        advance_invoice_sla_minutes INTEGER NOT NULL CHECK (advance_invoice_sla_minutes=60),
        reason TEXT NOT NULL, actor_user_id TEXT NOT NULL, created_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_commercial_legal_policies (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL,
        version INTEGER NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, exact_text TEXT NOT NULL,
        content_hash TEXT NOT NULL, configuration_json TEXT, reason TEXT NOT NULL,
        created_by_actor_user_id TEXT NOT NULL, created_at TEXT NOT NULL, approved_by_actor_user_id TEXT,
        approved_at TEXT, activated_at TEXT, supersedes_policy_id TEXT, idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,kind,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_proposal_template_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, service_type TEXT NOT NULL,
        version INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
        scope_items_json TEXT NOT NULL, deliverables_json TEXT NOT NULL, source_proposal_version_id TEXT,
        supersedes_template_id TEXT, content_hash TEXT NOT NULL, reason TEXT NOT NULL, actor_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL, activated_at TEXT, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,service_type,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_proposal_versions (
        id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, organisation_id TEXT NOT NULL, version INTEGER NOT NULL,
        client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL, service_type TEXT NOT NULL,
        status TEXT NOT NULL, current_step INTEGER NOT NULL, content_json TEXT NOT NULL, content_hash TEXT NOT NULL,
        validity_ends_at TEXT, predecessor_version_id TEXT, successor_version_id TEXT,
        created_at TEXT NOT NULL, created_by_actor_user_id TEXT NOT NULL, reviewed_at TEXT, approved_at TEXT,
        sent_at TEXT, accepted_at TEXT, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,proposal_id,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_proposal_approvals (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL,
        checkpoint TEXT NOT NULL, actor_user_id TEXT NOT NULL, actor_name TEXT NOT NULL, actor_role TEXT NOT NULL,
        reason TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,proposal_version_id,checkpoint), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_proposal_artifacts (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL UNIQUE,
        proposal_content_hash TEXT NOT NULL, client_projection_hash TEXT NOT NULL, artifact_hash_sha256 TEXT NOT NULL,
        private_object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        page_count INTEGER NOT NULL, renderer_version TEXT NOT NULL, generated_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_proposal_grants (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL,
        client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL, revoked_at TEXT, replaced_by_grant_id TEXT, opened_at TEXT,
        created_at TEXT NOT NULL, created_by_actor_user_id TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS founder_proposal_responses (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL,
        proposal_content_hash TEXT NOT NULL, artifact_hash_sha256 TEXT NOT NULL, client_id TEXT NOT NULL,
        prospective_project_id TEXT NOT NULL, response TEXT NOT NULL, full_name TEXT NOT NULL,
        acceptance_checked INTEGER, typed_confirmation_hash TEXT, organisation_name TEXT, designation TEXT,
        requested_changes TEXT, responded_at TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
        record_version INTEGER NOT NULL DEFAULT 1, UNIQUE (organisation_id,proposal_version_id), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_commercial_payment_confirmations (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL,
        client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL, payment_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('ADVANCE','BALANCE')), amount_paise INTEGER NOT NULL,
        confirmed_at TEXT NOT NULL, confirmed_by_actor_user_id TEXT NOT NULL, proposal_content_hash TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,payment_id), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_balance_deadlines (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL UNIQUE,
        client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL, advance_payment_confirmation_id TEXT,
        advance_confirmed_at TEXT, due_at TEXT, status TEXT NOT NULL, remaining_amount_paise INTEGER NOT NULL,
        commercial_policy_id TEXT NOT NULL, commercial_policy_version INTEGER NOT NULL, engagement_classification TEXT NOT NULL,
        prior_due_at TEXT, exception_reason TEXT, exception_actor_user_id TEXT, exception_at TEXT,
        record_version INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS founder_commercial_invoices (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL UNIQUE,
        client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL, advance_payment_confirmation_id TEXT UNIQUE,
        status TEXT NOT NULL, due_at TEXT, amount_received_paise INTEGER NOT NULL,
        gst_basis_points INTEGER NOT NULL, gst_amount_snapshot_paise INTEGER NOT NULL, remaining_balance_paise INTEGER NOT NULL,
        invoice_policy_id TEXT, invoice_number TEXT, artifact_hash_sha256 TEXT, private_object_key TEXT,
        issued_at TEXT, issued_by_actor_user_id TEXT, failure_code TEXT, failure_at TEXT,
        idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,invoice_number), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_commercial_audit_events (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, happened_at TEXT NOT NULL, reason TEXT NOT NULL,
        proposal_version_id TEXT, prospective_project_id TEXT, before_hash TEXT, after_hash TEXT,
        idempotency_key TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,idempotency_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_founder_proposals_scope ON founder_proposal_versions(organisation_id,client_id,prospective_project_id,status)",
      "CREATE INDEX IF NOT EXISTS idx_founder_deadlines_due ON founder_balance_deadlines(organisation_id,status,due_at)",
      "CREATE INDEX IF NOT EXISTS idx_founder_invoices_due ON founder_commercial_invoices(organisation_id,status,due_at)"
    ]
  },
  {
    version: 12,
    statements: [
      `CREATE TABLE IF NOT EXISTS founder_statutory_policy_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL,
        legal_business_name TEXT NOT NULL, gstin TEXT NOT NULL, registered_address TEXT NOT NULL,
        email TEXT NOT NULL, phone_e164 TEXT NOT NULL, phone_display TEXT NOT NULL,
        authorised_signatory TEXT NOT NULL, designation TEXT NOT NULL, sac TEXT NOT NULL,
        line_description TEXT NOT NULL, default_gst_basis_points INTEGER NOT NULL,
        reverse_charge_text TEXT NOT NULL, place_of_supply_basis TEXT NOT NULL,
        place_of_supply_approval TEXT NOT NULL, service_timing_approval TEXT NOT NULL,
        correction_policy_approval TEXT NOT NULL, service_timing_policy_text TEXT,
        accountant_approval_reference TEXT, created_by_actor_user_id TEXT NOT NULL, created_at TEXT NOT NULL,
        approved_at TEXT, activated_at TEXT, reason TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_billing_profile_versions (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL,
        version INTEGER NOT NULL, billing_legal_name TEXT NOT NULL, billing_address TEXT NOT NULL,
        billing_state TEXT NOT NULL, billing_pin TEXT NOT NULL, recipient_registered_for_gst INTEGER NOT NULL,
        recipient_gstin TEXT, client_location_country TEXT NOT NULL, client_location_state TEXT,
        property_location TEXT, time_zone TEXT NOT NULL, created_by_actor_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL, reason TEXT NOT NULL, predecessor_id TEXT, idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,client_id,prospective_project_id,version), UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_statutory_sequence_reservations (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, document_kind TEXT NOT NULL,
        fiscal_year TEXT NOT NULL, fiscal_year_compact TEXT NOT NULL, sequence INTEGER NOT NULL,
        document_number TEXT NOT NULL, status TEXT NOT NULL, reserved_at TEXT NOT NULL,
        reserved_by_actor_user_id TEXT NOT NULL, document_id TEXT NOT NULL, failure_code TEXT,
        idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,document_kind,fiscal_year,sequence), UNIQUE (organisation_id,document_number),
        UNIQUE (organisation_id,idempotency_key)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_statutory_documents (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
        proposal_version_id TEXT NOT NULL, proposal_content_hash TEXT NOT NULL, client_id TEXT NOT NULL,
        prospective_project_id TEXT NOT NULL, case_id TEXT, advance_payment_confirmation_id TEXT,
        balance_payment_confirmation_ids_json TEXT NOT NULL, triggering_payment_id TEXT, due_at TEXT,
        service_supplied_at TEXT, statutory_deadline_at TEXT, issued_at TEXT, issued_by_actor_user_id TEXT,
        policy_version_id TEXT, billing_profile_version_id TEXT, document_number TEXT, sequence_reservation_id TEXT,
        professional_fee_paise INTEGER NOT NULL, gst_basis_points INTEGER NOT NULL, cgst_paise INTEGER NOT NULL,
        sgst_paise INTEGER NOT NULL, igst_paise INTEGER NOT NULL, gst_total_paise INTEGER NOT NULL,
        round_off_paise INTEGER NOT NULL, total_payable_paise INTEGER NOT NULL, amount_received_paise INTEGER NOT NULL,
        remaining_balance_paise INTEGER NOT NULL, amount_in_words TEXT NOT NULL, tax_mode TEXT NOT NULL,
        balance_due_at TEXT, balance_deadline_status TEXT, logo_asset_version_id TEXT, logo_checksum_sha256 TEXT,
        signature_asset_version_id TEXT, signature_checksum_sha256 TEXT, artifact_hash_sha256 TEXT,
        private_object_key TEXT, renderer_version TEXT, failure_code TEXT, failure_at TEXT,
        idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1,
        UNIQUE (organisation_id,idempotency_key), UNIQUE (organisation_id,document_number),
        UNIQUE (organisation_id,artifact_hash_sha256)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_founder_statutory_due ON founder_statutory_documents(organisation_id,status,due_at)",
      "CREATE INDEX IF NOT EXISTS idx_founder_statutory_project ON founder_statutory_documents(organisation_id,client_id,prospective_project_id,kind)"
    ]
  },
  {
    version: 13,
    statements: [
      "ALTER TABLE founder_commercial_policy_versions ADD COLUMN refund_policy TEXT NOT NULL DEFAULT 'NO_REFUNDS' CHECK (refund_policy = 'NO_REFUNDS')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN operational_place_of_supply_selection TEXT NOT NULL DEFAULT 'CLIENT_LOCATION_ONLY' CHECK (operational_place_of_supply_selection = 'CLIENT_LOCATION_ONLY')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN receipt_voucher_trigger TEXT NOT NULL DEFAULT 'CONFIRMED_ADVANCE' CHECK (receipt_voucher_trigger = 'CONFIRMED_ADVANCE')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN receipt_voucher_sla_minutes INTEGER NOT NULL DEFAULT 60 CHECK (receipt_voucher_sla_minutes = 60)",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN proforma_policy TEXT NOT NULL DEFAULT 'AFTER_CONFIRMED_ADVANCE_ONLY' CHECK (proforma_policy = 'AFTER_CONFIRMED_ADVANCE_ONLY')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN tax_invoice_trigger TEXT NOT NULL DEFAULT 'CONFIRMED_FULL_PAYMENT' CHECK (tax_invoice_trigger = 'CONFIRMED_FULL_PAYMENT')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN refund_policy TEXT NOT NULL DEFAULT 'NO_REFUNDS' CHECK (refund_policy = 'NO_REFUNDS')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN correction_posture TEXT NOT NULL DEFAULT 'EXCEPTION_ONLY_ACCOUNTANT_APPROVAL' CHECK (correction_posture = 'EXCEPTION_ONLY_ACCOUNTANT_APPROVAL')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN purchase_side_debit_notes_in_scope INTEGER NOT NULL DEFAULT 0 CHECK (purchase_side_debit_notes_in_scope = 0)",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN opex_tracking_scope TEXT NOT NULL DEFAULT 'OUTSIDE_CLIENT_INVOICE_MODULE' CHECK (opex_tracking_scope = 'OUTSIDE_CLIENT_INVOICE_MODULE')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN accountant_approved_service_types_json TEXT",
      "ALTER TABLE founder_billing_profile_versions ADD COLUMN service_location TEXT"
    ]
  },
  {
    version: 14,
    statements: [
      "ALTER TABLE zoom_meeting_bindings ADD COLUMN host_user_email TEXT NOT NULL DEFAULT 'iyogesh2020@gmail.com' CHECK (host_user_email = 'iyogesh2020@gmail.com')",
      "ALTER TABLE zoom_meeting_bindings ADD COLUMN oauth_connection_type TEXT NOT NULL DEFAULT 'SERVER_TO_SERVER_OAUTH' CHECK (oauth_connection_type = 'SERVER_TO_SERVER_OAUTH')",
      `ALTER TABLE zoom_meeting_bindings ADD COLUMN scope_snapshot_json TEXT NOT NULL DEFAULT '["meeting:write:admin","meeting:read:admin","user:read:admin"]'`,
      "CREATE INDEX IF NOT EXISTS idx_zoom_binding_host ON zoom_meeting_bindings(organisation_id,host_user_email,status,created_at)"
    ]
  },
  {
    version: 15,
    statements: [
      `CREATE TABLE IF NOT EXISTS founder_commercial_policy_events (
        id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, client_id TEXT NOT NULL, prospective_project_id TEXT NOT NULL,
        proposal_version_id TEXT, event_type TEXT NOT NULL CHECK (event_type IN ('CLIENT_CANCELLATION_REQUESTED','CLIENT_DEPENDENCY_DELAY_RECORDED','UCHIT_RESCHEDULE_RECORDED')),
        reason TEXT NOT NULL, revised_estimate TEXT, replacement_date_or_slot TEXT,
        no_refund_or_credit_entitlement INTEGER NOT NULL DEFAULT 1 CHECK (no_refund_or_credit_entitlement = 1),
        payment_history_preserved INTEGER NOT NULL DEFAULT 1 CHECK (payment_history_preserved = 1),
        created_by_actor_user_id TEXT NOT NULL, created_at TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, record_version INTEGER NOT NULL DEFAULT 1 CHECK (record_version = 1),
        UNIQUE (organisation_id,idempotency_key)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_founder_commercial_policy_events_scope ON founder_commercial_policy_events(organisation_id,client_id,prospective_project_id,event_type,created_at)"
    ]
  },
  {
    version: 16,
    statements: [
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN active_place_of_supply_policy TEXT NOT NULL DEFAULT 'FIXED_LUDHIANA_PUNJAB' CHECK (active_place_of_supply_policy = 'FIXED_LUDHIANA_PUNJAB')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN place_of_supply_display TEXT NOT NULL DEFAULT 'Ludhiana, Punjab, India'",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN outside_india_billing_label TEXT NOT NULL DEFAULT 'Cash Sale' CHECK (outside_india_billing_label = 'Cash Sale')",
      "ALTER TABLE founder_statutory_policy_versions ADD COLUMN tax_treatment TEXT NOT NULL DEFAULT 'CGST_SGST_9_9_ALL_CLIENT_LOCATIONS' CHECK (tax_treatment = 'CGST_SGST_9_9_ALL_CLIENT_LOCATIONS')"
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
    if (migration.version === 9) {
      const [optinColumns, inboundColumns, auditColumns, tables] = await Promise.all([
        db.prepare("PRAGMA table_info(optin_leads)").all<{ name: string }>(),
        db.prepare("PRAGMA table_info(inbound_optin_events)").all<{ name: string }>(),
        db.prepare("PRAGMA table_info(audit_events)").all<{ name: string }>(),
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('external_sources','external_client_links','integration_events','integration_outbox','integration_conflicts','integration_cursors')").all<{ name: string }>()
      ]);
      const has = (result: { results?: Array<{ name: string }> }, required: readonly string[]) => {
        const names = new Set((result.results ?? []).map((row) => row.name));
        return required.every((name) => names.has(name));
      };
      const v9ColumnsPresent = has(optinColumns, ["organisation_id", "external_source_id", "source_record_type", "source_record_id", "external_client_code", "sync_status", "last_synced_at", "source_event_id", "record_version"])
        && has(inboundColumns, ["organisation_id", "external_source_id", "source_record_type", "source_record_id", "external_client_code", "sync_status", "last_synced_at", "record_version"])
        && has(auditColumns, ["source_system", "source_record_type", "source_record_id", "integration_event_id"]);
      const v9TablesPresent = has(tables, ["external_sources", "external_client_links", "integration_events", "integration_outbox", "integration_conflicts", "integration_cursors"]);
      if (v9ColumnsPresent && v9TablesPresent) {
        const appliedAt = new Date().toISOString();
        await db.batch([
          db.prepare("CREATE INDEX IF NOT EXISTS idx_optin_leads_external_link ON optin_leads(organisation_id,external_source_id,source_record_type,source_record_id)"),
          db.prepare("CREATE INDEX IF NOT EXISTS idx_inbound_optin_events_external ON inbound_optin_events(organisation_id,external_source_id,source_record_type,source_record_id)"),
          db.prepare("CREATE INDEX IF NOT EXISTS idx_audit_integration_source ON audit_events(organisation_id,source_system,source_record_type,source_record_id,occurred_at)"),
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
