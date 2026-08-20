import type { FounderScorecard } from "@/lib/founder-scorecard";
import { canOpenFounderFlowStep, getCurrentFounderFlowStep, getFounderFlowSteps, getNextFounderFlowStep, getPreviousFounderFlowStep, type FounderFlowStep } from "@/lib/founder-flow";
import { FounderStepWorkspace } from "@/components/founder-step-workspace";
import { FounderCaseSelector } from "@/components/founder-case-selector";
import { FounderProgressAutoScroll } from "@/components/founder-progress-auto-scroll";
import { FounderReviewStepLink } from "@/components/founder-review-step-link";

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
      <div className="founder-flow-stepper" aria-label="Available Founder steps">
        {steps.map((step) => {
          const available = canOpenFounderFlowStep(scorecard, step.number);
          const active = step.number === currentNumber;
          return available ? <a key={step.id} className={`founder-flow-stepper-item${active ? " active" : ""}`} href={step.flowPath} aria-current={active ? "step" : undefined} data-current-stage={active ? "true" : undefined}>
            <span>{step.number.toString().padStart(2, "0")}</span><strong>{step.title}</strong><small>{active ? "Current stage · " : ""}{statusLabel(step.status)}</small>
          </a> : <span key={step.id} className="founder-flow-stepper-item locked" aria-disabled="true" title={step.explanation}>
            <span>{step.number.toString().padStart(2, "0")}</span><strong>{step.title}</strong><small>Locked · {step.explanation}</small>
          </span>;
        })}
      </div>
      <FounderProgressAutoScroll />
      {previous.length ? <details className="founder-flow-progress-previous-menu"><summary>Previous steps</summary><div>{previous.map((step) => <a key={step.id} href={step.flowPath} className="founder-flow-progress-item founder-flow-progress-previous"><span>{step.number.toString().padStart(2, "0")}</span><strong>{step.title}</strong></a>)}</div></details> : null}
    </nav>
  );
}

export function FounderFlowHome({ scorecard }: { scorecard: FounderScorecard }) {
  const current = getCurrentFounderFlowStep(scorecard);
  const steps = getFounderFlowSteps(scorecard);
  const complete = steps.filter((step) => step.status === "COMPLETE").length;
  const attention = steps.filter((step) => ["IN_PROGRESS", "READY", "NEEDS_REGENERATION"].includes(step.status)).length;
  if (!scorecard.caseRecord || !scorecard.selectedFloorId) return <section className="founder-command-center" aria-labelledby="founder-command-center-title">
    <section className="founder-command-center-hero">
      <div className="founder-flow-kicker">Founder Command Center</div>
      <h1 id="founder-command-center-title">{scorecard.availableCaseCount ? "Choose the work to continue" : "No active cases yet"}</h1>
      <p>{scorecard.availableCaseCount ? "Select an authorised case and floor to continue from its server-derived workflow position." : "Start a governed client journey from Leads. A Case appears here only after the required commercial, qualification and handoff gates are complete."}</p>
      <div className="founder-command-center-actions">
        {scorecard.availableCaseCount ? <a className="button" href="/clients-cases">Open Clients &amp; Cases</a> : <a className="button" href="/crm">Start New Client</a>}
        <a className="button-secondary" href="/crm">Open Leads</a>
      </div>
    </section>
    <div className="founder-command-center-grid">
      <section className="founder-command-center-card"><span className="eyebrow">Current work</span><h2>{scorecard.availableCaseCount ? "Select one case and floor" : "Nothing is waiting for case work"}</h2><p>{scorecard.availableCaseCount ? "Recent and permitted cases remain available through the case selector." : "No case or floor has been fabricated. The next legitimate action is to start with an existing lead."}</p>{scorecard.availableCaseCount ? <FounderCaseSelector /> : <a className="text-link" href="/clients-cases">Review Clients &amp; Cases</a>}</section>
      <section className="founder-command-center-card"><span className="eyebrow">What happens next</span><h2>Use the governed journey</h2><p>Leads, qualification, proposal, acceptance and case handoff remain server-gated. Navigation exposes destinations; it does not unlock them.</p><a className="text-link" href="/workspace">Open My Workspace</a></section>
    </div>
  </section>;
  return (
    <section className="founder-command-center" aria-labelledby="founder-command-center-title">
      <section className="founder-flow-home-surface">
        <div className="founder-flow-kicker">Founder Command Center · {complete} of {steps.length} modules complete</div>
        <div className="founder-flow-context" aria-label="Selected project context">{contextLine(scorecard)}</div>
        <div className="founder-flow-progress-meter" aria-label={`${complete} of ${steps.length} modules complete`}><span style={{ width: `${Math.round((complete / steps.length) * 100)}%` }} /></div>
        <div className="founder-flow-step-number">{current ? `Next step ${current.number.toString().padStart(2, "0")}` : "Workflow complete"}</div>
        <h1 id="founder-command-center-title">{current?.title ?? "Review released work"}</h1>
        <p className="founder-flow-home-description">{current?.explanation ?? "All available Founder steps are complete. Review the report and controlled delivery surfaces for this case."}</p>
        <div className="founder-command-center-actions">{current ? <a className="button founder-flow-continue" href={current.flowPath}>Continue current work</a> : <a className="button" href="/reports">Review reports</a>}<a className="button-secondary" href="/clients-cases">Change case or floor</a></div>
      </section>
      <div className="founder-command-center-grid"><section className="founder-command-center-card"><span className="eyebrow">Needs attention</span><h2>{attention ? `${attention} workflow item${attention === 1 ? "" : "s"}` : "No open workflow items"}</h2><p>{attention ? "Continue the highlighted server-derived action. Locked steps remain unavailable until their prerequisite is recorded." : "The selected case has no open step requiring attention."}</p></section><section className="founder-command-center-card"><span className="eyebrow">Case context</span><h2>One floor at a time</h2><p>{contextLine(scorecard)}</p><FounderCaseSelector caseId={scorecard.caseRecord.id} floorId={scorecard.selectedFloorId} caseLabel={scorecard.caseRecord.caseNumber} /></section></div>
    </section>
  );
}

