# Founder CRM information architecture

The Founder edition now has four focused workspaces:

1. **Leads / Opt-ins** (`/crm`) — searchable table with a profile drawer. The drawer keeps Summary, Intake, Timeline, Follow-ups and Commercial context together and sends the operator to the canonical pipeline for a stage move.
2. **Lead Pipeline** (`/lead-pipeline`) — acquisition and qualification stages only. Every move uses `client-pipeline-transition`; there is no optimistic stage commit or owner override.
3. **Clients & Cases** (`/clients-cases`) — one card per active case/project grouped under the permanent Client ID. Floor progress, payment state and report state remain case-scoped; reports are never merged across floors.
4. **Evaluation** — the existing Founder sequential flow and evaluation route. One current module is shown at a time, with server-derived gates and recovery links.

Lovable remains a dormant source adapter. No direct Lovable writes, live sync, backfill, D1 v9 migration or client delivery are enabled. Private contact values, source record IDs and technical provenance remain behind Details/history disclosures.
