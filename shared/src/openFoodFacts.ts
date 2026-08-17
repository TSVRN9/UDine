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

/** Looks up a packaged-food product by barcode. Returns null if not found. */
export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) throw new Error(`OpenFoodFacts ${res.status}`);
  const data = (await res.json()) as OffApiResponse;
  if (data.status !== 1 || !data.product) return null;

  const n = data.product.nutriments ?? {};
  return {
    barcode,
    productName: data.product.product_name ?? "Unknown product",
    servingSize: data.product.serving_size ?? "",
    nutrition: {
      servingSize: data.product.serving_size ?? "",
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
    },
  };
}
