import assert from "node:assert/strict";
import { test } from "node:test";
import { searchBrandedFoods, searchFoods } from "./usdaFoodData.ts";

// Same fetch-swap technique as openFoodFacts.test.ts -- searchFoods calls the global fetch
// directly, no injectable client.
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

const RAW_BANANA_NUTRIENTS = [
  { nutrientId: 1008, nutrientName: "Energy", nutrientNumber: "208", unitName: "KCAL", value: 89 },
  { nutrientId: 1003, nutrientName: "Protein", nutrientNumber: "203", unitName: "G", value: 1.09 },
  { nutrientId: 1004, nutrientName: "Total lipid (fat)", nutrientNumber: "204", unitName: "G", value: 0.33 },
  { nutrientId: 1258, nutrientName: "Fatty acids, total saturated", nutrientNumber: "606", unitName: "G", value: 0.11 },
  { nutrientId: 1257, nutrientName: "Fatty acids, total trans", nutrientNumber: "605", unitName: "G", value: 0 },
  { nutrientId: 1253, nutrientName: "Cholesterol", nutrientNumber: "601", unitName: "MG", value: 0 },
  { nutrientId: 1093, nutrientName: "Sodium, Na", nutrientNumber: "307", unitName: "MG", value: 1 },
  { nutrientId: 1005, nutrientName: "Carbohydrate, by difference", nutrientNumber: "205", unitName: "G", value: 22.8 },
  { nutrientId: 1079, nutrientName: "Fiber, total dietary", nutrientNumber: "291", unitName: "G", value: 2.6 },
  { nutrientId: 2000, nutrientName: "Sugars, total including NLEA", nutrientNumber: "269", unitName: "G", value: 12.2 },
];

test("searchFoods maps a Foundation/SR Legacy hit's flat foodNutrients into NutritionFacts, per-100g", async () => {
  const result = await withFetch(
    async (url) => {
      const u = new URL(String(url));
      assert.equal(u.origin + u.pathname, "https://api.nal.usda.gov/fdc/v1/foods/search");
      assert.equal(u.searchParams.get("query"), "banana");
      assert.equal(u.searchParams.get("api_key"), "DEMO_KEY"); // no env var set in this test run
      return {
        ok: true,
        status: 200,
        json: async () => ({
          totalHits: 1,
          currentPage: 1,
          totalPages: 1,
          foods: [{ fdcId: 173944, description: "Banana, raw", dataType: "SR Legacy", foodNutrients: RAW_BANANA_NUTRIENTS }],
        }),
      } as Response;
    },
    () => searchFoods("banana"),
  );

  assert.deepEqual(result, {
    results: [
      {
        fdcId: "173944",
        productName: "Banana, raw",
        nutrition: {
          servingSize: "per 100g",
          calories: 89,
          caloriesFromFat: 0,
          totalFatG: 0.33,
          satFatG: 0.11,
          transFatG: 0,
          cholesterolMg: 0,
          sodiumMg: 1,
          totalCarbG: 22.8,
          dietaryFiberG: 2.6,
          sugarsG: 12.2,
          proteinG: 1.09,
        },
      },
    ],
    hasMore: false,
  });
});

test("searchFoods requests only Foundation/SR Legacy data types, excluding Branded packaged-goods overlap with OFF", async () => {
  let seenUrl: URL | undefined;
  await withFetch(
    async (url) => {
      seenUrl = new URL(String(url));
      return { ok: true, status: 200, json: async () => ({ totalHits: 0, currentPage: 1, totalPages: 1, foods: [] }) } as Response;
    },
    () => searchFoods("chicken breast"),
  );
  assert.equal(seenUrl?.searchParams.get("dataType"), "Foundation,SR Legacy");
});

test("searchFoods maps a Branded hit's own ingredients field when present", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          totalHits: 1,
          currentPage: 1,
          totalPages: 1,
          foods: [{ fdcId: 1, description: "Trail Mix", ingredients: "Peanuts, raisins", foodNutrients: [] }],
        }),
      }) as Response,
    () => searchFoods("trail mix"),
  );
  assert.equal(result.results[0].ingredients, "Peanuts, raisins");
});

