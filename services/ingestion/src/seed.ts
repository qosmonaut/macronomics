/**
 * M1 seed ingestion (run locally → Supabase, or against pglite for dev/verification).
 *
 *   pnpm --filter @macronomics/ingestion seed -- --query milch --limit 12 --locales de
 *   pnpm --filter @macronomics/ingestion seed -- --dry-run        # fetch+map, no DB
 *
 * With DATABASE_URL set it writes to that Postgres (Supabase EU pooler in prod); without it,
 * it uses an in-memory pglite so the whole pipeline can be verified with no external infra.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { createDb, schema, upsertProduct, type Db } from "@macronomics/db";
import { MigrosClient } from "@macronomics/migros";
import { computeMetrics, LOCALES, type Locale, type Product } from "@macronomics/shared";
import { eq } from "drizzle-orm";

// pnpm may forward a leading "--" separator into argv; drop it before parsing.
const rawArgs = process.argv.slice(2);
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    query: { type: "string", default: "milch" },
    limit: { type: "string", default: "12" },
    locales: { type: "string", default: "de" },
    "dry-run": { type: "boolean", default: false },
  },
});

const query = values.query ?? "milch";
const limit = Number(values.limit ?? "12");
const locales = (values.locales ?? "de")
  .split(",")
  .map((s) => s.trim())
  .filter((l): l is Locale => (LOCALES as readonly string[]).includes(l));
const dryRun = values["dry-run"] === true;

async function main(): Promise<void> {
  const client = new MigrosClient();
  console.log(
    `Ingestion · query="${query}" limit=${limit} locales=${locales.join(",")}${dryRun ? " (dry-run)" : ""}`,
  );

  const ids = await client.searchProductIds(query, { limit, locale: locales[0] });
  console.log(`  search → ${ids.length} product ids`);
  const products = await client.getProducts(ids, { locales });
  console.log(`  detail → ${products.length} products mapped`);

  if (dryRun) {
    printSorted(products);
    return;
  }

  const handle = await createDb();
  try {
    await handle.migrate();
    const runId = randomUUID();
    await handle.db
      .insert(schema.ingestionRuns)
      .values({ id: runId, startedAt: new Date(), status: "running", query });

    try {
      let upserted = 0;
      for (const p of products) {
        await upsertProduct(handle.db, p);
        upserted++;
      }
      await handle.db
        .update(schema.ingestionRuns)
        .set({ finishedAt: new Date(), status: "ok", productsUpserted: upserted })
        .where(eq(schema.ingestionRuns.id, runId));
      console.log(`  upserted ${upserted} products (run ${runId})`);

      await report(handle.db, locales[0] ?? "de");
    } catch (err) {
      await handle.db
        .update(schema.ingestionRuns)
        .set({
          finishedAt: new Date(),
          status: "error",
          note: err instanceof Error ? err.message : String(err),
        })
        .where(eq(schema.ingestionRuns.id, runId));
      throw err;
    }
  } finally {
    await handle.close();
  }
}

/** Dry-run: compute + print the protein/CHF ranking without touching a database. */
function printSorted(products: Product[]): void {
  const ranked = products
    .filter((p) => p.nutrition && p.price?.per100 !== undefined)
    .map((p) => ({
      name: Object.values(p.names)[0] ?? p.uid,
      ...computeMetrics({ nutrition: p.nutrition!, pricePer100: p.price?.per100 }),
    }))
    .sort((a, b) => (b.proteinPerChf ?? -1) - (a.proteinPerChf ?? -1));

  console.log("\nrank  protein/CHF  protein/100  name");
  ranked.forEach((r, i) =>
    console.log(
      `${String(i + 1).padEnd(4)} ${(r.proteinPerChf?.toFixed(1) ?? "-").padStart(11)} ${String(r.proteinPer100 ?? "-").padStart(12)}  ${r.name}`,
    ),
  );
}

/** Read back the top products by protein/CHF from the DB — proves the sort end-to-end. */
async function report(db: Db, locale: Locale): Promise<void> {
  const rows = (
    await db
      .select({
        name: schema.productI18n.name,
        proteinPerChf: schema.productMetrics.proteinPerChf,
        proteinPer100: schema.productMetrics.proteinPer100,
      })
      .from(schema.productMetrics)
      .innerJoin(
        schema.productI18n,
        eq(schema.productI18n.productUid, schema.productMetrics.productUid),
      )
      .where(eq(schema.productI18n.locale, locale))
      .limit(50)
  )
    .filter((r) => r.proteinPerChf !== null)
    .sort((a, b) => (b.proteinPerChf ?? -1) - (a.proteinPerChf ?? -1))
    .slice(0, 10);
  console.log("\nTop by protein/CHF (queried from DB):");
  for (const r of rows) {
    const v = r.proteinPerChf === null ? "-" : r.proteinPerChf.toFixed(1);
    console.log(`  ${v.padStart(6)}  ${r.name}`);
  }
}

await main();
