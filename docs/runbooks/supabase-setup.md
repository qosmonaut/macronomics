# Runbook: Create the Macronomics Supabase project (EU / Zurich)

Goal: a Supabase Postgres in the **EU (Zurich)** region, plus a `DATABASE_URL` for our
ingestion (and later the API). Our `createDb()` reads `DATABASE_URL`; without it, it falls back
to local pglite — so nothing here changes app code, only configuration. **Never commit the URL.**

> Verified against Supabase docs as of 2026-06-12. Exact dashboard labels can shift slightly.

## Prerequisites

- A GitHub (or email) login for https://supabase.com.
- This repo checked out; `pnpm install` done.

## Steps

1. **Create an account / organization** at https://supabase.com → **Sign in** → create an
   organization (any name, e.g. "Macronomics"). Free plan is fine to start.

2. **New project.** Click **New project** and set:
   - **Name:** `macronomics`
   - **Region:** **`Europe (Central EU - Zurich)` / `eu-central-2`** ← chosen for this project.
     This is the data-residency choice and is **permanent** (to change it you'd recreate + migrate).
     **Zurich keeps the data physically in Switzerland** — the strongest option for Swiss FADP.
   - **Database password:** generate a strong one and **save it in your password manager now.**
     You'll need it for the connection string and it isn't shown again in full.
   - Create, then wait ~1–2 min for provisioning.

3. **Get the connection string.** Click **Connect** (top bar) → the connection panel opens.
   Pick the **Shared Pooler → Transaction** option (port **6543**). Copy the URI; it looks like:

   ```
   postgres://postgres.<project-ref>:[YOUR-PASSWORD]@aws-<region>.pooler.supabase.com:6543/postgres
   ```

   Replace `[YOUR-PASSWORD]` with the password from step 2.

   **Why this one (not the others):**
   | Option | Port | Use | Notes |
   | --- | --- | --- | --- |
   | **Transaction pooler** ✅ | 6543 | our choice — serverless/short-lived | **IPv4-OK**; **no prepared statements** → our client already sets `prepare:false` |
   | Session pooler | 5432 (pooler host) | long-lived backend on IPv4 | one direct conn per client |
   | Direct | 5432 (`db.<ref>...`) | persistent VM, `pg_dump`, migrations | **IPv6-only** unless paid IPv4 add-on |

   We use the **transaction pooler** because it's IPv4-friendly and fits our short-lived
   connections; it requires `prepare:false`, which `packages/db/src/client.ts` already does.

4. **Put it in a local `.env`** at the repo root (the repo already git-ignores `.env`):

   ```bash
   # .env  — DO NOT COMMIT
   DATABASE_URL="postgres://postgres.<ref>:<your-password>@aws-<region>.pooler.supabase.com:6543/postgres"
   ```

   Quote it (the password may contain shell-special characters).

5. **Run migrations + seed** (migrations auto-apply on connect via our migrator):

   ```bash
   set -a; . ./.env; set +a   # load DATABASE_URL into the shell
   node services/ingestion/src/seed.ts --query milch --limit 20 --locales de
   ```

   Expected: `upserted N products` + a "Top by protein/CHF (queried from DB)" table — now from
   Supabase, not pglite.

6. **Verify in the dashboard:** Supabase → **Table Editor** → you should see `products`,
   `product_i18n`, `product_nutrition`, `product_metrics`, `ingestion_runs` populated.

## Security: sharing the connection string

The `DATABASE_URL` contains the **DB password** — treat it like a secret.

- **Preferred:** don't share it. You run the seed yourself (above) and just tell me the result.
- If you want me to run it: share via a **secret channel** (password manager item / 1Password
  link / `op`), **not** in chat or a commit. Rotate the DB password afterward (Project Settings →
  Database → Reset database password). Consider creating a **restricted Postgres role** for the
  app rather than using the default `postgres` superuser, before any production use.

## Free-plan caveats (current)

- **500 MB** database/project, **2 active projects**, **5 GB egress** (org-wide).
- **Free projects pause after ~1 week of inactivity** (just un-pause from the dashboard).
- **DPA (GDPR):** request the signable DPA from the dashboard's legal-documents page; Supabase
  publishes a TIA and holds SOC 2 Type 2 / ISO 27001. Data stays in the region you picked at
  creation — which is why step 2's region choice matters.

When you've got the project up, either paste the seed output here or hand me the `DATABASE_URL`
via a secret channel and I'll run the real ingestion and confirm the catalog + sort against Supabase.
