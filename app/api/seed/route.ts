import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { clients, commercialProposals, leadQualifications, payments, reportVersions, timelineEvents, utilityRules, vastuCases, whatsappTemplates } from "@/lib/seed";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
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
