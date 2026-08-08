"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import { canManageTemplates } from "@/lib/permissions";
import { rolePermissions } from "@/lib/auth";
import type { AppState } from "@/lib/store";

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load admin state");
  }
  return response.json();
}

async function postAction(payload: Record<string, unknown>) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Request failed");
  }
  return result;
}

export function AdminConsole() {
  const { activeUser } = useSession();
  const [state, setState] = useState<AppState | null>(null);
  const [message, setMessage] = useState("Load admin state to start");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    slug: "qualification-reminder",
    title: "Qualification reminder",
    category: "Lead",
    body: "Hi {{client_name}}, we’re ready for your short qualification call.",
    variables: "client_name,setter_name"
  });

  const templates = state?.whatsappTemplates ?? [];
  const logs = state?.whatsappLogs ?? [];
  const userRows = useMemo(() => Object.entries(rolePermissions), []);
  const activeTemplates = templates.filter((template) => template.active);
  const sendCountsByTemplate = useMemo(() => {
    return logs.reduce<Record<string, number>>((acc, log) => {
      acc[log.templateId] = (acc[log.templateId] ?? 0) + 1;
      return acc;
    }, {});
  }, [logs]);

  async function refresh() {
    setBusy(true);
    try {
      setState(await fetchState());
      setMessage("Admin state refreshed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await postAction({ ...action, actorRole: activeUser.role });
      setState(await fetchState());
      setMessage(JSON.stringify(result).slice(0, 160));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-grid">
      <div className="card span-7">
        <div className="eyebrow">Template admin</div>
        <h2>WhatsApp templates</h2>
        <p className="subtle">This gives us a local control panel for template lifecycle without waiting for the cloud backend.</p>

        <div className="pill-row" style={{ marginTop: 14 }}>
          <span className="pill">Templates {templates.length}</span>
          <span className="pill">Active {activeTemplates.length}</span>
          <span className="pill">Sent logs {logs.length}</span>
        </div>

        <div className="two-col" style={{ marginTop: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>New template</strong>
                <div className="meta">Create a reusable message</div>
              </div>
            </div>
            <div className="field">
              <label>Slug</label>
              <input value={draft.slug} onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))} />
            </div>
            <div className="field">
              <label>Title</label>
              <input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div className="field">
              <label>Category</label>
              <input value={draft.category} onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))} />
            </div>
            <div className="field">
              <label>Body</label>
              <textarea value={draft.body} onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))} />
            </div>
            <div className="field">
              <label>Variables</label>
              <input value={draft.variables} onChange={(event) => setDraft((prev) => ({ ...prev, variables: event.target.value }))} />
            </div>
            <button
              className="button"
              type="button"
              disabled={busy || !canManageTemplates(activeUser)}
              onClick={() =>
                run({
                  action: "template-create",
                  slug: draft.slug,
                  title: draft.title,
                  category: draft.category,
                  body: draft.body,
                  variables: draft.variables
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                })
              }
            >
              Create template
            </button>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <strong>Template catalog</strong>
                <div className="meta">{templates.length} templates total</div>
              </div>
            </div>
            <div className="list" style={{ marginTop: 12 }}>
              {templates.map((template) => (
                <div key={template.id} className="list-item">
                  <strong>{template.title}</strong>
                  <span className="meta">
                    {template.slug} · {template.category}
                  </span>
                  <div className="pill-row">
                    <span className={`tag ${template.active ? "good" : "warn"}`}>{template.active ? "Active" : "Paused"}</span>
                    <span className="pill">Sent {sendCountsByTemplate[template.id] ?? 0}</span>
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={busy || !canManageTemplates(activeUser)}
                      onClick={() => run({ action: "template-toggle", templateId: template.id, active: !template.active })}
                    >
                      {template.active ? "Pause" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <strong>Recent send log</strong>
              <div className="meta">Latest outbound templates captured in the local CRM</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {logs.slice(0, 5).map((log) => {
              const template = templates.find((item) => item.id === log.templateId);
              return (
                <div key={log.id} className="list-item">
                  <strong>{template?.title ?? log.templateId}</strong>
                  <span className="meta">
                    {log.recipientPhone} · {new Date(log.sentAt).toLocaleString()}
                  </span>
                  <span className="tag good">{log.status}</span>
                </div>
              );
            })}
            {!logs.length ? <span className="meta">No template sends logged yet.</span> : null}
          </div>
        </div>
      </div>

      <div className="card span-5">
        <div className="eyebrow">Role matrix</div>
        <h2>Permission coverage</h2>
        <p className="subtle">This mirrors the local role session picker and makes it easy to see what each role can touch.</p>
        <div className="list" style={{ marginTop: 14 }}>
          {userRows.map(([role, permissions]) => (
            <div key={role} className="list-item">
              <strong>{role}</strong>
              <span className="meta">{permissions.join(" · ")}</span>
            </div>
          ))}
        </div>
        <div className="footer-note">{message}</div>
        <button className="button-secondary" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh admin state
        </button>
      </div>
    </section>
  );
}
