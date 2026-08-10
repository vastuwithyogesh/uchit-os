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
  settings: {
    mode: string;
    actor: {
      role: string;
    };
  };
  result: {
    d1: {
      configured: boolean;
      reachable: boolean;
      error: string | null;
    };
    r2: {
      configured: boolean;
      reachable: boolean;
      error: string | null;
    };
    connectionProfile: {
      configuredKeys: Record<string, boolean>;
      error: string | null;
    };
    staffRoles: {
      configured: boolean;
      reachable: boolean;
      error: string | null;
      count: number;
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
  const { activeUser, isLocalDemo } = useSession();
  const [settings, setSettings] = useState<LocalConnectionSettings>(blankSettings);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load the saved workspace profile to begin.");
  const [testResult, setTestResult] = useState<SettingsTestPayload | null>(null);
  const configuredCount = Object.values(status).filter(Boolean).length;
  const trackedCount = Object.keys(status).length;

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
      setMessage("Connection profile loaded");
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
      setMessage("Connection profile saved");
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
      setTestResult(payload);
      setMessage("Runtime readiness test completed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyEnvBlock() {
    try {
      await navigator.clipboard.writeText(envSnippet);
      setMessage("Env block copied to clipboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Copy failed");
    }
  }

  function updateField<K extends keyof LocalConnectionSettings>(key: K, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="section-grid">
      <div className="card span-7">
        <div className="eyebrow">Connection profile</div>
        <h2>Runtime and integration profile</h2>
        <p className="subtle">These values are saved for this workspace and used when environment variables are not already present.</p>
        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{configuredCount}</span>
            <span className="stat-label">configured values</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{trackedCount}</span>
            <span className="stat-label">tracked keys</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{testResult?.result.staffRoles.count ?? 0}</span>
            <span className="stat-label">mapped staff roles</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{testResult?.result.d1.reachable || testResult?.result.r2.reachable ? "Live" : "Check"}</span>
            <span className="stat-label">storage readiness</span>
          </div>
        </div>
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
              <button className="button" type="button" onClick={() => persist(settings)} disabled={busy}>
                Save settings
              </button>
              <button className="button-secondary" type="button" onClick={refresh} disabled={busy}>
                Reload
              </button>
              <button className="button-secondary" type="button" onClick={runTest} disabled={busy}>
                Test readiness
              </button>
              <button className="button-secondary" type="button" onClick={copyEnvBlock} disabled={busy}>
                Copy env block
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Configured values</strong>
                <div className="meta">These checks show what the app can already read from saved workspace settings or environment values.</div>
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
                  <strong>Runtime mode</strong>
                  <span className="meta">{testResult.settings.mode}</span>
                </div>
                <div className="list-item">
                  <strong>Signed-in actor</strong>
                  <span className="meta">
                    Signed-in role · {testResult.settings.actor.role}
                  </span>
                </div>
                <div className="list-item">
                  <strong>D1 storage</strong>
                  <span className={`tag ${testResult.result.d1.reachable ? "good" : "warn"}`}>{testResult.result.d1.reachable ? "Reachable" : "Unavailable"}</span>
                  <span className="meta">{testResult.result.d1.error ?? (testResult.result.d1.configured ? "Configured" : "Not configured")}</span>
                </div>
                <div className="list-item">
                  <strong>R2 storage</strong>
                  <span className={`tag ${testResult.result.r2.reachable ? "good" : "warn"}`}>{testResult.result.r2.reachable ? "Reachable" : "Unavailable"}</span>
                  <span className="meta">{testResult.result.r2.error ?? (testResult.result.r2.configured ? "Configured" : "Not configured")}</span>
                </div>
                <div className="list-item">
                  <strong>Staff roles</strong>
                  <span className={`tag ${testResult.result.staffRoles.configured ? "good" : "warn"}`}>{testResult.result.staffRoles.count} mapped</span>
                  <span className="meta">{testResult.result.staffRoles.error ?? "Server-side role mapping is available."}</span>
                </div>
                <div className="list-item">
                  <strong>Connection profile</strong>
                  <span className={`tag ${Object.values(testResult.result.connectionProfile.configuredKeys).every(Boolean) ? "good" : "warn"}`}>
                    {Object.values(testResult.result.connectionProfile.configuredKeys).filter(Boolean).length} /{" "}
                    {Object.keys(testResult.result.connectionProfile.configuredKeys).length}
                  </span>
                  <span className="meta">{testResult.result.connectionProfile.error ?? "Profile is ready to reuse."}</span>
                </div>
              </div>
            ) : null}

            <div className="footer-note">{message}</div>
          </div>
        </div>
      </div>

      <div className="card span-5">
        <div className="eyebrow">Env output</div>
        <h2>Copyable env block</h2>
        <p className="subtle">This is useful when you want to mirror the saved settings into an environment file later.</p>
        <textarea value={envSnippet} readOnly style={{ minHeight: 360, marginTop: 16 }} />
        <div className="pill-row" style={{ marginTop: 12 }}>
          <span className="pill">Signed in as {activeUser.role}</span>
          <span className="pill">{isLocalDemo ? "Workspace role mode" : "Signed-in actor mode"}</span>
        </div>
      </div>
    </section>
  );
}
