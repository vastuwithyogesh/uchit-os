import assert from "node:assert/strict";
import test from "node:test";
import { execute } from "./r3-3d2-native-v1-stageb-execution-certification.test.ts";
import { getAppState, setAppState } from "../lib/store.ts";
import { approveReport, prepareFinalReport, type ReportApprovalExecutionPolicy } from "../lib/workflow-service.ts";
import { generateFinalPdf, readFinalPdfStatus, verifyFinalPdf } from "../lib/final-pdf.server.ts";
import { inspectProtectedPdf } from "../lib/protected-pdf-renderer.ts";

const founderApproval: ReportApprovalExecutionPolicy = { mode: "FOUNDER", creatorMayApprove: true };

class TestStatement {
  private readonly db: TestD1;
  private readonly sql: string;
  private readonly values: unknown[];
  constructor(db: TestD1, sql: string, values: unknown[] = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values: unknown[]) { return new TestStatement(this.db, this.sql, values); }
  async run() { return this.db.run(this.sql, this.values); }
  async first<T = Record<string, unknown>>() { return this.db.first<T>(this.sql, this.values); }
  async all<T = Record<string, unknown>>() { return { results: await this.db.all<T>(this.sql, this.values), meta: { changes: 0 } }; }
}

class TestD1 {
  readonly artifacts: any[] = [];
  readonly events: any[] = [];
  readonly caseFile = {
    object_key: "case-files/native-v1-marked-plan.png", original_file_name: "native-v1-marked-plan.png", mime_type: "image/png",
    size_bytes: 75, checksum_sha256: "af432780db49c19bee19a27ff8a1e5a7468a9e385df5fa8474e8f30049a22776"
  };
  prepare(sql: string) { return new TestStatement(this, sql); }
  batch(statements: TestStatement[]) { return Promise.all(statements.map((statement) => statement.run())); }
  async first<T>(sql: string, values: unknown[]) {
    if (/FROM final_pdf_artifacts/i.test(sql)) return (this.artifacts.find((row) => row.organisation_id === values[0] && row.report_version_id === values[1]) ?? null) as T | null;
    if (/FROM case_file_assets/i.test(sql)) return (values[0] === "native-v1-marked-plan" ? this.caseFile : null) as T | null;
    return null;
  }
  async all<T>(sql: string, _values: unknown[] = []) { return [] as T[]; }
  async run(sql: string, values: unknown[]) {
    if (/INSERT INTO final_pdf_artifacts/i.test(sql)) {
      const [artifact_id, organisation_id, report_version_id, report_version_label, case_id, project_id, floor_id, report_template_version, source_snapshot_hash, artifact_hash_sha256, object_key, mime_type, size_bytes, page_count, renderer_version, page_configuration, embedded_evidence_checksums_json, generated_at, security_profile, generation_idempotency_key] = values;
      this.artifacts.push({ artifact_id, organisation_id, report_version_id, report_version_label, case_id, project_id, floor_id, report_template_version, source_snapshot_hash, artifact_hash_sha256, object_key, mime_type, size_bytes, page_count, renderer_version, page_configuration, embedded_evidence_checksums_json, generated_at, security_profile, status: "GENERATED", generation_idempotency_key, record_version: 1, verified_at: null, released_at: null, released_by_actor_id: null });
    } else if (/UPDATE final_pdf_artifacts SET status='VERIFIED'/i.test(sql)) {
      const row = this.artifacts.find((item) => item.artifact_id === values[1]);
      if (row) { row.status = "VERIFIED"; row.verified_at = new Date().toISOString(); row.record_version += 1; }
    } else if (/INSERT INTO final_pdf_artifact_events/i.test(sql)) {
      this.events.push({ sql, values });
    }
    return { meta: { changes: 1 } };
  }
}

