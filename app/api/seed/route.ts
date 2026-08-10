import { NextResponse } from "next/server";
import { isExplicitLocalDemo, requireRouteActor } from "@/lib/auth";
import { clients, commercialProposals, leadQualifications, payments, reportVersions, timelineEvents, utilityRules, vastuCases, whatsappTemplates } from "@/lib/seed";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) {
    return access.response;
  }
  if (!isExplicitLocalDemo(request.headers)) {
    return NextResponse.json(
      { ok: false, error: "Demo fixtures are unavailable outside an explicit local demo." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
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
  }, { headers: { "Cache-Control": "private, no-store" } });
}
