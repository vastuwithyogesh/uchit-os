import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const buildDir = join(root, "build");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const statusLines = git("status", "--porcelain").split(/\r?\n/).filter(Boolean);
const allowedGenerated = /^(\?\?|!!) (build|output|tmp)[\\/]/;
const unsafeDirty = statusLines.filter((line) => !allowedGenerated.test(line));
if (unsafeDirty.length) throw new Error(`Private-staging packaging requires committed scoped source. Remaining changes:\n${unsafeDirty.join("\n")}`);

const hosting = JSON.parse(await readFile(join(root, ".openai", "hosting.json"), "utf8"));
if (hosting.d1 !== "DB" || hosting.r2 !== "R2" || !hosting.project_id) throw new Error("Hosting metadata must declare logical DB/R2 resource bindings and an explicit private Sites project.");

await mkdir(buildDir, { recursive: true });
const commit = git("rev-parse", "HEAD");
const shortCommit = commit.slice(0, 12);
const archiveName = `founder-private-staging-${shortCommit}.tar.gz`;
const archivePath = join(buildDir, archiveName);
execFileSync("git", ["archive", "--format=tar.gz", `--output=${archivePath}`, "HEAD"], { cwd: root, stdio: "inherit" });
const archiveBytes = await readFile(archivePath);
const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
const manifest = {
  manifestVersion: "founder-pre-staging/v1",
  preparedAt: new Date().toISOString(),
  sourceCommit: commit,
  archive: { name: archiveName, sha256: archiveSha256, bytes: archiveBytes.byteLength },
  hosting: { projectId: hosting.project_id, d1LogicalBinding: hosting.d1, r2LogicalBinding: hosting.r2, deploymentExecuted: false },
  declaredD1MigrationLevel: 13,
  requiredRuntime: {
    resourceBindings: ["DB (disposable D1 resource binding)", "R2 (disposable private R2 resource binding)"],
    secrets: ["PDF_OWNER_SECRET (server-only, minimum 32 characters; verify presence/length only)"],
    explicitlyDisabledOrAbsent: ["LOVABLE_INTEGRATION_ENABLED", "LOVABLE_INTEGRATION_ACTIVATION", "real Zoom provider/OAuth connection", "client delivery"]
  },
  failClosedBlockers: [
    "P5 active approved professional-boundary copy",
    "P13 active approved acceptance declaration",
    "P14 active approved cancellation/refund/delay policy",
    "accountant-approved client-location place-of-supply and service-timing policy",
    "private active Founder-approved statutory logo and signature asset versions",
    "active approved Existing Space and New Construction scope/deliverable templates",
    "five approved PDF bytes not ingested or activated",
    "real Zoom organisation connection not configured"
  ],
  assertions: {
    realPdfBytesIncluded: false,
    persistentFixturesIncluded: false,
    liveDataIncluded: false,
    clientDeliveryEnabled: false,
    lovableActivated: false,
    stageBImplemented: false
  }
};
const manifestPath = join(buildDir, "founder-private-staging-manifest.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(`${archivePath}.sha256`, `${archiveSha256}  ${archiveName}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
