# packages/migros

Adapter over [`migros-api-wrapper`](https://github.com/aliyss/migros-api-wrapper) that
isolates the rest of the app from Migros' churn.

- `MigrosClient`: cached guest token + request **throttle** (min interval between calls);
  `searchProductIds(query)` and `getProducts(uids, { locales })` (one upstream call per locale,
  names merged; nutrition/price from the first locale).
- `mappers`: `parseProduct` / `parsePrice` / `parseNutrition` — port the response shapes
  confirmed by the M0 spike (`spikes/migros-feasibility/FINDINGS.md`), including the localized
  nutrient string parsing (`"287 kJ (69 kcal)"`, `"3.2 g"`, DE labels, skipping `davon …` rows).
- Hermetic mapper test (`src/mappers.test.ts`, `node --test`).

**Deferred** (future): exponential backoff/retry, recorded-fixture contract tests + an
upstream-shape canary, and recipe (Migusto) methods per [ADR-0002](../../docs/adr/0002-migusto-recipe-data-path.md).
