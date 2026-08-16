import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Founder lead transition keeps datetime-local input and controlled state synchronized", () => {
  const ui = source("components/unified-leads-workspace.tsx");
  assert.match(ui, /type="datetime-local" value=\{dueAt\} onInput=\{\(event\) => setDueAt\(event\.currentTarget\.value\)\} onChange=\{\(event\) => setDueAt\(event\.currentTarget\.value\)\}/);
  assert.match(ui, /!terminal && \(!nextAction\.trim\(\) \|\| !dueAt \|\| new Date\(dueAt\)\.getTime\(\) <= Date\.now\(\)\)/);
  assert.match(ui, /nextActionDueAt: terminal \? undefined : new Date\(dueAt\)\.toISOString\(\)/);
});

test("qualification DATE answers retain the same input value through input and change events", () => {
  const ui = source("components/qualification-form-client.tsx");
  assert.match(ui, /type=\{question\.kind==="DATE"\?"date":"text"\} value=\{String\(answers\[question\.id\]\?\?""\)\} onInput=\{\(event\)=>setAnswers\(\{\.\.\.answers,\[question\.id\]:event\.currentTarget\.value\}\)\} onChange=\{\(event\)=>setAnswers\(\{\.\.\.answers,\[question\.id\]:event\.currentTarget\.value\}\)\}/);
});

test("shared CRM pipeline date control also preserves fail-closed future validation", () => {
  const ui = source("components/crm-pipeline-board.tsx");
  assert.match(ui, /type="datetime-local" value=\{dueAt\} onInput=\{\(e\) => setDueAt\(e\.currentTarget\.value\)\} onChange=\{\(e\) => setDueAt\(e\.currentTarget\.value\)\}/);
  assert.match(ui, /terminal \|\| \(nextAction\.trim\(\) && dueAt && new Date\(dueAt\)\.getTime\(\) > Date\.now\(\)\)/);
});
