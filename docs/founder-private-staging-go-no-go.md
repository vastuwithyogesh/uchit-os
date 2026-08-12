# Founder private-staging GO/NO-GO and rollback

This is a preparation checklist only. Packaging does not publish or migrate anything.

## Required private environment

- Owner-only Sites access for Yogesh, with zero external visitors.
- `DB` is an actual disposable D1 resource binding, never a string environment value.
- `R2` is an actual disposable private R2 resource binding, never a string environment value.
- `PDF_OWNER_SECRET` is server-only and at least 32 characters; diagnostics verify presence/length only.
- `LOVABLE_INTEGRATION_ENABLED` and `LOVABLE_INTEGRATION_ACTIVATION` remain absent/disabled.
- No real Zoom connection, client-delivery flag, live client data, production secrets, or real approved PDF bytes are copied.

## GO gates

- Exact source commit is committed and the working tree contains no scoped source changes.
- Full `pnpm test:release`, TypeScript/lint, and production build pass.
- Disposable migration, backup/restore, private storage, integrated boundary, UI action, privacy, and deterministic artifact tests pass.
- Package SHA-256 matches `build/founder-private-staging-<commit>.tar.gz.sha256`.
- Hosting metadata names only the intended private project and declares logical `DB`/`R2` bindings.
- Owner confirms the disposable resources and rollback owner before any publication.

## Automatic NO-GO

Any failing test/build, dirty scoped source, ordinary string `DB`/`R2` values, missing secret, unverified migration/backup, unresolved no-op action, external visitor, live/client data, enabled Lovable/provider/client-delivery path, or attempt to weaken P5/P13/P14/statutory-document/template/Stage B blockers is NO-GO.

These content blockers do not prevent private UI review, but they do prevent proposal approval/sending/acceptance, invoice issuance, real asset communication, Zoom creation, and Stage B.

## Forward-fix and rollback

1. Stop all owner mutation actions and record the failing build/version and migration marker without payloads.
2. Do not roll back by editing immutable business rows or deleting a migration marker.
3. If no business write occurred, return traffic to the previously known private version.
4. If a disposable migration failed, restore its pre-run backup or publish a reviewed additive forward-fix; verify integrity and row hashes.
5. Inventory private objects against immutable metadata. Quarantine orphans; do not auto-delete retained bytes.
6. Re-run session, diagnostics, migration markers, D1 integrity, R2 checksum/read denial, action audit, and bounded synthetic smoke checks.
7. Destroy disposable resources when review evidence is complete.

## Package command

After all scoped changes are committed, run `node scripts/prepare-founder-private-staging.mjs`. It refuses a dirty scoped source tree, archives tracked bytes from the exact `HEAD`, computes the archive SHA-256, and writes a no-deploy manifest. It does not install dependencies, access a network, publish, migrate, or connect a provider.
