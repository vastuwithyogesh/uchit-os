import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const projectDir = process.cwd();
const distDir = join(projectDir, "dist");
const serverWrapperPath = join(distDir, "server", "index.js");
const prismaSourceDir = join(projectDir, "node_modules", ".prisma");
const prismaClientSourceDir = join(projectDir, "node_modules", "@prisma", "client");

// Keep this list explicit: deployment preparation must never copy developer
// credentials, local state, archives, or other unreviewed workspace files.
const packageEntries = [
  ".openai/hosting.json",
  "app",
  "build",
  "components",
  "db",
  "lib",
  "next-env.d.ts",
  "next.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "prisma",
  "public",
  "scripts",
  "supabase/config.toml",
  "tsconfig.json",
  "vercel.json",
  "vite.config.ts",
  "worker"
];

const packageDataEntries = ["data/residential-tab.csv"];

async function copyIfExists(source, destination, options = {}) {
  try {
    await cp(source, destination, { recursive: true, ...options });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const child = spawn(isWindows ? "cmd.exe" : command, isWindows ? ["/c", command, ...args] : args, {
      cwd,
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        CI: "1"
      }
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const entry of [...packageEntries, ...packageDataEntries]) {
    await copyIfExists(join(projectDir, entry), join(distDir, entry));
  }

  await run("pnpm.cmd", ["install", "--prod", "--ignore-scripts", "--frozen-lockfile", "--node-linker=hoisted"], distDir);
  await copyIfExists(prismaSourceDir, join(distDir, "node_modules", ".prisma"), { dereference: true });
  await copyIfExists(prismaClientSourceDir, join(distDir, "node_modules", "@prisma", "client"), { dereference: true });

  await mkdir(join(distDir, "server"), { recursive: true });
  await writeFile(
    serverWrapperPath,
    [
      'import next from "next";',
      'import { createServer } from "node:http";',
      '',
      'const port = Number(process.env.PORT ?? 3000);',
      'const hostname = "0.0.0.0";',
      'const app = next({ dev: false, hostname, port, dir: process.cwd() });',
      'const handle = app.getRequestHandler();',
      '',
      'await app.prepare();',
      '',
      'createServer((req, res) => {',
      '  void handle(req, res);',
      '}).listen(port, hostname);'
    ].join("\n"),
    "utf8"
  );
}

await main();
