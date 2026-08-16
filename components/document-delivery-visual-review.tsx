const allChecks = [
  ["Report sequence finalised", "Released immutable v5 floor report."],
  ["Integrity PASS", "Section A, five Remedy pages, Extras, and report-wide integrity pass."],
  ["Template snapshot frozen", "Brand Profile v1 · Vastu Report Template v1."],
  ["Final approval", "Approved by Yogesh Vastu · 14 Aug 2026, 10:12."],
  ["Protected PDF verified", "pdf_7f21c8 · released · 24 pages."],
  ["Payment and release gate", "Full balance evidence approved."],
  ["Client recipient resolved", "Asha Mehta · asha@example.com."],
  ["No regeneration blocker", "No open floor regeneration state."]
] as const;

const scenarioTitle: Record<string, string> = {
  dashboard: "Delivery dashboard", panel: "Report delivery panel", ready: "Readiness checklist complete", blocked: "Readiness blocked",
  identity: "Exact artifact and hash identity", approval: "Final approval authority", protected: "Protected PDF verification",
  recipient: "Recipient resolution", mark_ready: "Mark Ready", confirmation: "Delivery confirmation", delivered: "Delivered state",
  history: "Delivery history", repeat: "Repeat delivery", manual: "Manual handoff", replacement: "Replacement delivery link",
  old_preserved: "Original delivery preserved", client_list: "Client delivered reports", client_detail: "Client report detail",
  download: "Secure protected download", acknowledge_action: "Receipt acknowledgement action", acknowledged: "Acknowledged state",
  access_history: "Access and download history", unauthorized: "Unauthorised access", health: "Delivery health",
  founder_deferred: "Founder deliverable scope", remedy: "Vastu Remedy floor deliverable", old_brand: "Historical Brand v1 retained",
  replacement_brand: "Replacement uses Brand v2", mobile_client: "Mobile client report", mobile_internal: "Mobile delivery dashboard"
};

function ClientReview({ scenario }: { scenario: string }) {
  const acknowledged = scenario === "acknowledged"; const detail = ["client_detail", "download", "acknowledge_action", "acknowledged", "access_history", "mobile_client"].includes(scenario);
  return <div className={`delivery-review-frame client-review ${scenario === "mobile_client" ? "review-mobile" : ""}`}>
    <header className="review-topbar"><strong>UCHIT <span>VASTU INDIA</span></strong><span>Asha Mehta · Client portal</span></header>
    <main><div className="eyebrow">Your Vastu journey</div><h1>{detail ? "Ground Floor · Final v1" : "Your delivered reports"}</h1>
      {detail ? <section className="card client-delivery-detail"><span className={`tag ${acknowledged ? "good" : "neutral"}`}>{acknowledged ? "Receipt acknowledged" : "Delivered"}</span><h2>Asha Residence</h2><p className="subtle">Delivered 14 Aug 2026, 10:30 · exact protected PDF · 24 pages</p>
        <div className="delivery-identity"><div><span className="meta">Delivery reference</span><code>del_asha_ground_v1</code></div><div><span className="meta">Protected checksum</span><code>8f5d26ad9401…9bc321aa</code></div></div>
        {scenario === "download" ? <div className="review-callout good">Secure download authorised for this delivered record only. No newer report fallback.</div> : null}
        <div className="hero-actions"><button className="button-secondary">View report</button><button className="button">Download protected PDF</button>{!acknowledged ? <button className="button-secondary">Acknowledge receipt</button> : null}</div>
        {scenario === "acknowledge_action" ? <p className="subtle">Acknowledgement confirms receipt only. It is not a legal signature or implementation confirmation.</p> : null}
        {scenario === "access_history" || acknowledged ? <div className="list"><div className="list-item"><strong>{acknowledged ? "Receipt acknowledged" : "Protected PDF downloaded"}</strong><span className="meta">14 Aug 2026, 10:42</span></div><div className="list-item"><strong>Report viewed</strong><span className="meta">14 Aug 2026, 10:36</span></div></div> : null}
      </section> : <section className="card"><div className="list"><div className="list-item"><strong>Final v1 · Ground Floor</strong><span className="meta">Delivered 14 Aug 2026 · protected PDF</span><span className="tag neutral">Delivered</span><div className="hero-actions"><button className="button-secondary">View report</button><button className="button">Download protected PDF</button></div></div><div className="list-item"><strong>First Floor</strong><span className="meta">No delivered report yet</span><span className="tag warn">Not available</span></div></div></section>}
    </main>
  </div>;
}