test("searchFoods omits ingredients when the hit has none", async () => {
  const result = await withFetch(
    async () =>
      ({ ok: true, status: 200, json: async () => ({ totalHits: 1, currentPage: 1, totalPages: 1, foods: [{ fdcId: 1, description: "X", foodNutrients: [] }] }) }) as Response,
    () => searchFoods("x"),
  );
  assert.equal("ingredients" in result.results[0], false);
});

test("searchFoods defaults missing nutrients to 0 rather than throwing", async () => {
  const result = await withFetch(
    async () =>
      ({ ok: true, status: 200, json: async () => ({ totalHits: 1, currentPage: 1, totalPages: 1, foods: [{ fdcId: 1, description: "Mystery", foodNutrients: [] }] }) }) as Response,
    () => searchFoods("mystery"),
  );
  assert.equal(result.results[0].nutrition.calories, 0);
  assert.equal(result.results[0].nutrition.proteinG, 0);
});

test("searchFoods requests the given pageNumber and reports hasMore from currentPage/totalPages", async () => {
  let seenUrl: URL | undefined;
  const result = await withFetch(
    async (url) => {
      seenUrl = new URL(String(url));
      return { ok: true, status: 200, json: async () => ({ totalHits: 60, currentPage: 2, totalPages: 3, foods: [] }) } as Response;
    },
    () => searchFoods("chicken", 2),
  );
  assert.equal(seenUrl?.searchParams.get("pageNumber"), "2");
  assert.equal(result.hasMore, true);
});

test("searchFoods reports hasMore false on the last page", async () => {
  const result = await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ totalHits: 60, currentPage: 3, totalPages: 3, foods: [] }) }) as Response,
    () => searchFoods("chicken", 3),
  );
  assert.equal(result.hasMore, false);
});

test("searchFoods throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () => withFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response, () => searchFoods("x")),
    /USDA FoodData Central search 500/,
  );
});

test("searchBrandedFoods requests dataType=Branded and maps a hit the same way searchFoods does", async () => {
  let seenUrl: URL | undefined;
  const result = await withFetch(
    async (url) => {
      seenUrl = new URL(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          totalHits: 1,
          currentPage: 1,
          totalPages: 1,
          foods: [
            {
              fdcId: 2001,
              description: "Cheerios",
              ingredients: "Whole grain oats, sugar, corn starch",
              dataType: "Branded",
              foodNutrients: RAW_BANANA_NUTRIENTS,
            },
          ],
        }),
      } as Response;
    },
    () => searchBrandedFoods("cheerios"),
  );

  assert.equal(seenUrl?.searchParams.get("dataType"), "Branded");
  assert.equal(seenUrl?.searchParams.get("query"), "cheerios");
  assert.deepEqual(result, {
    results: [
      {
        fdcId: "2001",
        productName: "Cheerios",
        ingredients: "Whole grain oats, sugar, corn starch",
        nutrition: {
          servingSize: "per 100g",
          calories: 89,
          caloriesFromFat: 0,
          totalFatG: 0.33,
          satFatG: 0.11,
          transFatG: 0,
          cholesterolMg: 0,
          sodiumMg: 1,
          totalCarbG: 22.8,
          dietaryFiberG: 2.6,
          sugarsG: 12.2,
          proteinG: 1.09,
        },
      },
    ],
    hasMore: false,
  });
});

test("searchBrandedFoods requests the given pageNumber and reports hasMore from currentPage/totalPages", async () => {
  let seenUrl: URL | undefined;
  const result = await withFetch(
    async (url) => {
      seenUrl = new URL(String(url));
      return { ok: true, status: 200, json: async () => ({ totalHits: 60, currentPage: 2, totalPages: 3, foods: [] }) } as Response;
    },
    () => searchBrandedFoods("cheerios", 2),
  );
  assert.equal(seenUrl?.searchParams.get("pageNumber"), "2");
  assert.equal(result.hasMore, true);
});

test("searchBrandedFoods throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () => withFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response, () => searchBrandedFoods("x")),
    /USDA FoodData Central search 500/,
  );
});
