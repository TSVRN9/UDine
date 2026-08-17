import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDailyTotals, isoDateOf } from "./macros.ts";
import type { LogEntry } from "./types.ts";

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: "1",
    loggedAt: "2026-08-17T12:00:00.000Z",
    source: { type: "umass-menu", dishName: "Chicken", hallTid: 1 },
    servings: 1,
    nutrition: {
      servingSize: "1 serving",
      calories: 100,
      caloriesFromFat: 10,
      totalFatG: 5,
      satFatG: 1,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 0,
      totalCarbG: 10,
      dietaryFiberG: 1,
      sugarsG: 1,
      proteinG: 20,
    },
    ...overrides,
  };
}

test("computeDailyTotals sums calories/macros across entries, scaled by servings", () => {
  const entries = [entry({ id: "1", servings: 1 }), entry({ id: "2", servings: 2 })];
  const totals = computeDailyTotals("2026-08-17", entries);
  assert.equal(totals.calories, 300);
  assert.equal(totals.proteinG, 60);
  assert.equal(totals.totalCarbG, 30);
  assert.equal(totals.totalFatG, 15);
});

test("computeDailyTotals returns zeroes for no entries", () => {
  const totals = computeDailyTotals("2026-08-17", []);
  assert.deepEqual(totals, { date: "2026-08-17", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 });
});

test("isoDateOf truncates a full ISO timestamp to the date portion", () => {
  assert.equal(isoDateOf("2026-08-17T12:00:00.000Z"), "2026-08-17");
});
