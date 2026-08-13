import type { FounderScorecard } from "@/lib/founder-scorecard";
import { canOpenFounderFlowStep, getCurrentFounderFlowStep, getFounderFlowSteps, getNextFounderFlowStep, getPreviousFounderFlowStep, type FounderFlowStep } from "@/lib/founder-flow";
import { FounderStepWorkspace } from "@/components/founder-step-workspace";
import { FounderCaseSelector } from "@/components/founder-case-selector";

function statusTone(status: FounderFlowStep["status"]) {
  if (status === "BLOCKED" || status === "NEEDS_REGENERATION") return status === "NEEDS_REGENERATION" ? "needs-regeneration" : "blocked";
  if (status === "COMPLETE") return "approved";
  if (status === "READY") return "ready";
  if (status === "IN_PROGRESS") return "attention";
  return "neutral";
}

function statusLabel(status: FounderFlowStep["status"]) {
  return status.replaceAll("_", " ");
}

function contextLine(scorecard: FounderScorecard) {
  const floor = scorecard.floors.find((item) => item.id === scorecard.selectedFloorId);
  return `${scorecard.client?.displayName ?? "No client selected"} · ${scorecard.project?.propertyName ?? scorecard.caseRecord?.caseNumber ?? "Case setup pending"} · ${floor?.label ?? "Floor setup pending"}`;
}

function ProgressControl({ scorecard, currentNumber }: { scorecard: FounderScorecard; currentNumber: number }) {
  const steps = getFounderFlowSteps(scorecard);
  const current = steps.find((step) => step.number === currentNumber) ?? steps[0];
  const previous = steps.filter((step) => step.number < currentNumber);
  return (
    <nav className="founder-flow-progress" aria-label="Founder progress">
      <span className="founder-flow-progress-current" aria-current="step">Step {current?.number.toString().padStart(2, "0")} of {steps.length} / {current?.title}</span>
      {previous.length ? <details className="founder-flow-progress-previous-menu"><summary>Previous steps</summary><div>{previous.map((step) => <a key={step.id} href={step.flowPath} className="founder-flow-progress-item founder-flow-progress-previous"><span>{step.number.toString().padStart(2, "0")}</span><strong>{step.title}</strong></a>)}</div></details> : null}
    </nav>
  );
}

export function FounderFlowHome({ scorecard }: { scorecard: FounderScorecard }) {
  const current = getCurrentFounderFlowStep(scorecard);
  const steps = getFounderFlowSteps(scorecard);
  const complete = steps.filter((step) => step.status === "COMPLETE").length;
  if (!scorecard.caseRecord || !scorecard.selectedFloorId) return <section className="founder-flow-home"><FounderCaseSelector /><div className="workspace-state"><h1>Select a case to continue</h1><p>Case and floor context is required. Nothing is selected automatically.</p></div></section>;
  return (
    <section className="founder-flow-home" aria-labelledby="founder-flow-home-title">
      <section className="founder-flow-home-surface">
        <div className="founder-flow-kicker">Founder Edition · {complete} of {steps.length} modules complete</div>
        <div className="founder-flow-context" aria-label="Selected project context">{contextLine(scorecard)}</div>
        <div className="founder-flow-progress-meter" aria-label={`${complete} of ${steps.length} modules complete`}><span style={{ width: `${Math.round((complete / steps.length) * 100)}%` }} /></div>
        <div className="founder-flow-step-number">Step {current?.number.toString().padStart(2, "0")}</div>
        <h1 id="founder-flow-home-title">{current?.title ?? "Founder workflow complete"}</h1>
        <p className="founder-flow-home-description">{current?.explanation ?? "All available Founder steps are complete. Stage B remains reserved until its approved methodology is supplied."}</p>
        {current ? <a className="button founder-flow-continue" href={current.flowPath}>Continue</a> : null}
      </section>
      <div className="founder-flow-home-note">Previous steps remain available from the progress control inside each module. Future gated steps stay closed until the server reports them ready.</div>
    </section>
  );
}

export function FounderFlowPage({ scorecard, stepNumber }: { scorecard: FounderScorecard; stepNumber: number }) {
  const step = getFounderFlowSteps(scorecard).find((item) => item.number === stepNumber);
  const current = getCurrentFounderFlowStep(scorecard);
  const previous = getPreviousFounderFlowStep(scorecard, stepNumber);
  const next = getNextFounderFlowStep(scorecard, stepNumber);
  if (!step || !current) return <p className="subtle">This Founder step is not available.</p>;
  const isFuture = !canOpenFounderFlowStep(scorecard, stepNumber);
  const displayStatus = isFuture ? "BLOCKED" : step.status;
  const tone = statusTone(displayStatus);
  const isBlocked = step.status === "BLOCKED" || step.status === "NEEDS_REGENERATION" || isFuture;
  const isComplete = step.status === "COMPLETE" && !isFuture;
  const action = isComplete ? (next ? { href: next.flowPath, label: "Continue to next step" } : undefined) : isFuture ? { href: current.flowPath, label: `Go to step ${current.number.toString().padStart(2, "0")}` } : isBlocked ? (step.recoveryAction ?? { href: current.flowPath, label: "Go to required step" }) : step.primaryAction;
  return (
    <section className="founder-flow-page" aria-labelledby="founder-flow-title">
      <FounderCaseSelector caseId={scorecard.caseRecord?.id} floorId={scorecard.selectedFloorId} caseLabel={scorecard.caseRecord?.caseNumber} />
      <ProgressControl scorecard={scorecard} currentNumber={stepNumber} />
      <section className="founder-flow-surface" data-tone={tone}>
        <div className="founder-flow-context" aria-label="Selected client, project and floor">{contextLine(scorecard)}</div>
        <div className="founder-flow-step-number">Step {step.number.toString().padStart(2, "0")} · {statusLabel(displayStatus)}</div>
        <h1 id="founder-flow-title">{step.title}</h1>
        <p className="founder-flow-description">{step.purpose}</p>
        <div className={`founder-flow-status status-${tone}`} role={isBlocked ? "alert" : "status"}>
          <div className="founder-flow-status-label"><span>Current status</span><strong>{isFuture ? "BLOCKED" : statusLabel(step.status)}</strong></div>
          <p>{isFuture ? `Complete step ${current.number.toString().padStart(2, "0")} before opening this work.` : step.explanation}</p>
        </div>
        <details className="founder-flow-inputs" open={!isBlocked && !isComplete}><summary>Required now</summary><ul>{step.requiredInputs.map((input) => <li key={input}>{input}</li>)}</ul></details>
        {step.status === "COMPLETE" && !isFuture ? <div className="founder-flow-success" role="status">This step is complete. Continue when you are ready for the next server-derived step.</div> : null}
        {!isBlocked && !isComplete ? <div className="founder-current-workspace"><FounderStepWorkspace scorecard={scorecard} stepNumber={stepNumber} /></div> : null}
        <div className="founder-flow-action-bar">
          {(isBlocked || isComplete) && action ? <a className="button founder-flow-primary" href={action.href}>{action.label}</a> : null}
          {previous ? <a className="button-secondary" href={previous.flowPath}>Back</a> : <a className="button-secondary" href="/">Back to scorecard</a>}
        </div>
        <details className="founder-technical-details founder-flow-details"><summary>Details</summary><p>Technical status, IDs, hashes, audit history and advanced controls remain in the focused module workspace and history surfaces.</p></details>
      </section>
    </section>
  );
}
