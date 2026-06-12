/**
 * Migusto exploration tool (throwaway, M0 follow-up).
 *
 * The wrapper's `migusto.recipeSearch` fails with a non-JSON "org.spring…" body.
 * This probes the SAME endpoint through different transports + tries alternate
 * paths, so we can tell apart:
 *   - "endpoint moved"      → HTTP 404 / Spring no-handler page
 *   - "bot/transport block" → 403 (fixable with UA + TLS like the product endpoints)
 *   - "login required"      → 401/403 on the data endpoint but the public site is 200
 *
 * It reuses the wrapper's own request primitives:
 *   - postRequest / getRequest             → plain global fetch (what recipeSearch uses)
 *   - postRequestBypass / getRequestBypass → axios client (TLS 1.3 + optional UA)
 *
 * Run:   node src/explore-migusto.ts
 * Then edit the "your discovery" block with any URL/payload you find in DevTools.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrosApiPaths } from "migros-api-wrapper";
import {
  getRequest,
  getRequestBypass,
  postRequest,
  postRequestBypass,
} from "migros-api-wrapper/dist/utils/requests.js";

// Send a browser-like UA on the *bypass* (axios) calls, like the wrapper allows.
process.env.MIGROS_API_WRAPPER_USERAGENT ??=
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(HERE, "..", "output");

const migusto = migrosApiPaths.migusto;
const JSON_HEADERS = { Accept: "*/*", "content-type": "application/json" };

// CONFIRMED 2026-06-12 (DevTools capture + bisect): /.rest/recipes/v1 is JSON (a proxy
// to an upstream GraphQL service). The wrapper fails ONLY because its default body sends
// `order: "RELEVANCE_DESC"`, which the upstream no longer accepts → 417 GRAPHQL_PARSE_FAILED.
// Drop `order` (offset/uuids/language/searchTerm are all fine) and it returns 200.
const WRAPPER_BODY = {
  ingredients: [],
  language: "de",
  limit: 5,
  offset: 0,
  order: "RELEVANCE_DESC", // <-- the one offending field
  recipeFilterUuid: "b11fb25b-e7f6-4eac-b3c1-9e473eeaa0f5",
  searchTerm: "poulet",
  uuids: [],
};
const WORKING_BODY = {
  recipeFilterUuid: "b11fb25b-e7f6-4eac-b3c1-9e473eeaa0f5",
  limit: 5,
  ingredients: [] as string[], // or ingredient IDs, e.g. ["14055874/"] (14055874 = Poulet)
  searchTerm: "poulet",
};

let n = 0;

/** Normalize a fetch Response or an axios response/error into {status, ctype, body}. */
async function unwrap(res: unknown): Promise<{ status: number; ctype: string; body: string }> {
  const r = res as {
    text?: () => Promise<string>;
    status?: number;
    data?: unknown;
    headers?: unknown;
  };
  if (typeof r.text === "function") {
    const get = (r.headers as { get?: (k: string) => string | null } | undefined)?.get;
    const ctype = (typeof get === "function" ? get.call(r.headers, "content-type") : null) ?? "";
    return { status: r.status ?? 0, ctype, body: await r.text() };
  }
  const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
  const ctype =
    (r.headers as Record<string, string | undefined> | undefined)?.["content-type"] ?? "";
  return { status: r.status ?? 0, ctype, body };
}

function preview(body: string): string {
  return JSON.stringify(body.replace(/\s+/g, " ").slice(0, 140));
}

