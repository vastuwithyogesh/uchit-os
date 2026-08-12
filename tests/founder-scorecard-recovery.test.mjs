import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("empty Founder scorecard recovers through Clients & Cases, not legacy ops", async () => {
  const source = await readFile(new URL("../components/founder-scorecard.tsx", import.meta.url), "utf8");
  const emptyState = source.slice(source.indexOf("founder-scorecard-empty"));
  assert.match(emptyState, /href="\/clients-cases"/);
  assert.match(emptyState, /Open Clients &amp; Cases/);
  assert.doesNotMatch(emptyState, /href="\/ops"/);
});
