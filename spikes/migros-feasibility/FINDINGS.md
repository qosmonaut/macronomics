# Migros feasibility — findings (M0)

Run date: **2026-05-31** · wrapper `migros-api-wrapper@1.1.37` · Node 24 · egress IP Zürich/CH.

## TL;DR

The free-tier premise is **confirmed**: from Node we can reach Migros, get a guest token,
search, and read **price + all four macros** for products. The paid-tier **recipe** premise
is **at risk**: the wrapper's Migusto method currently fails. Proceed to M1; treat recipes
as a separate feasibility item before committing the paid tier (M6).

## Results

| Check                            | Result | Notes                                                                                    |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Reachability (Node + axios)      | ✅     | `curl` gets HTTP 403 (bot protection); the wrapper's axios client gets through.          |
| Guest token (anonymous)          | ✅     | `MigrosAPI.account.oauth2.getGuestToken()` → JWT-like `token`.                           |
| Product search                   | ✅     | `searchProduct({query})` → `productIds` (100 for "milch") + facets.                      |
| Product price                    | ✅     | `offer.price.effectiveValue` (CHF) — 100% of sample.                                     |
| Price normalized per 100g/ml     | ✅     | `offer.price.unitPrice {value, unit}` provided by Migros — no manual normalization!      |
| Macros (energy/protein/carb/fat) | ✅     | `productInformation.nutrientsInformation.nutrientsTable` per 100 g/ml — 100% of sample.  |
| Migusto recipe macros            | ❌     | `migusto.recipeSearch` returned a non-JSON Spring error — method appears broken/changed. |

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

## Open follow-up (before M6 paid tier)

- Investigate the Migusto failure: is it params/headers, a moved endpoint, or removed from
  the wrapper? If recipes lack structured macros, the paid tier must **derive** them from
  ingredients (hard: free-text → product mapping) or use another recipe source.

> Raw API captures live in `output/` (git-ignored). Re-run with `pnpm spike:migros`.
