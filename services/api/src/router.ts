import { getProduct, listProductsByMetric, searchProducts } from "@macronomics/db";
import { getInputSchema, listInputSchema, searchInputSchema } from "@macronomics/shared";

import { publicProcedure, router } from "./trpc.ts";

/**
 * The app↔server contract. Read-only product queries over the synced catalog.
 * Versioned at the transport level (`/trpc/v1`); keep changes additive (ADR-0001 §7).
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "macronomics-api" })),
  product: router({
    /** Products sorted by a characteristic (protein/CHF, protein/kcal, …), keyset-paginated. */
    list: publicProcedure
      .input(listInputSchema)
      .query(({ ctx, input }) => listProductsByMetric(ctx.db, input)),
    /** A single product by Migros uid. */
    get: publicProcedure.input(getInputSchema).query(({ ctx, input }) => getProduct(ctx.db, input)),
    /** Free-text search on the localized product name. */
    search: publicProcedure
      .input(searchInputSchema)
      .query(({ ctx, input }) => searchProducts(ctx.db, input)),
  }),
});

export type AppRouter = typeof appRouter;
