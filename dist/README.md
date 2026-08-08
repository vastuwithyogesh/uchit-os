# Uchit Vastu Client CRM + Evaluation Engine

This repo scaffolds the v0.2 product surface for the Uchit Vastu workflow:

- ScoreApp-style conversational lead intake
- setter dashboard and 2-minute qualification call support
- commercial approval workflow with a ₹51,000 default package
- minimum ₹11,000 advance rule
- payment gates for case creation and verdict release
- floor workspace locking and regeneration flags
- utility-evaluation generator seeded from the residential tab CSV
- Shakti engine with 16-value ranking and tie-break handling
- preview watermarking and full verdict release after approvals
- WhatsApp template library
- permanent client timeline

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your Supabase and database values.
3. Run `pnpm install`.
4. Run `pnpm dev`.

## Data model

The Prisma schema lives in `prisma/schema.prisma` and includes the main domain objects requested in the PRD.

## Seed data

`pnpm seed` will read `data/residential-tab.csv` and seed the utility rule table when a database URL is available.
