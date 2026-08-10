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
