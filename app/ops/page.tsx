import { SiteHeader } from "@/components/site-header";
import { WorkflowConsole } from "@/components/workflow-console";

export default function OpsPage() {
  return (
    <main className="page-shell">
      <SiteHeader title="Workflow Console" subtitle="Local action layer" />

      <section className="hero-panel" style={{ marginTop: 22 }}>
        <div className="eyebrow">Mutable local layer</div>
        <h1>The live action layer for approvals, case creation, preview generation, and verdict release.</h1>
        <p className="lede">
          This page is the bridge between the seeded demo and the real workflows. It uses the local API routes so we can test the PRD logic end to end without needing the cloud backend connected yet.
        </p>
      </section>

      <WorkflowConsole />
    </main>
  );
}
