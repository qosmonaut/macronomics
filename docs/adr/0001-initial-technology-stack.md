# ADR 0001 — Initial technology stack

- **Status:** Accepted
- **Date:** 2026-05-31
- **Deciders:** Project owner (@qosmonaut), with options analysis by the assistant
- **Reviewers:** Project owner, OpenAI Codex

## Context

Macronomics is a cross-platform app (Android, iOS, web) for a Swiss audience that
tracks and compares the macronutrients of supermarket products. It sources product
data (price, nutrition) from **Migros** via the community
[`migros-api-wrapper`](https://github.com/aliyss/migros-api-wrapper) (TypeScript, MIT),
lets users **sort products by characteristics** (protein, protein/carb, protein/fat,
protein/kcal, protein/price, …), and offers a **paid tier** with custom macronutrient
profiles plus ingredient/recipe suggestions that match a target profile.

Constraints and forces:

- One small team, strongest in **TypeScript/React** and backend; **new to mobile**.
- Migros' API is **undocumented, unofficial, and changes often**; some endpoints work
  via anonymous guest tokens, others need a real login. There are likely rate limits
  and **bot protection** (see Consequences). Building a _paid_ product on it carries
  ToS/legal risk to be resolved before monetization.
- Swiss audience ⇒ localization in **EN/DE/FR/IT** and **Swiss FADP / EU GDPR** duties.
- Want low idle cost and an iterative path from prototype to published app.

## Decision

| Concern             | Decision                                                         | Key alternatives considered                 |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Cross-platform UI   | **Expo (React Native) + React Native Web**                       | Flutter; PWA/Next-only                      |
| Styling             | **NativeWind (Tailwind for RN)**                                 | Tamagui; React Native Paper                 |
| App↔API contract    | **tRPC** (over **Hono** for host portability)                    | REST + zod + OpenAPI                        |
| Backend host        | **Fly.io**, **Zürich** region, scale-to-zero machine             | Railway; Supabase Edge; Hetzner; Vercel     |
| DB / Auth / Storage | **Supabase**, **EU (Frankfurt)** region                          | Firebase; custom Postgres                   |
| ORM                 | **Drizzle**                                                      | Prisma; supabase-js only                    |
| Migros access       | Wrapper behind our **adapter** (token mgmt, rate limit, mappers) | Call Migros directly from client (rejected) |
| Catalog strategy    | **Sync into Postgres**; serve/sort from our DB                   | On-demand fetch+cache; hybrid               |
| Repo                | **Monorepo** (pnpm + Turborepo)                                  | Multi-repo; single app + /server            |
| i18n                | **i18next** + `expo-localization` (EN/DE/FR/IT)                  | LinguiJS; FormatJS                          |
| Payments (later)    | **RevenueCat** (App Store / Play / Stripe-web)                   | Per-platform IAP + Stripe by hand           |

### Rationale highlights

- **TS end-to-end** keeps one language across app, API, ingestion, and shared schemas;
  the Migros wrapper is already TS/Node.
- **tRPC** gives the single TS client fully-typed calls with zero codegen and pairs with
  TanStack Query. We accept its coupling because there is one first-party client; a
  REST/OpenAPI surface can be generated later if third parties need access.
- **Hono** hosts the tRPC handler and runs unchanged on Node, Fly, Vercel, Cloudflare,
  Bun, and Deno — so the **host choice is reversible**.
- **Fly.io (Zürich)** scales to zero (low idle cost), runs the Node wrapper natively, and
  keeps compute in-region for **data residency**. Supabase is pinned to **EU (Frankfurt)**.
- **Catalog sync into Postgres** is required for the core feature: Migros search cannot
  sort by arbitrary derived ratios (protein/price, protein/kcal) across the catalog.

## Consequences

### Positive

- Single language and shared zod types across the stack; fast iteration.
- Low idle cost; EU/CH data residency from day one (chosen explicitly).
- Migros churn is contained behind one adapter; the app reads a stable contract.

### Negative / risks (tracked; see ROADMAP and pitfall review)

1. **Migros bot protection is real.** From a Swiss IP, `https://www.migros.ch/` returns
   **HTTP 403** even to browser-like headers — a signature consistent with **Akamai-style
   TLS/HTTP fingerprinting**, not geo/header checks. Whether Node + the wrapper's
   guest-token/cookie flow gets through is the subject of the **feasibility spike**
   (`spikes/migros-feasibility`). This is the single biggest premise risk.
2. **Single-source dependency** on an unofficial API = the whole app can go dark if Migros
   blocks us or changes shape. Mitigation now: adapter + heavy caching. Deferred option:
   add Open Food Facts as fallback/augmentation (owner chose Migros-only for the prototype).
3. **Commercial ToS/legal** exposure of selling access atop Migros data — legal sanity
   check pulled forward to **M1**; keep free vs paid value cleanly separable.
4. **Cross-table ratios** (price × nutrition) cannot be Postgres _generated columns_; they
   need a denormalized `product_metrics` table/materialized view refreshed at ingestion.
5. **Unit normalization** (per-100g/ml vs per-package price) must happen at ingestion or
   ratios are meaningless; unnormalizable products are excluded from those sorts.
6. **Serverless + Postgres** ⇒ use the **Supabase pooler (Supavisor, transaction mode)**
   with Drizzle (`prepare: false`) to avoid connection storms.
7. **tRPC versioning:** old installed app versions persist ⇒ additive-only changes and a
   `/trpc/v1` path; rate-limit/abuse-protect the public free-tier API.
8. **Auth (M5):** Drizzle uses a privileged connection (bypasses RLS) ⇒ enforce authz in
   **tRPC middleware**; keep the service-role key server-only.
9. **4-language ingestion** multiplies Migros calls ⇒ fetch names per locale, nutrition once.
10. **Expo + pnpm + Metro** symlink quirks ⇒ `node-linker=hoisted` + Metro `watchFolders`.
11. **Expo web** is app-style, not desktop-grade; a Next.js web app sharing packages can be
    added later if needed.
12. **Scale-to-zero cold starts** (~1–3 s on wake) ⇒ consider `min_machines_running=1` at deploy.

## Follow-up

Subsequent significant decisions get their own ADRs (`docs/adr/000N-*.md`). The build
sequence and milestone gates are in [`docs/ROADMAP.md`](../ROADMAP.md).
