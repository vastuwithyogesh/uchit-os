import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const domain = fs.readFileSync("lib/domain.ts", "utf8");
const stageB = fs.readFileSync("lib/stage-b-remediation.ts", "utf8");
const actions = fs.readFileSync("app/api/actions/route.ts", "utf8");
const workspace = fs.readFileSync("components/section-a-remediation-workspace.tsx", "utf8");
const requestHelpers = fs.readFileSync("lib/request-helpers.ts", "utf8");
const caseFilesRoute = fs.readFileSync("app/api/case-files/route.ts", "utf8");

test("revised-layout candidates have explicit semantic lifecycle fields", () => {
  assert.match(domain, /purpose\?: "REVISED_FURNITURE_LAYOUT"/);
  assert.match(domain, /status: "DRAFT" \| "APPROVED" \| "AVAILABLE" \| "WITHDRAWN"/);
  assert.match(domain, /approvedByActorUserId\?: string/);
  assert.match(domain, /sourceAssetId\?: string/);
});

test("candidate creation uses exact scope, shared evidence authority, and rejects existing evidence", () => {
  assert.match(actions, /"revised-layout-candidate-create"/);
  assert.match(actions, /resolveCaseFileEvidenceAuthority\(String\(body\.evidenceRef\)/);
  assert.match(stageB, /input\.purpose !== "REVISED_FURNITURE_LAYOUT"/);
  assert.match(stageB, /scoped\.remediation\.existingLayoutAssetId/);
  assert.match(stageB, /siteEvaluationEvidenceVersions\.some/);
  assert.match(stageB, /spatialEvidenceVersions\.some/);
});

test("approval is Founder-only and selection accepts only approved candidates", () => {
  assert.match(actions, /actor\.role !== "SUPER_ADMIN"/);
  assert.match(stageB, /Only the Founder\/SUPER_ADMIN can approve/);
  assert.match(stageB, /\["APPROVED", "AVAILABLE"\]\.includes\(item\.status\)/);
  assert.match(workspace, /Approve Revised Layout/);
  assert.match(workspace, /Use this layout for all subsequent remedial pages\?/);
});

test("A2 upload path is visible without creating a golden candidate", () => {
  assert.match(workspace, /Upload Revised Layout/);
  assert.match(workspace, /Upload as Draft Candidate/);
  assert.match(workspace, /REVISED_FURNITURE_LAYOUT/);
  assert.match(workspace, /up to 20 MB/);
  assert.match(workspace, /Founder approval and explicit A2 selection remain separate actions/);
});

test("A2 multipart upload omits Content-Type and preserves required fields", () => {
  assert.match(requestHelpers, /options\?: \{ multipart\?: boolean \}/);
  assert.match(requestHelpers, /options\?\.multipart \? \{\} : \{/);
  assert.match(workspace, /fetch\("\/api\/case-files", \{ method: "POST", headers: buildActionHeaders\(activeUser\.role, \{ multipart: true \}\), body \}\)/);
  assert.match(workspace, /body\.set\("file", revisedLayoutFile\)/);
  assert.match(workspace, /body\.set\("caseId", caseRecord\.id\)/);
  assert.match(workspace, /body\.set\("floorLabel", floor\.floorLabel\)/);
  assert.doesNotMatch(workspace.match(/fetch\("\/api\/case-files"[\s\S]{0,260}/)?.[0] ?? "", /Content-Type/);
});

test("runtime generates multipart boundary for PDF, PNG, JPEG, and WebP uploads", async () => {
  for (const [name, type] of [["layout.pdf", "application/pdf"], ["layout.png", "image/png"], ["layout.jpg", "image/jpeg"], ["layout.webp", "image/webp"]]) {
    const form = new FormData();
    form.set("file", new File(["fixture"], name, { type }));
    form.set("caseId", "case");
    form.set("floorLabel", "Ground floor");
    const request = new Request("http://localhost/api/case-files", { method: "POST", body: form });
    assert.match(request.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/);
    const parsed = await request.formData();
    assert.equal(parsed.get("file")?.type, type);
    assert.equal(parsed.get("caseId"), "case");
    assert.equal(parsed.get("floorLabel"), "Ground floor");
  }
});

test("shared case-file endpoint remains multipart and validates MIME through the existing parser", () => {
  assert.match(caseFilesRoute, /await request\.formData\(\)/);
  assert.match(caseFilesRoute, /file instanceof File/);
  assert.match(caseFilesRoute, /saveCaseFileUpload\(file/);
  assert.match(workspace, /application\/pdf,image\/png,image\/jpeg,image\/webp/);
  assert.match(stageB, /REVISED_FURNITURE_LAYOUT/);
});

test("JSON action callers retain application/json", () => {
  assert.match(requestHelpers, /options\?\.multipart \? \{\} : \{\s*"Content-Type": "application\/json"/);
  assert.match(workspace, /headers: buildActionHeaders\(activeUser\.role\), body: JSON\.stringify/);
});
