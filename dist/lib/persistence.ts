import { prisma } from "@/lib/db";
import { AppState, setAppState, getAppState } from "@/lib/store";
import { LeadStage } from "@/lib/domain";
import { readOptInLeadRecords } from "@/lib/optin-leads-store";
import { writeOptInLeadRecords } from "@/lib/optin-leads-store";
import { readReviewCallBookingRecords, writeReviewCallBookingRecords } from "@/lib/review-call-bookings-store";
import { readAdvanceVerificationRecords, writeAdvanceVerificationRecords } from "@/lib/advance-verifications-store";

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function inferLeadStage(score: number): LeadStage {
  if (score >= 80) {
    return "QUALIFIED";
  }
  if (score >= 60) {
    return "QUALIFYING";
  }
  return "NEW";
}

export async function loadStateFromPersistence(): Promise<AppState> {
  if (!hasDatabase()) {
    const state = getAppState();
    state.optInLeads = await readOptInLeadRecords();
    state.reviewCallBookings = await readReviewCallBookingRecords();
    state.advanceVerifications = await readAdvanceVerificationRecords();
    return state;
  }

  const [
    clients,
    leadQualifications,
    commercialProposals,
    payments,
    vastuCases,
    floorWorkspaces,
    reportVersions,
    reportApprovals,
    evaluationSnapshots,
    mapping32D,
    mapping16D,
    utilityRules,
    shaktiSnapshots,
    timelineEvents,
    whatsappTemplates,
    whatsappLogs
  ] = await Promise.all([
    prisma.client.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.leadQualification.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.commercialProposal.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.payment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.vastuCase.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.floorWorkspace.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reportVersion.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.reportApproval.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.evaluationSnapshot.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mapping32D.findMany({ orderBy: { code: "asc" } }),
    prisma.mapping16D.findMany({ orderBy: { code: "asc" } }),
    prisma.utilityRule.findMany({ orderBy: [{ tabName: "asc" }, { zoneCode: "asc" }] }),
    prisma.shaktiSnapshot.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.clientTimelineEvent.findMany({ orderBy: { happenedAt: "desc" } }),
    prisma.whatsAppTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.whatsAppTemplateLog.findMany({ orderBy: { sentAt: "desc" } })
  ]);

  const state: AppState = {
    clients: clients.map((client) => ({
      id: client.id,
      displayName: client.displayName,
      email: client.email ?? "",
      phone: client.phone ?? "",
      city: client.city ?? "",
      source: client.source ?? "",
      assignedSetterId: client.assignedSetterId ?? "",
      stage: leadQualifications.find((lead) => lead.clientId === client.id)?.stage ?? "NEW"
    })),
    leadQualifications: leadQualifications.map((lead) => ({
      id: lead.id,
      clientId: lead.clientId,
      score: lead.score,
      notes: lead.notes,
      qualificationCallDueAt: lead.qualificationCallDueAt?.toISOString() ?? new Date().toISOString(),
      qualificationCallCompletedAt: lead.qualificationCallCompletedAt?.toISOString(),
      deliverableTriggeredAt: lead.deliverableTriggeredAt?.toISOString(),
      conversationalForm: Array.isArray(lead.conversationalForm) ? (lead.conversationalForm as Array<{ label: string; answer: string }>) : []
    })),
    commercialProposals: commercialProposals.map((proposal) => ({
      id: proposal.id,
      clientId: proposal.clientId,
      amountInr: proposal.amountInr,
      minAdvanceInr: proposal.minAdvanceInr,
      status: proposal.status,
      reviewerId: proposal.reviewerId ?? undefined,
      superAdminApprovedAt: proposal.superAdminApprovedAt?.toISOString()
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      clientId: payment.clientId,
      proposalId: payment.proposalId ?? undefined,
      caseId: payment.caseId ?? undefined,
      type: payment.type,
      amountInr: payment.amountInr,
      status: payment.status,
      approvedAt: payment.approvedAt?.toISOString()
    })),
    vastuCases: vastuCases.map((item) => ({
      id: item.id,
      caseNumber: item.caseNumber,
      clientId: item.clientId,
      proposalId: item.proposalId ?? "",
      status: item.status,
      reportStatus: item.reportStatus,
      orientationLocked: item.orientationLocked,
      balanceApproved: item.balanceApproved,
      fullPaymentApproved: item.fullPaymentApproved
    })),
    floorWorkspaces: floorWorkspaces.map((workspace) => ({
      id: workspace.id,
      caseId: workspace.caseId,
      floorLabel: workspace.floorLabel,
      status: workspace.status,
      locked: workspace.locked,
      regenerationReason: workspace.regenerationReason ?? undefined,
      evidenceUploads: Array.isArray(workspace.evidenceUploads) ? (workspace.evidenceUploads as string[]) : []
    })),
    reportVersions: reportVersions.map((report) => ({
      id: report.id,
      caseId: report.caseId,
      versionLabel: report.versionLabel,
      isPreview: report.isPreview,
      status: report.status,
      watermarkText: report.watermarkText ?? undefined,
      approvals: reportApprovals.filter((approval) => approval.reportVersionId === report.id).map((approval) => approval.approverId)
    })),
    evaluationSnapshots: evaluationSnapshots.map((snapshot) => ({
      id: snapshot.id,
      caseId: snapshot.caseId,
      snapshotName: snapshot.snapshotName,
      sourceVersion: snapshot.sourceVersion,
      generatedMatrix: Array.isArray(snapshot.generatedMatrix) ? (snapshot.generatedMatrix as Array<{ code: string; verdict: string; confidence: number }>) : []
    })),
    mapping32D: mapping32D.map((item) => ({
      code: item.code,
      label: item.label,
      element: item.element as "Air" | "Fire" | "Water" | "Earth" | "Space",
      direction: item.direction,
      weight: item.weight
    })),
    mapping16D: mapping16D.map((item) => ({
      code: item.code,
      label: item.label,
      pairCode: item.pairCode,
      weight: item.weight
    })),
    utilityRules: utilityRules.map((rule) => ({
      id: rule.id,
      tabName: rule.tabName,
      zoneCode: rule.zoneCode,
      description: rule.description,
      verdict: rule.verdict as "GOOD" | "BAD" | "OK-OK",
      confidence: rule.confidence,
      sourceCsvRow: rule.sourceCsvRow
    })),
    shaktiSnapshots: shaktiSnapshots.map((snapshot) => ({
      id: snapshot.id,
      caseId: snapshot.caseId,
      inputValues: Array.isArray(snapshot.inputValues) ? (snapshot.inputValues as number[]) : [],
      elementAverages: (snapshot.elementAverages as Record<string, number>) ?? {},
      rankedVerdicts: (snapshot.rankedVerdicts as Array<{ element: string; score: number }>) ?? [],
      tieBreakUsed: snapshot.tieBreakUsed
    })),
    timelineEvents: timelineEvents.map((event) => ({
      id: event.id,
      clientId: event.clientId,
      category: event.category,
      headline: event.headline,
      details: event.details,
      happenedAt: event.happenedAt.toISOString(),
      actorRole: event.actorRole ?? undefined
    })),
    whatsappTemplates: whatsappTemplates.map((template) => ({
      id: template.id,
      slug: template.slug,
      title: template.title,
      category: template.category,
      body: template.body,
      variables: Array.isArray(template.variables) ? (template.variables as string[]) : [],
      active: template.active
    })),
    whatsappLogs: whatsappLogs.map((log) => ({
      id: log.id,
      clientId: log.clientId,
      templateId: log.templateId,
      recipientPhone: log.recipientPhone,
      status: log.status,
      sentAt: log.sentAt.toISOString()
    })),
    optInLeads: await readOptInLeadRecords(),
    reviewCallBookings: await readReviewCallBookingRecords(),
    advanceVerifications: await readAdvanceVerificationRecords()
  };

  return setAppState(state);
}

