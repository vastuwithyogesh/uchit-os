# Uchit OS Architecture Rules

1. The canonical production repository is authoritative. No greenfield rebuild without explicit architecture approval.
2. Server/domain logic remains authoritative for business truth.
3. UI is never the canonical authority for permissions, payments, approvals, case creation, methodology completion, report release or delivery.
4. Organisation scoping is enforced server-side.
5. Case/Project/Floor lineage and floor isolation must remain intact.
6. Protected mutations use concurrency controls and idempotency where applicable.
7. Significant state changes remain auditable.
8. Immutable/versioned artifacts are not silently overwritten.
9. Financial calculations are exact and deterministic.
10. Locked methodology is deterministic where defined.
11. External providers are adapters, not domain truth.
12. Secrets remain outside source control.
13. API changes preserve compatibility or are explicitly versioned.
14. Database migrations default to additive, reviewed and rollback-aware.
15. Legacy paths are removed only after consumers and historical compatibility are proven safe.
16. Do not introduce infrastructure that is not justified by an observed requirement.

## Initial Do-Not-Rewrite Register
- Authentication / organisation scoping
- CAS / revision architecture
- Idempotency framework
- Audit / timeline
- Case / Project / Floor lineage
- Commercial proposal workflow
- Paid case handoff
- INTERNAL_COMPLIMENTARY handoff
- D8 / D16 / D32
- Directional V1
- Site Evidence V1
- Energy / Elemental V1
- StageBInputV1
- Remedy Engine contracts
- Report integrity / protected PDF / delivery gates
- Multi-floor isolation
