import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

test("payment tools require explicit Case selection before continuing", () => {
  const route = read("app/payment-proofs/page.tsx");
  assert.match(route, /title="Payment evidence"/);
  assert.match(route, /href: "\/founder\/continue"/);
  assert.match(route, /Select a case and continue/);
  assert.match(route, /<summary>Open advanced receipt uploader<\/summary>/);
  assert.match(route, /<PaymentProofConsole \/>/);
  assert.match(route, /₹11,000 suggested standard advance/);
  assert.match(route, /Confirmed advance or approved complimentary exception opens case/);
  assert.doesNotMatch(route, /₹11,000 minimum advance/);
});
