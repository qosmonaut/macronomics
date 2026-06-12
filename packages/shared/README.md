# packages/shared

Cross-cutting domain code shared across the monorepo (a single source of truth for types).

- Domain types: `Product`, `Nutrition`, `Price`, `Locale` (EN/DE/FR/IT).
- Sort-metric math: `computeMetric` / `computeMetrics` — protein per 100, per CHF, per kcal,
  per carb, per fat (used by ingestion to fill `product_metrics`, and later by the API to sort).
- Tests: `src/metrics.test.ts` (`node --test`).

**Later (M2):** zod schemas + the exported tRPC router type will live here too.
