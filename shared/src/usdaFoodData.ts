import type { NutritionFacts } from "./types.ts";

/**
 * USDA FoodData Central client -- the 4th search source in PlateSheet.tsx's add-item flow, added
 * to fill the gap OpenFoodFacts (openFoodFacts.ts) fundamentally can't: OFF is barcode-driven
 * packaged goods only, no coverage of raw/generic foods (a banana, a raw chicken breast).
 * Foundation Foods/SR Legacy are FDC's generic food-composition datasets -- exactly that coverage,
 * free, CC0-licensed, and (like OFF) a plain client-fetch-safe API key, no backend proxy needed.
 * Same shape as openFoodFacts.ts: one search function, one result mapper, page-based pagination.
 */
export interface UsdaSearchResult {
  fdcId: string;
  productName: string;
  nutrition: NutritionFacts;
  /** Branded-food hits sometimes carry their own ingredient statement; Foundation/SR Legacy
   * (generic composition data) generally don't. Omitted when FDC has none, same convention as
   * OffSearchResult.ingredients/MenuItem.ingredients. */
  ingredients?: string;
}

export interface UsdaSearchPage {
  results: UsdaSearchResult[];
  hasMore: boolean;
}

interface FdcNutrient {
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description?: string;
  ingredients?: string;
  foodNutrients?: FdcNutrient[];
}

interface FdcSearchApiResponse {
  currentPage?: number;
  totalPages?: number;
  foods?: FdcFood[];
}

/**
 * You do not need (and shouldn't fetch/guess/hardcode) a real USDA key to use this: DEMO_KEY is a
 * real, intentionally-provided no-registration fallback FDC documents for exactly this case --
 * rate-limited (~30 req/hour/IP vs ~1,000/hour registered) but functional. Read inside the
 * function (not hoisted to module scope) so Metro's EXPO_PUBLIC_* inlining still applies and the
 * DEMO_KEY fallback stays independently testable. See mobile/.env.example for how to register a
 * real key before real production traffic.
 */
function apiKey(): string {
  return process.env.EXPO_PUBLIC_USDA_FDC_API_KEY || "DEMO_KEY";
}

/** name-substring match against FDC's flat (search-endpoint-shape) foodNutrients array, optionally
 * pinned to a unit (Energy is reported in both KCAL and kJ -- unit disambiguates). Missing/absent
 * nutrients default to 0, same posture as openFoodFacts.ts's mapNutriments defaulting on `?? 0`. */
function findNutrient(nutrients: FdcNutrient[], namePart: string, unit?: string): number {
  const hit = nutrients.find(
    (n) => n.nutrientName?.toLowerCase().includes(namePart) && (!unit || n.unitName?.toUpperCase() === unit),
  );
  return hit?.value ?? 0;
}

/** Foundation/SR Legacy AND Branded values are both always reported per 100g of the food -- not an
 * estimate/fallback like OFF's per-100g case, but genuinely how FDC's search-endpoint data is
 * structured, regardless of dataType. Reuses the exact "per 100g" marker plate.ts's
 * isEstimatedServing checks for (see its own doc, updated to name both sources) so the UI flags it
 * the same way OFF's per-100g fallback already is. */
function mapFdcFood(food: FdcFood): UsdaSearchResult {
  const nutrients = food.foodNutrients ?? [];
  const nutrition: NutritionFacts = {
    servingSize: "per 100g",
    calories: findNutrient(nutrients, "energy", "KCAL"),
    caloriesFromFat: 0, // not provided by FDC search results
    totalFatG: findNutrient(nutrients, "total lipid"),
    satFatG: findNutrient(nutrients, "saturated"),
    transFatG: findNutrient(nutrients, "trans"),
    cholesterolMg: findNutrient(nutrients, "cholesterol"),
    sodiumMg: findNutrient(nutrients, "sodium"),
    totalCarbG: findNutrient(nutrients, "carbohydrate"),
    dietaryFiberG: findNutrient(nutrients, "fiber"),
    sugarsG: findNutrient(nutrients, "sugars"),
    proteinG: findNutrient(nutrients, "protein"),
  };
  return {
    fdcId: String(food.fdcId),
    productName: food.description ?? "Unknown food",
    nutrition,
    ...(food.ingredients ? { ingredients: food.ingredients } : {}),
  };
}

const FDC_PAGE_SIZE = 20;

/**
 * Text search against FDC's /foods/search endpoint. `dataType=Foundation,SR Legacy` restricts
 * results to generic food-composition data -- the whole point of adding USDA alongside OFF is
 * raw/generic coverage OFF lacks; unfiltered search also returns Branded (packaged goods), which
 * is exactly OFF's own territory already. `page` (1-based, default 1) mirrors
 * openFoodFacts.ts's searchProducts pagination shape.
 */
export async function searchFoods(query: string, page = 1): Promise<UsdaSearchPage> {
  return searchByDataType(query, "Foundation,SR Legacy", page);
}

/**
 * Same FDC /foods/search endpoint as searchFoods, but `dataType=Branded` -- manufacturer-submitted
 * packaged goods (carries UPC/GTIN, not surfaced here -- nothing in this app consumes it, see
 * UsdaSearchResult's own doc). Kept as an independent second call rather than broadening
 * searchFoods's dataType filter, so both result sets stay at full quality in their own 20-result
 * page instead of one crowding out the other (see searchFoods's doc for why Branded is excluded
 * there -- it's exactly OpenFoodFacts's own territory in that shared page).
 */
export async function searchBrandedFoods(query: string, page = 1): Promise<UsdaSearchPage> {
  return searchByDataType(query, "Branded", page);
}

async function searchByDataType(query: string, dataType: string, page: number): Promise<UsdaSearchPage> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey())}&query=${encodeURIComponent(query)}&dataType=${encodeURIComponent(dataType)}&pageNumber=${page}&pageSize=${FDC_PAGE_SIZE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USDA FoodData Central search ${res.status}`);
  const data = (await res.json()) as FdcSearchApiResponse;
  const results = (data.foods ?? []).map(mapFdcFood);
  const currentPage = data.currentPage ?? page;
  const totalPages = data.totalPages ?? 1;
  const hasMore = currentPage < totalPages;
  return { results, hasMore };
}
