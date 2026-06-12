# ADR 0002 — Migusto recipe data path

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Project owner (@qosmonaut)
- **Reviewers:** Project owner, OpenAI Codex
- **Relates to:** [ADR-0001](0001-initial-technology-stack.md); spike
  [`spikes/migros-feasibility`](../../spikes/migros-feasibility/FINDINGS.md)

## Context

The paid tier (M6) suggests recipes that match a macro profile, so it needs Migusto
**recipe search** and **per-recipe macros**. The M0 spike found `migros-api-wrapper`'s
`migusto.recipeSearch` failing with a non-JSON `org.spring…` body, which we initially
suspected was a moved endpoint, a login requirement, or bot protection.

A DevTools capture of the live site plus a request-body bisect (see the spike's
`explore-migusto.ts` / FINDINGS.md) established the real cause:

- `https://migusto.migros.ch/.rest/recipes/v1` still exists, takes **plain JSON** (it proxies
  an upstream GraphQL service), and needs **no login and no cookies** (the public site and the
  endpoint both answer anonymously from a Swiss IP).
- The wrapper fails **only** because its default body includes a stale field
  `order: "RELEVANCE_DESC"` that the upstream no longer accepts → HTTP 417 `GRAPHQL_PARSE_FAILED`.
  Removing `order` returns `200` with `{ total, recipes:[{ slug, … }], aggregations }`.
- Recipe **macros (per portion)** are not in the search response but are on each recipe **detail
  page**, in an embedded German nutrition object (`'nährwertkcal'`, `'nährwerteiweiss'`,
  `'nährwertfett'`, `'nährwertkohlenhydrate'`) → kcal, protein, fat, **carbs**. ⚠️ The schema.org
  JSON-LD on the same page **mislabels carbohydrates as `fiberContent`** and publishes no real
  fibre — verified: JSON-LD `fiberContent` == HTML `Kohlenhydrate`, and `4·P + 9·F + 4·C ≈ kcal`.

## Decision

For the recipe features we will **not rely on the wrapper's `recipeSearch`**. Instead, in the
M1/M6 `packages/migros` adapter:

1. **Search:** `POST /.rest/recipes/v1` directly with a minimal, current body
   `{ recipeFilterUuid, limit, ingredients[], searchTerm? }` (never send `order`). Resolve
   ingredient IDs via the `/.rest/suggest/v1/…` autocomplete when filtering by ingredient.
2. **Macros:** fetch each recipe's detail page by `slug` and parse the **embedded German
   nutrition keys** (`nährwertkcal` / `nährwerteiweiss` / `nährwertfett` / `nährwertkohlenhydrate`),
   not the JSON-LD field names. This yields kcal + protein + fat + carbs per portion as integers.
   Do **not** read the JSON-LD `fiberContent` (it is actually the carbohydrate value).

## Consequences

- ✅ Paid-tier recipe premise is **viable** with public, anonymous endpoints.
- One **extra request per recipe** for macros → cache aggressively at ingestion (M6), don't
  fetch per user request.
- Full **protein/fat/carbs/kcal per portion** are available (no derivation needed); **fibre is
  not published**. The macro-profile matching (M6) has the inputs it needs.
- Same upstream-churn risk as products → cover the recipe calls with the adapter's contract
  tests + canary (ADR-0001 §13). If Migros changes the body contract again, only the adapter
  changes.
- Optional good-citizen follow-up (not done): upstream issue/PR to drop the stale `order`
  default and expose `nutrition` in the wrapper. Outward-facing — only on explicit approval.
