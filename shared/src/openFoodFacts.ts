import type { NutritionFacts } from "./types.ts";

export interface OffProduct {
  barcode: string;
  productName: string;
  servingSize: string;
  nutrition: NutritionFacts;
}

interface OffApiResponse {
  status: number;
  product?: {
    product_name?: string;
    serving_size?: string;
    nutriments?: Record<string, number>;
  };
}

/** True when OFF gave us this product's own per-serving numbers, not just per-100g. */
function hasPerServingData(n: Record<string, number>): boolean {
  return "energy-kcal_serving" in n;
}

/** Maps OFF's `nutriments` bag to our NutritionFacts shape, preferring per-serving values and
 * falling back to per-100g — shared by lookupBarcode and searchProducts (#91). */
function mapNutriments(n: Record<string, number>, servingSize: string): NutritionFacts {
  return {
    servingSize,
    calories: n["energy-kcal_serving"] ?? n["energy-kcal_100g"] ?? 0,
    caloriesFromFat: 0, // not provided by OpenFoodFacts
    totalFatG: n["fat_serving"] ?? n["fat_100g"] ?? 0,
    satFatG: n["saturated-fat_serving"] ?? n["saturated-fat_100g"] ?? 0,
    transFatG: n["trans-fat_serving"] ?? n["trans-fat_100g"] ?? 0,
    cholesterolMg: n["cholesterol_serving"] ?? n["cholesterol_100g"] ?? 0,
    sodiumMg: (n["sodium_serving"] ?? n["sodium_100g"] ?? 0) * 1000,
    totalCarbG: n["carbohydrates_serving"] ?? n["carbohydrates_100g"] ?? 0,
    dietaryFiberG: n["fiber_serving"] ?? n["fiber_100g"] ?? 0,
    sugarsG: n["sugars_serving"] ?? n["sugars_100g"] ?? 0,
    proteinG: n["proteins_serving"] ?? n["proteins_100g"] ?? 0,
  };
}

/** Looks up a packaged-food product by barcode. Returns null if not found. */
export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) throw new Error(`OpenFoodFacts ${res.status}`);
  const data = (await res.json()) as OffApiResponse;
  if (data.status !== 1 || !data.product) return null;

  const n = data.product.nutriments ?? {};
  const servingSize = data.product.serving_size ?? "";
  return {
    barcode,
    productName: data.product.product_name ?? "Unknown product",
    servingSize,
    nutrition: mapNutriments(n, servingSize),
  };
}

export interface OffSearchResult {
  barcode: string;
  productName: string;
  nutrition: NutritionFacts;
}

interface OffSearchApiResponse {
  products?: Array<{
    code?: string;
    product_name?: string;
    serving_size?: string;
    nutriments?: Record<string, number>;
  }>;
}

/**
 * Text search for packaged foods — the mobile plate sheet's "Add something else" row (#91),
 * SEARCH only (barcode scanning needs a native dep, out of scope for #91). Uses OFF's `cgi/search.pl`
 * (the long-documented, stable text-search endpoint) rather than the newer search-a-licious service,
 * and requests only the fields the plate needs — OFF product records otherwise carry dozens of
 * unrelated fields. Search hits usually lack per-serving nutriments (unlike single-product lookups
 * via lookupBarcode), so this falls back to per-100g like lookupBarcode does, marking servingSize
 * with the literal "per 100g" so the UI can flag it as an estimate instead of silently presenting
 * 100g numbers as "1 serving" — see mobile/src/lib/plate.ts's isEstimatedServing, which reads this
 * exact marker, and PlateSheet.tsx, which renders it on both the search-result row and the row the
 * item becomes once added to the plate.
 */
export async function searchProducts(query: string): Promise<OffSearchResult[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,serving_size,nutriments`;
  const res = await fetch(url, { headers: { "User-Agent": "UDine/1.0 (+https://github.com/TSVRN9/UDine)" } });
  if (!res.ok) throw new Error(`OpenFoodFacts search ${res.status}`);
  const data = (await res.json()) as OffSearchApiResponse;
  return (data.products ?? [])
    .filter((p): p is typeof p & { code: string; product_name: string } => Boolean(p.code && p.product_name))
    .map((p) => {
      const n = p.nutriments ?? {};
      const servingSize = hasPerServingData(n) ? (p.serving_size ?? "") : "per 100g";
      return {
        barcode: p.code,
        productName: p.product_name,
        nutrition: mapNutriments(n, servingSize),
      };
    });
}
