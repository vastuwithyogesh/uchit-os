import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type LocalConnectionSettings = {
  databaseUrl: string;
  directUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  appUrl: string;
};

const defaultSettings: LocalConnectionSettings = {
  databaseUrl: "",
  directUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseServiceRoleKey: "",
  appUrl: "http://localhost:3000"
};

const settingsPath = join(process.cwd(), "data", "local-settings.json");

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
