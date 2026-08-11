# Lovable-style leads and pipeline parity map

This is an implementation map, not a live integration. Lovable remains dormant and no source data is connected.

## Canonical ownership

| Capability | Current Uchit surface | Current source of truth | Lovable status |
| --- | --- | --- | --- |
| Lead identity and contact | `components/lead-inbox-console.tsx`, `app/api/optin-leads/route.ts` | Uchit `optInLeads` / `clients` | Future inbound origin only |
| Pipeline stage and next action | `components/crm-pipeline-board.tsx`, `client-pipeline-transition` | Uchit `clients.pipelineStage`, `pipelineTransitions` | Future event source; cannot override |
| Qualification and review | `components/crm-workbench.tsx`, `components/commercial-console.tsx` | Uchit qualification/proposal/booking records | Uchit-owned |
| Commercial terms and payments | `components/commercial-console.tsx`, `components/payment-proof-console.tsx` | Uchit proposals/payments/cases | Uchit-owned |
| Activity and audit | `components/crm-workbench.tsx`, `components/timeline-console.tsx` | Uchit timeline/audit | Lovable history is labelled source history only |
| Client conversion and case creation | `components/client-intake-form.tsx`, `components/commercial-console.tsx` | Uchit permanent Client ID and case gate | Never source-owned |

## Field mapping

The unified workspace normalises both native and future inbound records into a display projection. It never writes to Lovable.

| Display field | Uchit field | Future Lovable source | Authority |
| --- | --- | --- | --- |
| Name/contact | `clients.displayName`, `email`, `phone` or `optInLeads.fullName`, `email`, `phone` | `applications` contact fields | Uchit canonical after reconciliation |
| Source | `clients.source` / `optInLeads.sourceSystem` | Lovable source/environment | Provenance only |
| Client ID | `clients.id` / `optInLeads.convertedClientId` | `client_code` retained as external linkage | Uchit generated ID |
| Stage | `clients.pipelineStage` (legacy stage normalised) | source status/event | Uchit transition API |
| Next action | `clients.nextAction` | `lead_followups` candidate | Uchit accepts only through transition API |
| Due date | `clients.nextAction.dueAt` | follow-up due timestamp candidate | Uchit-owned after acceptance |
| History | `timelineEvents` | `lead_activities`, `lead_followups` | Separate labelled source history |
| Sync state | `optInLeads.syncStatus`, `lastSyncedAt` | integration event/outbox state | Server metadata |

## Stage mapping

Native pipeline stages remain authoritative: `NEW → CONTACTED → VSL_SENT → VSL_WATCHED → PAID_REVIEW_PENDING → PAID_REVIEW_BOOKED → FORM_PENDING → REVIEW_COMPLETED → QUALIFIED → PROPOSAL_SCOPE → WON → ONBOARDING → IN_DELIVERY → FOLLOW_UP → CLOSED_REFERRAL`. `DISQUALIFIED` is only reachable from legitimate qualification states. Unknown or ambiguous source stages remain `REVIEW_REQUIRED`; they are never guessed into a commercial or case state.

## Integration boundary

The signed wrapper is intentionally dormant:

- `app/api/integrations/lovable/events/route.ts` validates the envelope but returns `503` until explicit activation.
- `app/api/integrations/lovable/reconcile/route.ts` is SUPER_ADMIN-only and remains fail-closed.
- `lib/lovable-wrapper.server.ts` prevents live mutation by design.

Before any Lovable leads appear, the approved environment must complete the activation checklist, D1 v9 migration/backfill rehearsal, signed smoke test, identity reconciliation/quarantine, source-history import and retry/dead-letter monitoring. No live activation or D1 migration is part of the v6 UI slice.

