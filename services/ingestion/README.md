# services/ingestion

**Milestone: M1.** Migros catalog sync. Starts as a **local seed script** → Supabase (EU);
later a Fly.io scheduled machine. Idempotent, resumable, rate-limited; normalizes nutrition
to per-100 g/ml and writes `products` / `product_i18n` / `product_nutrition` / `product_metrics`.

Uses `packages/migros` (the adapter), not the wrapper directly.

_Placeholder — scaffolded in M1._
