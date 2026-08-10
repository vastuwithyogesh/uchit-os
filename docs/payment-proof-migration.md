# Legacy payment-proof migration

This migration is dry-run first, preserves all legacy records, and refuses a production adapter.

## Required inputs

- A protected JSON export containing `legacyId`, proof slot key, file metadata, and either a base64 `dataUrl` or byte array.
- A separately reviewed ownership JSON object keyed by `legacyId`. Every entry must identify `clientId`, either `proposalId` or `caseId`, and the accountable migration operator.
- A local or staging adapter module exporting `{ db, r2, environment }`. `environment` must not be `production`.

Do not commit either input. Keep them outside the repository and restrict access.

## Operator sequence

1. Back up the target staging D1 database and inventory the private R2 bucket.
2. Export legacy records without printing their `dataUrl` values to the terminal.
3. Have a business owner review and sign off the ownership mapping.
4. Run the dry-run:

   `node --experimental-strip-types scripts/migrate-legacy-payment-proofs.ts --input <protected-export.json> --ownership <reviewed-ownership.json> --manifest <dry-run-manifest.json>`

5. Require zero failures and review record counts, target IDs, checksums, and slot mappings. The manifest never contains proof bytes.
6. Exercise execute mode against local or staging only:

   `node --experimental-strip-types scripts/migrate-legacy-payment-proofs.ts --execute --adapter <staging-adapter.mjs> --input <protected-export.json> --ownership <reviewed-ownership.json> --manifest <execution-manifest.json>`

7. Run the same command again. Every successful record must report `SKIPPED`; this is the restart-safety check.
8. Compare D1 rows, R2 object checksums, and authenticated file retrieval with the execution manifest.
9. Retain the legacy source and both manifests. Deletion is intentionally unsupported and requires a separate approved retention decision.

## Production gate

Production execution requires a separately reviewed adapter or controlled runtime entry point, a fresh backup, a maintenance window, an approved ownership map, staging evidence, and explicit project-head approval. This repository tool intentionally cannot target production.
