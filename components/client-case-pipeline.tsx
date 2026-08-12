import type { AppState } from "@/lib/store";
import type { UserRole } from "@/lib/domain";
import { buildFounderScorecard } from "@/lib/founder-scorecard";
import { getCurrentFounderFlowStep } from "@/lib/founder-flow";

const caseGroups = [
  { id: "SETUP", label: "Setup", range: [1, 3] },
  { id: "EVIDENCE", label: "Evidence / Mapping", range: [4, 7] },
  { id: "EVALUATION", label: "Evaluation", range: [8, 8] },
  { id: "VERDICT", label: "Verdict / Balance", range: [9, 13] },
  { id: "REPORT", label: "Report / Delivery", range: [14, 17] },
] as const;

function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase()); }
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

export function ClientCasePipeline({ state, actorRole }: { state: AppState; actorRole: UserRole }) {
  const clients = new Map(state.clients.map((client) => [client.id, client]));
  const projects = new Map(state.projects.map((project) => [project.id, project]));
  const cards = state.vastuCases.map((caseRecord) => {
    const client = clients.get(caseRecord.clientId);
    const floors = state.floorWorkspaces.filter((floor) => floor.caseId === caseRecord.id);
    const activeFloor = floors.find((floor) => floor.reportStatus !== "RELEASED" || !floor.deliveredAt) ?? floors[0];
    const scorecard = buildFounderScorecard(state, { role: actorRole }, client?.id, caseRecord.id, activeFloor?.id);
    const current = getCurrentFounderFlowStep(scorecard);
    const group = caseGroups.find((item) => current && current.number >= item.range[0] && current.number <= item.range[1]) ?? caseGroups[0];
    const releasedFloors = floors.filter((floor) => floor.reportStatus === "RELEASED").length;
    const deliveredFloors = floors.filter((floor) => Boolean(floor.deliveredAt)).length;
    return { caseRecord, client, project: caseRecord.projectId ? projects.get(caseRecord.projectId) : undefined, floors, activeFloor, current, group, releasedFloors, deliveredFloors };
  });

  return <section className="case-board" aria-labelledby="case-board-title">
    <header className="case-board-header"><div><h2 id="case-board-title">Client &amp; Case Pipeline</h2><p>One active case per card · one independent report per floor</p></div><span className="status-pill status-neutral">{cards.length} active cases</span></header>
    {!cards.length ? <div className="workspace-state" role="status"><h3>No active cases yet</h3><p>Confirm an approved advance before creating the first Vastu Case ID.</p><a className="button" href="/lead-pipeline">Open Lead Pipeline</a></div> : <div className="case-kanban" aria-label="Case progress board">{caseGroups.map((group) => {
      const groupCards = cards.filter((card) => card.group.id === group.id);
      return <section className="case-kanban-column" key={group.id}><header><h3>{group.label}</h3><span>{groupCards.length}</span></header><div>{groupCards.length ? groupCards.map((card) => {
        const nextPath = card.current?.flowPath ?? `/founder/01?caseId=${encodeURIComponent(card.caseRecord.id)}${card.activeFloor ? `&floorId=${encodeURIComponent(card.activeFloor.id)}` : ""}`;
        return <article className="case-pipeline-card" key={card.caseRecord.id}><div className="case-card-identity"><span>{card.client?.id ?? "Client ID unavailable"}</span><strong>{card.client?.displayName ?? "Client record"}</strong><small>{card.caseRecord.caseNumber}</small></div><h4>{card.project?.propertyName ?? "Vastu project"}</h4><dl><div><dt>Current floor</dt><dd>{card.activeFloor?.floorLabel ?? "Floor setup pending"}</dd></div><div><dt>Floor progress</dt><dd>{card.releasedFloors}/{card.floors.length || 1} reports released · {card.deliveredFloors}/{card.floors.length || 1} delivered</dd></div><div><dt>Next task</dt><dd>{card.current?.title ?? "Review case"}</dd></div><div><dt>Payment</dt><dd>{paymentState(state, card.caseRecord.id)}</dd></div><div><dt>Report</dt><dd>{reportState(state, card.caseRecord.id)}</dd></div></dl>{card.floors.length ? <div className="case-floor-chips" aria-label="Floor progress">{card.floors.map((floor) => { const floorScorecard = buildFounderScorecard(state, { role: actorRole }, card.client?.id, card.caseRecord.id, floor.id); const floorCurrent = getCurrentFounderFlowStep(floorScorecard); return <a key={floor.id} href={floorCurrent?.flowPath ?? nextPath} className={floor.id === card.activeFloor?.id ? "active" : undefined}>{floor.floorLabel}<span>{floor.reportStatus === "RELEASED" ? "Released" : floorCurrent ? `Step ${floorCurrent.number}` : label(floor.status)}</span></a>; })}</div> : null}<a className="button case-continue" href={nextPath}>Continue case</a><details><summary>Details</summary><p>Project state: {card.project?.status ?? "Setup pending"}. Partial floor completion never closes this project.</p></details></article>;
      }) : <p className="case-column-empty">No cases at this stage</p>}</div></section>;
    })}</div>}
  </section>;
}
