# Contributing to Macronomics

## Prerequisites

- Node `>=20` (repo pins `24.14.1` in `.node-version`)
- pnpm `11.5.0` (via Corepack: `corepack enable`)

## Setup

```bash
pnpm install        # installs all workspaces; sets up git hooks (husky)
```

## Common scripts (run from the repo root)

```bash
pnpm typecheck      # turbo run typecheck across packages
pnpm lint           # eslint across packages
pnpm test           # tests across packages
pnpm format         # prettier --write
pnpm spike:migros   # run the Migros feasibility spike (M0)
```

## Monorepo layout

```
apps/        # end-user apps (mobile = Expo: Android, iOS, web)
services/    # deployable backends (api = Hono+tRPC, ingestion = Migros sync)
packages/    # shared libraries (migros adapter, db, shared schemas, i18n)
spikes/      # throwaway experiments that validate assumptions
docs/        # ADRs, roadmap, this guide
```

## Git workflow

- Branch off `main`: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- **Conventional Commits** are enforced by commitlint on `commit-msg`:
  `type(scope): summary`, e.g. `feat(api): add product sort endpoint`.
  Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`.
- `pre-commit` runs lint-staged (Prettier + ESLint) on staged files.
- Keep commits small and reviewable (reviewed by the owner and OpenAI Codex).
- Significant/irreversible decisions get an ADR in `docs/adr/`.

## Secrets

Never commit secrets. Copy `.env.example` (added per service) to `.env`. Production
secrets live in Fly secrets / Supabase — not in the repo.

## Migros API etiquette

The Migros API is undocumented and rate-limited. When touching `packages/migros` or
ingestion: cache aggressively, keep request volume low, back off on errors, and never
hammer the upstream from tests (use recorded fixtures).
