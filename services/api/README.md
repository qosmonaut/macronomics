# services/api

Hono server hosting **tRPC at `/trpc/v1`** — the read API over the synced Migros catalog.

## Procedures (`appRouter`)

- `health` → `{ ok: true }`
- `product.list({ metric, locale, limit, cursor? })` — products sorted by a characteristic
  (`proteinPerChf` | `proteinPerKcal` | `proteinPerCarb` | `proteinPerFat` | `proteinPer100`),
  **keyset-paginated** (`nextCursor`). NULL metrics excluded, ordered in SQL.
- `product.get({ uid, locale })` — one product.
- `product.search({ q, locale, limit })` — name search (ILIKE).

Inputs are the zod schemas in `@macronomics/shared`; queries live in `@macronomics/db`.
The exported `AppRouter` type is what the app (M3) imports for end-to-end typing.

## Run locally

```bash
# against Supabase (EU/Zurich) when DATABASE_URL is set, else embedded pglite:
node services/api/src/index.ts
curl localhost:8787/health
curl "localhost:8787/trpc/v1/product.list?input=%7B%22metric%22%3A%22proteinPerChf%22%2C%22limit%22%3A3%7D"
```

`node --test` covers the router against pglite (`src/router.test.ts`).

## Deploy (Fly.io, Zurich — deferred until `fly` is authed)

`Dockerfile` + `fly.toml` are ready (scale-to-zero, `/health` check). See the header of
`fly.toml` for the exact `fly launch` / `fly secrets set DATABASE_URL=…` / `fly deploy` steps.
**Not yet deployed** — needs a Fly account; the Docker build hasn't been run in this environment.

**Notes:** versioned at `/trpc/v1` (keep changes additive); a minimal in-memory rate limiter
guards the public free-tier API (swap for a shared store if scaled horizontally).
