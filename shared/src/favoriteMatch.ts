import type { Favorite, MealPeriod, MenuItem } from "./types.ts";

/**
 * One favorited dish spotted on a fetched menu — the client-side mirror of a `food_sightings` row
 * (minus `userId`, which only exists server-side). `date`/`mealPeriod` are carried straight through
 * from the matched `MenuItem` rather than derived from `new Date()` — sidesteps the Eastern-vs-UTC
 * trap `check-favorited-foods/index.ts`'s `easternDateParts()` doc comment describes, and callers
 * (task 3's dedup store, keyed like `food_sightings`' `unique(dish_name, hall_tid, sighted_date)`)
 * get an unambiguous key for free.
 */
export interface FavoriteDishMatch {
  dishName: string;
  hallTid: number;
  mealPeriod: MealPeriod;
  date: string;
}

/**
 * Matches a favorited-dish list against already-parsed menu items, mirroring
 * `check-favorited-foods/index.ts`'s `extractDishMealMap`/match-by-exact-key semantics exactly:
 * case-sensitive, no fuzzy/substring matching, and no normalization on the favorite side —
 * `dishName` is looked up verbatim, the same way the server does `dishes.get(fav.dish_name)`
 * against a Map whose keys came from the menu side only.
 *
 * The menu side needs no re-normalization either: `MenuItem.dishName` (umassDining.ts's
 * `parseCategoryItems` -> `getAttr` -> `getAttrRaw`) is already `decodeEntities(...).trim()`'d,
 * byte-identical to what `extractDishMealMap` produces from the same raw HTML. Re-decoding here
 * would risk double-decoding an already-decoded name (`decodeEntities` isn't idempotent, e.g.
 * "&amp;amp;" -> "&amp;" -> "&") and diverge from the server on that input — so this function
 * takes already-parsed `MenuItem[]`, not raw HTML, and does zero re-normalization.
 *
 * Only `Favorite`'s "dish" variant can match; a "location" favorite is never a food match.
 *
 * Like `extractDishMealMap`, a dish keeps the FIRST meal period it's found under — WITHIN EACH
 * HALL, since matches are per-hall (the server's `hallDishes` is `Map<hallTid, Map<dishName,
 * mealPeriod>>`, one map per hall). "First" follows `menuItems`' own array order; this function
 * doesn't sort or reorder it, so a caller building that array from `RAW_MEAL_PERIOD_KEYS` order
 * (as `fetchMenuUncached` does) reproduces the server's breakfast/lunch/dinner priority for free.
 */
export function matchFavoritedDishes(favorites: Favorite[], menuItems: MenuItem[]): FavoriteDishMatch[] {
  const favoritedNames = new Set(favorites.filter((f) => f.type === "dish").map((f) => f.dishName));
  if (favoritedNames.size === 0) return [];

  // hallTid -> dishName -> first-seen MenuItem, mirroring extractDishMealMap's per-hall
  // first-occurrence-wins Map (built fresh per hall server-side too).
  const firstByHall = new Map<number, Map<string, MenuItem>>();
  for (const item of menuItems) {
    const byDish = firstByHall.get(item.hallTid) ?? new Map<string, MenuItem>();
    if (!byDish.has(item.dishName)) byDish.set(item.dishName, item);
    firstByHall.set(item.hallTid, byDish);
  }

  const matches: FavoriteDishMatch[] = [];
  for (const [hallTid, byDish] of firstByHall) {
    for (const dishName of favoritedNames) {
      const item = byDish.get(dishName);
      if (!item) continue;
      matches.push({ dishName, hallTid, mealPeriod: item.mealPeriod, date: item.date });
    }
  }
  return matches;
}
