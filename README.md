# Macronomics

Cross-platform app (Android, iOS, web) to **track and compare the macronutrients of
supermarket products** for a Swiss audience. It sources product data from **Migros**,
sorts products by characteristics (protein, protein/carb, protein/fat, protein/kcal,
**protein/price**, …), and — in a paid tier — lets users define custom macronutrient
profiles and suggests ingredients and recipes that match them.

> **Data source disclaimer:** product data is sourced from Migros via the unofficial,
> community [`migros-api-wrapper`](https://github.com/aliyss/migros-api-wrapper).
> Macronomics is **not** affiliated with or endorsed by Migros.

## Status

🚧 Early development — **M1 (data pipeline)**; M0 (scaffold + feasibility spike) complete. See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack

| Layer                 | Choice                                             |
| --------------------- | -------------------------------------------------- |
| App (Android/iOS/web) | Expo (React Native) + React Native Web, NativeWind |
| API                   | tRPC over Hono                                     |
| Backend host          | Fly.io (Zürich), scale-to-zero                     |
| DB / Auth / Storage   | Supabase (EU / Frankfurt)                          |
| ORM                   | Drizzle                                            |
| Localization          | i18next (EN / DE / FR / IT)                        |
| Repo                  | pnpm + Turborepo monorepo                          |

Full rationale and alternatives: [`docs/adr/0001-initial-technology-stack.md`](docs/adr/0001-initial-technology-stack.md).

## Repository layout

```
apps/      # mobile (Expo) — Android, iOS, web
services/  # api (Hono+tRPC), ingestion (Migros sync)
packages/  # migros (adapter), db (Drizzle), shared (zod/types), i18n
spikes/    # throwaway experiments (e.g. Migros feasibility)
docs/      # ADRs, roadmap, contributing
```

## Getting started

```bash
corepack enable          # use the pinned pnpm
pnpm install
pnpm spike:migros        # M0: probe whether Migros data is usable from Node
```

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the dev workflow and commit
conventions.

## License

TBD.
