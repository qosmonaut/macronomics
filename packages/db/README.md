# packages/db

Drizzle schema, migrations, and client for the synced Migros catalog.

- **Schema** (`src/schema.ts`): `products`, `product_i18n`, `product_nutrition`, denormalized
  `product_metrics` (indexed sort ratios), `ingestion_runs`. _(later: `profiles`,
  `macro_targets`, `favorites`, `entitlements`.)_
- **Client** (`src/client.ts`): `createDb()` — postgres-js → Supabase EU pooler when
  `DATABASE_URL` is set (`prepare: false`), else embedded **pglite** for local dev/tests.
  See [ADR-0003](../../docs/adr/0003-local-dev-database-and-migrations.md).
- **Repository** (`src/repository.ts`): `upsertProduct()` (idempotent across the catalog tables).

```bash
pnpm --filter @macronomics/db run db:generate   # regenerate SQL migrations from schema
```

Migrations live in `migrations/` (committed, applied by the Drizzle migrator).
