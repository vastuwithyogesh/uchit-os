import test from "node:test";
import assert from "node:assert/strict";
import { buildGmailComposeUrl, buildMailtoComposeUrl, normaliseManualEmail } from "../lib/founder-manual-compose.ts";

test("manual email compose accepts only one safe recipient and encodes exact subject/body", () => {
  const subject = "Your introduction to the Uchit Vastu process";
  const body = "Hello Priya,\n\nA secure link: https://example.test/token?x=1&y=2";
  const gmail = buildGmailComposeUrl({ email: "priya@example.test", subject, body });
  const mailto = buildMailtoComposeUrl({ email: "priya@example.test", subject, body });
  assert.ok(gmail?.startsWith("https://mail.google.com/mail/?"));
  const gmailParams = new URL(gmail!).searchParams;
  assert.equal(gmailParams.get("to"), "priya@example.test");
  assert.equal(gmailParams.get("su"), subject);
  assert.equal(gmailParams.get("body"), body);
  assert.match(mailto!, /^mailto:priya%40example\.test\?subject=/);
  assert.match(mailto!, /%26y%3D2/);
});

test("manual email compose rejects missing or header-injection recipients", () => {
  for (const value of [undefined, "", "not-an-email", "priya@example.test?bcc=other@example.test", "priya@example.test\nBcc:other@example.test"]) {
    assert.equal(normaliseManualEmail(value), "");
    assert.equal(buildGmailComposeUrl({ email: value, subject: "s", body: "b" }), null);
    assert.equal(buildMailtoComposeUrl({ email: value, subject: "s", body: "b" }), null);
  }
});
