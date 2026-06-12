import assert from "node:assert/strict";
import { test } from "node:test";

import { computeMetric, computeMetrics, type Nutrition } from "./index.ts";

const nutrition: Nutrition = {
  basis: "100g",
  energyKcal: 100,
  proteinG: 20,
  carbsG: 5,
  fatG: 2,
};

test("metric ratios", () => {
  assert.equal(computeMetric("proteinPer100", { nutrition }), 20);
  assert.equal(computeMetric("proteinPerKcal", { nutrition }), 0.2);
  assert.equal(computeMetric("proteinPerCarb", { nutrition }), 4);
  assert.equal(computeMetric("proteinPerFat", { nutrition }), 10);
  assert.equal(computeMetric("proteinPerChf", { nutrition, pricePer100: 0.5 }), 40);
});

test("null when a denominator is missing or non-positive", () => {
  assert.equal(computeMetric("proteinPerChf", { nutrition }), null); // no price
  assert.equal(computeMetric("proteinPerCarb", { nutrition: { ...nutrition, carbsG: 0 } }), null);
});

test("computeMetrics returns every metric id", () => {
  const m = computeMetrics({ nutrition, pricePer100: 1 });
  assert.deepEqual(
    Object.keys(m).sort(),
    ["proteinPer100", "proteinPerCarb", "proteinPerChf", "proteinPerFat", "proteinPerKcal"].sort(),
  );
});
