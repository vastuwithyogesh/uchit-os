import { createClient } from "@supabase/supabase-js";
import { getMergedConnectionSettings } from "@/lib/server-settings";

function readRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    return null;
  }
  return value;
}

export function createBrowserSupabaseClient() {
  const settings = getMergedConnectionSettings();
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL") || settings.supabaseUrl;
  const anonKey = readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || settings.supabaseAnonKey;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey);
}

export function createServerSupabaseClient() {
  const settings = getMergedConnectionSettings();
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL") || settings.supabaseUrl;
  const serviceRole = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY") || settings.supabaseServiceRoleKey;

  if (!url || !serviceRole) {
    return null;
  }

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
