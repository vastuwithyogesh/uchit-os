import test from "node:test";
import assert from "node:assert/strict";
import { functionBody, source, switchCaseBody } from "./helpers/source-contracts.mjs";

const domain = source("lib/domain.ts");
const store = source("lib/store.ts");
const merge = source("lib/persistence-merge.ts");
const workflow = source("lib/workflow-service.ts");
const actions = source("app/api/actions/route.ts");
const helper = source("lib/client-intake.ts");

test("client intake profile is additive, versioned and legacy-safe", () => {
  assert.match(domain, /interface ClientIntakeProfile/);
  assert.match(domain, /"SOLE", "JOINT", "NOT_DECISION_MAKER"/);
  assert.match(domain, /version: "uchit-intake\/v1"/);
  assert.match(store, /clientIntakeProfiles: ClientIntakeProfile\[\]/);
  assert.equal((store.match(/clientIntakeProfiles: \[\]/g) ?? []).length, 2);
  assert.match(merge, /"clientIntakeProfiles"/);
});

test("action is SETTER+ with exact top-level fields, client CAS and global rollback", () => {
  assert.match(switchCaseBody(actions, "client-intake-upsert"), /canTriggerDeliverables\(actor\)/);
  assert.match(actions, /client-intake-upsert.*contactPreference.*businessContext.*propertyContext.*consent.*expectedRecordVersion.*expectedRevision/s);
  assert.match(actions, /Unknown CRM field/);
  assert.match(actions, /setAppState\(rollbackState/);
  const body = functionBody(workflow, "upsertClientIntake");
  assert.match(body, /assertExpectedRecordVersion\(client, input\.expectedRecordVersion\)/);
  assert.match(body, /client\.recordVersion = \(client\.recordVersion \?\? 0\) \+ 1/);
});

test("assigned-setter isolation occurs before idempotent profile return", () => {
  const body = functionBody(workflow, "upsertClientIntake");
  assert.ok(body.indexOf("Setters may update intake only for clients assigned to them") < body.indexOf("if (existing?.idempotencyKey === idempotencyKey) return existing"));
  assert.match(body, /idempotencyKey/);
});

test("nested objects reject unknown fields and prohibited data has no schema path", () => {
  const body = functionBody(workflow, "upsertClientIntake");
  assert.match(body, /intakeObject\(input\.contactPreference.*whatsapp.*preferredLanguage.*preferredContactWindow/s);
  assert.match(body, /intakeObject\(input\.consent.*version.*contact.*accuracy.*confidentiality/s);
  assert.match(functionBody(workflow, "intakeObject"), /Unknown .* field/);
  const model = domain.slice(domain.indexOf("export interface ClientIntakeProfile"), domain.indexOf("export interface LeadQualificationRecord"));
  assert.doesNotMatch(model, /birth|coordinate|planUrl|exportUrl|signature|image/i);
});

test("WhatsApp, area, service, strings and consent are fail-closed", () => {
  const body = functionBody(workflow, "upsertClientIntake");
  assert.match(body, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  assert.match(body, /Number\.isFinite/);
  assert.match(body, /Area value and area unit must be provided together/);
  assert.match(body, /enumValue\(propertyInput\.serviceInterest, serviceTypes/);
  assert.match(body, /consentInput\[key\].*typeof consentInput\[key\] !== "boolean"/s);
  assert.match(body, /consentComplete.*contact === true.*accuracy === true.*confidentiality === true/s);
  assert.match(body, /confirmedAt: consentComplete \? \(existing\?\.consent\.confirmedAt \?\? stamp\.at\) : undefined/);
  const stringGuard = functionBody(workflow, "optionalIntakeString");
  assert.match(stringGuard, /\\u0000-\\u001f\\u007f<>/);
  assert.match(stringGuard, /a-z0-9\+\.\-/);
  assert.match(stringGuard, /\\\.\\\./);
  assert.match(stringGuard, /must not contain HTML, a URL, or an embedded data payload/);
});

test("immutable artifact locks intake and audit timeline contains no intake values", () => {
  const body = functionBody(workflow, "upsertClientIntake");
  assert.match(body, /getActiveCaseForClient/);
  assert.match(body, /item\.artifact/);
  assert.match(body, /formal case rectification/);
  const timeline = body.match(/appendTimeline\([^;]+;/s)?.[0] ?? "";
  assert.match(timeline, /Client intake updated/);
  assert.match(timeline, /profile\.version/);
  assert.doesNotMatch(timeline, /whatsapp|company|challenge|outcome|consentInput|propertyContext/);
  assert.match(body, /created: existing\?\.created \?\? stamp, updated: stamp/);
});

test("completeness helper reports facts without creating a commercial or report gate", () => {
  const body = functionBody(helper, "getClientIntakeCompleteness");
  assert.match(body, /completed:/);
  assert.match(body, /total:/);
  assert.match(body, /consent/);
  assert.doesNotMatch(body, /price|payment|reportStatus|throw/);
});
