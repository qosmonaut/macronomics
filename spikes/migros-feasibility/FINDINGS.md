# Migros feasibility — findings (M0)

Run date: **2026-05-31** · wrapper `migros-api-wrapper@1.1.37` · Node 24 · egress IP Zürich/CH.

## TL;DR

The free-tier premise is **confirmed**: from Node we can reach Migros, get a guest token,
search, and read **price + all four macros** for products. The paid-tier **recipe** premise
is now **also confirmed** (resolved 2026-06-12, see below): Migusto recipe search + macros are
reachable with no login; the wrapper's failure was a single stale request field (`order`).

## Results

| Check                            | Result | Notes                                                                                                                        |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Reachability (Node + axios)      | ✅     | `curl` gets HTTP 403 (bot protection); the wrapper's axios client gets through.                                              |
| Guest token (anonymous)          | ✅     | `MigrosAPI.account.oauth2.getGuestToken()` → JWT-like `token`.                                                               |
| Product search                   | ✅     | `searchProduct({query})` → `productIds` (100 for "milch") + facets.                                                          |
| Product price                    | ✅     | `offer.price.effectiveValue` (CHF) — 100% of sample.                                                                         |
| Price normalized per 100g/ml     | ✅     | `offer.price.unitPrice {value, unit}` provided by Migros — no manual normalization!                                          |
| Macros (energy/protein/carb/fat) | ✅     | `productInformation.nutrientsInformation.nutrientsTable` per 100 g/ml — 100% of sample.                                      |
| Migusto recipe search + macros   | ✅     | search via `POST /.rest/recipes/v1` (drop `order`) → slugs; macros (kcal/protein/fat/carbs, per portion) on the detail page. |

### Proof of concept (live data, query "milch")

Sorting the sample by **protein per CHF** (per-100 basis) worked end-to-end, e.g. plain
`Milch` at 33.2 g protein/CHF vs `Vollmilch` at ~16–17. This is the core "sort by
characteristic" feature on real Migros data.

## What this means for M1 (the data pipeline)

- **Parsing is string-based.** Nutrient values are localized display strings, e.g.
  `"287 kJ (69 kcal)"`, `"3.2 g"`, label `"Eiweiss"`. M1's `packages/migros` mapper must:
  - extract kcal from the `kJ (… kcal)` energy string;
  - `parseFloat` gram values (handle `,`/`.` decimals);
  - map localized labels per language (DE: Energie/Fett/Kohlenhydrate/Eiweiss; +EN/FR/IT);
  - skip `davon …` sub-rows (saturated fat, sugar) when reading totals.
- **Use Migros' `unitPrice`** for the per-100 price basis instead of computing it; fall back
  to `effectiveValue ÷ quantity` only when `unitPrice` is absent.
- **Confirmed shapes** (for the mapper):
  - price: `offer.price.{effectiveValue, advertisedValue, unitPrice:{value,unit}}`, `offer.quantity`
  - nutrients: `productInformation.nutrientsInformation.nutrientsTable.{headers, rows:[{label, values[]}]}`
  - ids: search `productIds[]`; detail `getProductDetails({uids, language, region}, {leshopch})` → array of products.
- **Completeness caveat:** "milch" is nutrient-rich; M1 must measure completeness across
  diverse categories and mark products missing any macro as unsortable on that metric.

## Migusto recipes (resolved 2026-06-12)

The wrapper's `recipeSearch` failure was **not** a move, a login wall, or a bot block.
`/.rest/recipes/v1` is a JSON endpoint (proxying an upstream GraphQL service); the wrapper's
default body sends a stale `order: "RELEVANCE_DESC"` that the upstream rejects → HTTP 417
`GRAPHQL_PARSE_FAILED`. Bisecting the body confirmed `order` is the **sole** culprit
(`offset` / `uuids` / `language` / `searchTerm` are all accepted).

Working recipe pipeline (no login, no cookies — verified from Node, egress CH):

1. **Search** — `POST https://migusto.migros.ch/.rest/recipes/v1` with
   `{ recipeFilterUuid, limit, ingredients[], searchTerm? }` → `{ total, recipes:[{ slug, title, … }], aggregations }`.
   Ingredient IDs (e.g. `"14055874/"` = Poulet) come from the `/.rest/suggest/v1/…` autocomplete.
2. **Macros (per portion)** — `GET …/de/rezepte/{slug}`; parse the page's embedded German
   nutrition object (`'nährwertkcal'`, `'nährwerteiweiss'`, `'nährwertfett'`, `'nährwertkohlenhydrate'`)
   → **kcal, protein, fat, carbs** as clean integers. ⚠️ The schema.org JSON-LD on the same page
   **mislabels carbohydrates as `fiberContent`** (and exposes no real fibre), so do **not** trust its
   field names — parse the German keys. Verified: JSON-LD `fiberContent` == HTML `Kohlenhydrate` for
   every sample, and `4·protein + 9·fat + 4·carbs ≈ kcal`.

Caveats for M6: **no fibre** value is published; macros need **one extra request per recipe**
(cache at ingestion). Decision: [ADR-0002](../../docs/adr/0002-migusto-recipe-data-path.md).
Reproduce with `node src/explore-migusto.ts`.

> Raw API captures live in `output/` (git-ignored). Re-run with `pnpm spike:migros`.
