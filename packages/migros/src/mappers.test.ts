import assert from "node:assert/strict";
import { test } from "node:test";

import { computeMetric } from "@macronomics/shared";

import { parseProduct } from "./mappers.ts";

// Trimmed real shape (Vollmilch) captured by the M0 spike.
const VOLLMILCH = {
  uid: "104100200000",
  migrosId: "1041002",
  name: "Vollmilch",
  imageTransparent: { url: "https://example.test/vollmilch.png" },
  productInformation: {
    mainInformation: { brand: "M-Classic" },
    nutrientsInformation: {
      nutrientsTable: {
        headers: ["100 ml", "1 Glas (250 ml)"],
        rows: [
          { label: "Energie", values: ["287 kJ (69 kcal)", "710 kJ (170 kcal)"] },
          { label: "Fett", values: ["4 g", "10 g"] },
          { label: "davon gesättigte Fettsäuren", values: ["2.2 g", "5.5 g"] },
          { label: "Kohlenhydrate", values: ["5 g", "12 g"] },
          { label: "davon Zucker", values: ["5 g", "12 g"] },
          { label: "Ballaststoffe", values: ["0 g", "0 g"] },
          { label: "Eiweiss", values: ["3.2 g", "8 g"] },
          { label: "Salz", values: ["0.1 g", "0.26 g"] },
        ],
      },
    },
  },
  offer: {
    price: { effectiveValue: 1.85, unitPrice: { value: 0.19, unit: "100ml" } },
    quantity: "1l",
  },
};

test("parseProduct extracts identity, price and per-100 macros (DE)", () => {
  const p = parseProduct(VOLLMILCH, "de");
  assert.ok(p, "product should parse");
  assert.equal(p.uid, "104100200000");
  assert.equal(p.migrosId, "1041002");
  assert.equal(p.brand, "M-Classic");
  assert.equal(p.names.de, "Vollmilch");
  assert.equal(p.imageUrl, "https://example.test/vollmilch.png");

  assert.equal(p.price?.chf, 1.85);
  assert.equal(p.price?.per100, 0.19);
  assert.equal(p.price?.per100Unit, "100ml");
  assert.equal(p.price?.quantity, "1l");

  const n = p.nutrition;
  assert.ok(n, "nutrition should parse");
  assert.equal(n.basis, "100ml");
  assert.equal(n.energyKcal, 69); // from "287 kJ (69 kcal)"
  assert.equal(n.fatG, 4); // total "Fett", not the "davon …" sub-row
  assert.equal(n.carbsG, 5);
  assert.equal(n.proteinG, 3.2);
  assert.equal(n.saturatedFatG, 2.2);
  assert.equal(n.sugarsG, 5);
  assert.equal(n.fibreG, 0);
  assert.equal(n.saltG, 0.1);
});

test("protein-per-CHF metric matches the spike (≈16.8)", () => {
  const p = parseProduct(VOLLMILCH, "de");
  assert.ok(p?.nutrition);
  const v = computeMetric("proteinPerChf", {
    nutrition: p.nutrition,
    pricePer100: p.price?.per100,
  });
  assert.ok(v !== null);
  assert.ok(Math.abs(v - 3.2 / 0.19) < 1e-9);
});

test("parseProduct returns undefined for non-product input", () => {
  assert.equal(parseProduct(null, "de"), undefined);
  assert.equal(parseProduct({ foo: 1 }, "de"), undefined);
});
