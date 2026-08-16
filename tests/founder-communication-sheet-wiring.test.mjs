import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CRM wires the authoritative context action and does not gate it on its own output", async () => {
  const [workspace, sheet] = await Promise.all([
    read("components/unified-leads-workspace.tsx"),
    read("components/lead-communication-sheet.tsx")
  ]);

  assert.match(workspace, /onPrepareContext=\{prepareCommunicationContext\}/);
  assert.match(workspace, /action: "founder-communication-context"/);
  assert.match(workspace, /clientId: selected\.clientId/);
  assert.match(workspace, /qualificationKind/);
  assert.match(sheet, /const resolvedContext = context \?\? await props\.onPrepareContext/);
  assert.match(sheet, /!qualificationKind \|\| \(!context && !props\.onPrepareContext\)/);
  assert.doesNotMatch(sheet, /!props\.secureOnlineFormLink \|\| !props\.securePdfLink \|\| !props\.qualificationTitle/);
});
