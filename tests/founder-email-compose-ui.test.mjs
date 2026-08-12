import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("email compose uses Gmail first, preserves default-mail fallback and records OPENED only after a window opens", async () => {
  const sheet = await read("components/lead-communication-sheet.tsx");
  assert.match(sheet, /buildGmailComposeUrl/);
  assert.match(sheet, /buildMailtoComposeUrl/);
  assert.match(sheet, /Open Gmail draft/);
  assert.match(sheet, /Use default email app/);
  assert.match(sheet, /if \(!opened\) throw new Error\("The compose window was blocked/);
  assert.match(sheet, /await props\.onOpened\(record\)/);
  assert.doesNotMatch(sheet, /fetch\(|axios|sendEmail|provider.*send/i);
  assert.match(sheet, /OPENED only means the compose window was opened/);
});

test("preparing both channels serializes revisioned mutations so email does not lose the global CAS race", async () => {
  const sheet = await read("components/lead-communication-sheet.tsx");
  assert.match(sheet, /Each preparation is a protected, revisioned server mutation/);
  assert.doesNotMatch(sheet, /Promise\.allSettled/);
  const whatsapp = sheet.indexOf('await props.onPrepare("WHATSAPP"');
  const email = sheet.indexOf('await props.onPrepare("EMAIL"');
  assert.ok(whatsapp >= 0 && email > whatsapp, "WhatsApp preparation must finish before the refreshed email preparation begins");
  assert.match(sheet, /Email is not ready: \$\{emailFailure\} Reload and retry email preparation/);
});

test("client compose helper contains no logging or raw token persistence", async () => {
  const helper = await read("lib/founder-manual-compose.ts");
  assert.doesNotMatch(helper, /console\.|localStorage|sessionStorage|fetch\(/);
  assert.match(helper, /URLSearchParams/);
  assert.match(helper, /header-injection|recipient/i);
});