export async function persistStateToDatabase(state: AppState = getAppState()) {
  await Promise.all([
    writeOptInLeadRecords(state.optInLeads),
    writeReviewCallBookingRecords(state.reviewCallBookings),
    writeAdvanceVerificationRecords(state.advanceVerifications)
  ]);

  if (!hasDatabase()) {
    return state;
  }

  await prisma.$transaction([
    ...state.clients.map((client) =>
      prisma.client.upsert({
        where: { id: client.id },
        update: {
          displayName: client.displayName,
          email: client.email || null,
          phone: client.phone || null,
          city: client.city || null,
          source: client.source || null,
          assignedSetterId: client.assignedSetterId || null
        },
        create: {
          id: client.id,
          displayName: client.displayName,
          email: client.email || null,
          phone: client.phone || null,
          city: client.city || null,
          source: client.source || null,
          assignedSetterId: client.assignedSetterId || null
        }
      })
    ),
    ...state.leadQualifications.map((lead) =>
      prisma.leadQualification.upsert({
        where: { id: lead.id },
        update: {
          clientId: lead.clientId,
          stage: inferLeadStage(lead.score),
          score: lead.score,
          notes: lead.notes,
          conversationalForm: lead.conversationalForm,
          qualificationCallDueAt: new Date(lead.qualificationCallDueAt),
          qualificationCallCompletedAt: lead.qualificationCallCompletedAt ? new Date(lead.qualificationCallCompletedAt) : null,
          deliverableTriggeredAt: lead.deliverableTriggeredAt ? new Date(lead.deliverableTriggeredAt) : null
        },
        create: {
          id: lead.id,
          clientId: lead.clientId,
          stage: inferLeadStage(lead.score),
          score: lead.score,
          notes: lead.notes,
          conversationalForm: lead.conversationalForm,
          qualificationCallDueAt: new Date(lead.qualificationCallDueAt),
          qualificationCallCompletedAt: lead.qualificationCallCompletedAt ? new Date(lead.qualificationCallCompletedAt) : null,
          deliverableTriggeredAt: lead.deliverableTriggeredAt ? new Date(lead.deliverableTriggeredAt) : null
        }
      })
    ),
    ...state.commercialProposals.map((proposal) =>
      prisma.commercialProposal.upsert({
        where: { id: proposal.id },
        update: {
          clientId: proposal.clientId,
          amountInr: proposal.amountInr,
          minAdvanceInr: proposal.minAdvanceInr,
          status: proposal.status,
          reviewerId: proposal.reviewerId ?? null,
          superAdminApprovedAt: proposal.superAdminApprovedAt ? new Date(proposal.superAdminApprovedAt) : null
        },
        create: {
          id: proposal.id,
          clientId: proposal.clientId,
          amountInr: proposal.amountInr,
          minAdvanceInr: proposal.minAdvanceInr,
          status: proposal.status,
          reviewerId: proposal.reviewerId ?? null,
          superAdminApprovedAt: proposal.superAdminApprovedAt ? new Date(proposal.superAdminApprovedAt) : null
        }
      })
    ),
    ...state.payments.map((payment) =>
      prisma.payment.upsert({
        where: { id: payment.id },
        update: {
          clientId: payment.clientId,
          proposalId: payment.proposalId ?? null,
          caseId: payment.caseId ?? null,
          type: payment.type,
          amountInr: payment.amountInr,
          status: payment.status,
          approvedAt: payment.approvedAt ? new Date(payment.approvedAt) : null
        },
        create: {
          id: payment.id,
          clientId: payment.clientId,
          proposalId: payment.proposalId ?? null,
          caseId: payment.caseId ?? null,
          type: payment.type,
          amountInr: payment.amountInr,
          status: payment.status,
          approvedAt: payment.approvedAt ? new Date(payment.approvedAt) : null
        }
      })
    ),
    ...state.vastuCases.map((item) =>
      prisma.vastuCase.upsert({
        where: { id: item.id },
        update: {
          caseNumber: item.caseNumber,
          clientId: item.clientId,
          proposalId: item.proposalId || null,
          status: item.status,
          reportStatus: item.reportStatus,
          orientationLocked: item.orientationLocked,
          balanceApproved: item.balanceApproved,
          fullPaymentApproved: item.fullPaymentApproved
        },
        create: {
          id: item.id,
          caseNumber: item.caseNumber,
          clientId: item.clientId,
          proposalId: item.proposalId || null,
          status: item.status,
          reportStatus: item.reportStatus,
          orientationLocked: item.orientationLocked,
          balanceApproved: item.balanceApproved,
          fullPaymentApproved: item.fullPaymentApproved
        }
      })
    ),
    ...state.floorWorkspaces.map((workspace) =>
      prisma.floorWorkspace.upsert({
        where: { id: workspace.id },
        update: {
          caseId: workspace.caseId,
          floorLabel: workspace.floorLabel,
          status: workspace.status,
          locked: workspace.locked,
          regenerationReason: workspace.regenerationReason ?? null,
          evidenceUploads: workspace.evidenceUploads
        },
        create: {
          id: workspace.id,
          caseId: workspace.caseId,
          floorLabel: workspace.floorLabel,
          status: workspace.status,
          locked: workspace.locked,
          regenerationReason: workspace.regenerationReason ?? null,
          evidenceUploads: workspace.evidenceUploads
        }
      })
    ),
    ...state.reportVersions.map((report) =>
      prisma.reportVersion.upsert({
        where: { id: report.id },
        update: {
          caseId: report.caseId,
          versionLabel: report.versionLabel,
          isPreview: report.isPreview,
          status: report.status,
          watermarkText: report.watermarkText ?? null,
          approvedAt: report.approvals.length > 0 ? new Date() : null
        },
        create: {
          id: report.id,
          caseId: report.caseId,
          versionLabel: report.versionLabel,
          isPreview: report.isPreview,
          status: report.status,
          watermarkText: report.watermarkText ?? null,
          approvedAt: report.approvals.length > 0 ? new Date() : null
        }
      })
    ),
    ...state.reportVersions.flatMap((report) =>
      report.approvals.map((approverId) =>
        prisma.reportApproval.upsert({
          where: {
            id: `${report.id}:${approverId}`
          },
          update: {
            reportVersionId: report.id,
            approverId
          },
          create: {
            id: `${report.id}:${approverId}`,
            reportVersionId: report.id,
            approverId
          }
        })
      )
    ),
    ...state.evaluationSnapshots.map((snapshot) =>
      prisma.evaluationSnapshot.upsert({
        where: { id: snapshot.id },
        update: {
          caseId: snapshot.caseId,
          snapshotName: snapshot.snapshotName,
          sourceVersion: snapshot.sourceVersion,
          generatedMatrix: snapshot.generatedMatrix
        },
        create: {
          id: snapshot.id,
          caseId: snapshot.caseId,
          snapshotName: snapshot.snapshotName,
          sourceVersion: snapshot.sourceVersion,
          generatedMatrix: snapshot.generatedMatrix
        }
      })
    ),
    ...state.mapping32D.map((item) =>
      prisma.mapping32D.upsert({
        where: { code: item.code },
        update: item,
        create: item
      })
    ),
    ...state.mapping16D.map((item) =>
      prisma.mapping16D.upsert({
        where: { code: item.code },
        update: item,
        create: item
      })
    ),
    ...state.utilityRules.map((rule) =>
      prisma.utilityRule.upsert({
        where: { tabName_zoneCode: { tabName: rule.tabName, zoneCode: rule.zoneCode } },
        update: {
          description: rule.description,
          verdict: rule.verdict,
          confidence: rule.confidence,
          sourceCsvRow: rule.sourceCsvRow
        },
        create: {
          id: rule.id,
          tabName: rule.tabName,
          zoneCode: rule.zoneCode,
          description: rule.description,
          verdict: rule.verdict,
          confidence: rule.confidence,
          sourceCsvRow: rule.sourceCsvRow
        }
      })
    ),
    ...state.shaktiSnapshots.map((snapshot) =>
      prisma.shaktiSnapshot.upsert({
        where: { id: snapshot.id },
        update: {
          caseId: snapshot.caseId,
          inputValues: snapshot.inputValues,
          elementAverages: snapshot.elementAverages,
          rankedVerdicts: snapshot.rankedVerdicts,
          tieBreakUsed: snapshot.tieBreakUsed
        },
        create: {
          id: snapshot.id,
          caseId: snapshot.caseId,
          inputValues: snapshot.inputValues,
          elementAverages: snapshot.elementAverages,
          rankedVerdicts: snapshot.rankedVerdicts,
          tieBreakUsed: snapshot.tieBreakUsed
        }
      })
    ),
    ...state.timelineEvents.map((event) =>
      prisma.clientTimelineEvent.upsert({
        where: { id: event.id },
        update: {
          clientId: event.clientId,
          category: event.category,
          headline: event.headline,
          details: event.details,
          happenedAt: new Date(event.happenedAt),
          actorRole: event.actorRole ?? null
        },
        create: {
          id: event.id,
          clientId: event.clientId,
          category: event.category,
          headline: event.headline,
          details: event.details,
          happenedAt: new Date(event.happenedAt),
          actorRole: event.actorRole ?? null
        }
      })
    ),
    ...state.whatsappTemplates.map((template) =>
      prisma.whatsAppTemplate.upsert({
        where: { id: template.id },
        update: {
          slug: template.slug,
          title: template.title,
          category: template.category,
          body: template.body,
          variables: template.variables,
          active: template.active
        },
        create: {
          id: template.id,
          slug: template.slug,
          title: template.title,
          category: template.category,
          body: template.body,
          variables: template.variables,
          active: template.active
        }
      })
    ),
    ...state.whatsappLogs.map((log) =>
      prisma.whatsAppTemplateLog.upsert({
        where: { id: log.id },
        update: {
          clientId: log.clientId,
          templateId: log.templateId,
          recipientPhone: log.recipientPhone,
          status: log.status,
          sentAt: new Date(log.sentAt)
        },
        create: {
          id: log.id,
          clientId: log.clientId,
          templateId: log.templateId,
          recipientPhone: log.recipientPhone,
          status: log.status,
          sentAt: new Date(log.sentAt)
        }
      })
    )
  ]);

  return state;
}
