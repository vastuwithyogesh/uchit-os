import test from "node:test";
import assert from "node:assert/strict";
import { resolveClientIntakePrefill } from "../lib/client-intake.ts";
import { createEmptyAppState } from "../lib/store.ts";

test("intake prefill follows the exact selected case lineage and source precedence", () => {
  const state = createEmptyAppState();
  state.clients.push({ id: "client-a", organisationId: "org-a", displayName: "A", city: "Ludhiana", recordVersion: 1 } as never);
  state.optInLeads.push({ id: "lead-a", organisationId: "org-a", uniqueClientId: "client-a", convertedClientId: "client-a", country: "India" } as never);
  state.vastuCases.push({ id: "case-a", organisationId: "org-a", clientId: "client-a", projectId: "project-a", serviceType: "EXISTING_SPACE" } as never);
  state.prospectiveProjects.push({ id: "prospect-a", organisationId: "org-a", clientId: "client-a", caseId: "case-a", responseVersionId: "response-a", serviceType: "EXISTING_SPACE", propertyType: "Residential", floorCount: 2 } as never);
  state.qualificationResponseVersions.push({ id: "response-a", organisationId: "org-a", clientId: "client-a", status: "SUBMITTED", answers: { concern: "Qualified concern", desiredOutcome: "Qualified outcome", propertyStatus: "Occupied" } } as never);
  const result = resolveClientIntakePrefill(state, { caseId: "case-a", projectId: "project-a", clientId: "client-a" });
  assert.equal(result.values.challenge, "Qualified concern");
  assert.equal(result.provenance.challenge, "QUALIFICATION");
  assert.equal(result.values.propertyType, "Residential");
  assert.equal(result.provenance.propertyType, "CASE_SETUP");
  assert.equal(result.values.floorCount, "2");
  assert.equal(result.values.cityCountry, "Ludhiana, India");
  state.clientIntakeProfiles.push({ clientId: "client-a", version: 2, propertyContext: { propertyType: "Commercial", serviceInterest: "EXISTING_SPACE", propertyStatus: "Existing", cityCountry: "Delhi, India" }, needs: { mainChallenge: "Newer canonical concern", desiredOutcome: "Newer canonical outcome" }, consent: { version: "uchit-intake/v1" } } as never);
  const existing = resolveClientIntakePrefill(state, { caseId: "case-a", projectId: "project-a", clientId: "client-a" });
  assert.equal(existing.values.challenge, "Newer canonical concern");
  assert.equal(existing.provenance.challenge, "INTAKE");
  assert.equal(existing.values.propertyType, "Commercial");
});

test("intake prefill fails closed for mismatched case, project or client", () => {
  const state = createEmptyAppState();
  state.vastuCases.push({ id: "case-a", organisationId: "org-a", clientId: "client-a", projectId: "project-a" } as never);
  assert.deepEqual(resolveClientIntakePrefill(state, { caseId: "case-a", projectId: "project-b", clientId: "client-a" }).values, {});
  assert.deepEqual(resolveClientIntakePrefill(state, { caseId: "case-a", projectId: "project-a", clientId: "client-b" }).values, {});
});
