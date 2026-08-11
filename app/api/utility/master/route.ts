import { NextResponse } from "next/server";
import { requireRouteActor } from "@/lib/auth";
import { getUtilityMasterSource, groupUtilityRulesByVerdict } from "@/lib/utility-master";
import { readResidentialUtilityRules } from "@/lib/legacy-utility-rules.server";

export async function GET(request: Request) {
  try {
    const access = await requireRouteActor(request, "CONSULTANT");
    if (!access.ok) {
      return access.response;
    }

    const rules = await readResidentialUtilityRules();
    const grouped = groupUtilityRulesByVerdict(rules);
    const utilityMaster = getUtilityMasterSource();

    return NextResponse.json({
      rules,
      utilityMaster: { sourceVersion: utilityMaster.sourceVersion, workbookHash: utilityMaster.workbookHash, rows: utilityMaster.rows },
      grouped,
      counts: {
        total: rules.length,
        utilityMasterRows: utilityMaster.rows.length,
        utilityMasterUtilities: new Set(utilityMaster.rows.map((row) => row.utilityName)).size,
        good: grouped.GOOD.length,
        bad: grouped.BAD.length,
        okOk: grouped["OK-OK"].length
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load utility master."
      },
      { status: 500 }
    );
  }
}
