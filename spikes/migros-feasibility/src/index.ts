/**
 * M0 feasibility spike — see ./README.md.
 *
 * Goal: answer, before building any infrastructure, whether Node + the
 * `migros-api-wrapper` can (1) reach Migros past its bot protection,
 * (2) obtain a guest token, (3) return products with the price + four macros we
 * sort on, and (4) expose macros for Migusto recipes (paid-tier premise).
 *
 * This is throwaway code: return shapes from the wrapper are `any`, so we probe
 * the runtime JSON defensively and dump raw captures to ./output for inspection.
 * Shapes below were confirmed against live responses on 2026-05-31.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MigrosAPI } from "migros-api-wrapper";
// Enums are not re-exported from the package root; deep-import for the spike.
// Explicit .js extensions so Node's native ESM resolver finds the compiled files.
import { Language } from "migros-api-wrapper/dist/api/enums/Language.js";
import { Region } from "migros-api-wrapper/dist/api/enums/Region.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(HERE, "..", "output");

const SEARCH_QUERY = "milch"; // common term → many products with nutrition
const SAMPLE_SIZE = 8; // products to inspect for completeness
const LANGUAGE = Language.DE; // nutrient labels come back localized
const REGION = Region.NATIONAL;

type Json = unknown;
type Status = "ok" | "partial" | "fail";

interface StepResult {
  name: string;
  status: Status;
  detail: string;
}

const results: StepResult[] = [];
const record = (name: string, status: Status, detail: string): void => {
  results.push({ name, status, detail });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function capture(name: string, data: Json): Promise<void> {
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const ext = typeof data === "string" ? "txt" : "json";
  await writeFile(join(OUTPUT_DIR, `${name}.${ext}`), body, "utf8");
}

/** Extract a useful message + HTTP status out of an unknown (often axios) error. */
function describeError(error: unknown): string {
  const e = error as { response?: { status?: number }; code?: string; message?: string };
  const status = e?.response?.status ? `HTTP ${e.response.status}` : (e?.code ?? "");
  return [status, e?.message].filter(Boolean).join(" — ") || String(error);
}