function InternalReview({ scenario }: { scenario: string }) {
  const blocked = scenario === "blocked"; const delivered = ["delivered", "history", "repeat", "replacement", "old_preserved", "old_brand", "replacement_brand"].includes(scenario);
  const manual = scenario === "manual"; const health = scenario === "health"; const mobile = scenario === "mobile_internal";
  const checks = allChecks.map((item, index) => ({ label: item[0], detail: blocked && [1, 4].includes(index) ? (index === 1 ? "Section C integrity is pending." : "Protected PDF has not been verified.") : item[1], passed: !(blocked && [1, 4].includes(index)) }));
  return <div className={`delivery-review-frame ${mobile ? "review-mobile" : ""}`}><header className="review-topbar"><strong>UCHIT <span>VASTU INDIA</span></strong><span>Founder Edition · Report Delivery</span></header>
    <main className="delivery-admin-shell"><div className="delivery-dashboard-head card"><div><div className="eyebrow">Final report handoff</div><h1>{scenarioTitle[scenario] ?? "Delivery dashboard"}</h1><p className="subtle">Exact immutable protected artifact · one floor · one independent delivery.</p></div><button className="button-secondary">Refresh</button></div>
      {scenario === "unauthorized" ? <section className="card review-denied"><div className="eyebrow">Access denied</div><h2>Final report delivery requires the DELIVERY capability.</h2><p className="subtle">Consultants may author reports but cannot make protected artifacts available to clients.</p></section>
      : scenario === "founder_deferred" ? <section className="card review-deferred"><div className="eyebrow">Audited scope decision</div><h2>Founder proposal and statutory delivery is deferred.</h2><p className="subtle">Those families retain their current approved handoff paths. V1 activates only VASTU_REMEDY_REPORT; no unsupported readiness adapter is claimed.</p></section>
      : <div className="delivery-admin-grid"><aside className="card delivery-list"><button className="delivery-row active"><span><strong>Asha Mehta</strong><small>Asha Residence · Ground Floor</small></span><span className={`tag ${delivered ? "neutral" : blocked ? "warn" : "good"}`}>{delivered ? "DELIVERED" : blocked ? "BLOCKED" : "READY"}</span></button><button className="delivery-row"><span><strong>Rohan Shah</strong><small>Shah Villa · First Floor</small></span><span className="tag warn">DRAFT</span></button><button className="delivery-row"><span><strong>Meera Rao</strong><small>Rao Home · Ground Floor</small></span><span className="tag good">ACKNOWLEDGED</span></button></aside>
        <article className="card delivery-panel"><header><div><div className="eyebrow">UV-2026-014 · Ground Floor</div><h2>Final v1</h2><p className="subtle">Recipient: Asha Mehta · asha@example.com</p></div><span className={`tag ${health ? "bad" : "good"}`}>{health ? "Attention" : "Healthy"}</span></header>
          {scenario === "replacement" || scenario === "old_preserved" ? <div className="review-callout"><strong>{scenario === "replacement" ? "Replacement R2 links to delivery del_R1" : "Original R1 remains available"}</strong><span>{scenario === "replacement" ? "Separate report, protected artifact, readiness and delivery identity." : "R1 bytes and Brand v1 snapshot remain pinned after R2 delivery."}</span></div> : null}
          {scenario === "old_brand" || scenario === "replacement_brand" ? <div className="review-brand-pair"><div><span className="meta">Original delivery R1</span><strong>Brand Profile v1</strong><small>Snapshot brand_v1 · unchanged</small></div><div><span className="meta">Replacement delivery R2</span><strong>{scenario === "replacement_brand" ? "Brand Profile v2" : "Not selected"}</strong><small>{scenario === "replacement_brand" ? "New snapshot brand_v2" : "R1 does not auto-restyle"}</small></div></div> : null}
          <section className="delivery-identity"><div><span className="meta">Report canonical hash</span><code>aa82cf493ac1…e90172bd</code></div><div><span className="meta">Protected PDF ID</span><code>pdf_7f21c8</code></div><div><span className="meta">Protected PDF SHA-256</span><code>8f5d26ad9401…9bc321aa</code></div><div><span className="meta">Template snapshot</span><code>{scenario === "replacement_brand" ? "template_v2" : "template_v1"}</code></div></section>
          <section><h3>Readiness checklist</h3><div className="delivery-checklist">{checks.map((check) => <div key={check.label} className={check.passed ? "pass" : "block"}><span>{check.passed ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div></section>
          {health ? <section className="delivery-health"><h3>Delivery health</h3><ul><li>Protected PDF checksum mismatch</li><li>No automatic repair performed</li></ul></section> : null}
          <section><h3>Controlled actions</h3><div className="hero-actions">{delivered ? <><button className="button-secondary">Record repeat delivery</button><span className="tag neutral">Delivered 14 Aug 2026, 10:30</span></> : manual ? <><input value="Founder handed protected PDF on encrypted USB." readOnly /><button className="button-secondary">Record Manual Delivery</button></> : <><button className="button">{scenario === "mark_ready" ? "Mark Ready" : "Deliver to portal"}</button>{scenario === "confirmation" ? <span className="review-confirm">Confirm exact artifact pdf_7f21c8?</span> : null}</>}</div></section>
          <section><h3>Append-only delivery history</h3><div className="list">{delivered || ["history", "repeat"].includes(scenario) ? <><div className="list-item"><strong>{scenario === "repeat" ? "REDELIVERED" : "DELIVERED"}</strong><span className="meta">Delivery Admin · CLIENT PORTAL · 14 Aug 2026, 10:30</span></div><div className="list-item"><strong>READY</strong><span className="meta">All existing gates passed · 14 Aug 2026, 10:24</span></div><div className="list-item"><strong>PREPARED</strong><span className="meta">Exact artifact pinned · 14 Aug 2026, 10:20</span></div></> : <div className="list-item"><strong>PREPARED</strong><span className="meta">Exact artifact and recipient pinned.</span></div>}</div></section>
        </article></div>}
    </main></div>;
}

export function DocumentDeliveryVisualReview({ scenario }: { scenario: string }) {
  return ["client_list", "client_detail", "download", "acknowledge_action", "acknowledged", "access_history", "mobile_client"].includes(scenario)
    ? <ClientReview scenario={scenario} /> : <InternalReview scenario={scenario} />;
}
