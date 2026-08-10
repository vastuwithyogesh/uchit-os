import test from "node:test";
import assert from "node:assert/strict";
import { projectOperatingIntelligence } from "../lib/operating-intelligence.ts";

const admin = { id: "admin", fullName: "Admin", email: "admin@example.test", role: "ADMIN", color: "#000" };
function fixture() {
  const state = { commercialPolicy: { nextActionDueSoonHours: 24 }, clients: [], vastuCases: [], deliveryMilestones: [] };
  state.clients = [
    { id: "c1", displayName: "Private One", city: "Pune", source: "x", assignedSetterId: "setter-1", email: "one@private.test", phone: "111", stage: "QUALIFYING", pipelineStage: "CONTACTED", pipelineOwner: { id: "setter-1", name: "Setter", role: "SETTER" }, nextAction: { summary: "Call private client", dueAt: "2026-08-10T10:00:00.000Z" } },
    { id: "c2", displayName: "Private Two", city: "Delhi", source: "x", assignedSetterId: "setter-2", email: "two@private.test", phone: "222", stage: "QUALIFIED", pipelineStage: "QUALIFIED", pipelineOwner: { id: "setter-2", name: "Other Setter", role: "SETTER" }, nextAction: { summary: "Prepare scope", dueAt: "2026-08-11T06:00:00.000Z" } },
    { id: "c3", displayName: "Private Three", city: "Goa", source: "x", assignedSetterId: "setter-1", email: "three@private.test", phone: "333", stage: "DISQUALIFIED", pipelineStage: "DISQUALIFIED" }
  ];
  state.vastuCases = [
    { id: "old", caseNumber: "UV-OLD", clientId: "c1", proposalId: "p", status: "VERDICT_RELEASED", reportStatus: "RELEASED", orientationLocked: true, balanceApproved: true, fullPaymentApproved: true, revisionNumber: 1 },
    { id: "case1", caseNumber: "UV-1-R2", clientId: "c1", proposalId: "p", status: "RECTIFICATION", reportStatus: "PAYMENT_BLOCKED", orientationLocked: false, balanceApproved: false, fullPaymentApproved: false, revisionNumber: 2, serviceType: "EXISTING_SPACE", canonicalStage: "VERIFY" },
    { id: "case2", caseNumber: "UV-2", clientId: "c2", proposalId: "p2", status: "REPORT_APPROVAL_PENDING", reportStatus: "READY_FOR_APPROVAL", orientationLocked: true, balanceApproved: true, fullPaymentApproved: false, serviceType: "NEW_CONSTRUCTION", canonicalStage: "RECOMMEND" }
  ];
  state.deliveryMilestones = [
    { id: "m1", caseId: "case1", caseRevisionNumber: 2, serviceType: "EXISTING_SPACE", kind: "FOLLOW_UP", sequence: 1, roundLabel: "1", title: "Follow up", status: "BLOCKED", dueDate: "2026-08-10T09:00:00.000Z", ownerRole: "CONSULTANT", ownerName: "Consultant", blocker: true, evidenceRefs: [], idempotencyKey: "x", version: 1, created: {}, updated: {} },
    { id: "m2", caseId: "case2", caseRevisionNumber: 1, serviceType: "NEW_CONSTRUCTION", kind: "REVIEW_ROUND", sequence: 1, roundLabel: "1", title: "Review", status: "READY", dueDate: "2026-08-11T06:00:00.000Z", ownerRole: "ARCHITECT", ownerName: "Architect", blocker: false, evidenceRefs: [], idempotencyKey: "y", version: 1, created: {}, updated: {} }
  ];
  return state;
}

