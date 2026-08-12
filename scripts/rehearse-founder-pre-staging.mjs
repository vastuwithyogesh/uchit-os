import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { d1Migrations } from "../db/migrations.ts";

const migrationsTableSql = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

function quoteSqlitePath(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;");
  return db;
}

function applyMigrations(db, fromVersion = 1, throughVersion = 12) {
  db.exec(migrationsTableSql);
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => Number(row.version)));
  for (const migration of d1Migrations) {
    if (migration.version < fromVersion || migration.version > throughVersion || applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) db.exec(statement);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(migration.version, "2026-08-12T00:00:00.000Z");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((row) => String(row.name));
}

function indexNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name").all().map((row) => String(row.name));
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expectConstraint(action, label) {
  try {
    action();
  } catch {
    return label;
  }
  throw new Error(`Expected SQLite constraint rejection: ${label}`);
}

function insertSyntheticV9Data(db) {
  const payload = JSON.stringify({ fixture: "SYNTHETIC_PRE_EXISTING", clients: [{ id: "UC-SAFE-1" }], private: false });
  db.prepare("INSERT INTO app_state_snapshot(id,payload,updated_at,revision) VALUES(?,?,?,?)").run("primary", payload, "2026-08-12T00:00:00.000Z", 9);
  db.prepare("INSERT INTO optin_leads(id,identity_key,unique_client_id,payload,imported_at,last_seen_at,organisation_id,external_source_id,source_record_type,source_record_id,external_client_code,sync_status,last_synced_at,source_event_id,record_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("lead-safe-1", "email:synthetic@example.test", "UC-SAFE-1", JSON.stringify({ name: "Synthetic" }), "2026-08-12T00:00:00.000Z", "2026-08-12T00:00:00.000Z", "org-safe", "source-safe", "LEAD", "external-safe-1", "EXT-SAFE-1", "SYNCED", "2026-08-12T00:00:00.000Z", "event-safe-1", 1);
  db.prepare("INSERT INTO external_sources(id,organisation_id,source_system,source_environment,source_key,status,inbound_mode,config_version,created_at,updated_at,record_version) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run("source-safe", "org-safe", "SYNTHETIC", "DISPOSABLE", "source-key-safe", "PAUSED", "SIGNED_WEBHOOK", 1, "2026-08-12T00:00:00.000Z", "2026-08-12T00:00:00.000Z", 1);
  return sha(payload);
}

function verifyV11Constraints(db) {
  const base = ["policy-safe", "org-safe", 1, "ACTIVE", 5100000, 1100000, 1800, 7, 60, "Synthetic rehearsal policy", "owner-safe", "2026-08-12T00:00:00.000Z", "policy-idem-safe", "hash-safe", 1];
  const sql = "INSERT INTO founder_commercial_policy_versions(id,organisation_id,version,status,reference_fee_paise,reference_advance_paise,default_gst_basis_points,balance_deadline_days,advance_invoice_sla_minutes,reason,actor_user_id,created_at,idempotency_key,request_hash,record_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  db.prepare(sql).run(...base);
  const failures = [];
  failures.push(expectConstraint(() => db.prepare(sql).run(...["policy-duplicate", ...base.slice(1)]), "unique organisation policy version"));
  failures.push(expectConstraint(() => db.prepare(sql).run(...["policy-days-invalid", "org-safe", 2, "ACTIVE", 5100000, 1100000, 1800, 8, 60, "Invalid", "owner-safe", "2026-08-12T00:00:00.000Z", "policy-idem-2", "hash-2", 1]), "seven-day deadline constraint"));
  failures.push(expectConstraint(() => db.prepare(sql).run(...["policy-sla-invalid", "org-safe", 3, "ACTIVE", 5100000, 1100000, 1800, 7, 59, "Invalid", "owner-safe", "2026-08-12T00:00:00.000Z", "policy-idem-3", "hash-3", 1]), "sixty-minute invoice SLA constraint"));
  return failures;
}

export async function runFounderPreStagingRehearsal() {
  const workspace = await mkdtemp(join(tmpdir(), "uchit-founder-rehearsal-"));
  const cleanPath = join(workspace, "clean-v12.sqlite");
  const upgradePath = join(workspace, "upgrade-v9-v12.sqlite");
  const backupPath = join(workspace, "upgrade-v9.backup.sqlite");
  const restorePath = join(workspace, "restore-v12.sqlite");
  const interruptedPath = join(workspace, "interrupted-v11.sqlite");
  let report;
  try {
    const clean = openDatabase(cleanPath);
    applyMigrations(clean, 1, 12);
    const cleanTables = tableNames(clean);
    const cleanIndexes = indexNames(clean);
    const constraints = verifyV11Constraints(clean);
    applyMigrations(clean, 1, 12);
    const repeatedMarkerCount = Number(clean.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count);
    clean.close();

    let upgrade = openDatabase(upgradePath);
    applyMigrations(upgrade, 1, 9);
    const payloadHashBefore = insertSyntheticV9Data(upgrade);
    upgrade.exec(`VACUUM INTO ${quoteSqlitePath(backupPath)}`);
    upgrade.close();
    upgrade = openDatabase(upgradePath);
    applyMigrations(upgrade, 10, 12);
    const snapshot = upgrade.prepare("SELECT payload,revision FROM app_state_snapshot WHERE id='primary'").get();
    const preserved = sha(String(snapshot.payload)) === payloadHashBefore && Number(snapshot.revision) === 9
      && Number(upgrade.prepare("SELECT COUNT(*) AS count FROM optin_leads WHERE id='lead-safe-1'").get().count) === 1
      && Number(upgrade.prepare("SELECT COUNT(*) AS count FROM external_sources WHERE id='source-safe'").get().count) === 1;
    applyMigrations(upgrade, 10, 12);
    const upgradedMarkers = Number(upgrade.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count);
    const integrity = String(upgrade.prepare("PRAGMA integrity_check").get().integrity_check);
    upgrade.close();

    await copyFile(backupPath, restorePath);
    const restored = openDatabase(restorePath);
    applyMigrations(restored, 10, 12);
    const restoredSnapshot = restored.prepare("SELECT payload,revision FROM app_state_snapshot WHERE id='primary'").get();
    const restoredPreserved = sha(String(restoredSnapshot.payload)) === payloadHashBefore && Number(restoredSnapshot.revision) === 9;
    const restoreIntegrity = String(restored.prepare("PRAGMA integrity_check").get().integrity_check);
    restored.close();

    const interrupted = openDatabase(interruptedPath);
    applyMigrations(interrupted, 1, 11);
    interrupted.exec("BEGIN IMMEDIATE");
    let injectedFailure = false;
    try {
      interrupted.exec(d1Migrations.find((item) => item.version === 12).statements[0]);
      interrupted.exec("THIS IS AN INTENTIONAL REHEARSAL FAILURE");
      interrupted.exec("COMMIT");
    } catch {
      interrupted.exec("ROLLBACK");
      injectedFailure = true;
    }
    const noPartialMarker = Number(interrupted.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version=12").get().count) === 0;
    const noPartialTable = !tableNames(interrupted).includes("founder_statutory_policy_versions");
    applyMigrations(interrupted, 12, 12);
    const forwardFixed = Number(interrupted.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version=12").get().count) === 1;
    interrupted.close();

    report = {
      scope: "DISPOSABLE_LOCAL_ONLY",
      migrationsDeclared: 12,
      cleanPath: { from: 1, to: 12, markerCount: repeatedMarkerCount, idempotent: repeatedMarkerCount === 12 },
      upgradePath: { from: 9, through: 12, markerCount: upgradedMarkers, syntheticDataPreserved: preserved, integrity },
      backupRestore: { backupCreated: (await stat(backupPath)).size > 0, syntheticDataPreserved: restoredPreserved, integrity: restoreIntegrity },
      interruptionRecovery: { injectedFailure, noPartialMarker, noPartialTable, forwardFixed },
      schema: {
        tableCount: cleanTables.length,
        founderV12TableCount: cleanTables.filter((name) => name.startsWith("founder_")).length,
        requiredIndexesPresent: ["idx_founder_proposals_scope", "idx_founder_deadlines_due", "idx_founder_invoices_due", "idx_founder_statutory_due", "idx_founder_statutory_project"].every((name) => cleanIndexes.includes(name)),
        constraintFailuresObserved: constraints
      },
      persistentEnvironmentTouched: false,
      disposed: false
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
  report.disposed = true;
  return report;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const report = await runFounderPreStagingRehearsal();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
