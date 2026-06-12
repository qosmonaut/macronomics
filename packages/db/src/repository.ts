import { computeMetrics, type Product } from "@macronomics/shared";

import type { Db } from "./client.ts";
import { productI18n, productMetrics, productNutrition, products } from "./schema.ts";

/**
 * Upsert one mapped product across the catalog tables (products, i18n, nutrition, metrics).
 * Idempotent: safe to re-run an ingestion over the same products.
 */
export async function upsertProduct(db: Db, p: Product): Promise<void> {
  await db
    .insert(products)
    .values({
      uid: p.uid,
      migrosId: p.migrosId,
      brand: p.brand,
      imageUrl: p.imageUrl,
      priceChf: p.price?.chf,
      pricePer100: p.price?.per100,
      pricePer100Unit: p.price?.per100Unit,
      quantity: p.price?.quantity,
    })
    .onConflictDoUpdate({
      target: products.uid,
      set: {
        migrosId: p.migrosId,
        brand: p.brand,
        imageUrl: p.imageUrl,
        priceChf: p.price?.chf,
        pricePer100: p.price?.per100,
        pricePer100Unit: p.price?.per100Unit,
        quantity: p.price?.quantity,
      },
    });

  for (const [locale, name] of Object.entries(p.names)) {
    if (!name) continue;
    await db
      .insert(productI18n)
      .values({ productUid: p.uid, locale, name })
      .onConflictDoUpdate({
        target: [productI18n.productUid, productI18n.locale],
        set: { name },
      });
  }

  if (p.nutrition) {
    await db
      .insert(productNutrition)
      .values({ productUid: p.uid, ...p.nutrition })
      .onConflictDoUpdate({ target: productNutrition.productUid, set: { ...p.nutrition } });

    const m = computeMetrics({ nutrition: p.nutrition, pricePer100: p.price?.per100 });
    await db
      .insert(productMetrics)
      .values({ productUid: p.uid, ...m })
      .onConflictDoUpdate({ target: productMetrics.productUid, set: { ...m } });
  }
}
