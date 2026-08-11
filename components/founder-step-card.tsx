import type { ReactNode } from "react";

type StepTone = "neutral" | "attention" | "blocked" | "ready" | "approved" | "released" | "needs-regeneration";

type FounderStepCardProps = {
  step: string;
  title: string;
  description?: string;
  tone?: StepTone;
  status?: string;
  children: ReactNode;
  className?: string;
};

export function FounderStepCard({ step, title, description, tone = "neutral", status, children, className = "" }: FounderStepCardProps) {
  return (
    <section className={`founder-step-card ${className}`.trim()} data-tone={tone} aria-labelledby={`${step}-title`}>
      <div className="founder-step-card-heading">
        <div>
          <div className="eyebrow">{step}</div>
          <h3 id={`${step}-title`}>{title}</h3>
          {description ? <p className="subtle">{description}</p> : null}
        </div>
        {status ? <span className={`status-pill status-${tone}`}>{status}</span> : null}
      </div>
      <div className="founder-step-card-body">{children}</div>
    </section>
  );
}
