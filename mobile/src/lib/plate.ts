import { useRef } from "react";
import type { CustomFood, LogEntry, MenuItem, NutritionFacts, OffSearchResult, UsdaSearchResult } from "@udine/shared";
import type { HistoryDish } from "./dishHistory";

/** One merged search result from PlateSheet's "Search for a food": device-local dish history/the
 * cached public.dishes catalog ("umass"), an OpenFoodFacts hit ("off"), a USDA FoodData Central hit
 * ("usda"), or a saved on-device CustomFood ("custom"). Tagged so a result row can badge it and so
 * plateSearchResultToPlateEntry/plateSearchResultDetail below can dispatch on it without the caller
 * needing a 4-way if/else of its own. */
export type PlateSearchResult =
  | { kind: "umass"; dish: HistoryDish }
  | { kind: "off"; product: OffSearchResult }
  | { kind: "usda"; food: UsdaSearchResult }
  | { kind: "custom"; food: CustomFood };

/**
 * One row on the in-memory plate: a dish/product plus how many servings the user has stepped it to.
 * Not persisted — the plate only becomes durable log rows on LOG (see toLogEntries).
 */
export interface PlateEntry {
  key: string;
  label: string;
  nutrition: NutritionFacts;
  source: LogEntry["source"];
  count: number;
  // Retail-only, carried through from MenuItem.price -- undefined for hall dishes and OFF
  // products, same optionality as its source field.
  price?: string;
}

/** Same identity a plate row and its eventual LogEntry share: umass-menu dishes key by hall + dish
 * name (the same dish can be on the plate from two different halls), everything else keys by its
 * own source-specific id. A switch (not a ternary) so a 5th LogEntry source variant fails to
 * compile here instead of silently falling through to the wrong branch. */
export function plateKeyFor(source: LogEntry["source"]): string {
  switch (source.type) {
    case "umass-menu":
      return `menu:${source.hallTid}:${source.dishName}`;
    case "off":
      return `off:${source.barcode}`;
    case "usda":
      return `usda:${source.fdcId}`;
    case "custom":
      return `custom:${source.customFoodId}`;
  }
}

export function menuItemToPlateEntry(item: MenuItem, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid };
  return { key: plateKeyFor(source), label: item.dishName, nutrition: item.nutrition, source, count, ...(item.price !== undefined ? { price: item.price } : {}) };
}

export function offResultToPlateEntry(result: OffSearchResult, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "off", barcode: result.barcode, productName: result.productName };
  return { key: plateKeyFor(source), label: result.productName, nutrition: result.nutrition, source, count };
}

/**
 * A previously-logged dish, picked from the plate's food-history search, staged back onto the
 * plate. `dish.nutrition` is already the per-serving snapshot the original LogEntry carried (see
 * HistoryDish's own doc) -- carried through unchanged here, same as menuItemToPlateEntry/
 * offResultToPlateEntry above, NOT divided or multiplied by however many servings were logged
 * historically. `count` always resets to 1 (the default) regardless of that original servings value
 * -- this is a fresh add, not a resumption of the old log entry.
 */
export function historyDishToPlateEntry(dish: HistoryDish, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "umass-menu", dishName: dish.dishName, hallTid: dish.hallTid };
  return { key: plateKeyFor(source), label: dish.dishName, nutrition: dish.nutrition, source, count };
}

export function usdaResultToPlateEntry(result: UsdaSearchResult, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "usda", fdcId: result.fdcId, productName: result.productName };
  return { key: plateKeyFor(source), label: result.productName, nutrition: result.nutrition, source, count };
}

export function customFoodToPlateEntry(food: CustomFood, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "custom", customFoodId: food.id, productName: food.name };
  return { key: plateKeyFor(source), label: food.name, nutrition: food.nutrition, source, count };
}

/** Stable per-result key for a search-results list's row keys -- reuses plateSearchResultToPlateEntry
 * rather than re-deriving the same switch a second time. */
export function plateSearchResultKey(result: PlateSearchResult): string {
  return plateSearchResultToPlateEntry(result).key;
}

