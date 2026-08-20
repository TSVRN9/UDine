import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupBarcode, searchProducts } from "./openFoodFacts.ts";

// lookupBarcode calls the global fetch directly (no injectable client), so these tests swap
// globalThis.fetch for a stub and restore it afterward rather than hitting the real API.

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test("lookupBarcode returns a mapped product on a found response, using per-serving nutriments", async () => {
  const result = await withFetch(
    async (url) => {
      assert.equal(url, "https://world.openfoodfacts.org/api/v2/product/016000275270.json");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 1,
          product: {
            product_name: "Cheerios",
            serving_size: "28 g",
            nutriments: {
              "energy-kcal_serving": 110,
              "fat_serving": 2,
              "saturated-fat_serving": 0.5,
              "trans-fat_serving": 0,
              "cholesterol_serving": 0,
              "sodium_serving": 0.15,
              "carbohydrates_serving": 22,
              "fiber_serving": 3,
              "sugars_serving": 1,
              "proteins_serving": 3,
            },
          },
        }),
      } as Response;
    },
    () => lookupBarcode("016000275270"),
  );

  assert.deepEqual(result, {
    barcode: "016000275270",
    productName: "Cheerios",
    servingSize: "28 g",
    nutrition: {
      servingSize: "28 g",
      calories: 110,
      caloriesFromFat: 0,
      totalFatG: 2,
      satFatG: 0.5,
      transFatG: 0,
      cholesterolMg: 0,
      sodiumMg: 150, // sodium_serving (grams) * 1000
      totalCarbG: 22,
      dietaryFiberG: 3,
      sugarsG: 1,
      proteinG: 3,
    },
  });
});

test("lookupBarcode falls back to *_100g nutriments and default name/serving-size when per-serving and product_name/serving_size are absent", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          status: 1,
          product: {
            nutriments: {
              "energy-kcal_100g": 400,
              "fat_100g": 20,
              "saturated-fat_100g": 8,
              "trans-fat_100g": 1,
              "cholesterol_100g": 5,
              "sodium_100g": 1.2,
              "carbohydrates_100g": 50,
              "fiber_100g": 4,
              "sugars_100g": 10,
              "proteins_100g": 12,
            },
          },
        }),
      }) as Response,
    () => lookupBarcode("999999999999"),
  );

  assert.deepEqual(result, {
    barcode: "999999999999",
    productName: "Unknown product",
    servingSize: "",
    nutrition: {
      servingSize: "",
      calories: 400,
      caloriesFromFat: 0,
      totalFatG: 20,
      satFatG: 8,
      transFatG: 1,
      cholesterolMg: 5,
      sodiumMg: 1200, // sodium_100g (grams) * 1000
      totalCarbG: 50,
      dietaryFiberG: 4,
      sugarsG: 10,
      proteinG: 12,
    },
  });
});

test("lookupBarcode returns null when OpenFoodFacts reports the barcode not found (status !== 1)", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ status: 0 }),
      }) as Response,
    () => lookupBarcode("000000000000"),
  );
  assert.equal(result, null);
});

test("lookupBarcode returns null when status is 1 but no product is present (malformed success response)", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ status: 1 }),
      }) as Response,
    () => lookupBarcode("111111111111"),
  );
  assert.equal(result, null);
});

test("lookupBarcode throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () =>
      withFetch(
        async () =>
          ({
            ok: false,
            status: 503,
            json: async () => ({}),
          }) as Response,
        () => lookupBarcode("222222222222"),
      ),
    /OpenFoodFacts 503/,
  );
});

// searchProducts: the mobile plate sheet's "Add something else" row (#91), SEARCH only — barcode
// scanning needs a native dep, out of scope for #91.

test("searchProducts maps hits with per-serving nutriments, using the product's own serving size", async () => {
  const result = await withFetch(
    async (url) => {
      const u = new URL(String(url));
      assert.equal(u.origin + u.pathname, "https://world.openfoodfacts.org/cgi/search.pl");
      assert.equal(u.searchParams.get("search_terms"), "cheerios");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          products: [
            {
              code: "016000275270",
              product_name: "Cheerios",
              serving_size: "28 g",
              nutriments: {
                "energy-kcal_serving": 110,
                "fat_serving": 2,
                "saturated-fat_serving": 0.5,
                "trans-fat_serving": 0,
                "cholesterol_serving": 0,
                "sodium_serving": 0.15,
                "carbohydrates_serving": 22,
                "fiber_serving": 3,
                "sugars_serving": 1,
                "proteins_serving": 3,
              },
            },
          ],
        }),
      } as Response;
    },
    () => searchProducts("cheerios"),
  );

  assert.deepEqual(result, [
    {
      barcode: "016000275270",
      productName: "Cheerios",
      nutrition: {
        servingSize: "28 g",
        calories: 110,
        caloriesFromFat: 0,
        totalFatG: 2,
        satFatG: 0.5,
        transFatG: 0,
        cholesterolMg: 0,
        sodiumMg: 150,
        totalCarbG: 22,
        dietaryFiberG: 3,
        sugarsG: 1,
        proteinG: 3,
      },
    },
  ]);
});

test("searchProducts falls back to per-100g nutriments and marks the serving size as an estimate when a hit has no per-serving data", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          products: [
            {
              code: "3017620422003",
              product_name: "Nutella",
              nutriments: {
                "energy-kcal_100g": 539,
                "fat_100g": 30.9,
                "saturated-fat_100g": 10.6,
                "carbohydrates_100g": 57.5,
                "sugars_100g": 56.3,
                "proteins_100g": 6.3,
              },
            },
          ],
        }),
      }) as Response,
    () => searchProducts("nutella"),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].nutrition.servingSize, "per 100g");
  assert.equal(result[0].nutrition.calories, 539);
  assert.equal(result[0].nutrition.proteinG, 6.3);
});

test("searchProducts drops hits missing a barcode or product name", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          products: [{ code: "111", nutriments: {} }, { product_name: "No barcode", nutriments: {} }, {}],
        }),
      }) as Response,
    () => searchProducts("x"),
  );
  assert.deepEqual(result, []);
});

test("searchProducts returns an empty array when the response has no products field", async () => {
  const result = await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    () => searchProducts("x"),
  );
  assert.deepEqual(result, []);
});

test("searchProducts throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () =>
      withFetch(
        async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response,
        () => searchProducts("x"),
      ),
    /OpenFoodFacts search 503/,
  );
});
