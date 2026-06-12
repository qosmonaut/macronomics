import assert from "node:assert/strict";
import { test } from "node:test";

import { createDb, upsertProduct } from "@macronomics/db";
import type { Product } from "@macronomics/shared";

import { appRouter } from "./router.ts";
import { createCallerFactory } from "./trpc.ts";

const sample: Product[] = [
  {
    uid: "p-quark",
    names: { de: "Magerquark" },
    price: { chf: 1.0, per100: 0.5, per100Unit: "100g" },
    nutrition: { basis: "100g", energyKcal: 70, proteinG: 12, carbsG: 4, fatG: 0.2 },
  },
  {
    uid: "p-milk",
    names: { de: "Vollmilch" },
    price: { chf: 1.85, per100: 0.19, per100Unit: "100ml" },
    nutrition: { basis: "100ml", energyKcal: 69, proteinG: 3.2, carbsG: 5, fatG: 4 },
  },
];

test("product router over pglite: list sorts by protein/CHF, get + search work", async () => {
  const handle = await createDb(); // no DATABASE_URL → embedded pglite
  try {
    await handle.migrate();
    for (const p of sample) await upsertProduct(handle.db, p);
    const caller = createCallerFactory(appRouter)({ db: handle.db });

    // 12 g / 0.5 CHF = 24  >  3.2 g / 0.19 CHF ≈ 16.8  → quark first
    const list = await caller.product.list({ metric: "proteinPerChf", locale: "de", limit: 10 });
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0]?.uid, "p-quark");
    assert.ok((list.items[0]?.metricValue ?? 0) > (list.items[1]?.metricValue ?? 0));
    assert.equal(list.nextCursor, null);

    const one = await caller.product.get({ uid: "p-milk", locale: "de" });
    assert.equal(one?.name, "Vollmilch");
    assert.equal(one?.proteinG, 3.2);

    const found = await caller.product.search({ q: "quark", locale: "de", limit: 10 });
    assert.equal(found.length, 1);
    assert.equal(found[0]?.uid, "p-quark");

    const health = await caller.health();
    assert.equal(health.ok, true);
  } finally {
    await handle.close();
  }
});