/** Single dispatch point for "add this search result to the plate", covering all 4
 * PlateSearchResult kinds -- what NutritionLabel's onAddToPlate ultimately calls from PlateSheet. */
export function plateSearchResultToPlateEntry(result: PlateSearchResult, count = 1): PlateEntry {
  switch (result.kind) {
    case "umass":
      return historyDishToPlateEntry(result.dish, count);
    case "off":
      return offResultToPlateEntry(result.product, count);
    case "usda":
      return usdaResultToPlateEntry(result.food, count);
    case "custom":
      return customFoodToPlateEntry(result.food, count);
  }
}

/** What NutritionLabel (the shared confirm/detail step, mobile/src/components/NutritionLabel.tsx)
 * needs to render for any of the 4 search-result kinds -- UMass history/catalog hits carry no
 * allergen/diet-tag/ingredient data (HistoryDish/DishCatalogEntry don't have it), so those come
 * back empty rather than undefined, matching NutritionLabel's required (non-optional)
 * allergens/dietTags props. */
export interface PlateSearchResultDetail {
  dishName: string;
  /** "via {source}" attribution caption -- NutritionLabel renders this under the badge pill
   * rather than as a bare source name. */
  subtitle: string;
  /** Filled source-badge pill label (PACKAGED/UMASS/USDA/CUSTOM), rendered next to the caption. */
  badge: string;
  nutrition: NutritionFacts;
  allergens: string[];
  dietTags: string[];
  ingredients?: string;
}

export function plateSearchResultDetail(result: PlateSearchResult): PlateSearchResultDetail {
  switch (result.kind) {
    case "umass":
      return {
        dishName: result.dish.dishName,
        subtitle: "via UMass Dining",
        badge: "UMASS",
        nutrition: result.dish.nutrition,
        allergens: [],
        dietTags: [],
      };
    case "off":
      return {
        dishName: result.product.productName,
        subtitle: "via OpenFoodFacts",
        badge: "PACKAGED",
        nutrition: result.product.nutrition,
        allergens: result.product.allergens ?? [],
        dietTags: [],
        ...(result.product.ingredients ? { ingredients: result.product.ingredients } : {}),
      };
    case "usda":
      return {
        dishName: result.food.productName,
        subtitle: "via USDA FoodData Central",
        badge: "USDA",
        nutrition: result.food.nutrition,
        allergens: [],
        dietTags: [],
        ...(result.food.ingredients ? { ingredients: result.food.ingredients } : {}),
      };
    case "custom":
      return {
        dishName: result.food.name,
        subtitle: "via custom entry",
        badge: "CUSTOM",
        nutrition: result.food.nutrition,
        allergens: [],
        dietTags: [],
        ...(result.food.ingredients ? { ingredients: result.food.ingredients } : {}),
      };
  }
}

/** True when this nutrition snapshot is reported per 100g rather than per an actual serving --
 * shared/src/openFoodFacts.ts's searchProducts sets the literal "per 100g" marker as a fallback
 * when a search hit has no per-serving nutriments, and shared/src/usdaFoodData.ts's searchFoods
 * sets the same marker unconditionally (Foundation/SR Legacy data is always reported per 100g, not
 * a fallback there but still not "1 serving") -- lets the UI flag either case as an estimate
 * instead of silently presenting 100g numbers as "1 serving". */
export function isEstimatedServing(nutrition: NutritionFacts): boolean {
  return nutrition.servingSize === "per 100g";
}

/** Adds a new row, or merges into the existing row for the same key (stepper reflects the combined
 * count instead of the row appearing twice). */
export function addOrIncrement(plate: PlateEntry[], entry: PlateEntry): PlateEntry[] {
  const existing = plate.find((p) => p.key === entry.key);
  if (existing) return setCount(plate, entry.key, existing.count + entry.count);
  return [...plate, entry];
}

/** Sets a row's count directly (the stepper's +/- and the sheet's numeric entry both funnel here).
 * count <= 0 removes the row — there's no such thing as a zero-count plate row. */
export function setCount(plate: PlateEntry[], key: string, count: number): PlateEntry[] {
  if (count <= 0) return plate.filter((p) => p.key !== key);
  return plate.map((p) => (p.key === key ? { ...p, count } : p));
}

