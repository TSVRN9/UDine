import { useRef } from "react";
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
  // #177: retail-only, carried through from MenuItem.price -- undefined for hall dishes and OFF
  // products, same optionality as its source field.
  price?: string;
}

/** Same identity a plate row and its eventual LogEntry share: umass-menu dishes key by hall + dish
 * name (the same dish can be on the plate from two different halls), OFF products key by barcode. */
export function plateKeyFor(source: LogEntry["source"]): string {
  return source.type === "umass-menu" ? `menu:${source.hallTid}:${source.dishName}` : `off:${source.barcode}`;
}

export function menuItemToPlateEntry(item: MenuItem, count = 1): PlateEntry {
  const source: LogEntry["source"] = { type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid };
  return { key: plateKeyFor(source), label: item.dishName, nutrition: item.nutrition, source, count, ...(item.price !== undefined ? { price: item.price } : {}) };
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

/**
 * #177 styling spec: "Plate bar with prices: summary line becomes `1 item · 640 cal · $11.25`".
 * null when nothing on the plate carries a price -- a hall-only plate keeps today's price-free
 * summary line exactly as it renders now, per the spec's "no price in the data -> renders exactly
 * as today." Rows without a price (mixed hall+café plate) simply don't contribute to the sum
 * rather than being excluded from it -- $0 from an unpriced row and "no total" from an all-unpriced
 * plate are different things, so `any` tracks whether at least one row actually had a price.
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

export interface LogStorageLike {
  addEntry(entry: LogEntry): Promise<void>;
}

export type LogPlateResult = { ok: true; count: number } | { ok: false; error: unknown };

/**
 * #147: halls/[slug].tsx and grab-n-go/[slug].tsx had byte-for-byte identical logPlate bodies with
 * no in-flight guard -- LOG only ever disabled on an empty plate, not while a commit was already
 * running, so a second tap landing before the sequential addEntry() writes finished re-ran
 * toLogEntries (minting fresh ids) and duplicated every row; a tap landing just after completion
 * re-logged the now-empty plate ("Logged 0 items"). One shared, guarded implementation for both
 * screens instead of the guard living (or not living) in each copy separately.
 *
 * The ref is checked synchronously before the first await -- same mechanism as logs.tsx's
 * withStepGuard -- and DROPS a second call outright while the first is still in flight, rather than
 * queuing it: the correct fix for a duplicate write is exactly one write, not two serialized ones.
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
