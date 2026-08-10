import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { migrateLegacyPaymentProofs, type LegacyPaymentProof, type LegacyProofOwnership } from "../lib/payment-proof-migration.ts";
import type { D1DatabaseBinding, R2BucketBinding } from "../lib/runtime-env.ts";

type Adapter = { db: D1DatabaseBinding; r2: R2BucketBinding; environment: string };

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const inputPath = argument("--input");
  const ownershipPath = argument("--ownership");
  const outputPath = argument("--manifest") ?? "payment-proof-migration-manifest.json";
  const execute = process.argv.includes("--execute");
  const adapterPath = argument("--adapter");
  if (!inputPath || !ownershipPath) throw new Error("Required: --input <legacy.json> --ownership <ownership.json>");

  const records = JSON.parse(await readFile(inputPath, "utf8")) as LegacyPaymentProof[];
  const ownership = JSON.parse(await readFile(ownershipPath, "utf8")) as Record<string, LegacyProofOwnership>;
  for (const record of records) {
    if (Array.isArray(record.bytes)) record.bytes = Uint8Array.from(record.bytes);
  }

  let adapter: Adapter | undefined;
  if (execute) {
    if (!adapterPath) throw new Error("Execute mode requires --adapter <module> with explicit non-production D1/R2 bindings.");
    adapter = (await import(pathToFileURL(adapterPath).href)).default as Adapter;
    if (!adapter || adapter.environment.toLowerCase() === "production") throw new Error("This migration tool refuses production adapters.");
  }

  const manifest = await migrateLegacyPaymentProofs(adapter?.db, adapter?.r2, records, ownership, { execute });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`${manifest.mode}: ${manifest.totals.records} records; ${manifest.totals.failed} failed. Manifest: ${outputPath}`);
  if (manifest.totals.failed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
