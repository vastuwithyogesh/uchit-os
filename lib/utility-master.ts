import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UtilityRule } from "@/lib/domain";
import { utilityRules as seedUtilityRules } from "@/lib/seed";

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values;
}

export function parseUtilityRulesCsv(csvText: string): UtilityRule[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [, ...rows] = lines;
  return rows.map((row, index) => {
    const [tabName = "Residential", zoneCode = `Z${String(index + 1).padStart(2, "0")}`, description = "", verdict = "OK-OK", confidence = "70"] = parseCsvLine(row);

    return {
      id: `rule_csv_${String(index + 1).padStart(3, "0")}`,
      tabName,
      zoneCode,
      description,
      verdict: verdict as UtilityRule["verdict"],
      confidence: Number(confidence),
      sourceCsvRow: index + 2
    };
  });
}

export async function readResidentialUtilityRules() {
  const candidatePaths = [
    join(process.cwd(), "data", "residential-tab.csv"),
    join(process.cwd(), "outputs", "uchit-vastu", "data", "residential-tab.csv")
  ];

  for (const filePath of candidatePaths) {
    try {
      const csvText = await readFile(filePath, "utf8");
      const parsedRules = parseUtilityRulesCsv(csvText);
      if (parsedRules.length > 0) {
        return parsedRules;
      }
    } catch {
      // Try the next location before falling back to the seeded master table.
    }
  }

  return structuredClone(seedUtilityRules);
}

export function groupUtilityRulesByVerdict(rules: UtilityRule[]) {
  return rules.reduce<Record<UtilityRule["verdict"], UtilityRule[]>>(
    (groups, rule) => {
      if (rule.verdict === "GOOD" || rule.verdict === "BAD" || rule.verdict === "OK-OK") {
        groups[rule.verdict].push(rule);
      } else {
        groups["OK-OK"].push(rule);
      }
      return groups;
    },
    { GOOD: [], BAD: [], "OK-OK": [] }
  );
}
