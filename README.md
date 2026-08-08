# Uchit Vastu Client CRM + Evaluation Engine

This repository scaffolds the v0.2 product surface for the Uchit Vastu workflow as of Saturday, August 8, 2026.

Included workflow coverage:

- ScoreApp-style conversational lead intake
- setter dashboard and 2-minute qualification call support
- commercial approval workflow with a ₹51,000 default package
- minimum ₹11,000 advance rule
- payment gates for case creation and verdict release
- floor workspace locking and regeneration flags
- utility-evaluation generation seeded from the residential tab CSV
- Shakti engine with 16-value ranking and tie-break handling
- Stage-A preview watermarking and full verdict release after approvals
- WhatsApp template library
- permanent client timeline

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your database and Supabase values.
3. Run `pnpm install`.
4. Run `pnpm dev`.
5. Open the app at `http://localhost:3003`.

## Environment

The local template expects:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

For Sites deployment, `.openai/hosting.json` declares:

- D1 binding: `DB`
- R2 binding: `R2`

## Data model

The Prisma schema lives in `prisma/schema.prisma` and includes the main domain objects requested in the PRD.

## Seed data

`pnpm seed` reads `data/residential-tab.csv` and seeds the utility rule table when a database URL is available.
