import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const currentDir = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(currentDir, "../data/residential-tab.csv");

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",");

  return rows.map((row) => {
    const columns = row.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, columns[index]]));
  });
}

async function main() {
  const csv = await readFile(csvPath, "utf8");
  const rules = parseCsv(csv);

  if (process.env.DATABASE_URL) {
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index];
      await prisma.utilityRule.upsert({
        where: {
          tabName_zoneCode: {
            tabName: rule.tabName,
            zoneCode: rule.zoneCode
          }
        },
        update: {
          description: rule.description,
          verdict: rule.verdict,
          confidence: Number(rule.confidence),
          sourceCsvRow: index + 1
        },
        create: {
          tabName: rule.tabName,
          zoneCode: rule.zoneCode,
          description: rule.description,
          verdict: rule.verdict,
          confidence: Number(rule.confidence),
          sourceCsvRow: index + 1
        }
      });
    }
  }

  console.log(`Seeded ${rules.length} residential utility rules.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