export function FounderFlowPage({ scorecard, stepNumber, walkthrough = false }: { scorecard: FounderScorecard; stepNumber: number; walkthrough?: boolean }) {
  const step = getFounderFlowSteps(scorecard).find((item) => item.number === stepNumber);
  const current = getCurrentFounderFlowStep(scorecard);
  const previous = getPreviousFounderFlowStep(scorecard, stepNumber);
  const next = getNextFounderFlowStep(scorecard, stepNumber);
  if (!step || !current) return <p className="subtle">This Founder step is not available.</p>;
  const isFuture = !canOpenFounderFlowStep(scorecard, stepNumber);
  const isV1 = scorecard.caseRecord?.evaluationArchitectureVersion === "V1" && scorecard.selectedFloor?.evaluationArchitectureVersion === "V1";
  const isOptionalV1ManualSheet = isV1 && step.id === "manual-sheet";
  const displayStatus = isFuture ? "BLOCKED" : step.status;
  const tone = statusTone(displayStatus);
  const isRegeneration = step.status === "NEEDS_REGENERATION" && !isFuture;
  const isBlocked = step.status === "BLOCKED" || step.status === "NEEDS_REGENERATION" || isFuture;
  const isComplete = step.status === "COMPLETE" && !isFuture;
  const action = isComplete ? { href: "#founder-step-workspace", label: "Review current step" } : isRegeneration ? { href: "#founder-step-workspace", label: "Resolve regeneration" } : isFuture ? { href: current.flowPath, label: `Go to step ${current.number.toString().padStart(2, "0")}` } : isBlocked && !step.selfRemediableOnCurrentStep ? (step.recoveryAction ?? { href: current.flowPath, label: "Go to required step" }) : !isBlocked ? step.primaryAction : undefined;
  const nextReason = isOptionalV1ManualSheet ? "Optional V1 supporting evidence. Continue skips this legacy-only surface." : isComplete ? "This step is complete. Continue to the next server-derived step." : isFuture ? `Complete step ${current.number.toString().padStart(2, "0")} to unlock the next step.` : step.explanation;
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
        <details className="founder-flow-inputs" open={!isBlocked && !isComplete && !isOptionalV1ManualSheet}><summary>{isOptionalV1ManualSheet ? "Optional supporting evidence" : "Required now"}</summary><ul>{step.requiredInputs.map((input) => <li key={input}>{input}</li>)}</ul></details>
        {step.status === "COMPLETE" && !isFuture ? <div className="founder-flow-success" role="status">This step is complete. Continue when you are ready for the next server-derived step.</div> : null}
        {walkthrough ? <div id="founder-step-workspace" className="founder-current-workspace" tabIndex={-1}><FounderStepWorkspace scorecard={scorecard} stepNumber={stepNumber} walkthrough /></div> : !isBlocked || isRegeneration || step.selfRemediableOnCurrentStep ? <div id="founder-step-workspace" className="founder-current-workspace" tabIndex={-1}><FounderStepWorkspace scorecard={scorecard} stepNumber={stepNumber} /></div> : null}
        <div className="founder-flow-action-bar" aria-label="Step navigation">
          {previous ? <a className="button-secondary" href={previous.flowPath}>Previous</a> : <a className="button-secondary" href="/">Back to scorecard</a>}
          {(isBlocked || isComplete) && action ? isComplete ? <FounderReviewStepLink href={action.href} label={action.label} /> : <a className="button founder-flow-primary" href={action.href}>{action.label}</a> : null}
          {!isBlocked && !isComplete && !isOptionalV1ManualSheet ? <span className="founder-flow-current-action">Complete the current action above</span> : null}
          {next ? (isComplete || isOptionalV1ManualSheet) ? <a className="button founder-flow-next" href={next.flowPath}>Next step</a> : <button className="button founder-flow-next" type="button" disabled aria-describedby="founder-flow-next-reason">Next step</button> : <button className="button founder-flow-next" type="button" disabled aria-describedby="founder-flow-next-reason">Delivery remains disabled</button>}
          <p id="founder-flow-next-reason" className="founder-flow-next-reason">{nextReason}</p>
        </div>
        <p className="founder-flow-save-guidance">Save and Save &amp; Continue controls stay inside the active workspace so each action uses its exact server-side validation and concurrency contract.</p>
        <details className="founder-technical-details founder-flow-details"><summary>Details</summary><p>Technical status, IDs, hashes, audit history and advanced controls remain in the focused module workspace and history surfaces.</p></details>
      </section>
    </section>
  );
}