test("admin projection is deterministic, aggregate-only, and counts canonical operations", () => {
  const projection = projectOperatingIntelligence(fixture(), admin, "2026-08-10T12:00:00+05:30");
  assert.equal(projection.asOf, "2026-08-10T06:30:00.000Z");
  assert.deepEqual({ contacted: projection.funnel.byStage.CONTACTED, qualified: projection.funnel.byStage.QUALIFIED, disqualified: projection.funnel.byStage.DISQUALIFIED }, { contacted: 1, qualified: 1, disqualified: 1 });
  assert.deepEqual(projection.workload, { active: 2, overdue: 0, dueSoon: 2, missingNextAction: 0, dueSoonHours: 24 });
  assert.deepEqual(projection.activeCases, { total: 2, byService: { EXISTING_SPACE: 1, NEW_CONSTRUCTION: 1 }, byStage: { UNDERSTAND: 0, VERIFY: 1, MAP: 0, EVALUATE: 0, PRIORITISE: 0, RECOMMEND: 1, IMPLEMENT: 0 } });
  assert.deepEqual(projection.delivery, { open: 2, overdue: 0, dueSoon: 2, blocked: 1, missingDueDate: 0 });
  assert.deepEqual(projection.gates.reports, { previewBlocked: 0, paymentBlocked: 1, awaitingApproval: 1, approvedNotReleased: 0 });
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /Private One|Private Two|one@private|two@private|111|222|Call private client|Prepare scope/);
  assert.equal(projection.unavailable.averageStageDuration, "N/A");
});

test("active-case selection is successor-aware and owner aggregation contains roles only", () => {
  const projection = projectOperatingIntelligence(fixture(), admin, "2026-08-10T06:30:00.000Z");
  assert.equal(projection.activeCases.total, 2);
  assert.equal(projection.activeCases.byStage.VERIFY, 1);
  assert.equal(projection.gates.reports.paymentBlocked, 1);
  assert.deepEqual(projection.ownerWorkload, [{ ownerRole: "SETTER", active: 2, overdue: 0, dueSoon: 2, missingNextAction: 0 }]);
  assert.doesNotMatch(JSON.stringify(projection.ownerWorkload), /setter-1|setter-2|Other Setter|"Setter"/);
});

test("lower-role access and invalid clocks fail closed", () => {
  const state = fixture();
  for (const role of ["CLIENT", "SETTER", "CONSULTANT"]) assert.throws(() => projectOperatingIntelligence(state, { ...admin, role }, "2026-08-10T00:00:00Z"), /requires an admin/i);
  assert.throws(() => projectOperatingIntelligence(state, admin, "not-a-date"), /valid ISO/i);
});

test("due-soon uses the configured window and exact boundary semantics", () => {
  const state = fixture();
  state.commercialPolicy.nextActionDueSoonHours = 2;
  state.clients[0].nextAction.dueAt = "2026-08-10T06:30:00.000Z";
  state.clients[1].nextAction.dueAt = "2026-08-10T08:30:00.000Z";
  let projection = projectOperatingIntelligence(state, admin, "2026-08-10T06:30:00.000Z");
  assert.equal(projection.workload.overdue, 0);
  assert.equal(projection.workload.dueSoon, 1);
  assert.equal(projection.workload.dueSoonHours, 2);
  state.clients[0].nextAction.dueAt = "2026-08-10T06:29:59.999Z";
  projection = projectOperatingIntelligence(state, admin, "2026-08-10T06:30:00.000Z");
  assert.equal(projection.workload.overdue, 1);
});

test("empty state is deterministic and contains no financial or record-level fields", () => {
  const empty = { commercialPolicy: { nextActionDueSoonHours: 24 }, clients: [], vastuCases: [], deliveryMilestones: [] };
  const first = projectOperatingIntelligence(empty, admin, "2026-08-10T06:30:00.000Z");
  const second = projectOperatingIntelligence(empty, admin, "2026-08-10T06:30:00.000Z");
  assert.deepEqual(first, second);
  assert.equal(first.funnel.total, 0);
  assert.equal(first.workload.active, 0);
  assert.equal(first.activeCases.total, 0);
  assert.equal(first.delivery.open, 0);
  assert.deepEqual(first.ownerWorkload, []);
  assert.doesNotMatch(JSON.stringify(first), /clientId|caseId|displayName|email|phone|whatsapp|amount|revenue|forecast|pipeline value/i);
});
