"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";

type LocalConnectionSettings = {
  databaseUrl: string;
  directUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  appUrl: string;
};

type SettingsPayload = {
  settings: LocalConnectionSettings;
  status: Record<string, boolean>;
};

type SettingsTestPayload = {
  ok: true;
  result: {
    database: {
      configured: boolean;
      reachable: boolean;
      error: string | null;
    };
    supabase: {
      configured: boolean;
      reachable: boolean;
      error: string | null;
    };
  };
};

const blankSettings: LocalConnectionSettings = {
  databaseUrl: "",
  directUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseServiceRoleKey: "",
  appUrl: "http://localhost:3000"
};

async function fetchSettings() {
  const response = await fetch("/api/settings", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load settings");
  }
  return (await response.json()) as SettingsPayload;
}

async function saveSettings(settings: LocalConnectionSettings) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Failed to save settings");
  }

  return payload as SettingsPayload & { ok: true };
}

async function testSettings() {
  const response = await fetch("/api/settings/test", { method: "POST" });
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? "Failed to test settings");
  }

  return payload as SettingsTestPayload;
}

export function SettingsConsole() {
  const { activeUser } = useSession();
  const [settings, setSettings] = useState<LocalConnectionSettings>(blankSettings);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load the local settings to begin");
  const [testResult, setTestResult] = useState<SettingsTestPayload["result"] | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  const envSnippet = useMemo(
    () =>
      [
        `DATABASE_URL="${settings.databaseUrl}"`,
        `DIRECT_URL="${settings.directUrl}"`,
        `NEXT_PUBLIC_SUPABASE_URL="${settings.supabaseUrl}"`,
        `NEXT_PUBLIC_SUPABASE_ANON_KEY="${settings.supabaseAnonKey}"`,
        `SUPABASE_SERVICE_ROLE_KEY="${settings.supabaseServiceRoleKey}"`,
        `NEXT_PUBLIC_APP_URL="${settings.appUrl}"`
      ].join("\n"),
    [settings]
  );

  async function refresh() {
    setBusy(true);
    try {
      const payload = await fetchSettings();
      setSettings(payload.settings);
      setStatus(payload.status);
      setMessage("Local settings loaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  async function persist(next: LocalConnectionSettings) {
    setBusy(true);
    try {
      const payload = await saveSettings(next);
      setSettings(payload.settings);
      setStatus(payload.status);
      setMessage("Local settings saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setBusy(true);
    try {
      const payload = await testSettings();
      setTestResult(payload.result);
      setMessage("Connection test completed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  function updateField<K extends keyof LocalConnectionSettings>(key: K, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="section-grid">
      <div className="card span-7">
        <div className="eyebrow">Connection profile</div>
        <h2>Database and Supabase settings</h2>
        <p className="subtle">These values are stored locally for the current workspace. The server reads them when your env vars are not already set.</p>
        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="field">
              <label>DATABASE_URL</label>
              <input value={settings.databaseUrl} onChange={(event) => updateField("databaseUrl", event.target.value)} placeholder="postgresql://..." />
            </div>
            <div className="field">
              <label>DIRECT_URL</label>
              <input value={settings.directUrl} onChange={(event) => updateField("directUrl", event.target.value)} placeholder="postgresql://..." />
            </div>
            <div className="field">
              <label>NEXT_PUBLIC_SUPABASE_URL</label>
              <input value={settings.supabaseUrl} onChange={(event) => updateField("supabaseUrl", event.target.value)} placeholder="https://project.supabase.co" />
            </div>
            <div className="field">
              <label>NEXT_PUBLIC_SUPABASE_ANON_KEY</label>
              <input value={settings.supabaseAnonKey} onChange={(event) => updateField("supabaseAnonKey", event.target.value)} placeholder="anon key" />
            </div>
            <div className="field">
              <label>SUPABASE_SERVICE_ROLE_KEY</label>
              <input value={settings.supabaseServiceRoleKey} onChange={(event) => updateField("supabaseServiceRoleKey", event.target.value)} placeholder="service role key" />
            </div>
            <div className="field">
              <label>NEXT_PUBLIC_APP_URL</label>
              <input value={settings.appUrl} onChange={(event) => updateField("appUrl", event.target.value)} placeholder="http://localhost:3000" />
            </div>
            <div className="hero-actions">
              <button className="button" type="button" onClick={() => persist(settings)} disabled={busy}>Save settings</button>
              <button className="button-secondary" type="button" onClick={refresh} disabled={busy}>Reload</button>
              <button className="button-secondary" type="button" onClick={runTest} disabled={busy}>Test connection</button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Connection health</strong>
                <div className="meta">These checks show what the local app can already use.</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {Object.entries(status).map(([key, value]) => (
                <div key={key} className="list-item">
                  <strong>{key}</strong>
                  <span className={`tag ${value ? "good" : "warn"}`}>{value ? "Ready" : "Missing"}</span>
                </div>
              ))}
            </div>
            {testResult ? (
              <div className="list" style={{ marginTop: 12 }}>
                <div className="list-item">
                  <strong>Database test</strong>
                  <span className={`tag ${testResult.database.reachable ? "good" : "warn"}`}>{testResult.database.reachable ? "Reachable" : "Blocked"}</span>
                  <span className="meta">{testResult.database.error ?? "No error"}</span>
                </div>
                <div className="list-item">
                  <strong>Supabase test</strong>
                  <span className={`tag ${testResult.supabase.reachable ? "good" : "warn"}`}>{testResult.supabase.reachable ? "Reachable" : "Blocked"}</span>
                  <span className="meta">{testResult.supabase.error ?? "No error"}</span>
                </div>
              </div>
            ) : null}
            <div className="footer-note">{message}</div>
          </div>
        </div>
      </div>

      <div className="card span-5">
        <div className="eyebrow">Env output</div>
        <h2>Copyable .env block</h2>
        <p className="subtle">This is handy if you want to paste the settings into a real `.env.local` file later.</p>
        <textarea value={envSnippet} readOnly style={{ minHeight: 360, marginTop: 16 }} />
        <div className="pill-row" style={{ marginTop: 12 }}>
          <span className="pill">Signed in as {activeUser.role}</span>
          <span className="pill">Local-only storage</span>
        </div>
      </div>
    </section>
  );
}