export function stepCount(plate: PlateEntry[], key: string, delta: number): PlateEntry[] {
  const existing = plate.find((p) => p.key === key);
  if (!existing) return plate;
  return setCount(plate, key, existing.count + delta);
}

/** The bar's "N items" figure — sum of servings across rows, not the number of distinct rows, so
 * stepping one dish to 3 reads as 3 items. */
export function totalItemCount(plate: PlateEntry[]): number {
  return plate.reduce((sum, p) => sum + p.count, 0);
}

/**
 * null when nothing on the plate carries a price -- a hall-only plate keeps today's price-free
 * summary line exactly as it renders now. Rows without a price (mixed hall+café plate) simply don't
 * contribute to the sum rather than being excluded from it -- $0 from an unpriced row and "no total"
 * from an all-unpriced plate are different things, so `any` tracks whether at least one row actually
 * had a price.
 */
export function totalPlatePrice(plate: PlateEntry[]): string | null {
  let total = 0;
  let any = false;
  for (const p of plate) {
    if (p.price === undefined) continue;
    const amount = Number.parseFloat(p.price.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount)) continue;
    any = true;
    total += amount * p.count;
  }
  return any ? `$${total.toFixed(2)}` : null;
}

/** Bottom padding a scrollable dish list needs to keep its last row reachable while the plate bar
 * floats over it. The bar is now always mounted (an empty plate still needs a tappable entry point
 * into OFF search, not just a spot to review staged items), so this is just the bar's own measured
 * height, unconditionally. */
export function listBottomPadding(barHeight: number): number {
  return barHeight;
}

/**
 * One LogEntry per plate row (not one per unit of count) — mirrors how today.tsx already displays
 * and lets you remove a logged item ("Dish × N"), and how rank.tsx dedupes its comparison pool by
 * dish key: N separate 1-serving rows for the same dish would just be N duplicates there.
 */
export function toLogEntries(plate: PlateEntry[], loggedAt: string): LogEntry[] {
  return plate.map((p, i) => ({
    id: `${loggedAt}-${i}-${Math.random().toString(36).slice(2)}`,
    loggedAt,
    source: p.source,
    servings: p.count,
    nutrition: p.nutrition,
  }));
}

export interface LogStorageLike {
  addEntry(entry: LogEntry): Promise<void>;
}

export type LogPlateResult = { ok: true; count: number } | { ok: false; error: unknown };

/** Two simultaneous RN Modals on Android can silently fail to present the second one. Fix:
 * CustomFoodForm always wins -- halls/[slug].tsx feeds both Modals' `visible` props through this
 * instead of their raw sheetOpen/customFoodFormOpen state, so PlateSheet's Modal is forced closed
 * the instant CustomFoodForm's should show, and reopens once customFoodFormOpen goes back to false. */
export function resolvePlateAndCustomFoodVisibility(sheetOpen: boolean, customFoodFormOpen: boolean): { plateSheetVisible: boolean; customFoodFormVisible: boolean } {
  return { plateSheetVisible: sheetOpen && !customFoodFormOpen, customFoodFormVisible: customFoodFormOpen };
}

/**
 * A second tap landing before the sequential addEntry() writes finished would re-run toLogEntries
 * (minting fresh ids) and duplicate every row; a tap landing just after completion would re-log the
 * now-empty plate. The ref is checked synchronously before the first await and drops a second call
 * outright while the first is in flight, rather than queuing it -- the correct fix for a duplicate
 * write is exactly one write, not two serialized ones.
 */
export function useGuardedLogPlate(storage: LogStorageLike) {
  const inFlight = useRef(false);
  return async function logPlate(plate: PlateEntry[], loggedAt: string): Promise<LogPlateResult | null> {
    if (inFlight.current || plate.length === 0) return null;
    inFlight.current = true;
    try {
      const entries = toLogEntries(plate, loggedAt);
      try {
        for (const entry of entries) {
          await storage.addEntry(entry);
        }
      } catch (e) {
        return { ok: false, error: e };
      }
      return { ok: true, count: totalItemCount(plate) };
    } finally {
      inFlight.current = false;
    }
  };
}
