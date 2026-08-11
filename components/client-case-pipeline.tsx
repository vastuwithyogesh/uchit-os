import type { AppState } from "@/lib/store";
import { normalizeClientPipeline } from "@/lib/crm-pipeline";

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

function paymentState(state: AppState, caseId: string) {
  const payments = state.payments.filter((payment) => payment.caseId === caseId);
  if (payments.some((payment) => payment.type === "BALANCE" && payment.status === "APPROVED")) return "Balance confirmed";
  if (payments.some((payment) => payment.type === "ADVANCE" && payment.status === "APPROVED")) return "Advance confirmed";
  return "Payment gate pending";
}

function reportState(state: AppState, caseId: string) {
  const reports = state.reportVersions.filter((report) => report.caseId === caseId);
  if (reports.some((report) => report.status === "RELEASED")) return "Report released";
  if (reports.some((report) => report.isPreview)) return "Internal preview";
  return "Report not started";
}

export function ClientCasePipeline({ state }: { state: AppState }) {
  const clients = new Map(state.clients.map((client) => [client.id, client]));
  const projects = new Map(state.projects.map((project) => [project.id, project]));
  const floorsByCase = new Map<string, typeof state.floorWorkspaces>();
  for (const floor of state.floorWorkspaces) {
    const floors = floorsByCase.get(floor.caseId) ?? [];
    floors.push(floor);
    floorsByCase.set(floor.caseId, floors);
  }
  const grouped = new Map<string, typeof state.vastuCases>();
  for (const caseRecord of state.vastuCases) {
    const cases = grouped.get(caseRecord.clientId) ?? [];
    cases.push(caseRecord);
    grouped.set(caseRecord.clientId, cases);
  }

  return (
    <section className="client-case-pipeline" aria-labelledby="client-case-pipeline-title">
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">Canonical case workspace</div>
          <h2 id="client-case-pipeline-title">Clients &amp; Cases</h2>
          <p className="subtle">One card per active case or project, grouped under the permanent Client ID. Floors remain independent and reports are never merged.</p>
        </div>
        <span className="status-pill status-neutral">Uchit-owned</span>
      </div>
      {!grouped.size ? (
        <div className="workspace-state" role="status">
          <h3>No active cases yet</h3>
          <p>Confirm the advance in Leads before creating a Vastu Case ID.</p>
          <a className="button" href="/lead-pipeline">Open Lead Pipeline</a>
        </div>
      ) : (
        <div className="client-case-groups">
          {Array.from(grouped.entries()).map(([clientId, cases]) => {
            const client = clients.get(clientId);
            return (
              <section className="client-case-group" key={clientId} aria-labelledby={`client-${clientId}`}>
                <div className="client-case-group-heading">
                  <div><span className="eyebrow">Permanent Client ID</span><h3 id={`client-${clientId}`}>{client?.displayName ?? "Client record"}</h3></div>
                  <span className="meta">{cases.length} case{cases.length === 1 ? "" : "s"}</span>
                </div>
                <div className="client-case-cards">
                  {cases.map((caseRecord) => {
                    const project = caseRecord.projectId ? projects.get(caseRecord.projectId) : undefined;
                    const floors = floorsByCase.get(caseRecord.id) ?? [];
                    const completeFloors = floors.filter((floor) => floor.reportStatus === "RELEASED" || floor.status === "LOCKED").length;
                    const pipeline = client ? normalizeClientPipeline(client) : undefined;
                    return (
                      <article className="client-case-card" key={caseRecord.id}>
                        <div className="client-case-card-top"><span className="status-pill status-ready">{label(caseRecord.status)}</span><span className="meta">{caseRecord.caseNumber}</span></div>
                        <h4>{project?.propertyName ?? "Vastu project"}</h4>
                        <dl className="client-case-fields">
                          <div><dt>Project stage</dt><dd>{label(project?.status ?? pipeline?.stage ?? "IN_PROGRESS")}</dd></div>
                          <div><dt>Floor progress</dt><dd>{completeFloors}/{floors.length || 1} floors released · one report per floor</dd></div>
                          <div><dt>Payment</dt><dd>{paymentState(state, caseRecord.id)}</dd></div>
                          <div><dt>Report</dt><dd>{reportState(state, caseRecord.id)}</dd></div>
                          <div><dt>Next action</dt><dd>{pipeline?.nextAction?.summary ?? "Review case setup"}</dd></div>
                        </dl>
                        <div className="client-case-actions"><a className="button" href={`/ops?caseId=${encodeURIComponent(caseRecord.id)}`}>Open case workspace</a><a className="button-secondary" href={`/spatial?caseId=${encodeURIComponent(caseRecord.id)}`}>View floors</a></div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
