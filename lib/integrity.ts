import type { AppState } from "@/lib/store";

export type IntegrityIssue = {
  area: string;
  message: string;
  severity: "info" | "warn" | "error";
};

export function inspectIntegrity(
  state: AppState,
  runtime?: {
    d1Configured?: boolean;
    r2Configured?: boolean;
    staffAssignments?: number;
  },
  paymentProofAssets?: Array<{
    id?: string;
    key: string;
    label: string;
    fileName: string;
    url: string;
    uploadedAt: string;
    clientId?: string;
    proposalId?: string;
    caseId?: string;
  }>
) {
  const issues: IntegrityIssue[] = [];

  const clientIds = new Set(state.clients.map((client) => client.id));
  const proposalIds = new Set(state.commercialProposals.map((proposal) => proposal.id));
  const caseIds = new Set(state.vastuCases.map((item) => item.id));
  const reportIds = new Set(state.reportVersions.map((item) => item.id));
  const templateIds = new Set(state.whatsappTemplates.map((template) => template.id));

  for (const proposal of state.commercialProposals) {
    if (!clientIds.has(proposal.clientId)) {
      issues.push({ area: "Commercial proposals", message: `Proposal ${proposal.id} points to missing client ${proposal.clientId}.`, severity: "error" });
    }
  }

  for (const booking of state.reviewCallBookings) {
    if (!clientIds.has(booking.clientId)) {
      issues.push({ area: "Review call bookings", message: `Booking ${booking.id} points to missing client ${booking.clientId}.`, severity: "error" });
    }
    if (!proposalIds.has(booking.proposalId)) {
      issues.push({ area: "Review call bookings", message: `Booking ${booking.id} points to missing proposal ${booking.proposalId}.`, severity: "error" });
    }
  }

  for (const payment of state.payments) {
    if (!clientIds.has(payment.clientId)) {
      issues.push({ area: "Payments", message: `Payment ${payment.id} points to missing client ${payment.clientId}.`, severity: "error" });
    }
    if (payment.proposalId && !proposalIds.has(payment.proposalId)) {
      issues.push({ area: "Payments", message: `Payment ${payment.id} points to missing proposal ${payment.proposalId}.`, severity: "error" });
    }
    if (payment.caseId && !caseIds.has(payment.caseId)) {
      issues.push({ area: "Payments", message: `Payment ${payment.id} points to missing case ${payment.caseId}.`, severity: "error" });
    }
  }

  for (const verification of state.advanceVerifications) {
    if (!clientIds.has(verification.clientId)) {
      issues.push({ area: "Advance verifications", message: `Verification ${verification.id} points to missing client ${verification.clientId}.`, severity: "error" });
    }
    if (!proposalIds.has(verification.proposalId)) {
      issues.push({ area: "Advance verifications", message: `Verification ${verification.id} points to missing proposal ${verification.proposalId}.`, severity: "error" });
    }
    if (!state.payments.some((payment) => payment.id === verification.paymentId)) {
      issues.push({ area: "Advance verifications", message: `Verification ${verification.id} points to missing payment ${verification.paymentId}.`, severity: "error" });
    }
  }

  for (const vastuCase of state.vastuCases) {
    if (!clientIds.has(vastuCase.clientId)) {
      issues.push({ area: "Vastu cases", message: `Case ${vastuCase.id} points to missing client ${vastuCase.clientId}.`, severity: "error" });
    }
    if (!proposalIds.has(vastuCase.proposalId)) {
      issues.push({ area: "Vastu cases", message: `Case ${vastuCase.id} points to missing proposal ${vastuCase.proposalId}.`, severity: "error" });
    }
  }

  for (const workspace of state.floorWorkspaces) {
    if (!caseIds.has(workspace.caseId)) {
      issues.push({ area: "Floor workspaces", message: `Workspace ${workspace.id} points to missing case ${workspace.caseId}.`, severity: "error" });
    }
  }

  for (const report of state.reportVersions) {
    if (!caseIds.has(report.caseId)) {
      issues.push({ area: "Reports", message: `Report ${report.id} points to missing case ${report.caseId}.`, severity: "error" });
    }
    if ((report.approvals?.length ?? 0) > 0 && !reportIds.has(report.id)) {
      issues.push({ area: "Reports", message: `Report ${report.id} approval references are inconsistent.`, severity: "warn" });
    }
    if (report.isPreview && !report.watermarkText) {
      issues.push({ area: "Reports", message: `Preview report ${report.id} is missing watermark text.`, severity: "warn" });
    }
  }

  for (const snapshot of state.evaluationSnapshots) {
    if (!caseIds.has(snapshot.caseId)) {
      issues.push({ area: "Evaluation snapshots", message: `Snapshot ${snapshot.id} points to missing case ${snapshot.caseId}.`, severity: "error" });
    }
  }

  for (const snapshot of state.shaktiSnapshots) {
    if (!caseIds.has(snapshot.caseId)) {
      issues.push({ area: "Shakti snapshots", message: `Snapshot ${snapshot.id} points to missing case ${snapshot.caseId}.`, severity: "error" });
    }
    if (snapshot.inputValues.length !== 16) {
      issues.push({ area: "Shakti snapshots", message: `Snapshot ${snapshot.id} does not contain 16 input values.`, severity: "warn" });
    }
  }

  for (const event of state.timelineEvents) {
    if (!clientIds.has(event.clientId)) {
      issues.push({ area: "Timeline events", message: `Event ${event.id} points to missing client ${event.clientId}.`, severity: "error" });
    }
  }

  for (const lead of state.optInLeads) {
    if (lead.submissionCount < 1) {
      issues.push({ area: "Opt-in leads", message: `Lead ${lead.id} has an invalid submission count.`, severity: "warn" });
    }
    if (lead.firstSeenAt > lead.lastSeenAt) {
      issues.push({ area: "Opt-in leads", message: `Lead ${lead.id} has first seen later than last seen.`, severity: "warn" });
    }
    if (lead.isReturningLead && lead.duplicateCount === 0) {
      issues.push({ area: "Opt-in leads", message: `Lead ${lead.id} is marked returning without a duplicate count.`, severity: "warn" });
    }
  }

  for (const log of state.whatsappLogs) {
    if (!clientIds.has(log.clientId)) {
      issues.push({ area: "WhatsApp logs", message: `Log ${log.id} points to missing client ${log.clientId}.`, severity: "error" });
    }
    if (!templateIds.has(log.templateId)) {
      issues.push({ area: "WhatsApp logs", message: `Log ${log.id} points to missing template ${log.templateId}.`, severity: "error" });
    }
  }

  if (paymentProofAssets) {
    for (const payment of state.payments.filter((item) => item.status === "APPROVED")) {
      const expectedKey = payment.type === "ADVANCE" ? "advance-proof" : "balance-proof";
      const exactProof = paymentProofAssets.find((asset) => asset.id === payment.proofAssetId
        && asset.key === expectedKey
        && asset.clientId === payment.clientId
        && (payment.type === "ADVANCE" ? asset.proposalId === payment.proposalId : asset.caseId === payment.caseId));
      if (!exactProof) {
        issues.push({
          area: "Payment proofs",
          message: `Approved ${payment.type.toLowerCase()} payment ${payment.id} is legacy or is not bound to exact scoped proof. Keep it quarantined from new release decisions.`,
          severity: "warn"
        });
      }
    }
  }

  const duplicateUtilityRules = state.utilityRules.reduce<Record<string, number>>((acc, rule) => {
    const key = `${rule.tabName}:${rule.zoneCode}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  for (const [key, count] of Object.entries(duplicateUtilityRules)) {
    if (count > 1) {
      issues.push({ area: "Utility rules", message: `Duplicate rule key ${key} appears ${count} times.`, severity: "warn" });
    }
  }

  if (runtime) {
    if (!runtime.d1Configured) {
      issues.push({ area: "Runtime", message: "D1 storage binding is not configured, so durable structured storage is unavailable.", severity: "warn" });
    }
    if (!runtime.r2Configured) {
      issues.push({ area: "Runtime", message: "R2 storage binding is not configured, so upload storage will fall back to local-only behavior.", severity: "warn" });
    }
    if ((runtime.staffAssignments ?? 0) === 0) {
      issues.push({ area: "Staff roles", message: "No server-side staff role assignments are configured yet.", severity: "warn" });
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues
  };
}
