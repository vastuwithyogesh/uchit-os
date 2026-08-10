import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getRuntimeEnv } from "@/lib/runtime-env";

export type LocalConnectionSettings = {
  databaseUrl: string;
  directUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  appUrl: string;
};

export type RedactedConnectionSettings = {
  databaseUrl: "";
  directUrl: "";
  supabaseUrl: string;
  supabaseAnonKey: "";
  supabaseServiceRoleKey: "";
  appUrl: string;
};

const defaultSettings: LocalConnectionSettings = {
  databaseUrl: "",
  directUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseServiceRoleKey: "",
  appUrl: "http://localhost:3003"
};

const settingsPath = join(process.cwd(), "data", "local-settings.json");

async function readSettingsFromD1(): Promise<LocalConnectionSettings | null> {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS local_settings (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const row = await env.DB.prepare("SELECT payload FROM local_settings WHERE id = ?").bind("current").first<{ payload: string }>();
  if (!row?.payload) {
    return null;
  }

  return JSON.parse(row.payload) as LocalConnectionSettings;
}

async function writeSettingsToD1(settings: LocalConnectionSettings) {
  const env = getRuntimeEnv();
  if (!env.DB) {
    return null;
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS local_settings (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await env.DB.prepare("DELETE FROM local_settings WHERE id = ?").bind("current").run();
  await env.DB.prepare("INSERT INTO local_settings (id, payload, updated_at) VALUES (?, ?, ?)").bind(
    "current",
    JSON.stringify(settings),
    new Date().toISOString()
  ).run();
  return settings;
}

export function readLocalConnectionSettings(): LocalConnectionSettings {
  if (!existsSync(settingsPath)) {
    return defaultSettings;
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<LocalConnectionSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function writeLocalConnectionSettings(settings: LocalConnectionSettings) {
  const directory = dirname(settingsPath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

export function getConnectionStatus(settings: LocalConnectionSettings = readLocalConnectionSettings()) {
  return {
    databaseUrl: Boolean(process.env.DATABASE_URL || settings.databaseUrl),
    directUrl: Boolean(process.env.DIRECT_URL || settings.directUrl),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || settings.supabaseUrl),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || settings.supabaseAnonKey),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || settings.supabaseServiceRoleKey),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL || settings.appUrl)
  };
}

export function redactConnectionSettings(settings: LocalConnectionSettings): RedactedConnectionSettings {
  return {
    databaseUrl: "",
    directUrl: "",
    supabaseUrl: settings.supabaseUrl,
    supabaseAnonKey: "",
    supabaseServiceRoleKey: "",
    appUrl: settings.appUrl
  };
}

export function getMergedConnectionSettings() {
  const local = readLocalConnectionSettings();
  return {
    ...local,
    databaseUrl: process.env.DATABASE_URL || local.databaseUrl,
    directUrl: process.env.DIRECT_URL || local.directUrl,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || local.supabaseUrl,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.supabaseAnonKey,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || local.supabaseServiceRoleKey,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || local.appUrl
  };
}

export async function readPersistentConnectionSettings() {
  return (await readSettingsFromD1()) ?? readLocalConnectionSettings();
}

export async function writePersistentConnectionSettings(settings: LocalConnectionSettings) {
  const wrote = await writeSettingsToD1(settings);
  if (wrote) {
    return wrote;
  }

  return writeLocalConnectionSettings(settings);
}
