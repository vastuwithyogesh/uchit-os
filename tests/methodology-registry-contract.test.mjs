import test from "node:test";
import assert from "node:assert/strict";
import { source, functionBody } from "./helpers/source-contracts.mjs";
import { getMethodologyReadiness } from "../lib/methodology-readiness.ts";

test("methodology modules and safety statuses are explicit and Planetary is absent", () => {
  const domain = source("lib/domain.ts");
  for (const module of ["DIRECTION_32", "DIRECTION_16", "SITE_ENVIRONMENT", "UTILITY", "SHAKTI_ELEMENT", "STAGE_B_REMEDIAL"]) assert.match(domain, new RegExp(`"${module}"`));
  for (const status of ["APPROVED", "CONFIGURABLE", "REVIEW_REQUIRED", "BLOCKED_METHOD_INPUT", "DEFERRED", "NEEDS_REGENERATION"]) assert.match(domain, new RegExp(`"${status}"`));
  assert.doesNotMatch(domain.slice(domain.indexOf("methodologyModules"), domain.indexOf("export interface ReportVersionRecord")), /PLANET/);
});

test("only the organisation owner can author or publish methodology", () => {
  const registry = source("lib/methodology-registry.ts");
  const owner = functionBody(registry, "assertOwner");
  assert.match(owner, /actor\.role !== "SUPER_ADMIN"/);
  assert.match(owner, /actor\.organisationCapability !== "organisation_owner"/);
  const route = source("app/api/actions/route.ts");
  for (const action of ["methodology-version-create", "methodology-rule-upsert", "methodology-fixture-upsert", "methodology-version-publish"]) assert.match(route, new RegExp(`"${action}"`));
  assert.match(route, /expectedRecordVersion/);
  assert.match(route, /expectedRevision/);
});

test("published methodology is immutable, versioned, hashed and requires approved rules plus fixtures", () => {
  const registry = source("lib/methodology-registry.ts");
  assert.match(functionBody(registry, "draftContext"), /Published methodology is immutable/);
  const publish = functionBody(registry, "publishMethodologyVersion");
  assert.match(publish, /item\.decisionStatus !== "APPROVED"/);
  assert.match(publish, /At least one approved golden fixture/);
  assert.match(publish, /deterministicContentHash\(content\)/);
  assert.match(publish, /current\.lifecycleStatus = "RETIRED"/);
  assert.match(publish, /version\.lifecycleStatus = "ACTIVE"/);
});

test("Stage B publication is authority, adapter, rule and fixture bound", () => {
  const publish = functionBody(source("lib/methodology-registry.ts"), "publishMethodologyVersion");
  assert.match(publish, /version\.module === "STAGE_B_REMEDIAL"/);
  assert.match(publish, /STAGE_B_AUTHORITY_HASH/);
  assert.match(publish, /STAGE_B_RESOLVER_VERSION/);
  assert.match(publish, /rules\.length < 5/);
  assert.match(publish, /fixtures\.length < 6/);
});

test("approved register still cannot execute until an adapter is reviewed and bound", () => {
  const base = {
    methodologyVersions: [{ id: "v1", organisationId: "org1", module: "UTILITY", version: 1, lifecycleStatus: "ACTIVE", contentHash: "hash" }],
    methodologyRules: [{ id: "r1", organisationId: "org1", methodologyVersionId: "v1", decisionStatus: "APPROVED" }],
    methodologyGoldenFixtures: [{ id: "f1", organisationId: "org1", methodologyVersionId: "v1", decisionStatus: "APPROVED" }]
  };
  const blocked = getMethodologyReadiness(base, "org1", "UTILITY");
  assert.equal(blocked.ready, false);
  assert.match(blocked.reason, /execution adapter/);
  base.methodologyVersions[0].executionAdapterVersion = "utility-adapter/v1";
  const ready = getMethodologyReadiness(base, "org1", "UTILITY");
  assert.equal(ready.ready, true);
  assert.equal(ready.status, "APPROVED");
});

test("Utility and Shakti provenance pins methodology version and content hash", () => {
  const workflow = source("lib/workflow-service.ts");
  const utility = functionBody(workflow, "createEvaluationSnapshot");
  const shakti = functionBody(workflow, "recordShaktiSnapshot");
  for (const body of [utility, shakti]) {
    assert.match(body, /getMethodologyReadiness/);
    assert.match(body, /methodologyVersionId/);
    assert.match(body, /methodologyContentHash/);
    assert.match(body, /Blocked — Methodology Input Required/);
  }
});

test("methodology UI exposes controlled drafts, fixtures and immutable publication", () => {
  const ui = source("components/methodology-console.tsx");
  assert.match(ui, /Approve rules before the engine uses them/);
  assert.match(ui, /Golden fixture/);
  assert.match(ui, /reviewed deterministic adapter/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /Your draft was not silently retried/);
  assert.match(source("app/methodology/page.tsx"), /requirePageAccess\("SUPER_ADMIN"\)/);
});
