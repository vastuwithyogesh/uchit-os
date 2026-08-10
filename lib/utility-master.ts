import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { UtilityRule } from "./domain.ts";
import { utilityRules as seedUtilityRules } from "./seed.ts";
import { deterministicContentHash } from "./evaluation-provenance.ts";

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
  if (inQuotes) {
    throw new Error("Utility CSV contains an unterminated quoted field.");
  }
  return values;
}

const REQUIRED_HEADERS = ["tabName", "zoneCode", "description", "verdict", "confidence"];
const VALID_VERDICTS = new Set<UtilityRule["verdict"]>(["GOOD", "BAD", "OK-OK"]);

export function parseUtilityRulesCsv(csvText: string): UtilityRule[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Utility CSV must contain a header and at least one rule row.");
  }
  const [header, ...rows] = lines;
  const headers = parseCsvLine(header);
  if (headers.length !== REQUIRED_HEADERS.length || headers.some((value, index) => value !== REQUIRED_HEADERS[index])) {
    throw new Error(`Utility CSV header must be exactly: ${REQUIRED_HEADERS.join(",")}.`);
  }

  const seenZones = new Set<string>();
  return rows.map((row, index) => {
    const columns = parseCsvLine(row);
    const sourceCsvRow = index + 2;
    if (columns.length !== REQUIRED_HEADERS.length) {
      throw new Error(`Utility CSV row ${sourceCsvRow} must contain exactly ${REQUIRED_HEADERS.length} columns.`);
    }
    const [tabName, zoneCode, description, verdict, confidenceText] = columns;
    if (!tabName || !zoneCode || !description) {
      throw new Error(`Utility CSV row ${sourceCsvRow} has a blank required field.`);
    }
    if (!VALID_VERDICTS.has(verdict as UtilityRule["verdict"])) {
      throw new Error(`Utility CSV row ${sourceCsvRow} has invalid verdict "${verdict}".`);
    }
    const confidence = Number(confidenceText);
    if (confidenceText === "" || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      throw new Error(`Utility CSV row ${sourceCsvRow} confidence must be a finite number from 0 to 100.`);
    }
    const zoneIdentity = `${tabName}\u0000${zoneCode}`;
    if (seenZones.has(zoneIdentity)) {
      throw new Error(`Utility CSV row ${sourceCsvRow} duplicates zone "${zoneCode}" in tab "${tabName}".`);
    }
    seenZones.add(zoneIdentity);
    const rowHash = deterministicContentHash({ confidence, description, tabName, verdict, zoneCode }).slice(7, 23);

    return {
      id: `rule_csv_${rowHash}`,
      tabName,
      zoneCode,
      description,
      verdict: verdict as UtilityRule["verdict"],
      confidence,
      sourceCsvRow
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // Try the next location only when this candidate does not exist.
    }
  }

  return structuredClone(seedUtilityRules);
}

export function groupUtilityRulesByVerdict(rules: UtilityRule[]) {
  return rules.reduce<Record<UtilityRule["verdict"], UtilityRule[]>>(
    (groups, rule) => {
      groups[rule.verdict].push(rule);
      return groups;
    },
    { GOOD: [], BAD: [], "OK-OK": [] }
  );
}
