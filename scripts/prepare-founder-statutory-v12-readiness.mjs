import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runFounderStatutoryV12Rehearsal } from "./rehearse-founder-statutory-v12.mjs";

const root = process.cwd();
const buildDir = join(root, "build");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const statusLines = git("status", "--porcelain").split(/\r?\n/).filter(Boolean);
const allowedGenerated = /^(\?\?|!!) (build|output|tmp)[\\/]/;
const unsafeDirty = statusLines.filter((line) => !allowedGenerated.test(line));
if (unsafeDirty.length) throw new Error(`Statutory v12 readiness packaging requires committed scoped source. Remaining changes:\n${unsafeDirty.join("\n")}`);

const hosting = JSON.parse(await readFile(join(root, ".openai", "hosting.json"), "utf8"));
if (hosting.d1 !== "DB" || hosting.r2 !== "R2") throw new Error("Hosting metadata must retain logical DB/R2 resource bindings.");

await mkdir(buildDir, { recursive: true });
const sourceCommit = git("rev-parse", "HEAD");
const shortCommit = sourceCommit.slice(0, 12);
const archiveName = `founder-statutory-v12-readiness-${shortCommit}.tar.gz`;
const archivePath = join(buildDir, archiveName);
execFileSync("git", ["archive", "--format=tar.gz", `--output=${archivePath}`, "HEAD"], { cwd: root, stdio: "inherit" });
const archiveBytes = await readFile(archivePath);
const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
const rehearsal = await runFounderStatutoryV12Rehearsal();
const manifest = {
  manifestVersion: "fe-invoice-statutory-config/v1.1-readiness",
  preparedAt: new Date().toISOString(),
  sourceCommit,
  archive: { name: archiveName, sha256: archiveSha256, bytes: archiveBytes.byteLength },
  hostingContract: {
    logicalD1Binding: hosting.d1,
    logicalR2Binding: hosting.r2,
    deployedResourceUsed: false,
    deploymentExecuted: false
  },
  declaredD1MigrationLevel: 12,
  rehearsal,
  activationState: {
    statutoryIssuanceEnabled: false,
    accountantPolicyActive: false,
    logoIngestedOrActivated: false,
    signatureIngestedOrActivated: false,
    providerConnected: false,
    clientDeliveryEnabled: false
  },
  decision: "NO_GO_PENDING_OWNER_AND_ACCOUNTANT_INPUTS"
};
const manifestName = `founder-statutory-v12-readiness-${shortCommit}.json`;
const manifestPath = join(buildDir, manifestName);
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
await writeFile(manifestPath, manifestBytes);
await writeFile(`${manifestPath}.sha256`, `${manifestSha256}  ${manifestName}\n`, "utf8");
await writeFile(`${archivePath}.sha256`, `${archiveSha256}  ${archiveName}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ ...manifest, manifest: { name: manifestName, sha256: manifestSha256 } }, null, 2)}\n`);