function installDurableBindings(db: TestD1, bytes: Uint8Array) {
  const objects = new Map<string, Uint8Array>([["case-files/native-v1-marked-plan.png", bytes]]);
  (globalThis as any).__uchitEnv = {
    DB: db,
    R2: {
      async put(key: string, value: Uint8Array) { objects.set(key, new Uint8Array(value)); },
      async get(key: string) {
        const value = objects.get(key); if (!value) return null;
        return { body: new ReadableStream({ start(controller) { controller.enqueue(value); controller.close(); } }) };
      },
      async delete(key: string) { objects.delete(key); }
    },
    PDF_OWNER_SECRET: "owner-secret-native-v1-r4-1-32-characters-minimum"
  };
}

async function prepareV1ApprovalScenario() {
  const result = execute();
  const { fixture } = result;
  const { state, owner, caseRecord, floor } = fixture;
  state.payments.push({ id: `payment-${crypto.randomUUID()}`, organisationId: fixture.organisationId, clientId: fixture.client.id, caseId: caseRecord.id, type: "BALANCE", amountInr: 10000, status: "APPROVED", proofAssetId: "proof-native-v1-r4-2", recordVersion: 1 } as any);
  setAppState(state);
  const report = await prepareFinalReport(caseRecord.id, floor.id, owner, caseRecord.recordVersion, `prepare-${crypto.randomUUID()}`);
  return { fixture, report };
}

test("R4.1 executes prepare -> approve -> generate and verifies the durable protected artifact", async () => {
  const result = execute();
  const { fixture } = result;
  const { state, owner, caseRecord, floor, project } = fixture;
  const markedBytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPcEqXBwMDAxAAGAA8+ATocNFacAAAAAElFTkSuQmCC", "base64"));
  state.spatialEvidenceVersions.push({ id: "evidence-native-v1-marked", organisationId: fixture.organisationId, projectId: project.id, caseId: caseRecord.id, floorId: floor.id, planVersionId: fixture.existingLayoutPlan.id, kind: "HAND_MARKED_PLAN", classification: "MARKED_32D_CHAKRA_V1", has32SectorChakra: true, protectedFileRef: "native-v1-marked-plan", fullColour: true, status: "CURRENT", recordVersion: 1 } as any);
  state.payments.push({ id: "payment-native-v1-r4-1", organisationId: fixture.organisationId, clientId: fixture.client.id, caseId: caseRecord.id, type: "BALANCE", amountInr: 10000, status: "APPROVED", proofAssetId: "proof-native-v1-r4-1", recordVersion: 1 } as any);
  const db = new TestD1(); installDurableBindings(db, markedBytes); setAppState(state);
  const prepared = await prepareFinalReport(caseRecord.id, floor.id, owner, caseRecord.recordVersion, "native-v1-r4-1-prepare");
  assert.equal(prepared.status, "READY_FOR_APPROVAL");
  assert.equal(prepared.artifact?.templateVersion, "uchit-verdict/v5");
  assert.equal(prepared.artifact?.stageBRenderManifest?.reportSourceId, fixture.combinedReport.id);
  assert.equal(prepared.approvals.length, 0);
  const reviewed = approveReport(prepared.id, owner, "Founder reviewed native V1 final report", founderApproval, prepared.recordVersion ?? 0, "native-v1-r4-1-reviewed");
  assert.equal(reviewed.status, "READY_FOR_APPROVAL");
  const approved = approveReport(prepared.id, owner, "Founder approved native V1 final report", founderApproval, reviewed.recordVersion ?? 0, "native-v1-r4-1-approved");
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvalEvidence?.length, 2);
  assert.equal(approved.approvalEvidence?.every((item) => item.checkpoint), true);
  const generated = await generateFinalPdf({ state: getAppState(), revision: 0, context: { organisation: { id: fixture.organisationId, founderUserId: owner.id } as any, membership: { userId: owner.id, role: "SUPER_ADMIN", capability: "organisation_owner" } as any, workflowPolicy: { policyJson: { clientDeliveryEnabled: false } } as any, approvalPolicy: { steps: ["FOUNDER_REVIEWED", "FOUNDER_APPROVED"] } as any, isFounderEdition: true }, actor: owner, reportId: approved.id, expectedRecordVersion: approved.recordVersion ?? 0, expectedRevision: 0, idempotencyKey: "native-v1-r4-1-generate", requestId: "native-v1-r4-1-request" });
  assert.equal(generated.artifact.status, "GENERATED");
  assert.equal(generated.artifact.reportVersionId, approved.id);
  assert.equal(generated.artifact.floorId, floor.id);
  assert.equal(db.artifacts[0].report_template_version, "uchit-verdict/v5");
  assert.equal(db.artifacts[0].source_snapshot_hash, approved.artifact?.contentHash);
  assert.equal(generated.artifact.artifactHashSha256.length, 64);
  const verified = await verifyFinalPdf({ state: getAppState(), revision: 0, context: { organisation: { id: fixture.organisationId, founderUserId: owner.id } as any, membership: { userId: owner.id, role: "SUPER_ADMIN", capability: "organisation_owner" } as any, workflowPolicy: { policyJson: { clientDeliveryEnabled: false } } as any, approvalPolicy: { steps: ["FOUNDER_REVIEWED", "FOUNDER_APPROVED"] } as any, isFounderEdition: true }, actor: owner, reportId: approved.id, expectedRecordVersion: approved.recordVersion ?? 0, expectedRevision: 0, expectedArtifactVersion: 1, idempotencyKey: "native-v1-r4-1-verify", requestId: "native-v1-r4-1-verify-request" });
  assert.equal(verified.artifact.status, "VERIFIED");
  assert.equal(db.artifacts[0].report_version_id, approved.id);
  assert.equal(db.artifacts[0].floor_id, floor.id);
  assert.equal(db.artifacts[0].source_snapshot_hash, approved.artifact?.contentHash);
  assert.equal(db.artifacts[0].status, "VERIFIED");
  assert.equal(db.artifacts[0].artifact_id !== fixture.combinedReport.id, true);
  if (process.env.R4_CERT_PRINT_ARTIFACT === "1") console.log(`R4.2_ARTIFACT ${JSON.stringify(generated.artifact)}`);
  const status = await readFinalPdfStatus({ state: getAppState(), context: { organisation: { id: fixture.organisationId, founderUserId: owner.id } as any, membership: { userId: owner.id, role: "SUPER_ADMIN", capability: "organisation_owner" } as any, workflowPolicy: { policyJson: { clientDeliveryEnabled: false } } as any, approvalPolicy: { steps: ["FOUNDER_REVIEWED", "FOUNDER_APPROVED"] } as any, isFounderEdition: true }, actor: owner, reportId: approved.id });
  assert.equal(status?.status, "VERIFIED");
  assert.equal(status?.artifactHashSha256, generated.artifact.artifactHashSha256);
});

