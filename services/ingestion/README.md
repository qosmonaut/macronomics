# services/ingestion

Migros catalog sync. Today: a **local seed script** (`src/seed.ts`); later a Fly.io scheduled
machine. Uses `@macronomics/migros` (adapter) → maps/normalizes → upserts via `@macronomics/db`.

```bash
# fetch + map + print the protein/CHF ranking, no database:
node services/ingestion/src/seed.ts --dry-run --query milch --limit 10

# full pipeline into a database (pglite if no DATABASE_URL, else that Postgres):
node services/ingestion/src/seed.ts --query milch --limit 12 --locales de
DATABASE_URL=postgres://… node services/ingestion/src/seed.ts --query poulet --limit 50
```

Flags: `--query` (search term), `--limit`, `--locales` (csv: de,fr,it,en), `--dry-run`.
Writes an `ingestion_runs` audit row and reads back the top products by protein/CHF.

**Deferred:** resumable checkpointing, category-wide crawl, scheduled runs (later in M1/M2).
