import { NextResponse } from "next/server";
import { groupUtilityRulesByVerdict, readResidentialUtilityRules } from "@/lib/utility-master";

export async function GET() {
  const rules = await readResidentialUtilityRules();
  const grouped = groupUtilityRulesByVerdict(rules);

  return NextResponse.json({
    rules,
    grouped,
    counts: {
      total: rules.length,
      good: grouped.GOOD.length,
      bad: grouped.BAD.length,
      okOk: grouped["OK-OK"].length
    }
  });
}
