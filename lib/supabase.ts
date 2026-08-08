import { createClient } from "@supabase/supabase-js";

function readRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    return null;
  }
  return value;
}

export function createBrowserSupabaseClient() {
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey);
}

export function createServerSupabaseClient() {
  const url = readRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

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
