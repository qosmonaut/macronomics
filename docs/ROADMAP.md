# Macronomics — Roadmap

Iterative path from prototype to published app. Each milestone is a small set of
reviewable commits. Stack rationale: [`docs/adr/0001-initial-technology-stack.md`](adr/0001-initial-technology-stack.md).

Legend: ✅ done · 🚧 in progress · ⬜ planned

## M0 — Scaffold & docs ✅

- ✅ Monorepo (pnpm + Turborepo), TS strict, ESLint/Prettier, Conventional Commits, CI-ready config.
- ✅ Docs: ADR-0001, this roadmap, CONTRIBUTING, expanded README.
- ✅ **Feasibility spike** (`spikes/migros-feasibility`, see its
  [FINDINGS.md](../spikes/migros-feasibility/FINDINGS.md)):
  - ✅ Node + the wrapper reaches Migros (curl is 403; axios gets through), guest token works.
  - ✅ Products expose **price + all four macros** (100% of the sample); Migros even returns a
    normalized per-100 `unitPrice`. The "sort by protein/CHF" feature was proven on live data.
  - ✅ Migusto **recipes** resolved (2026-06-12, [ADR-0002](adr/0002-migusto-recipe-data-path.md)):
    the wrapper's failure was a stale `order` field; `POST /.rest/recipes/v1` (minus `order`)
    returns recipes + slugs, and macros come from the detail page's embedded German nutrition keys (not the JSON-LD field names).
- **Gate result:** free-tier **and** paid-tier (recipe) premises **confirmed → proceed to M1**.
  M6 note: recipe macros (kcal/protein/fat/carbs, per portion) come from the detail page's German
  nutrition keys; the JSON-LD mislabels carbs as `fiberContent` and no real fibre is published.

## M1 — Data pipeline ⬜

- `packages/migros`: adapter over the wrapper — guest-token cache, token-bucket rate
  limiter, exponential backoff, response → domain mappers, contract tests with recorded
  fixtures, a canary that flags upstream shape changes.
- `packages/db`: Drizzle schema + migrations — `products`, `product_i18n`,
  `product_nutrition`, denormalized `product_metrics` (indexed ratios), `ingestion_runs`.
- `services/ingestion`: **local seed script** → Supabase (EU). Idempotent, resumable,
  unit-normalized (per-100g/ml; price normalized to the same basis).
- **Legal/ToS sanity check** on commercial use of Migros data (pulled forward).

## M2 — tRPC API ⬜

- `services/api`: Hono + tRPC; product `list`/`search`/`sortBy(metric)` reading Postgres
  via the **Supabase pooler** (`prepare: false`). `/trpc/v1` path; rate limiting.
- `packages/shared`: zod schemas + exported router type.
- Deploy to **Fly.io (Zürich)**; decide scale-to-zero vs one warm machine.

## M3 — Prototype app (the agreed MVP) ⬜

- `apps/mobile`: Expo + Expo Router + NativeWind; browse + sort UI; tRPC client +
  TanStack Query; i18n scaffolding (EN first). Runs on **web, iOS, Android**. No accounts.

## M4 — Free-tier polish ⬜

- Search, category nav, filters, product detail, all sort ratios, keyset pagination,
  loading/empty/error states, full **EN/DE/FR/IT**.

## M5 — Accounts ⬜

- Supabase Auth; favorites / saved sorts. Authz enforced in **tRPC middleware**.
- Privacy groundwork (FADP/GDPR): data export/delete, consent.

## M6 — Paid tier ⬜

- Custom macro profiles (protein/fat/carb/kcal targets); ingredient + Migusto-recipe
  matching (recipe data path: [ADR-0002](adr/0002-migusto-recipe-data-path.md)); **RevenueCat**
  entitlements (App Store / Play / Stripe-web).
- **Gate:** resolve the Migros commercial ToS question before charging.

## M7 — Launch ⬜

- Store assets, privacy policy, EAS build/submit, web deploy, monitoring/observability.
- Budget: Apple Developer ($99/yr), Google Play ($25 once), EAS, Supabase/Fly tiers.

## Cross-cutting (every milestone)

- Conventional Commits; ADR for each significant decision; README per package.
- Secrets only via env / Fly secrets / Supabase — never committed.
- Respect Migros: cache aggressively, low request volume, attribution, graceful degradation.
