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

test("lookupBarcode retries once on a 503 and succeeds on the following 200", async () => {
  let calls = 0;
  const result = await withFetch(
    async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, json: async () => ({}) } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 1, product: { product_name: "Cheerios", nutriments: {} } }),
      } as Response;
    },
    () => lookupBarcode("016000275270"),
  );
  assert.equal(calls, 2);
  assert.equal(result?.productName, "Cheerios");
});

test("lookupBarcode throws after a second consecutive 503 (retry exhausted, not retried again)", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withFetch(
        async () => {
          calls++;
          return { ok: false, status: 503, json: async () => ({}) } as Response;
        },
        () => lookupBarcode("016000275270"),
      ),
    /OpenFoodFacts 503/,
  );
  assert.equal(calls, 2);
});

test("lookupBarcode sends a User-Agent header", async () => {
  let seenHeaders: Record<string, string> | undefined;
  await withFetch(
    async (_url, init) => {
      seenHeaders = init?.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 1, product: { product_name: "X", nutriments: {} } }),
      } as Response;
    },
    () => lookupBarcode("1"),
  );
  assert.equal(seenHeaders?.["User-Agent"], "UDine/1.0 (+https://github.com/TSVRN9/UDine)");
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

  assert.deepEqual(result, {
    results: [
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
    ],
    hasMore: false,
  });
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

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].nutrition.servingSize, "per 100g");
  assert.equal(result.results[0].nutrition.calories, 539);
  assert.equal(result.results[0].nutrition.proteinG, 6.3);
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
  assert.deepEqual(result.results, []);
});

test("searchProducts returns an empty array when the response has no products field", async () => {
  const result = await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    () => searchProducts("x"),
  );
  assert.deepEqual(result.results, []);
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

test("searchProducts retries once on a 503 and succeeds on the following 200", async () => {
  let calls = 0;
  const result = await withFetch(
    async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, json: async () => ({}) } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ products: [{ code: "1", product_name: "Cheerios", nutriments: {} }] }),
      } as Response;
    },
    () => searchProducts("cheerios"),
  );
  assert.equal(calls, 2);
  assert.equal(result.results[0]?.productName, "Cheerios");
});

// 3c: a merely-slow (never 503-ing) response has no request timeout today, so it can hang a
// search's OFF group indefinitely. fetchWithRetry503 is not exported -- this exercises it through
// searchProducts, the same way every other test in this file does.
test("searchProducts times out a hung (non-503) request instead of waiting forever", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const resultPromise = withFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted")));
      }),
    () => searchProducts("slow"),
  );
  t.mock.timers.tick(6000);
  await assert.rejects(resultPromise);
});

test("searchProducts requests the given page and reports hasMore true when count exceeds this page's reach", async () => {
  let seenUrl: URL | undefined;
  const result = await withFetch(
    async (url) => {
      seenUrl = new URL(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          count: 45,
          products: Array.from({ length: 20 }, (_, i) => ({ code: String(i), product_name: `Product ${i}`, nutriments: {} })),
        }),
      } as Response;
    },
    () => searchProducts("cheerios", 2),
  );
  assert.equal(seenUrl?.searchParams.get("page"), "2");
  assert.equal(result.results.length, 20);
  assert.equal(result.hasMore, true); // page 2 * 20 = 40 < 45
});

test("searchProducts reports hasMore false once count is exhausted", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ count: 45, products: [{ code: "1", product_name: "Last one", nutriments: {} }] }),
      }) as Response,
    () => searchProducts("cheerios", 3), // 3 * 20 = 60 >= 45
  );
  assert.equal(result.hasMore, false);
});

test("searchProducts falls back to a full-page heuristic for hasMore when the response omits count", async () => {
  const fullPage = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          products: Array.from({ length: 20 }, (_, i) => ({ code: String(i), product_name: `Product ${i}`, nutriments: {} })),
        }),
      }) as Response,
    () => searchProducts("x"),
  );
  assert.equal(fullPage.hasMore, true);

  const shortPage = await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ products: [{ code: "1", product_name: "One", nutriments: {} }] }) }) as Response,
    () => searchProducts("x"),
  );
  assert.equal(shortPage.hasMore, false);
});

test("searchProducts maps ingredients_text and title-cases/strips-locale from allergens_tags", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          products: [
            {
              code: "1",
              product_name: "Trail Mix",
              nutriments: {},
              ingredients_text: "Peanuts, almonds, dried cranberries",
              allergens_tags: ["en:milk", "en:tree-nuts"],
            },
          ],
        }),
      }) as Response,
    () => searchProducts("trail mix"),
  );
  assert.equal(result.results[0].ingredients, "Peanuts, almonds, dried cranberries");
  assert.deepEqual(result.results[0].allergens, ["Milk", "Tree Nuts"]);
});

test("searchProducts omits ingredients/allergens fields entirely when OFF has neither", async () => {
  const result = await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ products: [{ code: "1", product_name: "Plain", nutriments: {} }] }) }) as Response,
    () => searchProducts("plain"),
  );
  assert.equal("ingredients" in result.results[0], false);
  assert.equal("allergens" in result.results[0], false);
});
