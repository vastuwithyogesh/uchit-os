import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (file) => fs.readFileSync(file, "utf8");

test("Review requires the existing prospective-project scope and does not create a Case", () => {
  const workspace = source("components/unified-leads-workspace.tsx");
  const sheet = source("components/founder-project-scope-sheet.tsx");
  const route = source("app/api/actions/route.ts");
  const workflow = source("lib/workflow-service.ts");
  assert.match(sheet, /founder-project-scope-save/);
  assert.match(sheet, /Capture project scope/);
  assert.match(sheet, /Qualification Questionnaire Snapshot \(optional\)/);
  assert.match(route, /founder-project-scope-save/);
  assert.match(workflow, /Project scope is required before moving this lead into Review/);
  assert.match(source("lib/founder-commercial.ts"), /existingPreCase/);
  assert.doesNotMatch(workspace, /founder-case-intent-create.*projectScope/);
});

test("Converted proposal entry has no generic profile fallback", () => {
  const workspace = source("components/unified-leads-workspace.tsx");
  assert.match(workspace, /if \(project\) openProposalDraft\(project\); else setMessage/);
});

test("pre-case scope is REVIEW_PENDING and qualification remains optional at capture time", () => {
  const commercial = source("lib/founder-commercial.ts");
  assert.match(commercial, /preCaseReview/);
  assert.match(commercial, /status: input\.preCaseReview \? "REVIEW_PENDING"/);
  assert.match(commercial, /input\.preCaseReview \? \{\} : \{ responseVersionId/);
});

test("scope save revalidates current client and persistence revisions before Review transition", () => {
  const workspace = source("components/unified-leads-workspace.tsx");
  assert.match(workspace, /async function transitionAfterScope\(\)/);
  assert.match(workspace, /const latest = await fetchJson<Bootstrap>\("\/api\/bootstrap"\)/);
  assert.match(workspace, /expectedRecordVersion: latestClient\.recordVersion/);
  assert.match(workspace, /expectedRevision: latest\.persistenceRevision/);
  assert.match(workspace, /onSaved=\{\(\) => void transitionAfterScope\(\)\}/);
  assert.doesNotMatch(workspace, /expectedRevision: state\?\.persistenceRevision \?\? null \}\) \}\);\n      const payload/);
});
