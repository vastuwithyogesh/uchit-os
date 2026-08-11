import type { FounderScorecard as FounderScorecardModel, FounderScorecardModule, FounderScorecardStatus } from "@/lib/founder-scorecard";
import { FounderStepCard } from "@/components/founder-step-card";

function toneForStatus(status: FounderScorecardStatus) {
  if (status === "BLOCKED") return "blocked" as const;
  if (status === "NEEDS_REGENERATION") return "needs-regeneration" as const;
  if (status === "COMPLETE") return "approved" as const;
  if (status === "READY") return "ready" as const;
  if (status === "IN_PROGRESS") return "attention" as const;
  return "neutral" as const;
}

function readableStatus(status: FounderScorecardStatus) {
  return status.replaceAll("_", " ");
}

function ModuleCard({ module, active }: { module: FounderScorecardModule; active: boolean }) {
  const tone = toneForStatus(module.status);
  return (
    <FounderStepCard
      step={`${module.number.toString().padStart(2, "0")} · ${active ? "Next" : "Module"}`}
      title={module.title}
      description={module.purpose}
      tone={tone}
      status={readableStatus(module.status)}
      className={active ? "founder-scorecard-module founder-scorecard-module-active" : "founder-scorecard-module"}
    >
      <p className="founder-scorecard-explanation">{module.explanation}</p>
      <div className="founder-scorecard-actions">
        <a className="button founder-action-primary" href={module.primaryAction.href}>{module.primaryAction.label}</a>
        {module.recoveryAction ? <a className="button-secondary" href={module.recoveryAction.href}>{module.recoveryAction.label}</a> : null}
      </div>
      <details className="founder-technical-details founder-scorecard-details">
        <summary>Technical details</summary>
        <p>{module.technical}</p>
      </details>
    </FounderStepCard>
  );
}

export function FounderScorecard({ scorecard }: { scorecard: FounderScorecardModel }) {
  const active = scorecard.modules.find((module) => module.id === scorecard.recommendedModuleId);
  return (
    <div className="founder-scorecard" aria-label="Founder project scorecard">
      <section className="founder-scorecard-header card" aria-labelledby="founder-scorecard-title">
        <div className="founder-scorecard-header-copy">
          <div className="eyebrow">Founder scorecard</div>
          <h1 id="founder-scorecard-title">One clear next step for this project.</h1>
          <p className="lede">Work through one module at a time. Required gates stay visible, and every floor keeps its own evidence, evaluation and report.</p>
          <div className="founder-context-bar" aria-label="Current project context">
            <span>{scorecard.client?.displayName ?? "No client selected"}</span>
            <span aria-hidden="true">→</span>
            <span>{scorecard.project?.propertyName ?? scorecard.caseRecord?.caseNumber ?? "Case not opened"}</span>
            <span aria-hidden="true">→</span>
            <span>{scorecard.floors.length ? `${scorecard.floors.length} floor${scorecard.floors.length === 1 ? "" : "s"}` : "Floor setup pending"}</span>
          </div>
        </div>
        <div className="founder-scorecard-header-next">
          <span className="status-pill status-attention">Recommended next</span>
          <strong>{active?.title ?? "Review the scorecard"}</strong>
          <p className="subtle">{active?.explanation ?? "Open the first available Founder module."}</p>
          {active ? <a className="button" href={active.primaryAction.href}>{active.primaryAction.label}</a> : null}
        </div>
      </section>

      <section className="founder-scorecard-floors" aria-labelledby="floor-progress-title">
        <div className="founder-scorecard-section-heading">
          <div>
            <div className="eyebrow">Floor progress</div>
            <h2 id="floor-progress-title">Each floor moves independently.</h2>
          </div>
          <span className="meta">One floor per report</span>
        </div>
        {scorecard.floors.length ? (
          <div className="founder-floor-chips">
            {scorecard.floors.map((floor) => (
              <a className={`founder-floor-chip founder-floor-chip-${floor.status.toLowerCase()}`} href={`/spatial?floorId=${encodeURIComponent(floor.id)}`} key={floor.id}>
                <span><strong>{floor.label}</strong><small>{floor.completedModules}/{floor.totalModules} modules</small></span>
                <span className="status-pill">{floor.status.replaceAll("_", " ")}</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="founder-scorecard-empty"><p>No floor workspace exists yet. Complete case setup, then add the first floor.</p><a className="button-secondary" href="/ops">Open floor setup</a></div>
        )}
      </section>

      <section className="founder-scorecard-list" aria-labelledby="module-sequence-title">
        <div className="founder-scorecard-section-heading">
          <div>
            <div className="eyebrow">Guided sequence</div>
            <h2 id="module-sequence-title">Complete the modules in order.</h2>
          </div>
          <span className="meta">Back is always allowed · required gates are not skippable</span>
        </div>
        <div className="founder-scorecard-modules">
          {scorecard.modules.map((module) => <ModuleCard key={module.id} module={module} active={module.id === scorecard.recommendedModuleId} />)}
        </div>
      </section>
    </div>
  );
}
