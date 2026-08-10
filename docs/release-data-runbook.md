# Release data runbook

This runbook covers staging rehearsal and production planning for D1 state metadata and private R2 objects. It does not authorize a production change. Replace every `<OWNER-SET-...>` placeholder through the release approval process before production work.

## Recovery objectives

- RPO: `<OWNER-SET-RPO>` — the business owner must set and approve this value.
- RTO: `<OWNER-SET-RTO>` — the business owner must set and approve this value.
- Release owner: `<OWNER-SET-RELEASE-OWNER>`.
- Rollback approver: `<OWNER-SET-ROLLBACK-APPROVER>`.

Do not infer these values from technical convenience.

## Preflight

1. Confirm the target is staging and record the D1 database identifier and R2 bucket identifier without copying credentials into the repository.
2. Confirm `.openai/hosting.json` binds D1 as `DB` and R2 as `R2`.
3. From a clean reviewed commit, run:

   ```text
   pnpm test:release-data
   pnpm test
   pnpm lint
   pnpm build
   ```

4. Record migration versions currently present in `schema_migrations`. Expected application versions are 1, 2, and 3.
5. Confirm storage capacity, access roles, maintenance window, communications owner, and rollback decision time.

## Backup before migration

Export the single `app_state_snapshot` row from staging using the approved platform console or authenticated operator tooling. The export input to this repository tool must contain only the parsed state payload; do not include credentials or R2 bytes.

Create a new backup file (the tool refuses to overwrite an existing path):

```text
pnpm backup:state -- --mode export --environment staging --input <STATE-JSON> --output <NEW-BACKUP-JSON> --revision <D1-REVISION>
```

Validate it independently:

```text
pnpm backup:state -- --mode import-dry-run --environment staging --input <BACKUP-JSON>
```

Record the printed SHA-256 in the release evidence. The envelope explicitly excludes secrets and R2 bytes.

Separately create an R2 inventory using approved provider tooling: object key, size, checksum/custom checksum metadata, and last-modified time. Store the inventory in the protected release-evidence location. R2 recovery requires provider-side versioning or an independently approved bucket copy; the state backup cannot restore file bytes.

## Staged migration rehearsal

1. Restore a disposable staging clone from the D1 export and the independently protected R2 copy/inventory.
2. Start the candidate application against only that clone. Application startup applies ordered migrations through `migrateD1`.
3. Verify `schema_migrations` contains one row each for versions 1, 2, and 3.
4. Verify `app_state_snapshot.revision` equals its pre-migration value. Migration 2 may initialize revision to zero only for a true v1 database that never had the column.
5. Verify `case_file_assets` exists with unique `evidence_ref` and `object_key`, the immutable-status constraint, and indexes `idx_case_file_assets_scope` and `idx_case_file_assets_floor`.
6. Restart the candidate against the same clone and verify migration repeatability: no duplicate markers, schema drift, or revision change.

## Smoke checks

- Authenticated CONSULTANT can load bootstrap state and sees the unchanged revision.
- A staging-only case-file upload produces one D1 metadata row and one private R2 object with matching checksum.
- Case-file list omits object keys and bytes; download is attachment-only, `private, no-store`, and `nosniff`.
- Cross-case evidence references fail.
- A valid case document can be verified and evaluation readiness changes only after the full service checklist is satisfied.
- Existing v1/v2 report artifact integrity still matches.
- A concurrent stale write returns 409 and a missing precondition returns 428.

Remove or retain smoke-test records only under the staging data policy; do not improvise cleanup against production.

## Rollback and forward-fix

These migrations are additive. Prefer a forward-fix when the application can still read the previous state safely. Never drop a table or column as an emergency reaction.

If staging validation fails before production approval:

1. Stop the candidate application.
2. Preserve diagnostics, the failed clone, D1 export, R2 inventory, and hashes.
3. Restore a fresh staging clone from the pre-migration D1 export.
4. Validate the backup hash before import and verify the restored `app_state_snapshot.revision`.
5. Restore R2 separately from the approved versioned bucket/copy, then compare inventory counts and checksums.
6. Run the smoke checks on the restored release version.

For a production incident, the named rollback approver must choose forward-fix versus restore using the owner-approved RPO/RTO and incident evidence. The commands and resource identifiers must come from the approved platform change ticket; this repository intentionally provides no production mutation command.

## Health evidence and sign-off

Attach to the release record: commit ID, build output, all test outputs, migration markers before/after, snapshot revision before/after, backup SHA-256, R2 inventory hash/count, smoke-check results, integrity results, release owner decision, and rollback approver decision. Do not mark production-ready while any item is missing.
