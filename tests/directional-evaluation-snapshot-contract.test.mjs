import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/directional-evaluation-snapshot-v1.ts", import.meta.url), "utf8");

test("directional evaluation snapshots persist the bounded idempotency key", () => {
  assert.match(source, /idempotencyKey:\s*input\.idempotencyKey/);
  assert.match(source, /item\.idempotencyKey\s*===\s*input\.idempotencyKey/);
});