/** Recursively find the first value whose key matches `re`. */
function findByKey(obj: Json, re: RegExp, depth = 6): Json {
  if (depth < 0 || obj === null || typeof obj !== "object") return undefined;
  for (const [key, value] of Object.entries(obj as Record<string, Json>)) {
    if (re.test(key)) return value;
  }
  for (const value of Object.values(obj as Record<string, Json>)) {
    const hit = findByKey(value, re, depth - 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** First number in a Migros display string, e.g. "3.2 g" → 3.2, "287 kJ (69 kcal)" → 287. */
function firstNumber(value: string): number | undefined {
  const m = value.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : undefined;
}

/** kcal out of an energy string like "287 kJ (69 kcal)". */
function kcal(value: string): number | undefined {
  const m = value.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
  return m?.[1] ? Number(m[1].replace(",", ".")) : undefined;
}

function pct(n: number, total: number): string {
  return total === 0 ? "n/a" : `${Math.round((100 * n) / total)}%`;
}

// ---------------------------------------------------------------------------
// Domain extraction (confirmed shapes)
// ---------------------------------------------------------------------------

interface NutrientRow {
  label: string;
  values: string[];
}

interface ParsedProduct {
  name: string;
  priceChf?: number;
  pricePer100?: { value: number; unit: string };
  energyKcal?: number; // per 100 g/ml
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

/** A product object is a record carrying `productInformation` and/or `offer`. */
function looksLikeProduct(item: Json): boolean {
  if (item === null || typeof item !== "object") return false;
  const o = item as Record<string, Json>;
  return "productInformation" in o || ("offer" in o && "name" in o);
}

function parseProduct(item: Json): ParsedProduct {
  const o = item as Record<string, Json>;
  const out: ParsedProduct = { name: String(o.name ?? o.title ?? o.uid ?? "?") };

  const price = findByKey(o.offer, /^price$/, 3) as Record<string, Json> | undefined;
  if (typeof price?.effectiveValue === "number") out.priceChf = price.effectiveValue;
  const unit = price?.unitPrice as { value?: number; unit?: string } | undefined;
  if (typeof unit?.value === "number" && unit.unit) {
    out.pricePer100 = { value: unit.value, unit: unit.unit };
  }

  const rows = findByKey(o.productInformation, /^rows$/, 4) as NutrientRow[] | undefined;
  if (Array.isArray(rows)) {
    const per100 = (re: RegExp): string | undefined =>
      rows.find((r) => re.test(r.label) && !/^davon/i.test(r.label))?.values?.[0];
    const energy = per100(/energie|energy/i);
    out.energyKcal = energy ? kcal(energy) : undefined;
    const protein = per100(/eiwei|protein/i);
    out.proteinG = protein ? firstNumber(protein) : undefined;
    const carbs = per100(/kohlenhydr|carbo/i);
    out.carbsG = carbs ? firstNumber(carbs) : undefined;
    const fat = per100(/fett|fat/i);
    out.fatG = fat ? firstNumber(fat) : undefined;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | undefined> {
  try {
    const guest = (await MigrosAPI.account.oauth2.getGuestToken()) as Record<string, Json>;
    const redactedGuest: Record<string, Json> = {
      ...guest,
      token: typeof guest.token === "string" ? "<redacted>" : guest.token,
      access_token: typeof guest.access_token === "string" ? "<redacted>" : guest.access_token,
    };
    await capture("01-guest-token", redactedGuest);
    const token =
      (guest?.token as string | undefined) ??
      (guest?.access_token as string | undefined) ??
      (typeof guest === "string" ? guest : undefined);
    if (token) {
      record("guest token", "ok", `acquired (${String(token).slice(0, 8)}…)`);
      return token;
    }
    record("guest token", "fail", `no token field; keys: ${Object.keys(guest).join(", ")}`);
  } catch (error) {
    record("guest token", "fail", describeError(error));
  }
  return undefined;
}

async function search(token: string): Promise<string[]> {
  try {
    const res = await MigrosAPI.products.productSearch.searchProduct(
      { query: SEARCH_QUERY, language: LANGUAGE, regionId: REGION },
      { leshopch: token },
    );
    await capture("02-search", res);
    const ids = findByKey(res, /^productIds$/);
    if (Array.isArray(ids) && ids.length) {
      record("product search", "ok", `${ids.length} productIds for "${SEARCH_QUERY}"`);
      return ids.map(String).slice(0, SAMPLE_SIZE);
    }
    record("product search", "fail", "no productIds in search response");
  } catch (error) {
    record("product search", "fail", describeError(error));
  }
  return [];
}

async function inspectProducts(token: string, ids: string[]): Promise<ParsedProduct[]> {
  if (!ids.length) {
    record("product detail", "fail", "no ids to inspect");
    return [];
  }
  try {
    const detail = await MigrosAPI.products.productDisplay.getProductDetails(
      { uids: ids, language: LANGUAGE, region: REGION },
      { leshopch: token },
    );
    await capture("03-product-detail", detail);

    const raw = Array.isArray(detail) ? detail : [];
    const products = raw.filter(looksLikeProduct).map(parseProduct);
    if (!products.length) {
      record("product detail", "fail", "no product-shaped objects in detail response");
      return [];
    }

    const withPrice = products.filter((p) => p.priceChf !== undefined).length;
    const withUnit = products.filter((p) => p.pricePer100 !== undefined).length;
    const withMacros = products.filter(
      (p) =>
        p.energyKcal !== undefined &&
        p.proteinG !== undefined &&
        p.carbsG !== undefined &&
        p.fatG !== undefined,
    ).length;
    const total = products.length;
    const status: Status = withPrice === total && withMacros === total ? "ok" : "partial";
    record(
      "product nutrition+price",
      status,
      `${total} products · price ${pct(withPrice, total)} · unitPrice ${pct(withUnit, total)} · all-4-macros ${pct(withMacros, total)}`,
    );
    return products;
  } catch (error) {
    record("product detail", "fail", describeError(error));
    return [];
  }
}

async function inspectRecipes(): Promise<void> {
  try {
    const found = await MigrosAPI.migusto.recipeSearch({
      searchTerm: "poulet",
      language: LANGUAGE,
      limit: 5,
    });
    await capture("05-recipe-search", found);
    const slug = findByKey(found, /^slug$/) as string | undefined;
    if (!slug) {
      record("recipe search", "partial", "recipe search returned no slug");
      return;
    }
    const details = await MigrosAPI.migusto.recipeDetails({ slug, language: LANGUAGE });
    await capture("06-recipe-detail", details);
    const blob = JSON.stringify(details).toLowerCase();
    const hasMacros = ["eiwei", "kcal", "kohlenhydr", "fett"].every((k) => blob.includes(k));
    record(
      "recipe macros",
      hasMacros ? "ok" : "partial",
      hasMacros ? "macros present in recipe detail" : "no macros in recipe detail (derive in M6)",
    );
  } catch (error) {
    // Non-blocking for the free-tier MVP; capture the raw body for M6 follow-up.
    const e = error as { response?: { data?: unknown } };
    if (e?.response?.data !== undefined) await capture("05-recipe-error", e.response.data);
    record("recipe (Migusto)", "partial", `wrapper method failed: ${describeError(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(
    `\nMacronomics · Migros feasibility spike\nquery="${SEARCH_QUERY}" lang=${LANGUAGE}\n`,
  );

  const token = await getToken();
  if (!token) {
    printSummary();
    console.error("\n❌ No guest token — Migros unreachable from here. See ADR-0001.\n");
    process.exitCode = 1;
    return;
  }

  const ids = await search(token);
  const products = await inspectProducts(token, ids);
  await inspectRecipes();

  printSummary();
  printSortProof(products);

  // Hard-fail only if the core free-tier pipeline (search + detail) is broken.
  const coreBroken = results.some(
    (r) => (r.name === "product search" || r.name === "product detail") && r.status === "fail",
  );
  if (coreBroken) process.exitCode = 1;
}

function printSummary(): void {
  const icon: Record<Status, string> = { ok: "✅", partial: "⚠️ ", fail: "❌" };
  console.log("──────── summary ────────");
  for (const r of results) console.log(`${icon[r.status]} ${r.name}: ${r.detail}`);
  console.log(`\nRaw captures written to: ${OUTPUT_DIR}`);
}

/** Proof of concept: the core "sort by characteristic" feature on real data. */
function printSortProof(products: ParsedProduct[]): void {
  const sortable = products.filter((p) => p.proteinG !== undefined && p.pricePer100);
  if (!sortable.length) return;
  const ranked = sortable
    .map((p) => ({ ...p, proteinPerChf: p.proteinG! / p.pricePer100!.value }))
    .sort((a, b) => b.proteinPerChf - a.proteinPerChf);
  console.log("\n──────── proof: sort by protein per CHF (per-100 basis) ────────");
  console.log("rank  protein/CHF   protein/100   kcal/100   CHF/100   name");
  ranked.forEach((p, i) => {
    const row = [
      String(i + 1).padEnd(4),
      p.proteinPerChf.toFixed(1).padStart(10),
      `${p.proteinG}g`.padStart(12),
      `${p.energyKcal ?? "?"}`.padStart(9),
      `${p.pricePer100!.value} (${p.pricePer100!.unit})`.padStart(13),
      `  ${p.name}`,
    ].join("  ");
    console.log(row);
  });
  console.log();
}

void main();
