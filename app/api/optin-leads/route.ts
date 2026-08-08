import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { persistStateToDatabase } from "@/lib/persistence";
import { importInboundLeads } from "@/lib/workflow-service";
import { parseInboundLeadCsv } from "@/lib/lead-import";
import { readOptInLeadRecords } from "@/lib/optin-leads-store";

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) {
    return access.response;
  }
  const leads = await readOptInLeadRecords();
  return NextResponse.json({
    leads,
    counts: {
      total: leads.length,
      qualified: leads.filter((lead) => lead.status === "QUALIFIED").length,
      new: leads.filter((lead) => lead.submissionCount === 1).length,
      filtered: leads.filter((lead) => lead.status === "FILTERED").length,
      duplicates: leads.filter((lead) => lead.duplicateCount > 0 || lead.isReturningLead).length
    }
  });
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "SETTER");
  if (!access.ok) {
    return access.response;
  }
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing CSV file." }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseInboundLeadCsv(text);
  const result = importInboundLeads(rows);
  await persistStateToDatabase();

  return NextResponse.json({
    ok: true,
    imported: result.created.length + result.updated.length,
    created: result.created.length,
    updated: result.updated.length,
    duplicates: result.updated.length,
    leads: result.leads
  });
}
