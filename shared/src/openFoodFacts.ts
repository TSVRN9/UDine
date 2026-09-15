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
 * falling back to per-100g — shared by lookupBarcode and searchProducts. */
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

const OFF_TIMEOUT_MS = 6000;

/** A merely-slow (not 503-ing) OFF response has no other signal that tells it to give up, so it
 * can otherwise hang its caller indefinitely.
 * ponytail: AbortSignal.timeout() would be one line here, but this app's Hermes/RN runtime never
 * gets the real one -- react-native's setUpXHR.js unconditionally polyfillGlobals
 * AbortController/AbortSignal with the `abort-controller` npm package (predates AbortSignal.timeout
 * entering the spec), so calling it on-device throws where Node/Jest wouldn't catch it. Manual
 * controller+timer instead; revisit once that polyfill (or an RN upgrade) adds it. */
function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Retries once after a short jittered backoff if OpenFoodFacts returns 503 (transient overload),
 * shared by lookupBarcode and searchProducts.
 * ponytail: fixed single retry for transient blips, not a general backoff policy — if 503s are
 * still frequent after this, upgrade to real retries/backoff or move off the legacy search endpoint. */
async function fetchWithRetry503(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetchWithTimeout(url, init, OFF_TIMEOUT_MS);
  if (res.status !== 503) return res;
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 300));
  return fetchWithTimeout(url, init, OFF_TIMEOUT_MS);
}

export async function lookupBarcode(barcode: string): Promise<OffProduct | null> {
  const res = await fetchWithRetry503(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    { headers: { "User-Agent": "UDine/1.0 (+https://github.com/TSVRN9/UDine)" } },
  );
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
  /** Raw ingredient-statement prose (OFF's ingredients_text), when OFF has it. Same free-text shape
   * as MenuItem.ingredients -- fed straight into NutritionLabel's own ingredients prop. */
  ingredients?: string;
  /** Title-cased, locale-prefix-stripped allergen names (e.g. "Milk", "Soy") -- OFF's own
   * allergens_tags come back as `["en:milk","en:soy"]`; formatOffAllergenTag below normalizes them
   * to match MenuItem.allergens's display convention. Omitted when OFF has none for this hit. */
  allergens?: string[];
}

export interface OffSearchPage {
  results: OffSearchResult[];
  /** True when a further `page` is likely to return more hits -- pass `page + 1` back into
   * searchProducts to fetch it. */
  hasMore: boolean;
}

interface OffSearchApiResponse {
  count?: number;
  products?: Array<{
    code?: string;
    product_name?: string;
    serving_size?: string;
    nutriments?: Record<string, number>;
    ingredients_text?: string;
    allergens_tags?: string[];
  }>;
}

const OFF_PAGE_SIZE = 20;

/** OFF's allergens_tags entries are a locale prefix plus a hyphenated slug (e.g. "en:tree-nuts") --
 * strip the locale, title-case each word, matching how MenuItem.allergens values already read
 * elsewhere in the app (e.g. "Milk", "Soy" -- see FilterSheet/menuItemMatchesPreferences). */
function formatOffAllergenTag(tag: string): string {
  const withoutLocale = tag.replace(/^[a-z]{2,3}:/, "");
  return withoutLocale
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Text search for packaged foods -- SEARCH only (barcode scanning needs a native dep). Uses OFF's
 * `cgi/search.pl` (the long-documented, stable text-search endpoint) rather than the newer
 * search-a-licious service, and requests only the fields the plate needs. Search hits usually lack
 * per-serving nutriments (unlike single-product lookups via lookupBarcode), so this falls back to
 * per-100g like lookupBarcode does, marking servingSize with the literal "per 100g" so the UI can
 * flag it as an estimate instead of silently presenting 100g numbers as "1 serving" -- see
 * mobile/src/lib/plate.ts's isEstimatedServing, which reads this exact marker.
 *
 * `page` (1-based, default 1) paginates past OFF's own OFF_PAGE_SIZE-per-request cap -- pass the
 * returned `hasMore`'s implied `page + 1` back in for the next page.
 */
export async function searchProducts(query: string, page = 1): Promise<OffSearchPage> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page=${page}&page_size=${OFF_PAGE_SIZE}&fields=code,product_name,serving_size,nutriments,ingredients_text,allergens_tags`;
  const res = await fetchWithRetry503(url, { headers: { "User-Agent": "UDine/1.0 (+https://github.com/TSVRN9/UDine)" } });
  if (!res.ok) throw new Error(`OpenFoodFacts search ${res.status}`);
  const data = (await res.json()) as OffSearchApiResponse;
  const results = (data.products ?? [])
    .filter((p): p is typeof p & { code: string; product_name: string } => Boolean(p.code && p.product_name))
    .map((p) => {
      const n = p.nutriments ?? {};
      const servingSize = hasPerServingData(n) ? (p.serving_size ?? "") : "per 100g";
      const allergens = (p.allergens_tags ?? []).map(formatOffAllergenTag);
      return {
        barcode: p.code,
        productName: p.product_name,
        nutrition: mapNutriments(n, servingSize),
        ...(p.ingredients_text ? { ingredients: p.ingredients_text } : {}),
        ...(allergens.length > 0 ? { allergens } : {}),
      };
    });
  // `count` (OFF's total-hits-for-this-query figure) is always present on a real search response
  // regardless of the `fields` filter (that filter only trims each product object) -- but degrade
  // honestly if it's ever missing rather than silently killing pagination: a full page probably has
  // more, a short page probably doesn't.
  const hasMore = data.count !== undefined ? page * OFF_PAGE_SIZE < data.count : results.length === OFF_PAGE_SIZE;
  return { results, hasMore };
}
