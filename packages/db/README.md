# packages/db

**Milestone: M1.** Drizzle schema, migrations, and client for Supabase Postgres (EU).

Tables: `products`, `product_i18n`, `product_nutrition`, denormalized `product_metrics`
(indexed ratios for sorting), `ingestion_runs`; later `profiles`, `macro_targets`,
`favorites`, `entitlements`. Connects via the Supabase pooler (transaction mode,
`prepare: false`).

_Placeholder — scaffolded in M1._
