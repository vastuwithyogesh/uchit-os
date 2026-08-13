"use client";

/**
 * Local-only presentation adapter. The server grants this component only for a
 * loopback TEST_ONLY request; it has no API calls, storage access or mutation
 * path. It makes every scorecard workspace inspectable without a production
 * gate bypass.
 */
const content: Record<number, { title: string; fields: Array<[string, string]> }> = {
  1: { title: "Case and project", fields: [["Commercial clearance", "Approved INTERNAL_COMPLIMENTARY exception"], ["Case variation", "Existing Space · Residential"]] },
  2: { title: "Floor setup", fields: [["Floor", "Ground floor"], ["Independent lineage", "TEST_ONLY-FLR-001"]] },
  3: { title: "Intake", fields: [["Main requirement", "Calm home entry and family spaces"], ["Property context", "Residential · 1 floor · Test-only location"]] },
  4: { title: "Direction verification", fields: [["Evidence", "Synthetic Google Earth reference"], ["Status", "Ready for Founder verification"]] },
  5: { title: "Layout preparation", fields: [["Plan", "Synthetic Ground Floor Plan v1"], ["Status", "Ready for review"]] },
  6: { title: "Gridding and evidence", fields: [["Grid", "32D / 16D synthetic overlay"], ["Status", "Ready for confirmation"]] },
  7: { title: "Manual utility mapping", fields: [["Manual sheet", "Synthetic utility mapping"], ["Status", "Ready for approval"]] },
  8: { title: "Utility and Shakti evaluation", fields: [["Evaluation", "Representative rule-based result"], ["Status", "Ready for review"]] },
  9: { title: "Stage A verdict", fields: [["Verdict", "TEST_ONLY presentation snapshot"], ["Status", "Ready to present"]] },
  10: { title: "Site Analysis", fields: [["Site evidence", "Synthetic visit observation"], ["Status", "Ready for checkpoint"]] },
  11: { title: "Post-Site Findings", fields: [["Comparison", "Synthetic layout delta"], ["Status", "Ready for review"]] },
  12: { title: "Balance clearance", fields: [["Classification", "INTERNAL_COMPLIMENTARY"], ["Balance", "₹0.00 · no payment/invoice"]] },
  13: { title: "Stage B remedial reservation", fields: [["Methodology", "BLOCKED_METHOD_INPUT"], ["Recovery", "Await approved methodology"]] },
  14: { title: "Report assembly", fields: [["Artifact", "Synthetic immutable report draft"], ["Status", "Ready for assembly"]] },
  15: { title: "Founder review and approval", fields: [["Review", "Representative approval checklist"], ["Status", "Ready for Founder review"]] },
  16: { title: "Protected PDF", fields: [["Output", "Synthetic protected-PDF boundary"], ["Status", "Ready when approval gates pass"]] },
  17: { title: "Delivery history", fields: [["Delivery", "Disabled by policy"], ["Recovery", "Separate client-delivery approval required"]] }
};

export function FounderWalkthroughWorkspace({ stepNumber }: { stepNumber: number }) {
  const step = content[stepNumber] ?? { title: "Founder step", fields: [] };
  return <section className="card founder-work-surface" data-testid={`walkthrough-step-${stepNumber}`} aria-label={`TEST_ONLY ${step.title}`}>
    <span className="eyebrow">TEST_ONLY local walkthrough projection</span>
    <h2>{step.title}</h2>
    <p>Representative canonical fixture data is shown for inspection only. This page has no hosted mutation, provider, payment, invoice, or delivery action.</p>
    <dl className="founder-walkthrough-values">{step.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="footer-note">Use the route map to inspect another step. Canonical actions remain isolated to the disposable rehearsal harness.</p>
  </section>;
}
