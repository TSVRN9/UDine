import type { LogEntry, MenuItem, NutritionFacts, OffSearchResult } from "@udine/shared";

/**
 * One row on the in-memory plate (#91): a dish/product plus how many servings the user has
 * stepped it to. Not persisted — the plate only becomes durable log rows on LOG (see toLogEntries).
 */
export interface PlateEntry {
  key: string;
  label: string;
  nutrition: NutritionFacts;
  source: LogEntry["source"];
  count: number;
}

/** Same identity a plate row and its eventual LogEntry share: umass-menu dishes key by hall + dish
 * name (the same dish can be on the plate from two different halls), OFF products key by barcode. */
export function plateKeyFor(source: LogEntry["source"]): string {
  return source.type === "umass-menu" ? `menu:${source.hallTid}:${source.dishName}` : `off:${source.barcode}`;
}

export function menuItemToPlateEntry(item: MenuItem, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid };
  return { key: plateKeyFor(source), label: item.dishName, nutrition: item.nutrition, source, count };
}

export function offResultToPlateEntry(result: OffSearchResult, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "off", barcode: result.barcode, productName: result.productName };
  return { key: plateKeyFor(source), label: result.productName, nutrition: result.nutrition, source, count };
}

/** True when this nutrition snapshot came from OFF's per-100g fallback rather than the product's
 * own serving size (shared/src/openFoodFacts.ts's searchProducts sets the literal "per 100g" marker
 * when a search hit has no per-serving nutriments) -- lets the UI flag it as an estimate instead of
 * silently presenting 100g numbers as "1 serving". */
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

/** Bottom padding a scrollable dish list needs to keep its last row reachable while the plate bar
 * floats over it (the occlusion-bug class from PR #78/#84) — always 0 once the plate is empty, even
 * though the bar's last-measured height is still sitting in the caller's state (the bar itself
 * unmounts with nothing left to re-measure it down to 0). */
export function listBottomPadding(barHeight: number, plateHasItems: boolean): number {
  return plateHasItems ? barHeight : 0;
}

/**
 * One LogEntry per plate row (not one per unit of count) — mirrors how today.tsx already displays
 * and lets you remove a logged item ("Dish × N"), and how rank.tsx dedupes its comparison pool by
 * dish key: N separate 1-serving rows for the same dish would just be N duplicates there, not N
 * independent comparison candidates.
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
