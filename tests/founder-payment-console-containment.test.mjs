import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("legacy payment tools keep the Founder balance step as the primary recovery", () => {
  const route = read("app/payment-proofs/page.tsx");
  assert.match(route, /Legacy Payment Receipt Tools/);
  assert.match(route, /href: "\/founder\/12"/);
  assert.match(route, /Continue Founder balance step/);
  assert.match(route, /<summary>Open legacy receipt uploader<\/summary>/);
  assert.match(route, /<PaymentProofConsole \/>/);
});
