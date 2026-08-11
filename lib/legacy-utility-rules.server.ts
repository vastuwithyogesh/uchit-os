import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { utilityRules as seedUtilityRules } from "./seed.ts";
import { parseUtilityRulesCsv } from "./utility-master.ts";

/** Legacy staff-only CSV fallback. Canonical UtilityMaster execution does not use this file. */
export async function readResidentialUtilityRules() {
  const candidatePaths = [
    join(process.cwd(), "data", "residential-tab.csv"),
    join(process.cwd(), "outputs", "uchit-vastu", "data", "residential-tab.csv")
  ];
  for (const filePath of candidatePaths) {
    try {
      const parsedRules = parseUtilityRulesCsv(await readFile(filePath, "utf8"));
      if (parsedRules.length > 0) return parsedRules;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return structuredClone(seedUtilityRules);
}
