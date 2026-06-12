# Spike: Migros feasibility (M0)

**Throwaway** experiment. Its only job is to answer, before we build any infrastructure:

1. **Reachability** — can Node + `migros-api-wrapper` get past Migros' bot protection
   (a bare `curl` gets HTTP 403 even from a Swiss IP — see ADR-0001)?
2. **Guest token** — does the anonymous OAuth2 guest-token flow work?
3. **Product data completeness** — for a sample of products, do we get **price** and the
   four macros we sort on (**energy/kcal, protein, carbohydrate, fat**)? What fraction is
   complete and normalizable to per-100g/ml?
4. **Recipe macros** — do Migusto recipes expose **per-serving macros** (the paid-tier premise)?

## Run

```bash
pnpm install
pnpm spike:migros
# or, from this directory:
pnpm start
```

Raw API captures are written to `output/` (git-ignored) for inspection; the script prints
a structured summary and exits non-zero if reachability fails.

## Interpreting results

- ✅ reachable + mostly complete macros + recipe macros → proceed to M1 as planned.
- ⚠️ reachable but sparse nutrition → M1 must add a fallback source (e.g. Open Food Facts)
  and mark incomplete products as unsortable on the affected metrics.
- ❌ blocked (403/empty) from Node too → bot protection defeats direct access; revisit
  sourcing (hosted browser/proxy, different client, or contacting Migros) before M1.

This package is expected to be deleted (or archived) once M1's `packages/migros` adapter
exists.
