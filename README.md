# Uchit Vastu Client CRM + Evaluation Engine

This repository scaffolds the Uchit Vastu workflow and now serves as the canonical GitHub source for Uchit OS engineering governance and production development.

Included workflow coverage:

- ScoreApp-style conversational lead intake
- setter dashboard and qualification-call support
- governed commercial approval workflow
- advance/payment gates for case creation and verdict release
- floor workspace locking and regeneration flags
- utility-evaluation generation
- Shakti / directional evaluation foundations
- Stage-A preview and governed report release
- communication preparation
- permanent client timeline and audit history

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in the required environment values for the target environment.
3. Run `pnpm install`.
4. Run `pnpm dev`.

## Deployment environment

For Sites deployment, `.openai/hosting.json` declares the hosted bindings used by the application, including D1 and R2 where configured.

## Engineering governance

All agents and contributors must read `PRODUCT_CONSTITUTION.md`, `AGENTS.md`, `ARCHITECTURE_RULES.md`, `AUTONOMY_POLICY.md`, `SECURITY_POLICY.md`, `TESTING_POLICY.md`, and `RELEASE_POLICY.md` before modifying protected behavior.

## Release verification

`pnpm test:release` is the canonical broad release gate and is executed by the GitHub Actions release workflow for pull requests and pushes to `main`.
