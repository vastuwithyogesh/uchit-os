# Founder pre-remedy runbook

Use [founder-staging-walkthrough.md](./founder-staging-walkthrough.md) as the operator checklist and `pnpm test:founder-staging` as the no-write verification command.

The runbook is intentionally dry-run only. It does not insert fixtures, call live routes, upload evidence, enable client delivery or deploy. The required real staging pilot needs owner-approved uploads of two distinct floor plans and two distinct original full-colour hand-marked sheets.

The only valid recovery paths are the server responses and floor queue transitions documented in the walkthrough. Do not bypass 428/409 concurrency errors, payment gates, Founder checkpoints, evidence confirmation, methodology blockers or regeneration states. Stage B remains `BLOCKED_METHOD_INPUT` until the remedial PRD and approved methodology are supplied.
