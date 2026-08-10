# Security contract tests

Run `npm test` (or `pnpm test`). The suite uses Node's built-in test runner and
does not access the network, database, object storage, or live application data.

These tests deliberately inspect the security-critical source contracts. They
provide fast regression protection while the application is migrated toward
integration tests backed by injectable auth, D1, and R2 adapters.
