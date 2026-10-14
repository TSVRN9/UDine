// Language-neutral JSON in -> TS module call -> JSON out, for shared/vectors/*.json. gen-vectors.ts
// uses these to WRITE expected values; src/vectors.test.ts uses the same adapters to CHECK the
// committed files, so a behaviour change in the TS modules fails until the vectors are regenerated.
import { matchFavoritedDishes } from "../src/favoriteMatch.ts";
import { currentMealPeriod, effectiveMealWindow, mapInfoV2, openStatus, parseMapAddress, parseStreetAddress } from "../src/hours.ts";
import type { InfoV2Location } from "../src/hours.ts";
import { matchesQuery } from "../src/search.ts";
import * as storage from "../src/storage.ts";
import type { DiningHallHours, Favorite, HallMealPeriod, MealPeriod, MenuItem } from "../src/types.ts";
import { fetchMenu, parseCategoryItems } from "../src/umassDining.ts";

/** JSON round trip: drops `undefined` keys, turns Dates into ISO strings. Every adapter output goes
 * through it so "absent key" is the only representation of undefined. */
export function jsonify(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v));
}

export type Json = Record<string, unknown>;

export function foodproParse(i: { html: string; category: string; mealPeriod: MealPeriod; hallTid: number; isoDate: string }): unknown {
  return jsonify(parseCategoryItems(i.html, i.category, i.mealPeriod, i.hallTid, i.isoDate));
}

let clock = 0;
export async function foodproMenu(i: { hallTid: number; isoDate: string; response: unknown }): Promise<unknown> {
  const [y, m, d] = i.isoDate.split("-").map(Number);
  // `now` jumps an hour per call so fetchMenu's 30 min cache never serves a previous case's items.
  const items: MenuItem[] = await fetchMenu(
    i.hallTid,
    new Date(y, m - 1, d),
    (async () => ({ ok: true, status: 200, json: async () => i.response })) as unknown as typeof fetch,
    () => (clock += 3_600_000),
  );
  return jsonify(items);
}

export const hoursMap = (i: InfoV2Location[]): unknown => jsonify(mapInfoV2(i));
export const streetAddress = (i: string | null): unknown => parseStreetAddress(i);
export const mapAddress = (i: string | null): unknown => parseMapAddress(i);

const KEYS: HallMealPeriod[] = ["breakfast", "lunch", "dinner", "latenight"];

/** `now` is an absolute instant (ISO with offset); the TS module reads its wall-clock parts in the
 * process timezone, so callers must run under TZ=America/New_York. */
export function hoursStatus(i: { hours: DiningHallHours; now: string }): unknown {
  const now = new Date(i.now);
  return jsonify({
    mealPeriod: currentMealPeriod(i.hours, now),
    openStatus: openStatus(i.hours, now),
    effective: Object.fromEntries(KEYS.map((k) => [k, effectiveMealWindow(i.hours, k, now)])),
  });
}

export const matchQuery = (i: { name: string; query: string }): unknown => matchesQuery(i.name, i.query);

export const favoriteMatch = (i: { favorites: Favorite[]; menuItems: MenuItem[] }): unknown => jsonify(matchFavoritedDishes(i.favorites, i.menuItems));

/** One adapter per exporter: rows in, the exact exported string out. */
const exporter = (fn: (rows: never) => string) => (i: never): unknown => fn(i);

export const ADAPTERS: Record<string, Record<string, (input: never) => unknown>> = {
  "foodpro.json": { parse: foodproParse, menu: foodproMenu },
  "hours.json": { map_info_v2: hoursMap, street_address: streetAddress, map_address: mapAddress, status: hoursStatus },
  "match-query.json": { match: matchQuery },
  "favorite-match.json": { match: favoriteMatch },
  "export.json": {
    entries_json: exporter(storage.exportEntriesAsJson),
    entries_csv: exporter(storage.exportEntriesAsCsv),
    ranked_dishes_json: exporter(storage.exportRankedDishesAsJson),
    ranked_dishes_csv: exporter(storage.exportRankedDishesAsCsv),
    ranked_foods_json: exporter(storage.exportRankedFoodsAsJson),
    ranked_foods_csv: exporter(storage.exportRankedFoodsAsCsv),
    favorites_json: exporter(storage.exportFavoritesAsJson),
    favorites_csv: exporter(storage.exportFavoritesAsCsv),
    custom_foods_json: exporter(storage.exportCustomFoodsAsJson),
    custom_foods_csv: exporter(storage.exportCustomFoodsAsCsv),
  },
};
