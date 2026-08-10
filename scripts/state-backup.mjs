import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { createStateBackup, validateStateBackup } from "../lib/state-backup.ts";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const mode = args.get("--mode") ?? "validate";
const input = args.get("--input");
const environment = args.get("--environment") ?? "local";
if (!input) throw new Error("--input is required. This tool never connects to D1 or R2.");
if (!new Set(["local", "staging", "production"]).has(environment)) throw new Error("Choose local, staging, or production.");
if (environment === "production" && args.get("--acknowledge-production-read-only") !== "true") throw new Error("Production export or validation requires --acknowledge-production-read-only true. This tool remains read-only and never connects to live services.");
const parsed = JSON.parse(await readFile(input, "utf8"));

if (mode === "export") {
  const output = args.get("--output");
  if (!output) throw new Error("--output is required for export.");
  const state = parsed?.state && typeof parsed.state === "object" && !Array.isArray(parsed.state) ? parsed.state : parsed;
  const envelopeRevision = Number.isSafeInteger(parsed?.revision) ? parsed.revision : undefined;
  const requestedRevision = args.has("--revision") ? Number(args.get("--revision")) : envelopeRevision;
  if (envelopeRevision !== undefined && requestedRevision !== envelopeRevision) throw new Error("Requested revision does not match the authenticated export envelope.");
  const backup = await createStateBackup(state, requestedRevision, environment);
  await writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Created dry-run backup ${output}; sha256=${backup.stateSha256}. R2 bytes are excluded.`);
} else if (mode === "validate" || mode === "import-dry-run") {
  const backup = await validateStateBackup(parsed);
  console.log(`Validated ${backup.format}; revision=${backup.stateRevision}; sha256=${backup.stateSha256}. No data was written.`);
} else throw new Error("--mode must be export, validate, or import-dry-run.");
