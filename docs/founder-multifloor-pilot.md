# Founder Edition synthetic two-floor pilot

Status: **PASS**

This is a dependency-light synthetic verification fixture. It does not write to D1/R2, staging or production and does not enable client delivery.

## Scope

- One synthetic organisation and Founder/SUPER_ADMIN actor.
- One permanent synthetic Client ID, one project and one Vastu Case ID.
- Ground floor and First floor as independent workspaces under the same project and case.
- One project-level future consultant assignment slot; no floor-level consultant assignment.
- Separate current plan, manual 32D, manual 16D, Brahmasthan, Marmaa, graph and hand-marked utility evidence versions per floor.
- Separate Utility, Shakti, Stage A, Site Analysis, Post-Site Findings and v4 report lineage per floor.
- Separate encrypted protected-PDF bytes per floor.
- Four independent synthetic evidence files are used: a ground-floor plan, ground-floor manual sheet, first-floor plan, and first-floor manual sheet. Each has distinct immutable bytes/checksum and exact floor/plan scope.

## Verified invariants

- Editing the Ground-floor plan invalidates only its artifact integrity and does not change the First-floor payload, HTML, bytes or hash.
- Missing First-floor 16D evidence blocks only the First floor.
- A plan rebound to another floor fails closed before AOU/report composition.
- One released floor leaves the project `IN_PROGRESS`.
- One released and delivered floor while the other is incomplete leaves the project `IN_PROGRESS`.
- Two released reports without delivery leave the project `IN_PROGRESS`.
- The derived completion state becomes `COMPLETE` only when both independent reports are released and both floors have explicit delivery timestamps.
- Client delivery remains disabled by the active Founder policy; the completion assertion uses only an isolated hypothetical state and invokes no delivery route.
- Founder review, approval and release checkpoints are exact-floor scoped, immutable and idempotent.

## Residual constraints

- Orientation is currently a shared project/case version rather than a separate floor record. Every floor mapping and evaluation still binds that exact locked orientation version. A future policy decision is required only if different floor orientations must be independently supported.
- The controlled walkthrough uses synthetic files only; a real pilot must upload the actual independent floor plans and full-colour marked sheets through protected case-file storage.
- Stage B remains `BLOCKED_METHOD_INPUT` and is not started by this pilot.
- Client delivery and live fixture insertion remain disabled.

## Decision

The multi-floor workflow foundation passes. The controlled synthetic staging walkthrough is green and ready to be repeated against safe staging fixtures. It performs no live writes and does not enable client delivery. The next dependency is an owner-approved real staging upload of two independent plan files and two independent marked sheets, followed by the same acceptance checklist.
