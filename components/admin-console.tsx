"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import { canManageTemplates } from "@/lib/permissions";
import { rolePermissions } from "@/lib/auth";
import { buildActionHeaders } from "@/lib/request-helpers";
import type { UserRole } from "@/lib/domain";
import type { AppState } from "@/lib/store";

type StaffRoleAssignment = {
  email: string;
  role: UserRole;
  fullName: string;
  updatedAt: string;
};

type StaffRoleAuditRecord = {
  id: string;
  targetEmail: string;
  previousRole?: UserRole;
  nextRole: UserRole;
  actorName: string;
  actorRole: UserRole;
  changedAt: string;
};

async function fetchState() {
  const response = await fetch("/api/bootstrap", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load admin state");
  }
  return response.json();
}

async function fetchStaffRoles(role?: string) {
  const response = await fetch("/api/staff-roles", {
    cache: "no-store",
    headers: buildActionHeaders(role)
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Failed to load staff roles");
  }
  return result as { ok: true; assignments: StaffRoleAssignment[]; audit: StaffRoleAuditRecord[] };
}

async function saveStaffRoleAssignment(payload: { email: string; role: UserRole; fullName: string }, role?: string) {
  const response = await fetch("/api/staff-roles", {
    method: "POST",
    headers: buildActionHeaders(role),
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.error ?? "Failed to save staff role");
  }
  return result as { ok: true; assignments: StaffRoleAssignment[]; audit: StaffRoleAuditRecord[] };
}

async function revokeStaffRoleAssignment(email: string, role?: string) {
  const response = await fetch("/api/staff-roles", {
    method: "DELETE",
    headers: buildActionHeaders(role),
    body: JSON.stringify({ email })
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.error ?? "Failed to revoke staff access");
  return result as { ok: true; assignments: StaffRoleAssignment[]; audit: StaffRoleAuditRecord[] };
}

async function postAction(payload: Record<string, unknown>, role?: string) {
  const response = await fetch("/api/actions", {
    method: "POST",
    headers: buildActionHeaders(role),
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
  const [assignments, setAssignments] = useState<StaffRoleAssignment[]>([]);
  const [roleAudit, setRoleAudit] = useState<StaffRoleAuditRecord[]>([]);
  const [message, setMessage] = useState("Load admin state to start");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    slug: "qualification-reminder",
    title: "Qualification reminder",
    category: "Lead",
    body: "Hi {{client_name}}, we are ready for your short qualification call.",
    variables: "client_name,setter_name"
  });
  const [staffDraft, setStaffDraft] = useState({
    email: "",
    fullName: "",
    role: "SETTER" as UserRole
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
      const [nextState, nextAssignments] = await Promise.all([fetchState(), fetchStaffRoles(activeUser.role)]);
      setState(nextState);
      setAssignments(nextAssignments.assignments);
      setRoleAudit(nextAssignments.audit);
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
      const result = await postAction(action, activeUser.role);
      setState(await fetchState());
      setMessage(JSON.stringify(result).slice(0, 160));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    if (!window.confirm(`Give ${staffDraft.fullName || staffDraft.email} the ${staffDraft.role} role? This changes their production data access after hosting access is granted.`)) return;
    setBusy(true);
    try {
      const result = await saveStaffRoleAssignment(staffDraft, activeUser.role);
      setAssignments(result.assignments);
      setRoleAudit(result.audit);
      setStaffDraft({
        email: "",
        fullName: "",
        role: "SETTER"
      });
      setMessage("Staff role assignment updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assignment update failed");
    } finally {
      setBusy(false);
    }
  }

  async function revokeAssignment(assignment: StaffRoleAssignment) {
    if (!window.confirm(`Remove staff access for ${assignment.fullName} (${assignment.email})? They will fall back to client-only access.`)) return;
    setBusy(true);
    try {
      const result = await revokeStaffRoleAssignment(assignment.email, activeUser.role);
      setAssignments(result.assignments);
      setRoleAudit(result.audit);
      setMessage("Staff access revoked");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Staff access revocation failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="section-grid">
      <div className="card span-7">
        <div className="eyebrow">Template admin</div>
        <h2>WhatsApp templates</h2>
        <p className="subtle">This keeps outbound template control and role governance in one place.</p>

        <div className="stat-grid" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <span className="stat-value">{templates.length}</span>
            <span className="stat-label">templates loaded</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{activeTemplates.length}</span>
            <span className="stat-label">templates active</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{logs.length}</span>
            <span className="stat-label">send logs captured</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{assignments.length}</span>
            <span className="stat-label">staff mappings</span>
          </div>
        </div>

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
              <div className="meta">Latest outbound templates captured in the CRM</div>
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
        <p className="subtle">Permissions are visible here, and signed-in staff can now be mapped to roles on the server.</p>
        <div className="list" style={{ marginTop: 14 }}>
          {userRows.map(([role, permissions]) => (
            <div key={role} className="list-item">
              <strong>{role}</strong>
              <span className="meta">{permissions.join(" · ")}</span>
            </div>
          ))}
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <strong>Staff role assignments</strong>
              <div className="meta">These mappings drive production role resolution for signed-in staff.</div>
            </div>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {assignments.map((assignment) => (
              <div key={assignment.email} className="list-item">
                <strong>{assignment.fullName}</strong>
                <span className="meta">
                  {assignment.email} · {assignment.role}
                </span>
                {activeUser.role === "SUPER_ADMIN" && assignment.role !== "SUPER_ADMIN" ? (
                  <button className="button-secondary" type="button" disabled={busy} onClick={() => revokeAssignment(assignment)}>
                    Remove staff access
                  </button>
                ) : null}
              </div>
            ))}
            {!assignments.length ? <span className="meta">No staff role assignments loaded yet.</span> : null}
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Staff email</label>
            <input value={staffDraft.email} onChange={(event) => setStaffDraft((current) => ({ ...current, email: event.target.value }))} placeholder="name@uchitvastu.in" />
          </div>
          <div className="field">
            <label>Full name</label>
            <input value={staffDraft.fullName} onChange={(event) => setStaffDraft((current) => ({ ...current, fullName: event.target.value }))} placeholder="Team member name" />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={staffDraft.role} onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value as UserRole }))}>
              {(["SETTER", "CONSULTANT", "ADMIN"] as UserRole[]).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <button className="button" type="button" disabled={busy || activeUser.role !== "SUPER_ADMIN"} onClick={saveAssignment}>
            Save staff role
          </button>
          <div className="footer-note" style={{ marginTop: 10 }}>
            {activeUser.role === "SUPER_ADMIN" ? "Choose the least-powerful role needed. Super-Admin and hosting access are controlled separately." : "Only Super-Admin can change staff role assignments."}
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head"><div><strong>Recent role changes</strong><div className="meta">Permanent production access audit</div></div></div>
          <div className="list" style={{ marginTop: 12 }}>
            {roleAudit.slice(0, 8).map((entry) => (
              <div key={entry.id} className="list-item">
                <strong>{entry.targetEmail}</strong>
                <span className="meta">{entry.previousRole ?? "Unassigned"} → {entry.nextRole}</span>
                <span className="meta">Changed by {entry.actorName} ({entry.actorRole}) · {new Date(entry.changedAt).toLocaleString()}</span>
              </div>
            ))}
            {!roleAudit.length ? <span className="meta">No production role changes recorded yet.</span> : null}
          </div>
        </div>

        <div className="footer-note">{message}</div>
        <button className="button-secondary" type="button" onClick={refresh} disabled={busy} style={{ marginTop: 12 }}>
          Refresh admin state
        </button>
      </div>
    </section>
  );
}
