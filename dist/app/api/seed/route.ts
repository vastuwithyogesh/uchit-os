import { NextResponse } from "next/server";
import { clients, commercialProposals, leadQualifications, payments, reportVersions, timelineEvents, utilityRules, vastuCases, whatsappTemplates } from "@/lib/seed";

export async function GET() {
  return NextResponse.json({
    clients,
    commercialProposals,
    leadQualifications,
    payments,
    reportVersions,
    timelineEvents,
    utilityRules,
    vastuCases,
    whatsappTemplates
  });
}
