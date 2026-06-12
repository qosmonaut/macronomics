/**
 * Map raw Migros product-detail responses → our domain `Product`.
 *
 * Shapes were confirmed by the M0 spike (see spikes/migros-feasibility/FINDINGS.md):
 * - price:     offer.price.{effectiveValue, unitPrice:{value,unit}}, offer.quantity
 * - nutrients: productInformation.nutrientsInformation.nutrientsTable.{headers, rows:[{label,values[]}]}
 *
 * Nutrient values are localized display strings ("287 kJ (69 kcal)", "3.2 g"); the first
 * `values[]` entry is the per-100 (g/ml) column. We parse defensively and tolerate churn.
 */
import type { Basis, Locale, Nutrition, Price, Product } from "@macronomics/shared";

type Json = unknown;
type Obj = Record<string, Json>;

const isObj = (v: Json): v is Obj => v !== null && typeof v === "object";

/** Recursively find the first value whose key matches `re`. */
export function findByKey(obj: Json, re: RegExp, depth = 6): Json {
  if (depth < 0 || !isObj(obj)) return undefined;
  for (const [key, value] of Object.entries(obj)) if (re.test(key)) return value;
  for (const value of Object.values(obj)) {
    const hit = findByKey(value, re, depth - 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** First number in a display string, e.g. "3.2 g" → 3.2, "287 kJ (69 kcal)" → 287. */
function firstNumber(value: string): number | undefined {
  const m = value.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : undefined;
}

/** kcal out of an energy string like "287 kJ (69 kcal)". */
function kcalOf(value: string): number | undefined {
  const m = value.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
  return m?.[1] ? Number(m[1].replace(",", ".")) : undefined;
}

interface NutrientRow {
  label: string;
  values: string[];
}

function isNutrientRow(v: Json): v is NutrientRow {
  return isObj(v) && typeof v.label === "string" && Array.isArray(v.values);
}

export function parseNutrition(raw: Json): Nutrition | undefined {
  const info = isObj(raw) ? raw.productInformation : undefined;
  const table = findByKey(info, /^nutrientsTable$/, 4);
  const rows = isObj(table) ? table.rows : undefined;
  if (!Array.isArray(rows)) return undefined;
  const clean = rows.filter(isNutrientRow);

  const headers = isObj(table) && Array.isArray(table.headers) ? table.headers : [];
  const firstHeader = JSON.stringify(headers[0] ?? "");
  const basis: Basis = /ml/i.test(firstHeader) ? "100ml" : "100g";

  // per-100 is the first value column; exclude "davon …" sub-rows when reading totals.
  const per100 = (re: RegExp, allowDavon = false): string | undefined =>
    clean.find((r) => re.test(r.label) && (allowDavon || !/^davon/i.test(r.label)))?.values?.[0];

  const energy = per100(/energie|energy/i);
  const protein = per100(/eiwei|protein/i);
  const carbs = per100(/kohlenhydr|carbo/i);
  const fat = per100(/fett|fat/i);
  if ([energy, protein, carbs, fat].every((v) => v === undefined)) return undefined;

  const sugars = per100(/zucker|sugar/i, true);
  const saturated = per100(/ges.ttigte|saturated/i, true);
  const fibre = per100(/ballaststoff|fib(re|er)/i);
  const salt = per100(/salz|salt/i);

  return {
    basis,
    energyKcal: (energy && kcalOf(energy)) || 0,
    proteinG: (protein && firstNumber(protein)) || 0,
    carbsG: (carbs && firstNumber(carbs)) || 0,
    fatG: (fat && firstNumber(fat)) || 0,
    ...(sugars !== undefined ? { sugarsG: firstNumber(sugars) } : {}),
    ...(saturated !== undefined ? { saturatedFatG: firstNumber(saturated) } : {}),
    ...(fibre !== undefined ? { fibreG: firstNumber(fibre) } : {}),
    ...(salt !== undefined ? { saltG: firstNumber(salt) } : {}),
  };
}

export function parsePrice(raw: Json): Price | undefined {
  const offer = isObj(raw) ? raw.offer : undefined;
  const price = findByKey(offer, /^price$/, 3);
  if (!isObj(price)) return undefined;
  const chf = typeof price.effectiveValue === "number" ? price.effectiveValue : undefined;
  if (chf === undefined) return undefined;
  const unit = isObj(price.unitPrice) ? price.unitPrice : undefined;
  const per100 = unit && typeof unit.value === "number" ? unit.value : undefined;
  const per100Unit = unit && typeof unit.unit === "string" ? unit.unit : undefined;
  const quantity = isObj(offer) && typeof offer.quantity === "string" ? offer.quantity : undefined;
  return {
    chf,
    ...(per100 !== undefined ? { per100 } : {}),
    ...(per100Unit !== undefined ? { per100Unit } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  } as Price;
}

function str(v: Json): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function imageUrl(raw: Obj): string | undefined {
  const transparent = isObj(raw.imageTransparent) ? str(raw.imageTransparent.url) : undefined;
  if (transparent) return transparent;
  const images = raw.images;
  if (Array.isArray(images) && images.length) {
    const first = images[0];
    return str(first) ?? (isObj(first) ? str(first.url) : undefined);
  }
  return undefined;
}

/** Map one raw product-detail object for a given locale into a domain Product. */
export function parseProduct(raw: Json, locale: Locale): Product | undefined {
  if (!isObj(raw)) return undefined;
  const uid = str(raw.uid) ?? str(raw.migrosId);
  if (!uid) return undefined;
  const name = str(raw.name) ?? str(raw.title);
  const brand = str(findByKey(raw.productInformation, /^brand$/, 4));

  const product: Product = {
    uid,
    names: name ? { [locale]: name } : {},
    ...(str(raw.migrosId) !== undefined ? { migrosId: str(raw.migrosId) } : {}),
    ...(brand !== undefined ? { brand } : {}),
  };
  const img = imageUrl(raw);
  if (img) product.imageUrl = img;
  const price = parsePrice(raw);
  if (price) product.price = price;
  const nutrition = parseNutrition(raw);
  if (nutrition) product.nutrition = nutrition;
  return product;
}
