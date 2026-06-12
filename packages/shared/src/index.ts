/**
 * Shared domain types + sort-metric math for Macronomics.
 *
 * These are the stable contract between ingestion (which computes metrics) and the
 * API (which sorts by them). Nutrition is always normalized to a per-100 g/ml basis;
 * price metrics use Migros' own per-100 `unitPrice` (see ADR-0002 / the M0 spike).
 */

export const LOCALES = ["en", "de", "fr", "it"] as const;
export type Locale = (typeof LOCALES)[number];

/** Whether a per-100 basis is grams (solids) or millilitres (liquids). */
export type Basis = "100g" | "100ml";

/** Nutrition values normalized to a per-100 (g or ml) basis. */
export interface Nutrition {
  basis: Basis;
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarsG?: number;
  saturatedFatG?: number;
  fibreG?: number;
  saltG?: number;
}

export interface Price {
  /** Package price in CHF (Migros `offer.price.effectiveValue`). */
  chf: number;
  /** Price per 100 g/ml (Migros `offer.price.unitPrice.value`), CHF. */
  per100: number;
  /** Unit of the per-100 price, e.g. "100g" | "100ml". */
  per100Unit: string;
  /** Human display quantity, e.g. "1l", "500g". */
  quantity?: string;
}

export interface Product {
  /** Migros product uid (stable identifier). */
  uid: string;
  migrosId?: string;
  brand?: string;
  /** Localized display names by locale (from Migros, already localized). */
  names: Partial<Record<Locale, string>>;
  imageUrl?: string;
  price?: Price;
  nutrition?: Nutrition;
}

// ---------------------------------------------------------------------------
// Sort metrics ("sort products by characteristics")
// ---------------------------------------------------------------------------

export const METRIC_IDS = [
  "proteinPer100",
  "proteinPerChf",
  "proteinPerKcal",
  "proteinPerCarb",
  "proteinPerFat",
] as const;
export type MetricId = (typeof METRIC_IDS)[number];

/** Default (English) labels; localized labels live in the i18n catalogs. */
export const METRIC_LABELS: Record<MetricId, string> = {
  proteinPer100: "Protein per 100g/ml",
  proteinPerChf: "Protein per CHF",
  proteinPerKcal: "Protein per kcal",
  proteinPerCarb: "Protein per carb",
  proteinPerFat: "Protein per fat",
};

export interface MetricInput {
  nutrition: Nutrition;
  /** Price per 100 g/ml in CHF; required for the protein/CHF metric. */
  pricePer100?: number | undefined;
}

/** A ratio that is undefined when its denominator is missing or non-positive. */
function ratio(numerator: number, denominator: number | undefined): number | null {
  if (denominator === undefined || !(denominator > 0)) return null;
  return numerator / denominator;
}

/** Compute one metric; returns null when inputs are insufficient. */
export function computeMetric(id: MetricId, input: MetricInput): number | null {
  const n = input.nutrition;
  switch (id) {
    case "proteinPer100":
      return Number.isFinite(n.proteinG) ? n.proteinG : null;
    case "proteinPerChf":
      return ratio(n.proteinG, input.pricePer100);
    case "proteinPerKcal":
      return ratio(n.proteinG, n.energyKcal);
    case "proteinPerCarb":
      return ratio(n.proteinG, n.carbsG);
    case "proteinPerFat":
      return ratio(n.proteinG, n.fatG);
  }
}

/** Compute all metrics for a product at once (used by ingestion → product_metrics). */
export function computeMetrics(input: MetricInput): Record<MetricId, number | null> {
  return Object.fromEntries(METRIC_IDS.map((id) => [id, computeMetric(id, input)])) as Record<
    MetricId,
    number | null
  >;
}
