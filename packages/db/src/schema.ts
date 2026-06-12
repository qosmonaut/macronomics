/**
 * Drizzle schema for the synced Migros catalog (M1).
 *
 * Design notes (see ADR-0001 §4–5):
 * - Nutrition is stored per-100 g/ml; price keeps Migros' own per-100 `unitPrice`.
 * - Sort ratios live in a denormalized `product_metrics` table (NOT generated columns,
 *   since they combine price × nutrition across tables) refreshed at ingestion, and are
 *   indexed for fast `ORDER BY` + keyset pagination.
 */
import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  uid: text("uid").primaryKey(),
  migrosId: text("migros_id"),
  brand: text("brand"),
  imageUrl: text("image_url"),
  priceChf: doublePrecision("price_chf"),
  pricePer100: doublePrecision("price_per_100"),
  pricePer100Unit: text("price_per_100_unit"),
  quantity: text("quantity"),
  raw: jsonb("raw"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});

export const productI18n = pgTable(
  "product_i18n",
  {
    productUid: text("product_uid")
      .notNull()
      .references(() => products.uid, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 2 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => [primaryKey({ columns: [t.productUid, t.locale] })],
);

export const productNutrition = pgTable("product_nutrition", {
  productUid: text("product_uid")
    .primaryKey()
    .references(() => products.uid, { onDelete: "cascade" }),
  basis: text("basis").notNull(), // "100g" | "100ml"
  energyKcal: doublePrecision("energy_kcal"),
  proteinG: doublePrecision("protein_g"),
  carbsG: doublePrecision("carbs_g"),
  fatG: doublePrecision("fat_g"),
  sugarsG: doublePrecision("sugars_g"),
  saturatedFatG: doublePrecision("saturated_fat_g"),
  fibreG: doublePrecision("fibre_g"),
  saltG: doublePrecision("salt_g"),
});

export const productMetrics = pgTable(
  "product_metrics",
  {
    productUid: text("product_uid")
      .primaryKey()
      .references(() => products.uid, { onDelete: "cascade" }),
    proteinPer100: doublePrecision("protein_per_100"),
    proteinPerChf: doublePrecision("protein_per_chf"),
    proteinPerKcal: doublePrecision("protein_per_kcal"),
    proteinPerCarb: doublePrecision("protein_per_carb"),
    proteinPerFat: doublePrecision("protein_per_fat"),
  },
  (t) => [
    index("idx_metrics_protein_per_100").on(t.proteinPer100),
    index("idx_metrics_protein_per_chf").on(t.proteinPerChf),
    index("idx_metrics_protein_per_kcal").on(t.proteinPerKcal),
    index("idx_metrics_protein_per_carb").on(t.proteinPerCarb),
    index("idx_metrics_protein_per_fat").on(t.proteinPerFat),
  ],
);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: text("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  status: text("status").notNull(), // "running" | "ok" | "error"
  query: text("query"),
  productsUpserted: integer("products_upserted").notNull().default(0),
  note: text("note"),
});