test("R4.2 rejects V1 approval when native Directional Stage A is missing", async () => {
  const { fixture, report } = await prepareV1ApprovalScenario();
  fixture.state.directionalStageAPresentations.length = 0;
  assert.throws(() => approveReport(report.id, fixture.owner, "Approve without native Stage A", founderApproval, report.recordVersion ?? 0, "r4-2-missing-stage-a"), /Directional Stage A|native/i);
});

test("R4.2 rejects V1 approval when report floor authority is changed", async () => {
  const { fixture, report } = await prepareV1ApprovalScenario();
  fixture.state.floorWorkspaces.push({ ...fixture.floor, id: "floor-native-v1-wrong", floorLabel: "First Floor" } as any);
  report.floorId = "floor-native-v1-wrong";
  assert.throws(() => approveReport(report.id, fixture.owner, "Approve wrong floor", founderApproval, report.recordVersion ?? 0, "r4-2-wrong-floor"), /exact|integrity|manifest|V1/i);
});

test("R4.2 rejects V1 approval when final-report integrity is not PASS", async () => {
  const { fixture, report } = await prepareV1ApprovalScenario();
  report.artifact!.stageBRenderManifest!.integrityStatus = "FAIL" as any;
  assert.throws(() => approveReport(report.id, fixture.owner, "Approve failed integrity", founderApproval, report.recordVersion ?? 0, "r4-2-integrity"), /integrity|PASS/i);
});
