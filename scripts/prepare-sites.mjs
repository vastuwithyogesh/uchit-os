import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const projectDir = process.cwd();
const distDir = join(projectDir, "dist");
const serverWrapperPath = join(distDir, "server", "index.js");

const topLevelExcludes = new Set(["dist", "node_modules", ".git", ".next", "site-archive.tar.gz"]);

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

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const entries = await readdir(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (topLevelExcludes.has(entry.name)) {
      continue;
    }

    await cp(join(projectDir, entry.name), join(distDir, entry.name), { recursive: true });
  }

  await copyIfExists(join(projectDir, "node_modules"), join(distDir, "node_modules"), { dereference: true });

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