async function probe(label: string, run: () => Promise<unknown>): Promise<void> {
  const tag = String(++n).padStart(2, "0");
  const file = join(OUTPUT_DIR, `migusto-${tag}.txt`);
  try {
    const { status, ctype, body } = await unwrap(await run());
    const looksJson = ctype.includes("json") || /^[[{]/.test(body.trim());
    const verdict = status >= 200 && status < 300 && looksJson ? "✅" : "⚠️ ";
    await writeFile(file, `${label}\nHTTP ${status} ${ctype}\n\n${body}`);
    console.log(`${verdict} [${tag}] ${label}`);
    console.log(`     HTTP ${status} · ${ctype} · ${body.length}B · ${preview(body)}`);
  } catch (error) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    if (e.response) {
      const { status, ctype, body } = await unwrap(e.response);
      await writeFile(file, `${label}\nHTTP ${status} ${ctype}\n\n${body}`);
      console.log(`❌ [${tag}] ${label}`);
      console.log(`     HTTP ${status} · ${ctype} · ${preview(body)}`);
    } else {
      console.log(`❌ [${tag}] ${label}\n     threw: ${e.message ?? String(error)}`);
    }
  }
}

/** Recipe macros (per portion) from the public detail page's embedded German nutrition object. */
async function probeRecipeNutrition(slug: string): Promise<void> {
  const tag = String(++n).padStart(2, "0");
  const url = `https://migusto.migros.ch/de/rezepte/${slug}`;
  try {
    const { status, body } = await unwrap(await getRequestBypass(url, {}, { Accept: "text/html" }));
    const blocks = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    let recipe: Record<string, unknown> | null = null;
    for (const [, json] of blocks) {
      try {
        const o = JSON.parse(json ?? "");
        const arr = Array.isArray(o) ? o : (o["@graph"] ?? [o]);
        for (const node of arr) if (String(node?.["@type"] ?? "").includes("Recipe")) recipe = node;
      } catch {
        /* not all ld+json blocks are JSON we care about */
      }
    }
    // AUTHORITATIVE source: the page embeds an explicit German nutrition object (per portion),
    // e.g. 'nährwertkcal': 450, 'nährwerteiweiss': 23, 'nährwertfett': 29, 'nährwertkohlenhydrate': 22.
    // The JSON-LD `nutrition` MISLABELS carbohydrates as `fiberContent` (and provides no real fibre),
    // so we parse these keys instead of trusting the JSON-LD field names.
    const num = (key: string): number | undefined => {
      const m = body.match(new RegExp(`n[äa]hrwert${key}'?\\s*:\\s*(\\d+(?:[.,]\\d+)?)`, "i"));
      return m ? Number(m[1]!.replace(",", ".")) : undefined;
    };
    const macros = {
      kcal: num("kcal"),
      proteinG: num("eiweiss"),
      fatG: num("fett"),
      carbsG: num("kohlenhydrate"),
    };
    const nutrition = recipe?.nutrition as Record<string, unknown> | undefined;
    await writeFile(
      join(OUTPUT_DIR, `migusto-${tag}.txt`),
      `recipe detail: ${url}\nHTTP ${status} · yield ${recipe?.recipeYield ?? "?"}\n` +
        `macros per portion (German keys): ${JSON.stringify(macros)}\n` +
        `JSON-LD nutrition (note: fiberContent is actually carbs): ${JSON.stringify(nutrition)}\n`,
    );
    const ok = macros.carbsG !== undefined && macros.proteinG !== undefined;
    console.log(`${ok ? "✅" : "⚠️ "} [${tag}] recipe macros (per portion)  ${slug}`);
    console.log(`     HTTP ${status} · ${JSON.stringify(macros)}`);
    console.log(
      `     JSON-LD fiberContent=${String(nutrition?.fiberContent)} (== carbs; mislabeled)`,
    );
  } catch (error) {
    console.log(`❌ [${tag}] recipe detail ${slug}: ${(error as Error).message}`);
  }
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`\nMigusto exploration\nbase paths: ${JSON.stringify(migusto, null, 0)}\n`);

  // A. Reproduce the failure: the wrapper's old body (the `order` field breaks it).
  await probe(`POST recipes.v1 — wrapper old body (has \`order\`)  ${migusto.recipes.v1}`, () =>
    postRequest(migusto.recipes.v1, WRAPPER_BODY, {}, { ...JSON_HEADERS }),
  );

  // B. THE FIX: same endpoint, minimal current body (no `order`) → expect 200 + recipes[].
  await probe(`POST recipes.v1 — WORKING body (order removed)     ${migusto.recipes.v1}`, () =>
    postRequest(migusto.recipes.v1, WORKING_BODY, {}, { ...JSON_HEADERS }),
  );

  // C. Alternate documented paths in the wrapper (for the record).
  await probe(`GET  recipeInfo.v1 via bypass                      ${migusto.recipeInfo.v1}`, () =>
    getRequestBypass(migusto.recipeInfo.v1, {}, { Accept: "*/*" }),
  );
  await probe(
    `POST recipeProducts.v1 via bypass                  ${migusto.recipeProducts.v1}`,
    () => postRequestBypass(migusto.recipeProducts.v1, WORKING_BODY, {}, { ...JSON_HEADERS }),
  );

  // D. Is the site itself reachable? Public recipes HTML listing (no API).
  const listing = "https://migusto.migros.ch/de/rezepte";
  await probe(`GET  HTML listing via bypass                       ${listing}`, () =>
    getRequestBypass(listing, {}, { Accept: "text/html" }),
  );
  await probe(`GET  HTML listing via plain fetch                  ${listing}`, () =>
    getRequest(listing, {}, { Accept: "text/html" }),
  );

  // E. Recipe MACROS via the detail page's JSON-LD — works TODAY, no GraphQL needed.
  await probeRecipeNutrition("linsen-poulet-salat");

  console.log(`\nFull bodies written to ${OUTPUT_DIR}/migusto-*.txt`);
  console.log(
    `\nCodes: 404→moved · 403→forbidden · 417 GRAPHQL_PARSE_FAILED→sending the stale \`order\` field.\n`,
  );
}

void main();
