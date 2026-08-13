import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.(?:ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []); }

test("client components cannot import Node-only fixtures or Node runtime modules", () => {
  const forbidden = /(?:tests\/fixtures|node:crypto|node:fs|node:path|server-only fixture)/;
  for (const file of files(path.join(root, "components"))) assert.doesNotMatch(fs.readFileSync(file, "utf8"), forbidden, file);
  for (const file of files(path.join(root, "app"))) {
    const source = fs.readFileSync(file, "utf8");
    if (/^["']use client["'];/m.test(source)) assert.doesNotMatch(source, forbidden, file);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, "lib", "store.ts"), "utf8"), /tests\/fixtures/);
  const adapter = fs.readFileSync(path.join(root, "lib", "founder-walkthrough.server.ts"), "utf8");
  assert.match(adapter, /import "server-only"/);
  assert.match(adapter, /tests\/fixtures/);
});
