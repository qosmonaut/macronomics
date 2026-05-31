# packages/migros

**Milestone: M1.** Adapter over [`migros-api-wrapper`](https://github.com/aliyss/migros-api-wrapper).
Isolates the rest of the app from Migros' churn and provides:

- cached guest-token management;
- a token-bucket rate limiter + exponential backoff;
- mappers from raw Migros responses → our domain types (see the spike's FINDINGS.md for the
  confirmed response shapes and the string-parsing rules for localized nutrient values);
- contract tests against recorded fixtures + a canary for upstream shape changes.

_Placeholder — scaffolded in M1._
