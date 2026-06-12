/**
 * Read queries for the synced catalog, powering the tRPC API (M2).
 *
 * Sorting is done in SQL with `WHERE <metric> IS NOT NULL` + `ORDER BY <metric> DESC`
 * (so NULLs never lead) and **keyset pagination** on `(metric, uid)` for stable, scalable
 * paging (ADR-0001 §4). All values come back per-100 g/ml; price metrics use Migros' unitPrice.
 */
import { and, asc, desc, eq, ilike, isNotNull, lt, or, sql } from "drizzle-orm";
import type {
  GetInput,
  ListInput,
  ProductList,
  ProductListItem,
  SearchInput,
} from "@macronomics/shared";

import type { Db } from "./client.ts";
import { productI18n, productMetrics, productNutrition, products } from "./schema.ts";

const METRIC_COLUMN = {
  proteinPer100: productMetrics.proteinPer100,
  proteinPerChf: productMetrics.proteinPerChf,
  proteinPerKcal: productMetrics.proteinPerKcal,
  proteinPerCarb: productMetrics.proteinPerCarb,
  proteinPerFat: productMetrics.proteinPerFat,
} as const;

/** Columns returned for list/search/detail; `metricValue` is aliased per query. */
const itemColumns = {
  uid: products.uid,
  name: productI18n.name,
  brand: products.brand,
  imageUrl: products.imageUrl,
  priceChf: products.priceChf,
  pricePer100: products.pricePer100,
  pricePer100Unit: products.pricePer100Unit,
  quantity: products.quantity,
  energyKcal: productNutrition.energyKcal,
  proteinG: productNutrition.proteinG,
  carbsG: productNutrition.carbsG,
  fatG: productNutrition.fatG,
};

/** Products sorted by a chosen metric (desc), keyset-paginated. */
export async function listProductsByMetric(db: Db, input: ListInput): Promise<ProductList> {
  const col = METRIC_COLUMN[input.metric];
  const cursorPredicate = input.cursor
    ? or(
        lt(col, input.cursor.value),
        and(eq(col, input.cursor.value), sql`${products.uid} > ${input.cursor.uid}`),
      )
    : undefined;

  const rows = await db
    .select({ ...itemColumns, metricValue: col })
    .from(productMetrics)
    .innerJoin(products, eq(products.uid, productMetrics.productUid))
    .innerJoin(
      productI18n,
      and(
        eq(productI18n.productUid, productMetrics.productUid),
        eq(productI18n.locale, input.locale),
      ),
    )
    .leftJoin(productNutrition, eq(productNutrition.productUid, productMetrics.productUid))
    .where(and(isNotNull(col), cursorPredicate))
    .orderBy(desc(col), asc(products.uid))
    .limit(input.limit + 1);

  const hasMore = rows.length > input.limit;
  const items = (hasMore ? rows.slice(0, input.limit) : rows) as ProductListItem[];
  const last = items.at(-1);
  const nextCursor =
    hasMore && last && last.metricValue !== null
      ? { value: last.metricValue, uid: last.uid }
      : null;
  return { items, nextCursor };
}

/** A single product by uid (metricValue = proteinPerChf for convenience). */
export async function getProduct(db: Db, input: GetInput): Promise<ProductListItem | null> {
  const rows = await db
    .select({ ...itemColumns, metricValue: productMetrics.proteinPerChf })
    .from(products)
    .innerJoin(
      productI18n,
      and(eq(productI18n.productUid, products.uid), eq(productI18n.locale, input.locale)),
    )
    .leftJoin(productNutrition, eq(productNutrition.productUid, products.uid))
    .leftJoin(productMetrics, eq(productMetrics.productUid, products.uid))
    .where(eq(products.uid, input.uid))
    .limit(1);
  return (rows[0] as ProductListItem | undefined) ?? null;
}

/** Free-text search on the localized product name (metricValue = proteinPerChf). */
export async function searchProducts(db: Db, input: SearchInput): Promise<ProductListItem[]> {
  const rows = await db
    .select({ ...itemColumns, metricValue: productMetrics.proteinPerChf })
    .from(products)
    .innerJoin(
      productI18n,
      and(eq(productI18n.productUid, products.uid), eq(productI18n.locale, input.locale)),
    )
    .leftJoin(productNutrition, eq(productNutrition.productUid, products.uid))
    .leftJoin(productMetrics, eq(productMetrics.productUid, products.uid))
    .where(ilike(productI18n.name, `%${input.q}%`))
    .limit(input.limit);
  return rows as ProductListItem[];
}
