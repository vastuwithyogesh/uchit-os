# Founder Scorecard v4

The Founder home now presents one server-derived scorecard for the active client/case. It is a navigation and review surface only: existing action routes remain authoritative for every mutation, payment gate, approval checkpoint, evidence lock and report release.

## Sequence

1. Client and commercial readiness
2. Case and project setup
3. Floor setup
4. Plans, evidence and orientation
5. Gridding, 32D/16D and manual sheet
6. Utility and Shakti evaluation
7. Site analysis and post-site findings
8. Stage A verdict and Founder review
9. Balance and payment clearance
10. Founder approval and protected report
11. Delivery history and follow-up
12. Stage B remedial handoff

Each module exposes a purpose, server-derived status, one primary navigation action and a recovery action when a prerequisite is blocked. Technical IDs and counts are available only under a disclosure. The scorecard highlights one recommended next module; it never presents a UI path that bypasses a server gate.

## Floor behavior

Floor progress is computed independently. A project may show multiple floor chips, but each floor keeps its own plan, evidence, mappings, evaluation, verdict and report lineage. A partial release never closes the overall project. The scorecard links each chip to the floor-scoped spatial workspace.

## Deliberate deferrals

Client delivery remains disabled. Stage B remains `BLOCKED_METHOD_INPUT` until the approved remedial PRD and methodology are supplied. The scorecard does not infer missing methodology, calculate geometry, or create remedies.

## Verification

`tests/founder-scorecard.test.mjs` covers the twelve-module order, one recommended module, explicit statuses, direct recovery links, floor isolation, mobile contracts and deferred delivery. The scorecard is included in `pnpm test:release`.
